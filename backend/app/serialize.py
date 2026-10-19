"""JSON shapes returned to the frontend."""
from __future__ import annotations

from sqlmodel import Session, select

from .bom import compare, enrich
from .db import Project, ProjectPart, ProjectVersion, iso


def project_card(p: Project, s: Session) -> dict:
    lines = s.exec(select(ProjectPart).where(ProjectPart.project_id == p.id)).all()
    colours: dict[int, int] = {}
    for l in lines:
        colours[l.colour] = colours.get(l.colour, 0) + l.quantity
    from .catalog import colour_dict
    return {
        "id": p.id, "name": p.name, "status": p.status, "created_at": iso(p.created_at),
        "updated_at": iso(p.updated_at),
        "thumbnail": f"/files/thumbs/{p.thumbnail}" if p.thumbnail else None,
        "photo": f"/files/uploads/{p.photo}" if p.photo else None,
        "pieces": p.piece_count, "favourite": p.favourite, "from_inventory": p.from_inventory,
        "version": p.current_version, "model_used": p.model_used, "cost_usd": p.cost_usd,
        "source": p.source, "narration": p.narration, "request_text": p.request_text,
        "request_audio": f"/files/uploads/{p.request_audio}" if p.request_audio else None,
        "colours": [colour_dict(c) | {"count": n} for c, n in sorted(colours.items(), key=lambda kv: -kv[1])],
    }


def project_detail(p: Project, s: Session, available: dict) -> dict:
    lines = s.exec(select(ProjectPart).where(ProjectPart.project_id == p.id)).all()
    bom = [enrich(l.part, l.colour, l.quantity, printed=l.printed) for l in lines]
    bom, have, need = compare(bom, available)
    versions = s.exec(select(ProjectVersion).where(ProjectVersion.project_id == p.id).order_by(ProjectVersion.version)).all()
    return {
        **project_card(p, s),
        "bom": bom, "have": have, "need": need,
        "versions": [{"version": v.version, "thumbnail": f"/files/thumbs/{v.thumbnail}" if v.thumbnail else None,
                      "created_by": v.created_by, "created_at": iso(v.created_at), "note": v.note,
                      "pieces": sum(l["quantity"] for l in v.bom)} for v in versions],
        "mpd_url": f"/files/models/{p.mpd_path}" if p.mpd_path else None,
    }
