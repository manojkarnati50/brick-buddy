"""Minimal, dependency-free LDraw MPD reader/writer.

LDraw Nova's `build_plan` is the preferred writer (see nova.py). This module is
used to *read* any MPD (ours or LDraw Nova's examples), to recolour individual
lines in place, and as a fallback writer when LDraw Nova is not installed.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .catalog import get_part, part_id
from . import library

IDENT = (1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0)


def _mul(a, b):
    return tuple(sum(a[r * 3 + k] * b[k * 3 + c] for k in range(3)) for r in range(3) for c in range(3))


def _apply(m, v):
    return (m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
            m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
            m[6] * v[0] + m[7] * v[1] + m[8] * v[2])


def _fmt(v: float) -> str:
    s = f"{v:.4f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


@dataclass
class Brick:
    uid: int                 # index of this occurrence in the flattened model
    line: int                # 0-based line number of its `1 ...` line in the MPD text
    part: str                # '3001'
    colour: int              # resolved colour code
    pos: tuple               # world position (LDU)
    matrix: tuple            # world 3x3 rotation, row-major
    section: str             # top-level group (submodel) name
    step: int                # global build step index
    bbox: tuple = ()         # (minx,miny,minz,maxx,maxy,maxz) world, body only

    def to_dict(self) -> dict:
        p = get_part(self.part)
        return {
            "uid": self.uid, "line": self.line, "part": self.part, "colour": self.colour,
            "pos": [round(c, 3) for c in self.pos], "matrix": [round(c, 5) for c in self.matrix],
            "section": self.section, "step": self.step, "bbox": [round(c, 2) for c in self.bbox],
            "known": p is not None,
            "dims": [p.x, p.z, p.height] if p else None,
            "kind": p.kind if p else "other",
        }


@dataclass
class ParsedModel:
    bricks: list[Brick] = field(default_factory=list)
    sections: list[str] = field(default_factory=list)
    steps: int = 0
    name: str = ""


_FILE_RE = re.compile(r"^\s*0\s+FILE\s+(.+?)\s*$", re.I)


def split_files(text: str) -> tuple[list[str], dict[str, list[tuple[int, str]]], list[str]]:
    """Return (lines, {file_name_lower: [(line_no, line)]}, order)."""
    lines = text.replace("\r\n", "\n").split("\n")
    files: dict[str, list[tuple[int, str]]] = {}
    order: list[str] = []
    current = None
    for i, raw in enumerate(lines):
        m = _FILE_RE.match(raw)
        if m:
            current = m.group(1).strip().lower()
            files[current] = []
            order.append(current)
            continue
        if re.match(r"^\s*0\s+NOFILE", raw, re.I):
            current = None
            continue
        if current is None:
            if not files:  # plain .ldr without FILE headers
                current = "__main__"
                files[current] = []
                order.append(current)
            else:
                continue
        files[current].append((i, raw))
    return lines, files, order


def parse_mpd(text: str) -> ParsedModel:
    lines, files, order = split_files(text)
    model = ParsedModel()
    if not order:
        return model
    root = order[0]
    model.name = root
    step_counter = [0]

    def body_bbox(part: str, pos, mat):
        lo, hi = local_bounds(part)
        xs, ys, zs = [], [], []
        for cx in (lo[0], hi[0]):
            for cy in (lo[1], hi[1]):
                for cz in (lo[2], hi[2]):
                    w = _apply(mat, (cx, cy, cz))
                    xs.append(w[0] + pos[0]); ys.append(w[1] + pos[1]); zs.append(w[2] + pos[2])
        return (min(xs), min(ys), min(zs), max(xs), max(ys), max(zs))

    def walk(fname: str, pos, mat, colour: int, section: str | None, depth: int):
        if depth > 20:
            return
        for line_no, raw in files.get(fname, []):
            tok = raw.split()
            if not tok:
                continue
            if tok[0] == "0" and len(tok) > 1 and tok[1].upper() == "STEP" and depth == 0:
                step_counter[0] += 1
                continue
            if tok[0] == "0" and len(tok) > 1 and tok[1].upper() == "STEP" and depth == 1:
                step_counter[0] += 1
                continue
            if tok[0] != "1" or len(tok) < 15:
                continue
            c = int(tok[1])
            c = colour if c == 16 else c
            local_pos = tuple(float(v) for v in tok[2:5])
            local_mat = tuple(float(v) for v in tok[5:14])
            ref = " ".join(tok[14:]).strip()
            wpos = _apply(mat, local_pos)
            wpos = (wpos[0] + pos[0], wpos[1] + pos[1], wpos[2] + pos[2])
            wmat = _mul(mat, local_mat)
            key = ref.lower()
            if key in files:
                walk(key, wpos, wmat, c, section or ref.rsplit(".", 1)[0], depth + 1)
            else:
                pid = part_id(ref)
                b = Brick(uid=len(model.bricks), line=line_no, part=pid, colour=c, pos=wpos, matrix=wmat,
                          section=section or "main", step=step_counter[0])
                b.bbox = body_bbox(pid, wpos, wmat)
                model.bricks.append(b)
                if b.section not in model.sections:
                    model.sections.append(b.section)

    walk(root, (0.0, 0.0, 0.0), IDENT, 16, None, 0)
    model.steps = step_counter[0] + 1
    # compress step numbers to 0..n-1 (skip empty steps)
    used = sorted({b.step for b in model.bricks})
    remap = {s: i for i, s in enumerate(used)}
    for b in model.bricks:
        b.step = remap[b.step]
    model.steps = len(used)
    return model


def local_bounds(part: str):
    """Body bounds (no studs) in the part's local frame."""
    p = get_part(part)
    if p:
        return (-p.x * 10.0, 0.0, -p.z * 10.0), (p.x * 10.0, p.height, p.z * 10.0)
    b = library.part_bounds(part)
    if b:
        return b
    return (-10.0, 0.0, -10.0), (10.0, 24.0, 10.0)


def recolour_lines(text: str, changes: dict[int, int]) -> str:
    """Set the colour field on specific `1` lines. Geometry is untouched."""
    lines = text.replace("\r\n", "\n").split("\n")
    for line_no, code in changes.items():
        if 0 <= line_no < len(lines):
            tok = lines[line_no].split()
            if tok and tok[0] == "1" and len(tok) >= 15:
                indent = lines[line_no][: len(lines[line_no]) - len(lines[line_no].lstrip())]
                tok[1] = str(int(code))
                lines[line_no] = indent + " ".join(tok)
    return "\n".join(lines)


def write_mpd(name: str, sections: list[dict], author: str = "Brick Buddy") -> str:
    """Fallback writer for an LDraw-Nova-style plan that uses only `at`/`yaw`.

    sections: [{"name": "walls.ldr", "description": str, "steps": [[{ref, colour, at, yaw}]]}]
    The first section is the root model (it references the others).
    """
    out: list[str] = []
    for s in sections:
        out += [f"0 FILE {s['name']}", f"0 {s['description']}", f"0 Name: {s['name']}",
                f"0 Author: {author}", "0 !LDRAW_ORG Model"]
        for i, step in enumerate(s["steps"]):
            if i:
                out.append("0 STEP")
            for e in step:
                yaw = e.get("yaw", 0) % 360
                m = {0: IDENT, 90: (0, 0, 1, 0, 1, 0, -1, 0, 0), 180: (-1, 0, 0, 0, 1, 0, 0, 0, -1),
                     270: (0, 0, -1, 0, 1, 0, 1, 0, 0)}.get(yaw, IDENT)
                x, y, z = e["at"]
                if e.get("id"):
                    out.append(f"0 // {e['id']}: {e.get('purpose', e['ref'])}")
                out.append(f"1 {e['colour']} {_fmt(x)} {_fmt(y)} {_fmt(z)} " + " ".join(_fmt(v) for v in m) + f" {e['ref']}")
        out.append("0 NOFILE")
    return "\n".join(out) + "\n"
