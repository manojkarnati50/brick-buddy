"""Idea -> Claude kid plan -> LDraw Nova build_plan -> checks -> retry (max 3) -> saved project."""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field

from sqlmodel import Session

from . import claude_client as cc
from . import demo_builder, nova, validate
from .bom import bom_from_bricks, compare, total
from .catalog import KID_PALETTE, colour_by_name
from .config import settings
from .db import get_json, get_setting
from .inventory import available_map
from .kidplan import KID_PLAN_SCHEMA, count_parts, parts_table, to_nova_plan
from .ldraw import parse_mpd
from .prompts import BUILD_RULES, INVENTORY_RULES, KID_SAFETY, RETRY, SHORTFALL
from .store import create_project, record_colours

log = logging.getLogger("brickbuddy.gen")
MAX_RETRIES = 3

SIZES = {"quick": (10, 60), "inventory": (8, 60), "big": (40, 160)}


@dataclass
class Attempt:
    plan: dict | None = None
    text: str = ""
    issues: list = field(default_factory=list)
    bom: list = field(default_factory=list)
    shortfall: list = field(default_factory=list)


def build_kid_plan(kid: dict, *, max_parts: int, available: dict | None = None, strict: bool = True, extra: int = 0) -> Attempt:
    """Convert + build + check one plan. Pure function of the plan (no Claude)."""
    a = Attempt(plan=kid)
    plan, index, issues = to_nova_plan(kid)
    a.issues += issues
    if validate.errors(issues):
        return a
    text, diags = nova.build(plan)
    for d in diags:
        code = str(d.get("code", ""))
        if d.get("severity") == "error" and not any(k in code for k in ("collision", "overlap", "nova.build", "schema", "unknown")):
            d = {**d, "severity": "warning"}  # kid-grid checks below are authoritative for support
        a.issues.append(d)
    if not text:
        return a
    a.text = text
    model = parse_mpd(text)
    ids = {i: pid for i, pid in enumerate(index)}
    a.issues += validate.check_bricks(model.bricks, max_parts=max_parts, ids=ids)
    a.bom = bom_from_bricks(model.bricks)
    if available is not None:
        lines, _, need = compare(a.bom, available)
        a.shortfall = [l for l in lines if l["need"] > 0]
        if strict and need:
            a.issues.append({"code": "inventory.shortfall", "severity": "error", "message": f"{need} pieces over inventory"})
        elif not strict and need > extra:
            a.issues.append({"code": "inventory.shortfall", "severity": "error",
                             "message": f"{need} pieces over inventory (only {extra} extra allowed)"})
    return a


def _problems(a: Attempt, limit: int = 25) -> str:
    errs = validate.errors(a.issues)
    lines = [f"- {e.get('message')}" for e in errs if e.get("code") != "inventory.shortfall"][:limit]
    if len(errs) > limit:
        lines.append(f"- ...and {len(errs) - limit} more")
    return "\n".join(lines)


def _shortfall_text(a: Attempt) -> str:
    return "\n".join(f"- part {l['part']} ({l['name']}) colour {l['colour']['code']} {l['colour']['name']}: "
                     f"plan uses {l['quantity']}, we have {l['have']} -> over by {l['need']}" for l in a.shortfall)


def generate(s: Session, *, idea: str, mode: str = "quick", use_inventory: bool = False,
             audio: str | None = None, surprise: bool = False) -> tuple:
    """Returns (project, info dict). Never raises for model-quality problems: falls back to a starter."""
    child = get_setting(s, "child_name") or "Aaradya"
    lo, hi = SIZES.get(mode, SIZES["quick"])
    model_name = {"quick": settings.model_quick, "inventory": settings.model_inventory, "big": settings.model_big}[mode]
    available = None
    strict = (get_setting(s, "inventory_mode") or "strict") == "strict"
    extra = int(get_setting(s, "mostly_extra") or 0)
    palette = get_json(s, "printable_colours") or KID_PALETTE
    if use_inventory or surprise:
        available = {k: v for k, v in available_map(s).items() if v > 0}
        hi = min(hi, max(4, sum(available.values()) + (0 if strict else extra)))
        lo = min(lo, max(3, hi // 4))
    asked = [c for c in (colour_by_name(w) for w in idea.lower().replace(",", " ").split()) if c is not None]
    record_colours(s, asked, "asked")

    info = {"attempts": 0, "cost_usd": 0.0, "model": model_name, "fallback": False, "warnings": []}
    best: Attempt | None = None
    narration = ""
    if cc.enabled():
        system = KID_SAFETY.format(child=child) + "\n" + BUILD_RULES.format(
            min_parts=lo, max_parts=hi, table=parts_table(colours=palette))
        if available is not None:
            system += "\n" + INVENTORY_RULES.format(
                mode="strict: only what we have" if strict else f"mostly mine: up to {extra} extra pieces may be printed",
                extra_rule="" if strict else f"You may exceed availability by at most {extra} pieces in total.",
                table=parts_table(available=available))
        request = (f"Surprise me! Invent something fun that we can build right now with our bricks." if surprise and not idea
                   else f"{child} says: \"{idea}\". Build it.")
        messages: list = [{"role": "user", "content": request}]
        for attempt_no in range(MAX_RETRIES + 1):
            info["attempts"] = attempt_no + 1
            try:
                kid, content, cost = cc.call_json(purpose=f"build:{mode}", model=model_name, system=system,
                                                  messages=messages, schema=KID_PLAN_SCHEMA, max_tokens=16000)
            except cc.GentleRedirect:
                idea, best = "rainbow tower", None
                break
            info["cost_usd"] += cost
            a = build_kid_plan(kid, max_parts=hi + (0 if strict else extra), available=available, strict=strict, extra=extra)
            if best is None or len(validate.errors(a.issues)) < len(validate.errors(best.issues)):
                best = a
            if not validate.errors(a.issues):
                narration = kid.get("say", "")
                break
            if attempt_no == MAX_RETRIES:
                break
            follow = []
            if any(i.get("code") != "inventory.shortfall" for i in validate.errors(a.issues)):
                follow.append(RETRY.format(problems=_problems(a)))
            if a.shortfall and (strict or any(i.get("code") == "inventory.shortfall" for i in a.issues)):
                follow.append(SHORTFALL.format(problems=_shortfall_text(a)))
            messages = messages + [
                {"role": "assistant", "content": [b.model_dump(mode="json", exclude_none=True) for b in content]},
                {"role": "user", "content": "\n".join(follow) or "Please fix the plan."},
            ]
    if best is None or validate.errors(best.issues):
        # Kid never sees an error: use a hand-made starter that matches her words.
        info["fallback"] = True
        if best is not None:
            info["warnings"] = [i.get("message") for i in validate.errors(best.issues)][:10]
        best = _starter_for(idea, available, strict, extra)
        narration = best.plan.get("say", "")
    kid = best.plan or {}
    name = kid.get("name") or "My Model"
    project = create_project(
        s, name=name, text=best.text, request_text=idea or ("Surprise build" if surprise else ""),
        created_by="Claude" if not info["fallback"] else "Starter", model_used=model_name if cc.enabled() else "demo",
        cost=info["cost_usd"], source="claude" if not info["fallback"] else "demo", narration=narration,
        from_inventory=available is not None, audio=audio)
    info["shortfall"] = best.shortfall
    info["pieces"] = total(best.bom)
    return project, info


def _starter_for(idea: str, available, strict, extra) -> Attempt:
    first = demo_builder.from_idea(idea or "")
    if available is None:
        return build_kid_plan(first, max_parts=200)
    # pick the starter that fits the inventory best
    candidates = [first] + [demo_builder.starter(k) for k in demo_builder.STARTERS]
    scored = []
    for kid in candidates:
        a = build_kid_plan(kid, max_parts=200, available=available, strict=strict, extra=extra)
        need = sum(l["need"] for l in a.shortfall)
        scored.append((need, -count_parts(kid), a))
    scored.sort(key=lambda t: (t[0], t[1]))
    a = scored[0][2]
    a.issues = [i for i in a.issues if i.get("code") != "inventory.shortfall"]
    return a


def explain(info: dict) -> str:
    return json.dumps(info)
