"""Generation endpoints: kid builds, build-with-my-bricks, starters/examples, Big Build queue, suggestions."""
from __future__ import annotations

import hashlib
import json
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlmodel import Session, select

from .. import claude_client as cc
from .. import demo_builder, nova
from ..auth import require_parent
from ..config import settings
from ..db import BigBuild, UsageDay, get_session, get_setting, now, set_setting
from ..generation import build_kid_plan, generate
from ..inventory import available_map
from ..kidplan import parts_table
from ..prompts import KID_SAFETY, SUGGEST, SUGGEST_SCHEMA
from ..serialize import project_card
from ..store import create_project

router = APIRouter(prefix="/api", tags=["generate"])


def _bump_builds(s: Session):
    day = now().date().isoformat()
    u = s.get(UsageDay, day) or UsageDay(day=day)
    u.builds += 1
    s.add(u)
    s.commit()


@router.post("/generate")
async def generate_endpoint(idea: str = Form(""), mode: str = Form("quick"), use_inventory: bool = Form(False),
                            surprise: bool = Form(False), audio: UploadFile | None = File(None),
                            s: Session = Depends(get_session)):
    if mode not in ("quick", "inventory"):
        raise HTTPException(400, "Big builds go through the Big Build queue")
    idea = idea.strip()[:300]
    if not idea and not surprise:
        raise HTTPException(400, "Tell me your idea!")
    audio_name = None
    if audio is not None:
        data = await audio.read()
        if data and len(data) < 10_000_000:
            audio_name = f"idea-{uuid.uuid4().hex[:8]}.{(audio.filename or 'a.webm').rsplit('.', 1)[-1][:5]}"
            (settings.uploads_dir / audio_name).write_bytes(data)
    if use_inventory or surprise:
        mode = "inventory"
    try:
        project, info = generate(s, idea=idea, mode=mode, use_inventory=use_inventory or surprise,
                                 audio=audio_name, surprise=surprise)
    except cc.LimitReached as exc:
        raise HTTPException(429, str(exc)) from exc
    _bump_builds(s)
    return {"project": project_card(project, s), "info": info}


@router.get("/starters")
def starters():
    out = [{"key": k, "name": demo_builder.starter(k)["name"], "emoji": demo_builder.STARTER_EMOJI[k], "kind": "starter"}
           for k in demo_builder.STARTERS]
    for d in nova.example_dirs():
        thumb = next((p for p in (d / "home.png", d / "front.png") if p.exists()), None)
        out.append({"key": f"nova:{d.parent.name}/{d.name}", "name": d.name.replace("-", " ").title(),
                    "emoji": "🏰" if "building" in d.parent.name else "🚚", "kind": "example",
                    "thumb": f"/api/starters/thumb/{d.parent.name}/{d.name}" if thumb else None})
    return out


@router.get("/starters/thumb/{atlas}/{name}")
def starter_thumb(atlas: str, name: str):
    from fastapi.responses import FileResponse
    for d in nova.example_dirs():
        if d.parent.name == atlas and d.name == name:
            for p in (d / "home.png", d / "front.png"):
                if p.exists():
                    return FileResponse(p)
    raise HTTPException(404)


@router.post("/starters/{key:path}")
def use_starter(key: str, s: Session = Depends(get_session)):
    if key.startswith("nova:"):
        atlas, name = key[5:].split("/", 1)
        d = next((d for d in nova.example_dirs() if d.parent.name == atlas and d.name == name), None)
        if not d:
            raise HTTPException(404, "Example not found")
        mpd = next(d.glob("*.mpd"))
        p = create_project(s, name=name.replace("-", " ").title(), text=mpd.read_text(), request_text=f"LDraw Nova example: {name}",
                           created_by="LDraw Nova example", source="example", narration="Look what I found!")
        return {"project": project_card(p, s)}
    if key not in demo_builder.STARTERS:
        raise HTTPException(404, "Unknown starter")
    a = build_kid_plan(demo_builder.starter(key), max_parts=200)
    p = create_project(s, name=a.plan["name"], text=a.text, request_text=f"Starter: {key}", created_by="Starter",
                       source="demo", narration=a.plan.get("say", ""))
    return {"project": project_card(p, s)}


# ---------- Big Build queue (Opus, parent approved) ----------

class BigIn(BaseModel):
    idea: str


@router.post("/bigbuild")
def request_big_build(body: BigIn, s: Session = Depends(get_session)):
    if not body.idea.strip():
        raise HTTPException(400, "Tell me your big idea!")
    b = BigBuild(idea=body.idea.strip()[:300])
    s.add(b); s.commit(); s.refresh(b)
    return b


@router.get("/bigbuild")
def list_big_builds(s: Session = Depends(get_session), _=Depends(require_parent)):
    return s.exec(select(BigBuild).order_by(BigBuild.created_at.desc())).all()


@router.post("/bigbuild/{bid}/approve")
def approve_big_build(bid: int, s: Session = Depends(get_session), _=Depends(require_parent)):
    b = s.get(BigBuild, bid)
    if not b or b.status not in ("waiting", "failed"):
        raise HTTPException(400, "Not waiting")
    b.status = "running"; s.add(b); s.commit()
    try:
        project, info = generate(s, idea=b.idea, mode="big")
        b.status, b.project_id = "done", project.id
        b.note = f"{info['attempts']} attempt(s), ${info['cost_usd']:.3f}" + (" (starter fallback)" if info["fallback"] else "")
    except cc.LimitReached as exc:
        b.status, b.note = "failed", str(exc)
    except Exception as exc:  # noqa: BLE001
        b.status, b.note = "failed", str(exc)[:300]
    s.add(b); s.commit(); s.refresh(b)
    return b


@router.post("/bigbuild/{bid}/reject")
def reject_big_build(bid: int, s: Session = Depends(get_session), _=Depends(require_parent)):
    b = s.get(BigBuild, bid)
    if not b:
        raise HTTPException(404)
    b.status = "rejected"; s.add(b); s.commit()
    return b


# ---------- "You can build X things right now" ----------

@router.get("/suggestions")
def suggestions(refresh: bool = False, s: Session = Depends(get_session)):
    avail = {k: v for k, v in available_map(s).items() if v > 0}
    sig = hashlib.sha1(json.dumps(sorted((f"{k[0]}:{k[1]}", v) for k, v in avail.items())).encode()).hexdigest()
    try:
        cached = json.loads(get_setting(s, "suggestions_cache") or "{}")
    except json.JSONDecodeError:
        cached = {}
    if cached.get("sig") == sig and not refresh:
        return cached["data"]
    # starters that fit right now (always free + exact)
    fits = []
    for key in demo_builder.STARTERS:
        a = build_kid_plan(demo_builder.starter(key), max_parts=200, available=avail, strict=True)
        if not a.shortfall:
            fits.append({"name": a.plan["name"], "idea": key, "emoji": demo_builder.STARTER_EMOJI[key],
                         "parts": sum(l["quantity"] for l in a.bom), "exact": True})
    ideas = []
    if cc.enabled() and avail:
        try:
            data, _, _ = cc.call_json(purpose="suggestions", model=settings.model_quick,
                                      system=KID_SAFETY.format(child=get_setting(s, "child_name")),
                                      messages=[{"role": "user", "content": SUGGEST.format(table=parts_table(available=avail), n=4)}],
                                      schema=SUGGEST_SCHEMA, max_tokens=3000)
            ideas = [{**i, "exact": False} for i in data.get("ideas", [])[:4]]
        except Exception:  # noqa: BLE001 - suggestions are best effort
            ideas = []
    data = {"count": len(fits) + len(ideas), "items": fits + ideas, "available_pieces": sum(avail.values())}
    set_setting(s, "suggestions_cache", json.dumps({"sig": sig, "data": data}))
    return data
