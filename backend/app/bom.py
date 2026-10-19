"""Bill of materials helpers."""
from __future__ import annotations

from collections import Counter

from .catalog import colour_dict, get_part
from .ldraw import Brick


def bom_from_bricks(bricks: list[Brick]) -> list[dict]:
    counts = Counter((b.part, b.colour) for b in bricks)
    return [enrich(part, col, qty) for (part, col), qty in sorted(counts.items(), key=lambda kv: (kv[0][1], kv[0][0]))]


def enrich(part: str, colour: int, qty: int, **extra) -> dict:
    p = get_part(part)
    return {
        "part": part,
        "dat": f"{part}.dat",
        "name": p.name if p else f"Part {part}",
        "kind": p.kind if p else "other",
        "size": p.size_label if p else "?",
        "size_group": p.size_group if p else "special",
        "height": ("brick" if p and p.height >= 24 else "plate") if p else "?",
        "colour": colour_dict(colour),
        "quantity": qty,
        **extra,
    }


def total(bom: list[dict]) -> int:
    return sum(l["quantity"] for l in bom)


def compare(bom: list[dict], available: dict[tuple[str, int], int]) -> tuple[list[dict], int, int]:
    """Annotate each line with have/need. Returns (lines, pieces_have, pieces_need)."""
    out, have_total, need_total = [], 0, 0
    for l in bom:
        have = max(0, available.get((l["part"], l["colour"]["code"]), 0))
        need = max(0, l["quantity"] - have)
        have_total += min(have, l["quantity"])
        need_total += need
        out.append({**l, "have": have, "need": need})
    return out, have_total, need_total
