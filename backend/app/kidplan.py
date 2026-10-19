"""The 'kid plan' Claude writes, and its conversion to an LDraw Nova JSON build plan.

Claude places parts on a simple stud grid (x, z in studs, level in plates) which
is far easier to get right than raw LDU math. We convert each placement into an
LDraw Nova placement `{"id","ref","colour","at":[x,y,z],"yaw"}` and hand the
resulting `{"version":1,"sections":[...]}` plan to `build_plan`.
"""
from __future__ import annotations

import re

from .catalog import COLOURS, get_part, kid_parts

# JSON schema used with Claude structured outputs (output_config.format).
PLACEMENT_SCHEMA = {
    "type": "object",
    "properties": {
        "part": {"type": "string", "description": "Part id from the allowed table, e.g. '3001'"},
        "colour": {"type": "integer", "description": "LDraw colour code from the allowed table"},
        "x": {"type": "integer", "description": "Stud column of the part's left edge (west)"},
        "z": {"type": "integer", "description": "Stud row of the part's back edge (north)"},
        "level": {"type": "integer", "description": "Height of the part's bottom in plates (brick = 3 plates). Ground = 0"},
        "rotation": {"type": "integer", "enum": [0, 90, 180, 270],
                     "description": "Turn in degrees. 90/270 swap the part's X and Z size. Slopes: 0 slants north, 180 south, 90 west, 270 east"},
    },
    "required": ["part", "colour", "x", "z", "level", "rotation"],
    "additionalProperties": False,
}

KID_PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string", "description": "Cute 2-5 word model name, e.g. \"Bunny's Pink House\""},
        "say": {"type": "string", "description": "One short cheerful sentence for a 3-year-old (max 12 words)"},
        "sections": {
            "type": "array",
            "description": "Logical groups such as base, walls, roof, door. 1-6 sections.",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "lowercase word: base, walls, roof, door, wheels..."},
                    "description": {"type": "string"},
                    "steps": {
                        "type": "array",
                        "description": "Build steps in order; each step is a list of placements",
                        "items": {"type": "array", "items": PLACEMENT_SCHEMA},
                    },
                },
                "required": ["name", "description", "steps"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["name", "say", "sections"],
    "additionalProperties": False,
}


def _slug(s: str) -> str:
    s = re.sub(r"[^A-Za-z0-9 _-]+", "", s).strip().lower().replace(" ", "-") or "part"
    if not s[0].isalnum():
        s = "s" + s
    return s[:40]


def to_nova_plan(kid: dict, author: str = "Brick Buddy") -> tuple[dict, dict[str, dict], list[dict]]:
    """Return (nova_plan, id->placement map, structural issues found during conversion)."""
    issues: list[dict] = []
    root_name = _slug(kid.get("name", "model")) + ".ldr"
    sections, root_steps = [], []
    index: dict[str, dict] = {}
    used_names = {root_name.lower()}
    for si, sec in enumerate(kid.get("sections", [])):
        sname = _slug(sec.get("name") or f"part{si}") + ".ldr"
        while sname.lower() in used_names:
            sname = sname[:-4] + "x.ldr"
        used_names.add(sname.lower())
        steps = []
        for ti, step in enumerate(sec.get("steps", [])):
            out_step = []
            for pi, pl in enumerate(step):
                pid = f"{_slug(sec.get('name') or 's')}-{ti}-{pi}"
                part = get_part(str(pl.get("part", "")))
                if not part or not part.kid:
                    issues.append({"code": "plan.unknown_part", "severity": "error",
                                   "message": f"{pid}: part '{pl.get('part')}' is not in the allowed parts table."})
                    continue
                code = int(pl.get("colour", 4))
                if code not in COLOURS:
                    issues.append({"code": "plan.unknown_colour", "severity": "error",
                                   "message": f"{pid}: colour {code} is not in the allowed colour table."})
                    continue
                rot = int(pl.get("rotation", 90 if pl.get("turn") else 0)) % 360
                rot = rot if rot in (0, 90, 180, 270) else 0
                w, d = (part.z, part.x) if rot in (90, 270) else (part.x, part.z)
                x, z, level = int(pl["x"]), int(pl["z"]), int(pl["level"])
                at = [(x + w / 2) * 20.0, -(level * 8.0 + part.height), (z + d / 2) * 20.0]
                entry = {"id": pid, "ref": part.dat, "colour": code, "at": at}
                if rot:
                    entry["yaw"] = rot
                out_step.append(entry)
                index[pid] = {**pl, "section": sec.get("name"), "step": ti}
            if out_step:
                steps.append(out_step)
        if not steps:
            continue
        sections.append({"name": sname, "description": (sec.get("description") or sec.get("name") or "group")[:200].replace("\n", " "),
                         "steps": steps})
        root_steps.append([{"id": f"group-{si}", "ref": sname, "colour": 16, "at": [0, 0, 0]}])
    if not sections:
        issues.append({"code": "plan.empty", "severity": "error", "message": "The plan has no valid parts."})
    plan = {
        "version": 1,
        "author": author,
        "sections": [{"name": root_name, "description": (kid.get("name") or "Brick Buddy model")[:200], "steps": root_steps or [[]]}] + sections,
    }
    return plan, index, issues


def parts_table(available: dict[tuple[str, int], int] | None = None, colours: list[int] | None = None) -> str:
    """Compact table for the prompt."""
    if available is not None:
        rows = ["part | name | size(x by z studs) | height | colour code | colour | available"]
        for (part, col), qty in sorted(available.items()):
            p = get_part(part)
            if not p or not p.kid or qty <= 0 or col not in COLOURS:
                continue
            rows.append(f"{p.id} | {p.name} | {p.x}x{p.z} | {'brick(3 plates)' if p.height >= 24 else 'plate(1)'} | {col} | {COLOURS[col].name} | {qty}")
        return "\n".join(rows)
    rows = ["part | name | size(x by z studs) | height in plates | top"]
    for p in kid_parts():
        rows.append(f"{p.id} | {p.name} | {p.x}x{p.z} | {p.plates} | {'studs' if p.studs else 'smooth/sloped (nothing on top)'}")
    rows.append("")
    rows.append("colour code | colour")
    for c in (colours or list(COLOURS)):
        if c in COLOURS:
            rows.append(f"{c} | {COLOURS[c].name}")
    return "\n".join(rows)


def count_parts(kid: dict) -> int:
    return sum(len(step) for sec in kid.get("sections", []) for step in sec.get("steps", []))
