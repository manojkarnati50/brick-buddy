"""Saving models, versions, BOMs and thumbnails to disk + DB."""
from __future__ import annotations

import json
import uuid
from collections import Counter

from sqlmodel import Session, select

from .bom import bom_from_bricks, total
from .config import settings
from .db import ColourEvent, Project, ProjectPart, ProjectVersion, Sticker, now
from .ldraw import ParsedModel, parse_mpd
from .render import render_png


def read_mpd(p: Project) -> str:
    if not p.mpd_path:
        return ""
    f = settings.models_dir / p.mpd_path
    return f.read_text() if f.exists() else ""


def write_version(s: Session, p: Project, text: str, created_by: str, note: str = "") -> ProjectVersion:
    """Persist `text` as the next version of project `p` and make it current."""
    assert p.id is not None
    existing = s.exec(select(ProjectVersion).where(ProjectVersion.project_id == p.id)).all()
    version = max((v.version for v in existing), default=0) + 1
    tag = uuid.uuid4().hex[:6]
    mpd_name = f"p{p.id}-v{version}-{tag}.mpd"
    (settings.models_dir / mpd_name).write_text(text)
    parsed = parse_mpd(text)
    thumb = f"p{p.id}-v{version}-{tag}.png"
    render_png(parsed.bricks, settings.thumbs_dir / thumb)
    bom = bom_from_bricks(parsed.bricks)
    v = ProjectVersion(project_id=p.id, version=version, mpd_path=mpd_name, thumbnail=thumb,
                       bom_json=json.dumps(bom), created_by=created_by, note=note)
    s.add(v)
    p.current_version = version
    p.mpd_path = mpd_name
    p.thumbnail = thumb
    p.piece_count = total(bom)
    p.updated_at = now()
    _replace_parts(s, p, bom)
    s.add(p)
    return v


def _replace_parts(s: Session, p: Project, bom: list[dict]) -> None:
    for old in s.exec(select(ProjectPart).where(ProjectPart.project_id == p.id)).all():
        s.delete(old)
    for l in bom:
        s.add(ProjectPart(project_id=p.id, part=l["part"], colour=l["colour"]["code"], quantity=l["quantity"]))


def create_project(s: Session, *, name: str, text: str, request_text: str = "", created_by: str = "Claude",
                   model_used: str = "demo", cost: float = 0.0, source: str = "claude", narration: str = "",
                   from_inventory: bool = False, audio: str | None = None, status: str = "Generated") -> Project:
    p = Project(name=name[:80] or "My Model", request_text=request_text, request_audio=audio, model_used=model_used,
                cost_usd=round(cost, 5), source=source, narration=narration, from_inventory=from_inventory, status=status)
    s.add(p)
    s.flush()
    write_version(s, p, text, created_by)
    s.add(Sticker(kind="created", emoji="⭐", label=f"Made {p.name}", project_id=p.id))
    s.commit()
    s.refresh(p)
    return p


def parsed(p: Project) -> ParsedModel:
    return parse_mpd(read_mpd(p))


def record_colours(s: Session, codes: list[int], source: str) -> None:
    for code, n in Counter(codes).items():
        s.add(ColourEvent(colour=code, source=source, count=n))
