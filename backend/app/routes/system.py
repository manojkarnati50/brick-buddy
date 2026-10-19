"""Health, catalogue, parent gate, settings, print queue."""
from __future__ import annotations

import json
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from .. import claude_client as cc
from .. import library, nova
from ..auth import check_pin, make_token, require_parent, set_pin
from ..catalog import COLOURS, KID_PALETTE, colour_dict, get_part, kid_parts
from ..config import settings
from ..db import Project, ProjectPart, get_json, get_session, get_setting, set_setting
from ..stl import grams

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/health")
def health():
    return {"ok": True, "claude": cc.enabled(), "nova": nova.status(), "ldraw_library": library.available(),
            "sarvam": bool(settings.sarvam_api_key)}


@router.get("/catalog")
def catalog():
    return {"parts": [p.to_dict() for p in kid_parts()], "colours": [colour_dict(c) for c in COLOURS],
            "kid_palette": KID_PALETTE}


# ---------------- parent gate ----------------
_fails: list[float] = []


class PinIn(BaseModel):
    pin: str


@router.post("/auth/parent")
def parent_login(body: PinIn, s: Session = Depends(get_session)):
    t = time.time()
    _fails[:] = [f for f in _fails if t - f < 60]
    if len(_fails) >= 5:
        raise HTTPException(429, "Too many tries. Wait a minute.")
    if not (body.pin.isdigit() and len(body.pin) == 4 and check_pin(s, body.pin)):
        _fails.append(t)
        raise HTTPException(401, "Wrong PIN")
    return {"token": make_token()}


class NewPinIn(BaseModel):
    pin: str


@router.post("/auth/pin")
def change_pin(body: NewPinIn, s: Session = Depends(get_session), _=Depends(require_parent)):
    if not (body.pin.isdigit() and len(body.pin) == 4):
        raise HTTPException(400, "PIN must be 4 digits")
    set_pin(s, body.pin)
    return {"ok": True}


# ---------------- settings ----------------
PUBLIC_KEYS = ["mute", "voice_on", "language", "voice_provider", "daily_minutes", "printable_colours",
               "only_inventory_colours", "avatar", "child_name", "inventory_mode", "mostly_extra"]
PARENT_KEYS = PUBLIC_KEYS + ["monthly_cap_usd", "calls_per_minute", "calls_per_day", "filament_g_per_cm3", "infill"]
JSON_KEYS = {"printable_colours", "avatar"}


def _read(s: Session, keys):
    out = {}
    for k in keys:
        v = get_setting(s, k)
        if k in JSON_KEYS:
            out[k] = get_json(s, k)
        elif v in ("true", "false"):
            out[k] = v == "true"
        else:
            try:
                out[k] = float(v) if "." in v else int(v)
            except ValueError:
                out[k] = v
    return out


@router.get("/settings")
def public_settings(s: Session = Depends(get_session)):
    return _read(s, PUBLIC_KEYS)


@router.get("/settings/full")
def full_settings(s: Session = Depends(get_session), _=Depends(require_parent)):
    return _read(s, PARENT_KEYS) | {"claude": cc.enabled(), "sarvam": bool(settings.sarvam_api_key),
                                    "models": {"quick": settings.model_quick, "inventory": settings.model_inventory,
                                               "big": settings.model_big}}


@router.put("/settings")
def update_settings(body: dict, s: Session = Depends(get_session), _=Depends(require_parent)):
    for k, v in body.items():
        if k not in PARENT_KEYS:
            continue
        if k in JSON_KEYS:
            set_setting(s, k, json.dumps(v))
        elif isinstance(v, bool):
            set_setting(s, k, "true" if v else "false")
        else:
            set_setting(s, k, str(v))
    return full_settings(s, True)


class AvatarIn(BaseModel):
    style: str = "photo"   # photo | cartoon
    outfit: str
    accessory: str
    headphones: bool
    background: str
    brick_colour: int


@router.put("/avatar")
def save_avatar(body: AvatarIn, s: Session = Depends(get_session)):
    """Avatar Studio is kid-safe: no AI call, just layered pieces."""
    set_setting(s, "avatar", body.model_dump_json())
    return get_json(s, "avatar")


# ---------------- print queue ----------------

@router.get("/print-queue")
def print_queue(s: Session = Depends(get_session), _=Depends(require_parent)):
    density = float(get_setting(s, "filament_g_per_cm3") or 1.24)
    infill = float(get_setting(s, "infill") or 0.35)
    projects = s.exec(select(Project).where(Project.status.in_(["Generated", "Printing"]))).all()
    groups: dict[int, dict] = {}
    for p in projects:
        for l in s.exec(select(ProjectPart).where(ProjectPart.project_id == p.id)):
            todo = l.quantity - l.printed
            if todo <= 0:
                continue
            part = get_part(l.part)
            g = grams(part, density, infill) if part else 0
            grp = groups.setdefault(l.colour, {"colour": colour_dict(l.colour), "pieces": 0, "grams": 0.0, "lines": {}})
            key = l.part
            line = grp["lines"].setdefault(key, {"part": l.part, "name": part.name if part else l.part, "quantity": 0,
                                                 "grams_each": g, "projects": []})
            line["quantity"] += todo
            if p.name not in line["projects"]:
                line["projects"].append(p.name)
            grp["pieces"] += todo
            grp["grams"] = round(grp["grams"] + g * todo, 1)
    out = []
    for g in sorted(groups.values(), key=lambda g: -g["pieces"]):
        g["lines"] = sorted(g["lines"].values(), key=lambda l: -l["quantity"])
        out.append(g)
    return {"groups": out, "projects": [{"id": p.id, "name": p.name, "status": p.status} for p in projects]}
