"""Backup: export/import everything as a zip (JSON tables + model files).

Personal media (her avatar art, real build photos, voice recordings) is excluded
unless the parent ticks "include photos".
"""
from __future__ import annotations

import io
import json
import zipfile
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlmodel import Session, SQLModel, select

from ..auth import require_parent, valid_token
from ..config import settings
from ..db import (ApiCall, BigBuild, ColourEvent, InventoryItem, InventoryLog, Project, ProjectPart, ProjectVersion,
                  Setting, Sticker, UsageDay, get_session)

router = APIRouter(prefix="/api/backup", tags=["backup"])
TABLES: list[type[SQLModel]] = [Project, ProjectVersion, ProjectPart, InventoryItem, InventoryLog, Sticker, ApiCall,
                                ColourEvent, UsageDay, BigBuild, Setting]


def _row(obj) -> dict:
    d = obj.model_dump()
    return {k: (v.isoformat() if isinstance(v, datetime) else v) for k, v in d.items()}


@router.get("/export")
def export(token: str | None = None, include_photos: bool = False, s: Session = Depends(get_session)):
    if not valid_token(token):
        raise HTTPException(401, "Parent gate required")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        data = {}
        for T in TABLES:
            rows = [_row(r) for r in s.exec(select(T)).all()]
            if T is Setting:
                rows = [r for r in rows if r["key"] != "pin_hash"]
            if T is Project and not include_photos:
                rows = [{**r, "photo": None, "request_audio": None} for r in rows]
            data[T.__tablename__] = rows
        z.writestr("data.json", json.dumps({"format": "brick-buddy-backup", "version": 1,
                                            "exported_at": datetime.now(timezone.utc).isoformat(),
                                            "include_photos": include_photos, "tables": data}, indent=1))
        for folder in ("models", "thumbs"):
            for f in (settings.data_dir / folder).glob("*"):
                if f.is_file():
                    z.write(f, f"{folder}/{f.name}")
        if include_photos:
            for folder in ("uploads", "private/avatar"):
                for f in (settings.data_dir / folder).glob("*"):
                    if f.is_file():
                        z.write(f, f"{folder}/{f.name}")
    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    return Response(buf.getvalue(), media_type="application/zip",
                    headers={"Content-Disposition": f'attachment; filename="brick-buddy-backup-{stamp}.zip"'})


@router.post("/import")
async def import_backup(file: UploadFile = File(...), s: Session = Depends(get_session), _=Depends(require_parent)):
    raw = await file.read()
    try:
        z = zipfile.ZipFile(io.BytesIO(raw))
        payload = json.loads(z.read("data.json"))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, "Not a Brick Buddy backup zip") from exc
    if payload.get("format") != "brick-buddy-backup":
        raise HTTPException(400, "Not a Brick Buddy backup zip")
    tables = payload["tables"]
    # restore files first (only into known folders; ignore anything else in the zip)
    allowed = {"models", "thumbs", "uploads", "private/avatar"}
    for name in z.namelist():
        folder, _, fname = name.rpartition("/")
        if folder in allowed and fname and "/" not in fname and not fname.startswith("."):
            target = settings.data_dir / folder / fname
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(z.read(name))
    for T in reversed(TABLES):
        if T is Setting:
            continue
        for r in s.exec(select(T)).all():
            s.delete(r)
    s.commit()
    for T in TABLES:
        for r in tables.get(T.__tablename__, []):
            for k, v in list(r.items()):
                field = T.model_fields.get(k)
                if field and isinstance(v, str) and "datetime" in str(field.annotation):
                    r[k] = datetime.fromisoformat(v.replace("Z", "+00:00"))
            if T is Setting:
                existing = s.get(Setting, r["key"])
                if existing:
                    existing.value = r["value"]
                    continue
            s.add(T(**r))
    s.commit()
    return {"ok": True, "projects": len(tables.get("project", []))}
