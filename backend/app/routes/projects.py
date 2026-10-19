"""Projects: list, detail, 3D data, recolour (Colour Studio), statuses, printing."""
from __future__ import annotations

import base64
import io
import json
import uuid
import zipfile
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlmodel import Session, select

from .. import claude_client as cc
from ..auth import require_parent, valid_token
from ..catalog import COLOURS, KID_PALETTE, colour_dict, get_part
from ..config import settings
from ..db import (Project, ProjectPart, ProjectVersion, Sticker, get_json, get_session, get_setting, now)
from ..inventory import adjust, available_map, new_batch
from ..ldraw import parse_mpd, recolour_lines
from ..prompts import KID_SAFETY, SURPRISE_COLOURS, SURPRISE_SCHEMA
from ..serialize import project_card, project_detail
from ..stl import grams, stl_bytes
from ..store import create_project, read_mpd, record_colours, write_version

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _get(s: Session, pid: int) -> Project:
    p = s.get(Project, pid)
    if not p:
        raise HTTPException(404, "Project not found")
    return p


@router.get("")
def list_projects(status: str | None = None, colour: int | None = None, q: str | None = None,
                  date_from: str | None = None, date_to: str | None = None, favourite: bool | None = None,
                  include_archived: bool = False, s: Session = Depends(get_session)):
    stmt = select(Project).order_by(Project.created_at.desc())
    if status:
        stmt = stmt.where(Project.status == status)
    elif not include_archived:
        stmt = stmt.where(Project.status != "Archived")
    if q:
        stmt = stmt.where(Project.name.ilike(f"%{q}%"))
    if favourite is not None:
        stmt = stmt.where(Project.favourite == favourite)
    if date_from:
        stmt = stmt.where(Project.created_at >= datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc))
    if date_to:
        stmt = stmt.where(Project.created_at <= datetime.fromisoformat(date_to + "T23:59:59").replace(tzinfo=timezone.utc))
    rows = s.exec(stmt).all()
    if colour is not None:
        ids = set(s.exec(select(ProjectPart.project_id).where(ProjectPart.colour == colour)).all())
        rows = [p for p in rows if p.id in ids]
    return [project_card(p, s) for p in rows]


@router.get("/{pid}")
def get_project(pid: int, s: Session = Depends(get_session)):
    p = _get(s, pid)
    avail = available_map(s, exclude_project=pid)
    return project_detail(p, s, avail)


@router.get("/{pid}/model")
def get_model(pid: int, version: int | None = None, s: Session = Depends(get_session)):
    """Bricks for the 3D viewer: world positions, colours, line numbers (for painting), sections and steps."""
    p = _get(s, pid)
    text = read_mpd(p)
    if version and version != p.current_version:
        v = s.exec(select(ProjectVersion).where(ProjectVersion.project_id == pid, ProjectVersion.version == version)).first()
        if v:
            text = (settings.models_dir / v.mpd_path).read_text()
    m = parse_mpd(text)
    return {"id": p.id, "name": p.name, "bricks": [b.to_dict() for b in m.bricks], "sections": m.sections,
            "steps": m.steps, "mpd": text}


class Change(BaseModel):
    line: int
    colour: int


class RecolourIn(BaseModel):
    changes: list[Change]
    created_by: str = "Aaradya painted"
    note: str = ""
    as_copy: bool = False


@router.post("/{pid}/recolour")
def recolour(pid: int, body: RecolourIn, s: Session = Depends(get_session),
             x_parent_token: str | None = Header(default=None)):
    """Colour Studio save: only colour codes change, geometry is untouched; no Claude call."""
    p = _get(s, pid)
    if body.as_copy and not valid_token(x_parent_token):
        raise HTTPException(401, "Ask a grown-up to save a copy")
    for c in body.changes:
        if c.colour not in COLOURS:
            raise HTTPException(400, f"Unknown colour {c.colour}")
    if not body.changes:
        raise HTTPException(400, "Nothing to change")
    text = recolour_lines(read_mpd(p), {c.line: c.colour for c in body.changes})
    if p.status in ("Printed", "Built", "Printing") and not body.as_copy:
        raise HTTPException(409, "This model is already printed. Save the new colours as a copy?")
    if body.as_copy:
        copy = create_project(s, name=f"{p.name} (new colours)", text=text, request_text=p.request_text,
                              created_by=body.created_by, model_used=p.model_used, source="copy",
                              narration=p.narration, from_inventory=p.from_inventory)
        target = copy
    else:
        write_version(s, p, text, body.created_by, body.note)
        target = p
    if body.created_by.startswith("Aaradya"):
        record_colours(s, [c.colour for c in body.changes], "painted")
        s.add(Sticker(kind="painted", emoji="🎨", label=f"Painted {target.name}", project_id=target.id))
    s.commit()
    s.refresh(target)
    return project_detail(target, s, available_map(s, exclude_project=target.id))


@router.post("/{pid}/restore/{version}")
def restore(pid: int, version: int, s: Session = Depends(get_session)):
    """Go back to an older version (saved as a new version so nothing is lost)."""
    p = _get(s, pid)
    v = s.exec(select(ProjectVersion).where(ProjectVersion.project_id == pid, ProjectVersion.version == version)).first()
    if not v:
        raise HTTPException(404, "No such version")
    if p.status in ("Printed", "Built"):
        raise HTTPException(409, "Already printed; recolour as a copy instead.")
    write_version(s, p, (settings.models_dir / v.mpd_path).read_text(), "Parent edit", f"Back to v{version}")
    s.commit()
    return project_detail(p, s, available_map(s, exclude_project=pid))


class SurpriseIn(BaseModel):
    theme: str = ""
    inventory_only: bool = False


THEMES = ["rainbow", "princess pink", "ocean", "sunshine", "forest", "candy", "space night", "ice cream"]


@router.post("/{pid}/surprise-colours")
def surprise_colours(pid: int, body: SurpriseIn, s: Session = Depends(get_session)):
    """Claude proposes a new colour scheme. Returns line->colour changes; the client applies (and can undo) then saves."""
    import random
    p = _get(s, pid)
    m = parse_mpd(read_mpd(p))
    palette = [c for c in get_json(s, "printable_colours") if c in COLOURS] or KID_PALETTE
    theme = body.theme or random.choice(THEMES)
    groups: dict[str, set] = {}
    for b in m.bricks:
        groups.setdefault(b.section, set()).add(b.colour)
    mapping: dict[tuple[str, int], int] = {}
    scheme, say = theme.title(), "Ta-da! New colours!"
    if cc.enabled():
        try:
            data, _, cost = cc.call_json(
                purpose="surprise-colours", model=settings.model_quick,
                system=KID_SAFETY.format(child=get_setting(s, "child_name")),
                messages=[{"role": "user", "content": SURPRISE_COLOURS.format(
                    name=p.name, theme=theme,
                    groups=json.dumps({g: [f"{c} {COLOURS[c].name}" if c in COLOURS else str(c) for c in sorted(cs)] for g, cs in groups.items()}),
                    palette=", ".join(f"{c} {COLOURS[c].name}" for c in palette))}],
                schema=SURPRISE_SCHEMA, max_tokens=4000)
            scheme, say = data.get("scheme") or scheme, data.get("say") or say
            for ch in data.get("changes", []):
                if ch.get("to_colour") in palette:
                    mapping[(ch["group"], ch["from_colour"])] = ch["to_colour"]
        except (cc.LimitReached, cc.GentleRedirect, RuntimeError):
            mapping = {}
    if not mapping:  # offline rainbow: cycle the palette over groups/colours
        rnd = random.Random()
        pool = palette[:]
        rnd.shuffle(pool)
        i = 0
        for g, cs in groups.items():
            for c in sorted(cs):
                mapping[(g, c)] = pool[i % len(pool)]
                i += 1
    changes = []
    for b in m.bricks:
        new = mapping.get((b.section, b.colour))
        if new is not None and new != b.colour:
            changes.append({"line": b.line, "colour": new})
    # dedupe per line (a line can appear in several instances)
    seen, uniq = set(), []
    for c in changes:
        if c["line"] not in seen:
            seen.add(c["line"]); uniq.append(c)
    return {"scheme": scheme, "say": say, "changes": uniq}


class PatchIn(BaseModel):
    name: str | None = None
    favourite: bool | None = None
    status: str | None = None
    town_x: int | None = None
    town_z: int | None = None


@router.patch("/{pid}")
def patch_project(pid: int, body: PatchIn, s: Session = Depends(get_session), _=Depends(require_parent)):
    p = _get(s, pid)
    if body.name is not None:
        p.name = body.name[:80]
    if body.favourite is not None:
        p.favourite = body.favourite
    if body.status is not None:
        if body.status not in ("Generated", "Printing", "Printed", "Built", "Archived"):
            raise HTTPException(400, "Bad status")
        p.status = body.status
    if body.town_x is not None:
        p.town_x, p.town_z = body.town_x, body.town_z
    p.updated_at = now()
    s.add(p); s.commit()
    return project_card(p, s)


@router.post("/{pid}/favourite")
def toggle_favourite(pid: int, s: Session = Depends(get_session)):
    p = _get(s, pid)
    p.favourite = not p.favourite
    s.add(p); s.commit()
    return project_card(p, s)


@router.delete("/{pid}")
def delete_project(pid: int, s: Session = Depends(get_session), _=Depends(require_parent)):
    p = _get(s, pid)
    for row in s.exec(select(ProjectPart).where(ProjectPart.project_id == pid)).all():
        s.delete(row)
    for v in s.exec(select(ProjectVersion).where(ProjectVersion.project_id == pid)).all():
        for f in (settings.models_dir / v.mpd_path, settings.thumbs_dir / (v.thumbnail or "_")):
            if f.is_file():
                f.unlink()
        s.delete(v)
    s.delete(p)
    s.commit()
    return {"ok": True}


class PrintLine(BaseModel):
    part: str
    colour: int
    quantity: int


class PrintIn(BaseModel):
    lines: list[PrintLine] | None = None   # None = everything


@router.post("/{pid}/print")
def mark_printed(pid: int, body: PrintIn, s: Session = Depends(get_session), _=Depends(require_parent)):
    """Add printed BOM lines to the inventory. Returns a batch id for undo."""
    p = _get(s, pid)
    bom = s.exec(select(ProjectPart).where(ProjectPart.project_id == pid)).all()
    want = {(l.part, l.colour): l.quantity for l in body.lines} if body.lines is not None else None
    batch = new_batch()
    added = 0
    for l in bom:
        remaining = max(0, l.quantity - l.printed)
        q = remaining if want is None else min(remaining, max(0, want.get((l.part, l.colour), 0)))
        if q <= 0:
            continue
        adjust(s, l.part, l.colour, q, f"Printed for {p.name}", project_id=pid, batch=batch)
        l.printed += q
        added += q
        s.add(l)
    fully = all(l.printed >= l.quantity for l in bom)
    if added:
        p.status = "Printed" if fully else "Printing"
        if fully:
            p.printed_at = now()
            s.add(Sticker(kind="printed", emoji="🖨️", label=f"Printed {p.name}", project_id=pid))
        p.updated_at = now()
    s.add(p)
    s.commit()
    return {"batch": batch, "added": added, "status": p.status}


@router.post("/{pid}/unprint/{batch}")
def undo_print(pid: int, batch: str, s: Session = Depends(get_session), _=Depends(require_parent)):
    from ..db import InventoryLog
    from ..inventory import undo_batch
    rows = s.exec(select(InventoryLog).where(InventoryLog.batch == batch, InventoryLog.undone == False)).all()  # noqa: E712
    for r in rows:
        line = s.exec(select(ProjectPart).where(ProjectPart.project_id == pid, ProjectPart.part == r.part,
                                                ProjectPart.colour == r.colour)).first()
        if line:
            line.printed = max(0, line.printed - r.delta)
            s.add(line)
    undo_batch(s, batch)
    p = _get(s, pid)
    lines = s.exec(select(ProjectPart).where(ProjectPart.project_id == pid)).all()
    p.status = "Generated" if all(l.printed == 0 for l in lines) else "Printing"
    s.add(p); s.commit()
    return {"ok": True, "status": p.status}


@router.post("/{pid}/built")
def we_built_it(pid: int, s: Session = Depends(get_session)):
    """Kid button: 'We built it!' -> Built; its bricks move from available to in use."""
    p = _get(s, pid)
    avail = available_map(s, exclude_project=pid)
    lines = s.exec(select(ProjectPart).where(ProjectPart.project_id == pid)).all()
    missing = sum(max(0, l.quantity - max(0, avail.get((l.part, l.colour), 0))) for l in lines)
    p.status = "Built"
    p.built_at = now()
    if p.town_x is None:
        n = len(s.exec(select(Project).where(Project.town_x != None)).all())  # noqa: E711
        p.town_x, p.town_z = (n % 4) * 8, (n // 4) * 8
    s.add(p)
    s.add(Sticker(kind="built", emoji="🏆", label=f"Built {p.name}", project_id=pid))
    s.commit()
    return {"ok": True, "missing": missing, "status": p.status}


@router.post("/{pid}/take-apart")
def take_apart(pid: int, s: Session = Depends(get_session)):
    p = _get(s, pid)
    if p.status == "Built":
        p.status = "Printed"
        s.add(p); s.commit()
    return {"ok": True, "status": p.status}


@router.post("/{pid}/photo")
async def upload_photo(pid: int, file: UploadFile = File(...), s: Session = Depends(get_session), _=Depends(require_parent)):
    p = _get(s, pid)
    ext = (file.filename or "photo.jpg").rsplit(".", 1)[-1].lower()
    if ext not in ("jpg", "jpeg", "png", "webp", "heic"):
        raise HTTPException(400, "Use a JPG/PNG/WebP photo")
    name = f"build-{pid}-{uuid.uuid4().hex[:6]}.{ext}"
    (settings.uploads_dir / name).write_bytes(await file.read())
    p.photo = name
    s.add(p); s.commit()
    return project_card(p, s)


class ThumbIn(BaseModel):
    png_base64: str


@router.post("/{pid}/thumbnail")
def browser_thumbnail(pid: int, body: ThumbIn, s: Session = Depends(get_session)):
    """Optional nicer thumbnail rendered by the three.js viewer (replaces the isometric one)."""
    p = _get(s, pid)
    data = base64.b64decode(body.png_base64.split(",")[-1])
    if not data.startswith(b"\x89PNG") or len(data) > 3_000_000:
        raise HTTPException(400, "Not a PNG")
    if p.thumbnail:
        (settings.thumbs_dir / p.thumbnail).write_bytes(data)
    return {"ok": True}


@router.get("/{pid}/print-list")
def print_list(pid: int, s: Session = Depends(get_session)):
    p = _get(s, pid)
    density = float(get_setting(s, "filament_g_per_cm3") or 1.24)
    infill = float(get_setting(s, "infill") or 0.35)
    rows, per_colour = [], {}
    for l in s.exec(select(ProjectPart).where(ProjectPart.project_id == pid)).all():
        part = get_part(l.part)
        g = grams(part, density, infill) if part else 0
        todo = max(0, l.quantity - l.printed)
        rows.append({"part": l.part, "name": part.name if part else l.part, "colour": colour_dict(l.colour),
                     "quantity": l.quantity, "printed": l.printed, "to_print": todo, "grams_each": g, "grams": round(g * todo, 1)})
        c = per_colour.setdefault(l.colour, {"colour": colour_dict(l.colour), "pieces": 0, "grams": 0.0})
        c["pieces"] += todo; c["grams"] = round(c["grams"] + g * todo, 1)
    return {"project": p.name, "lines": rows, "by_colour": list(per_colour.values())}


@router.get("/{pid}/stl.zip")
def stl_zip(pid: int, token: str | None = None, s: Session = Depends(get_session)):
    # token in query so the browser can download via a plain link
    if not valid_token(token):
        raise HTTPException(401, "Parent gate required")
    p = _get(s, pid)
    lines = s.exec(select(ProjectPart).where(ProjectPart.project_id == pid)).all()
    pl = print_list(pid, s)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        done = set()
        for l in lines:
            part = get_part(l.part)
            if not part or l.part in done:
                continue
            done.add(l.part)
            z.writestr(f"stl/{l.part}-{part.name.replace('×', 'x').replace(' ', '-')}.stl", stl_bytes(part, part.name))
        txt = [f"Print list for {p.name}", ""]
        for r in pl["lines"]:
            txt.append(f"{r['to_print']:>3} x {r['name']:<18} ({r['part']})  {r['colour']['name']:<16} ~{r['grams']} g")
        txt += ["", "Filament per colour:"] + [f"  {c['colour']['name']}: {c['pieces']} pieces, ~{c['grams']} g" for c in pl["by_colour"]]
        z.writestr("print-list.txt", "\n".join(txt))
        z.writestr("model.mpd", read_mpd(p))
    fname = "".join(ch for ch in p.name if ch.isalnum() or ch in " -_").strip().replace(" ", "-") or "model"
    return Response(buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="{fname}-print.zip"'})
