"""Inventory: tiles, steppers, batches, history log, undo."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..auth import require_parent
from ..bom import enrich
from ..catalog import COLOURS, get_part
from ..db import InventoryLog, get_session, iso
from ..inventory import adjust, in_use_map, new_batch, owned_map, totals, undo_batch

router = APIRouter(prefix="/api/inventory", tags=["inventory"])
LOW_STOCK = 3


@router.get("")
def list_inventory(s: Session = Depends(get_session)):
    owned = owned_map(s)
    use = in_use_map(s)
    items = []
    for key in sorted(set(owned) | set(use), key=lambda k: (k[1], k[0])):
        o, u = owned.get(key, 0), use.get(key, 0)
        a = o - u
        items.append(enrich(key[0], key[1], o, owned=o, in_use=u, available=a, low=a <= LOW_STOCK))
    return {"items": items, "totals": totals(s), "low_stock_threshold": LOW_STOCK}


class SetIn(BaseModel):
    part: str
    colour: int
    quantity: int | None = None   # absolute
    delta: int | None = None      # relative (+/- steppers)
    reason: str = "Manual edit"


def _validate(part: str, colour: int):
    if not get_part(part):
        raise HTTPException(400, f"Unknown part {part}")
    if colour not in COLOURS:
        raise HTTPException(400, f"Unknown colour {colour}")


@router.post("/set")
def set_item(body: SetIn, s: Session = Depends(get_session), _=Depends(require_parent)):
    _validate(body.part, body.colour)
    current = owned_map(s).get((body.part, body.colour), 0)
    delta = body.delta if body.delta is not None else (body.quantity or 0) - current
    if delta:
        adjust(s, body.part, body.colour, delta, body.reason, batch=new_batch())
        s.commit()
    return list_inventory(s)


class BatchLine(BaseModel):
    part: str
    colour: int
    quantity: int


class BatchIn(BaseModel):
    lines: list[BatchLine]
    reason: str = "Printed a batch"


@router.post("/batch")
def add_batch(body: BatchIn, s: Session = Depends(get_session), _=Depends(require_parent)):
    batch = new_batch()
    for l in body.lines:
        _validate(l.part, l.colour)
        if l.quantity:
            adjust(s, l.part, l.colour, l.quantity, body.reason, batch=batch)
    s.commit()
    return {"batch": batch, **list_inventory(s)}


@router.post("/undo/{batch}")
def undo(batch: str, s: Session = Depends(get_session), _=Depends(require_parent)):
    n = undo_batch(s, batch)
    s.commit()
    return {"undone": n, **list_inventory(s)}


@router.get("/log")
def log(limit: int = 200, s: Session = Depends(get_session), _=Depends(require_parent)):
    rows = s.exec(select(InventoryLog).order_by(InventoryLog.created_at.desc()).limit(limit)).all()
    out = []
    for r in rows:
        p = get_part(r.part)
        out.append({"id": r.id, "at": iso(r.created_at), "part": r.part, "name": p.name if p else r.part,
                    "colour": r.colour, "colour_name": COLOURS[r.colour].name if r.colour in COLOURS else str(r.colour),
                    "delta": r.delta, "reason": r.reason, "project_id": r.project_id, "batch": r.batch, "undone": r.undone})
    return out
