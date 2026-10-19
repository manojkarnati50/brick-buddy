"""First-run seed: starter inventory (8 colours) + 6 sample projects across all statuses."""
from __future__ import annotations

import logging
from datetime import timedelta

from sqlmodel import Session, select

from . import demo_builder
from .db import ColourEvent, Project, ProjectPart, Sticker, UsageDay, engine, now
from .generation import build_kid_plan
from .inventory import adjust, new_batch
from .ldraw import recolour_lines
from .store import create_project, read_mpd, write_version

log = logging.getLogger("brickbuddy.seed")

COLOURS8 = [4, 14, 1, 2, 15, 13, 25, 0]  # red yellow blue green white pink orange black
STARTER_PARTS = {"3001": 6, "3003": 8, "3004": 10, "3005": 8, "3010": 4, "3020": 3, "3022": 4, "3039": 2}


def seed_if_empty() -> None:
    with Session(engine) as s:
        if s.exec(select(Project)).first():
            return
        log.info("Seeding sample data")
        batch = new_batch()
        for colour in COLOURS8:
            for part, qty in STARTER_PARTS.items():
                adjust(s, part, colour, qty, "Starter inventory", batch=batch)
        s.commit()

        t = now()
        samples = [
            ("house", "a pink house for bunny", "Built", 20, {}),
            ("car", "a red car that goes fast", "Printed", 9, {}),
            ("tower", "rainbow tower", "Printing", 4, {}),
            ("bunny", "a white bunny", "Generated", 3, {}),
            ("tree", "apple tree", "Generated", 2, {"recolour": {2: 27, 4: 13}}),
            ("rocket", "rocket to the moon", "Archived", 30, {}),
        ]
        for key, words, status, days_ago, extra in samples:
            a = build_kid_plan(demo_builder.starter(key), max_parts=200)
            p = create_project(s, name=a.plan["name"], text=a.text, request_text=words, created_by="Starter",
                               source="demo", narration=a.plan.get("say", ""))
            created = t - timedelta(days=days_ago, hours=3)
            p.created_at = p.updated_at = created
            if extra.get("recolour"):
                from .ldraw import parse_mpd
                m = parse_mpd(read_mpd(p))
                changes = {b.line: extra["recolour"][b.colour] for b in m.bricks if b.colour in extra["recolour"]}
                write_version(s, p, recolour_lines(read_mpd(p), changes), "Aaradya painted", "Pink apples!")
                for c in extra["recolour"].values():
                    s.add(ColourEvent(colour=c, source="painted", count=3, created_at=created))
            lines = s.exec(select(ProjectPart).where(ProjectPart.project_id == p.id)).all()
            if status in ("Printed", "Built", "Printing"):
                pb = new_batch()
                for i, l in enumerate(lines):
                    q = l.quantity if status != "Printing" else (l.quantity if i % 2 == 0 else 0)
                    if q:
                        log_row = adjust(s, l.part, l.colour, q, f"Printed for {p.name}", project_id=p.id, batch=pb)
                        l.printed = q
                        s.add(l)
                p.printed_at = created + timedelta(days=1)
                # backdate the print log for the weekly chart
                from .db import InventoryLog
                for row in s.exec(select(InventoryLog).where(InventoryLog.batch == pb)).all():
                    row.created_at = created + timedelta(days=1)
            if status == "Built":
                p.built_at = created + timedelta(days=2)
                p.town_x, p.town_z = 0, 0
                s.add(Sticker(kind="built", emoji="🏆", label=f"Built {p.name}", project_id=p.id))
            if status == "Printed":
                p.town_x, p.town_z = 9, 0
            p.status = status
            p.favourite = key in ("house", "bunny")
            s.add(p)
            s.commit()
        for c, n in ((13, 6), (22, 3), (4, 2), (9, 2), (14, 1)):
            s.add(ColourEvent(colour=c, source="asked", count=n, created_at=t - timedelta(days=n)))
        for d in range(4):
            day = (t - timedelta(days=d)).date().isoformat()
            if not s.get(UsageDay, day):
                s.add(UsageDay(day=day, seconds=600 + d * 120, builds=1))
        s.commit()
