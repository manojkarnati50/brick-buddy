"""Inventory maths. `quantity` = bricks we own. Bricks inside `Built` models are 'in use'.
available = owned - in use.
"""
from __future__ import annotations

import uuid
from collections import defaultdict

from sqlmodel import Session, select

from .db import InventoryItem, InventoryLog, Project, ProjectPart


def owned_map(s: Session) -> dict[tuple[str, int], int]:
    return {(i.part, i.colour): i.quantity for i in s.exec(select(InventoryItem))}


def in_use_map(s: Session, exclude_project: int | None = None) -> dict[tuple[str, int], int]:
    out: dict[tuple[str, int], int] = defaultdict(int)
    built = s.exec(select(Project.id).where(Project.status == "Built")).all()
    for pid in built:
        if pid == exclude_project:
            continue
        for l in s.exec(select(ProjectPart).where(ProjectPart.project_id == pid)):
            out[(l.part, l.colour)] += l.quantity
    return dict(out)


def available_map(s: Session, exclude_project: int | None = None) -> dict[tuple[str, int], int]:
    owned = owned_map(s)
    use = in_use_map(s, exclude_project)
    keys = set(owned) | set(use)
    return {k: owned.get(k, 0) - use.get(k, 0) for k in keys}


def adjust(s: Session, part: str, colour: int, delta: int, reason: str, *, project_id=None, batch=None) -> InventoryItem:
    item = s.exec(select(InventoryItem).where(InventoryItem.part == part, InventoryItem.colour == colour)).first()
    if not item:
        item = InventoryItem(part=part, colour=colour, quantity=0)
        s.add(item)
    item.quantity = max(0, item.quantity + delta)
    s.add(InventoryLog(part=part, colour=colour, delta=delta, reason=reason, project_id=project_id, batch=batch))
    return item


def new_batch() -> str:
    return uuid.uuid4().hex[:12]


def undo_batch(s: Session, batch: str) -> int:
    rows = s.exec(select(InventoryLog).where(InventoryLog.batch == batch, InventoryLog.undone == False)).all()  # noqa: E712
    for r in rows:
        item = s.exec(select(InventoryItem).where(InventoryItem.part == r.part, InventoryItem.colour == r.colour)).first()
        if item:
            item.quantity = max(0, item.quantity - r.delta)
        r.undone = True
    return len(rows)


def totals(s: Session) -> dict:
    owned = owned_map(s)
    use = in_use_map(s)
    o = sum(owned.values())
    u = sum(use.values())
    return {"owned": o, "in_use": u, "available": max(0, o - u)}
