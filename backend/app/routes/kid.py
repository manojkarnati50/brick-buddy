"""Kid extras: stickers, story time, time limit, her town, avatar art."""
from __future__ import annotations

import random

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from .. import claude_client as cc
from ..auth import require_parent
from ..catalog import COLOURS
from ..config import settings
from ..db import Project, Sticker, UsageDay, get_json, get_session, get_setting, iso, now
from ..prompts import KID_SAFETY, STORY, STORY_SCHEMA
from ..store import parsed

router = APIRouter(prefix="/api", tags=["kid"])

POSES = ["wave", "think", "jump", "hug", "pout", "bike", "hips"]


@router.get("/stickers")
def stickers(s: Session = Depends(get_session)):
    rows = s.exec(select(Sticker).order_by(Sticker.created_at.desc())).all()
    return [{"id": r.id, "kind": r.kind, "emoji": r.emoji, "label": r.label, "project_id": r.project_id,
             "at": iso(r.created_at)} for r in rows]


class StickerIn(BaseModel):
    kind: str
    emoji: str = "🌟"
    label: str = "Super star!"
    project_id: int | None = None


@router.post("/stickers")
def add_sticker(body: StickerIn, s: Session = Depends(get_session)):
    if body.kind not in ("game", "story", "avatar"):
        raise HTTPException(400, "Kid can only earn game/story/avatar stickers here")
    st = Sticker(kind=body.kind, emoji=body.emoji[:8], label=body.label[:60], project_id=body.project_id)
    s.add(st); s.commit()
    return {"ok": True}


class StoryIn(BaseModel):
    project_id: int


OUTFIT_DESC = {"cherry": "in a white top with a red cherry and starry blue jeans", "hoodie": "in a cosy green hoodie",
               "party": "in a sparkly party dress", "raincoat": "in a yellow raincoat", "princess": "in a princess dress",
               "astronaut": "in a little astronaut suit"}


@router.post("/story")
def story(body: StoryIn, s: Session = Depends(get_session)):
    p = s.get(Project, body.project_id)
    if not p:
        raise HTTPException(404)
    child = get_setting(s, "child_name") or "Aaradya"
    avatar = get_json(s, "avatar")
    m = parsed(p)
    cols = sorted({COLOURS[b.colour].kid_name for b in m.bricks if b.colour in COLOURS})[:4]
    lang = {"en": "English", "te": "Telugu (simple words)", "both": "English, with a few simple Telugu words"}.get(get_setting(s, "language"), "English")
    if cc.enabled():
        try:
            data, _, _ = cc.call_json(
                purpose="story", model=settings.model_quick, system=KID_SAFETY.format(child=child),
                messages=[{"role": "user", "content": STORY.format(
                    child=child, avatar_desc=OUTFIT_DESC.get(avatar.get("outfit"), "with long wavy hair"),
                    model=p.name, colours=", ".join(cols), language=lang)}],
                schema=STORY_SCHEMA, max_tokens=4000)
            s.add(Sticker(kind="story", emoji="📖", label=f"Story: {data.get('title', p.name)}"[:60], project_id=p.id)); s.commit()
            return {"title": data.get("title") or p.name, "paragraphs": data.get("paragraphs") or [], "offline": False}
        except (cc.LimitReached, cc.GentleRedirect, RuntimeError):
            pass
    colours = " and ".join(cols[:2]) or "bright"
    return {"title": f"{child} and the {p.name}", "offline": True, "paragraphs": [
        f"Once upon a time, {child} built something very special. It was the {p.name}, all {colours}!",
        "She clicked one brick, and another brick, and another. Click, click, click!",
        f"A little bunny hopped by. \"Wow!\" said the bunny. \"Can I play with the {p.name} too?\"",
        f"\"Yes!\" said {child}. They played and laughed all afternoon in the sunshine.",
        "When the stars came out, the bunny gave a big yawn. Time to rest.",
        f"{child} gave her {p.name} a gentle pat. \"Good night,\" she whispered. \"Tomorrow we build again!\"",
        "The end.",
    ]}


class PingIn(BaseModel):
    seconds: int


@router.post("/usage/ping")
def usage_ping(body: PingIn, s: Session = Depends(get_session)):
    day = now().date().isoformat()
    u = s.get(UsageDay, day) or UsageDay(day=day)
    u.seconds += max(0, min(body.seconds, 120))
    s.add(u); s.commit()
    return usage_today(s)


@router.get("/usage/today")
def usage_today(s: Session = Depends(get_session)):
    day = now().date().isoformat()
    u = s.get(UsageDay, day) or UsageDay(day=day)
    limit = int(get_setting(s, "daily_minutes") or 0)
    used = u.seconds // 60
    return {"used_minutes": used, "limit_minutes": limit, "remaining_minutes": max(0, limit - used) if limit else None,
            "time_up": bool(limit and used >= limit)}


@router.post("/usage/extend")
def usage_extend(s: Session = Depends(get_session), _=Depends(require_parent)):
    """Parent grants 10 more minutes today."""
    day = now().date().isoformat()
    u = s.get(UsageDay, day) or UsageDay(day=day)
    u.seconds = max(0, u.seconds - 600)
    s.add(u); s.commit()
    return usage_today(s)


@router.get("/town")
def town(s: Session = Depends(get_session)):
    rows = s.exec(select(Project).where(Project.status.in_(["Built", "Printed"]))).all()
    out = []
    for i, p in enumerate(sorted(rows, key=lambda p: p.created_at)):
        x = p.town_x if p.town_x is not None else (i % 4) * 9
        z = p.town_z if p.town_z is not None else (i // 4) * 9
        m = parsed(p)
        out.append({"id": p.id, "name": p.name, "status": p.status, "x": x, "z": z,
                    "bricks": [b.to_dict() for b in m.bricks]})
    return out


# ---- optional custom avatar art (generated from the prompts in docs/AVATAR_PROMPTS.md) ----
# Stored under data/private/avatar/ ; never exported unless the parent ticks "include photos".

@router.get("/avatar/art")
def avatar_art():
    d = settings.private_dir / "avatar"
    return {pose: f"/api/avatar/art/{pose}" for pose in POSES if (d / f"{pose}.png").exists()}


@router.get("/avatar/art/{pose}")
def avatar_art_file(pose: str):
    if pose not in POSES:
        raise HTTPException(404)
    f = settings.private_dir / "avatar" / f"{pose}.png"
    if not f.exists():
        raise HTTPException(404)
    return FileResponse(f, headers={"Cache-Control": "no-store"})


@router.post("/avatar/art/{pose}")
async def upload_avatar_art(pose: str, file: UploadFile = File(...), _=Depends(require_parent)):
    if pose not in POSES:
        raise HTTPException(400, f"pose must be one of {POSES}")
    data = await file.read()
    if not data.startswith(b"\x89PNG"):
        raise HTTPException(400, "Upload a PNG (transparent background works best)")
    (settings.private_dir / "avatar" / f"{pose}.png").write_bytes(data)
    return avatar_art()


@router.delete("/avatar/art/{pose}")
def delete_avatar_art(pose: str, _=Depends(require_parent)):
    f = settings.private_dir / "avatar" / f"{pose}.png"
    if pose in POSES and f.exists():
        f.unlink()
    return avatar_art()


@router.get("/game/round")
def game_round(kind: str = "find", s: Session = Depends(get_session)):
    """A tiny game round built from one of her own models."""
    rows = s.exec(select(Project).where(Project.status != "Archived")).all()
    if not rows:
        raise HTTPException(404, "Make a model first!")
    p = random.choice(rows)
    m = parsed(p)
    cols = sorted({b.colour for b in m.bricks if b.colour in COLOURS})
    target = random.choice(cols) if cols else 4
    levels = sorted({round(-b.bbox[1] / 24) for b in m.bricks if b.part}) if m.bricks else [0]
    return {"project_id": p.id, "name": p.name, "kind": kind, "target_colour": target,
            "count": sum(1 for b in m.bricks if b.colour == target), "tall": max(levels) if levels else 1}
