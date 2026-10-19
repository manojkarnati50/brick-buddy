"""Fast stud-grid checks for kid models: collisions, floating parts, size.

These run on every build (with or without LDraw Nova). When LDraw Nova is
installed, its `analyze_geometry` diagnostics are merged in as well (nova.py).
"""
from __future__ import annotations

from collections import defaultdict, deque

from .catalog import get_part
from .ldraw import Brick


def _cells(b: Brick):
    x0, y0, z0, x1, y1, z1 = b.bbox
    sx0, sx1 = round(x0 / 20), round(x1 / 20)
    sz0, sz1 = round(z0 / 20), round(z1 / 20)
    bottom, top = round(-y1 / 8), round(-y0 / 8)   # plate levels, ground = 0, up = +
    return sx0, sx1, sz0, sz1, bottom, top


def check_bricks(bricks: list[Brick], *, max_parts: int | None = None, ids: dict[int, str] | None = None) -> list[dict]:
    ids = ids or {}
    issues: list[dict] = []
    name = lambda b: ids.get(b.uid, f"{b.part}#{b.uid}")
    if max_parts and len(bricks) > max_parts:
        issues.append({"code": "size.too_many", "severity": "error",
                       "message": f"Model has {len(bricks)} parts; the limit is {max_parts}. Make it smaller."})
    known = [b for b in bricks if get_part(b.part)]
    occ: dict[tuple, Brick] = {}
    info = {}
    collided = set()
    for b in known:
        sx0, sx1, sz0, sz1, bot, top = _cells(b)
        info[b.uid] = (sx0, sx1, sz0, sz1, bot, top)
        if bot < 0:
            issues.append({"code": "geometry.below_ground", "severity": "error",
                           "message": f"{name(b)} goes below the ground (level {bot}). Use level >= 0."})
        for x in range(sx0, sx1):
            for z in range(sz0, sz1):
                for y in range(bot, top):
                    other = occ.get((x, z, y))
                    if other is not None and (other.uid, b.uid) not in collided:
                        collided.add((other.uid, b.uid))
                        issues.append({"code": "geometry.collision", "severity": "error",
                                       "message": f"{name(b)} overlaps {name(other)} at stud ({x},{z}) level {y}."})
                    occ[(x, z, y)] = b
    # connectivity through studs (bottom of upper touches top of lower with footprint overlap)
    by_bottom = defaultdict(list)
    by_top = defaultdict(list)
    for b in known:
        by_bottom[info[b.uid][4]].append(b)
        by_top[info[b.uid][5]].append(b)

    def overlap(a, c):
        A, C = info[a.uid], info[c.uid]
        return A[0] < C[1] and C[0] < A[1] and A[2] < C[3] and C[2] < A[3]

    def has_studs(b):
        p = get_part(b.part)
        return bool(p and (p.studs or p.kind == "slope"))  # slopes have a stud row at the top edge

    adj = defaultdict(set)
    for b in known:
        top = info[b.uid][5]
        for c in by_bottom.get(top, []):
            if c.uid != b.uid and overlap(b, c) and has_studs(b):
                adj[b.uid].add(c.uid); adj[c.uid].add(b.uid)
    grounded = deque(b.uid for b in known if info[b.uid][4] == 0)
    seen = set(grounded)
    while grounded:
        u = grounded.popleft()
        for v in adj[u]:
            if v not in seen:
                seen.add(v); grounded.append(v)
    for b in known:
        if b.uid not in seen:
            issues.append({"code": "geometry.floating", "severity": "error",
                           "message": f"{name(b)} is floating at level {info[b.uid][4]}: nothing holds it. "
                                      f"Put a studded brick/plate directly under it."})
    return issues


def errors(issues: list[dict]) -> list[dict]:
    return [i for i in issues if i.get("severity") == "error"]
