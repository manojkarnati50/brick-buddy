"""Dashboard numbers and chart data."""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlmodel import Session, func, select

from .. import claude_client as cc
from ..catalog import colour_dict, get_part
from ..db import (ApiCall, ColourEvent, InventoryLog, Project, ProjectPart, UsageDay, get_session, get_setting, now)
from ..inventory import owned_map, totals

router = APIRouter(prefix="/api", tags=["stats"])


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _streak(s: Session) -> int:
    days = {u.day for u in s.exec(select(UsageDay)) if u.seconds > 30 or u.builds > 0}
    days |= {p.created_at.date().isoformat() for p in s.exec(select(Project))}
    d = now().date()
    if d.isoformat() not in days:
        d -= timedelta(days=1)
    n = 0
    while d.isoformat() in days:
        n += 1
        d -= timedelta(days=1)
    return n


@router.get("/stats")
def stats(s: Session = Depends(get_session)):
    projects = s.exec(select(Project).where(Project.status != "Archived")).all()
    all_projects = s.exec(select(Project)).all()
    generated = sum(p.piece_count for p in all_projects)
    printed = int(s.exec(select(func.coalesce(func.sum(ProjectPart.printed), 0))).one())
    inv = totals(s)
    today = now().date()
    this_w, last_w = _week_start(today), _week_start(today) - timedelta(days=7)

    def in_week(dt, start):
        return start <= dt.date() < start + timedelta(days=7)

    # week-over-week uses rolling 7-day windows so Monday mornings don't read as zero
    this_w, last_w = today - timedelta(days=6), today - timedelta(days=13)

    printed_logs = [l for l in s.exec(select(InventoryLog).where(InventoryLog.project_id != None, InventoryLog.undone == False))  # noqa: E711,E712
                    if l.delta > 0]
    wk = {
        "projects": (sum(in_week(p.created_at, this_w) for p in all_projects), sum(in_week(p.created_at, last_w) for p in all_projects)),
        "generated": (sum(p.piece_count for p in all_projects if in_week(p.created_at, this_w)),
                      sum(p.piece_count for p in all_projects if in_week(p.created_at, last_w))),
        "printed": (sum(l.delta for l in printed_logs if in_week(l.created_at, this_w)),
                    sum(l.delta for l in printed_logs if in_week(l.created_at, last_w))),
    }
    # weekly bars (8 calendar weeks)
    weeks = []
    for i in range(7, -1, -1):
        start = _week_start(today) - timedelta(days=7 * i)
        weeks.append({"week": start.strftime("%d %b"),
                      "generated": sum(p.piece_count for p in all_projects if in_week(p.created_at, start)),
                      "printed": sum(l.delta for l in printed_logs if in_week(l.created_at, start))})
    owned = owned_map(s)
    by_colour, by_size = defaultdict(int), defaultdict(int)
    for (part, col), q in owned.items():
        if q <= 0:
            continue
        by_colour[col] += q
        p = get_part(part)
        by_size[p.size_group if p else "special"] += q
    fav = defaultdict(int)
    for e in s.exec(select(ColourEvent)):
        fav[e.colour] += e.count
    statuses = defaultdict(int)
    for p in all_projects:
        statuses[p.status] += 1
    spent = cc.month_spend(s)
    by_model = defaultdict(float)
    month_start = now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    for c in s.exec(select(ApiCall).where(ApiCall.created_at >= month_start)):
        by_model[c.model] += c.cost_usd
    from ..config import settings
    return {
        "counters": {
            "projects": len(projects), "pieces_generated": generated, "pieces_printed": printed,
            "inventory": inv["owned"], "available": inv["available"], "in_use": inv["in_use"], "streak": _streak(s),
        },
        "week_over_week": {k: {"this": a, "last": b} for k, (a, b) in wk.items()},
        "weekly": weeks,
        "inventory_by_colour": [colour_dict(c) | {"value": v} for c, v in sorted(by_colour.items(), key=lambda kv: -kv[1])],
        "inventory_by_size": [{"size": k, "value": v} for k, v in sorted(by_size.items(), key=lambda kv: -kv[1])],
        "favourite_colours": [colour_dict(c) | {"value": v} for c, v in sorted(fav.items(), key=lambda kv: -kv[1])[:8]],
        "statuses": dict(statuses),
        "spend": {"month_usd": round(spent, 4), "month_inr": round(spent * settings.usd_to_inr, 2),
                  "cap_usd": float(get_setting(s, "monthly_cap_usd") or 0), "by_model": {k: round(v, 4) for k, v in by_model.items()},
                  "total_usd": round(float(s.exec(select(func.coalesce(func.sum(ApiCall.cost_usd), 0.0))).one()), 4)},
    }
