"""Print helper: printable STL bricks + filament estimates.

LDraw parts are display meshes (not watertight solids), so instead of converting
them we generate clean printable solids from the part's footprint using standard
brick dimensions (8 mm pitch, 9.6 mm brick, 3.2 mm plate, 4.8 mm studs, hollow
underside with tubes). Overlapping solids are fine for all common slicers.
"""
from __future__ import annotations

import io
import math
import struct

from .catalog import Part

PITCH, BRICK, PLATE = 8.0, 9.6, 3.2
GAP = 0.1          # clearance per side
WALL, TOP = 1.2, 1.0
STUD_D, STUD_H = 4.8, 1.8
TUBE_OD, TUBE_ID, PIN_D = 6.51, 4.8, 3.0
SEG = 32


def _box(x0, y0, z0, x1, y1, z1):
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
    f = [(0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7), (0, 1, 5), (0, 5, 4), (2, 3, 7), (2, 7, 6), (1, 2, 6), (1, 6, 5), (0, 4, 7), (0, 7, 3)]
    return [(v[a], v[b], v[c]) for a, b, c in f]


def _cyl(cx, cy, r, z0, z1, seg=SEG):
    tris = []
    pts = [(cx + r * math.cos(2 * math.pi * i / seg), cy + r * math.sin(2 * math.pi * i / seg)) for i in range(seg)]
    for i in range(seg):
        a, b = pts[i], pts[(i + 1) % seg]
        tris += [((cx, cy, z1), (a[0], a[1], z1), (b[0], b[1], z1)),
                 ((cx, cy, z0), (b[0], b[1], z0), (a[0], a[1], z0)),
                 ((a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1)),
                 ((a[0], a[1], z0), (b[0], b[1], z1), (a[0], a[1], z1))]
    return tris


def _tube(cx, cy, ro, ri, z0, z1, seg=SEG):
    tris = []
    po = [(cx + ro * math.cos(2 * math.pi * i / seg), cy + ro * math.sin(2 * math.pi * i / seg)) for i in range(seg)]
    pi = [(cx + ri * math.cos(2 * math.pi * i / seg), cy + ri * math.sin(2 * math.pi * i / seg)) for i in range(seg)]
    for i in range(seg):
        j = (i + 1) % seg
        ao, bo, ai, bi = po[i], po[j], pi[i], pi[j]
        tris += [((ao[0], ao[1], z0), (bo[0], bo[1], z0), (bo[0], bo[1], z1)), ((ao[0], ao[1], z0), (bo[0], bo[1], z1), (ao[0], ao[1], z1)),
                 ((ai[0], ai[1], z0), (bi[0], bi[1], z1), (bi[0], bi[1], z0)), ((ai[0], ai[1], z0), (ai[0], ai[1], z1), (bi[0], bi[1], z1)),
                 ((ao[0], ao[1], z1), (bo[0], bo[1], z1), (bi[0], bi[1], z1)), ((ao[0], ao[1], z1), (bi[0], bi[1], z1), (ai[0], ai[1], z1)),
                 ((ao[0], ao[1], z0), (bi[0], bi[1], z0), (bo[0], bo[1], z0)), ((ao[0], ao[1], z0), (ai[0], ai[1], z0), (bi[0], bi[1], z0))]
    return tris


def mesh(part: Part) -> tuple[list, float]:
    """Return (triangles in mm, z-up) and solid volume in mm³."""
    h = BRICK if part.height >= 24 else PLATE
    nx, ny = part.x, part.z
    X, Y = nx * PITCH - 2 * GAP, ny * PITCH - 2 * GAP
    x0, y0 = GAP, GAP
    tris: list = []
    vol = 0.0
    if part.kind == "round":
        r = X / 2
        tris += _cyl(nx * PITCH / 2, ny * PITCH / 2, r, 0, h)
        vol += math.pi * r * r * h
    elif part.kind == "slope":
        # solid wedge: full height at the back stud row, sloping to 1/3 height at the front
        back = PITCH - GAP
        lo = h / 3
        v = [(x0, y0, 0), (x0 + X, y0, 0), (x0 + X, y0 + Y, 0), (x0, y0 + Y, 0),
             (x0, y0, lo), (x0 + X, y0, lo), (x0 + X, y0 + Y - back, h), (x0, y0 + Y - back, h),
             (x0, y0 + Y, h), (x0 + X, y0 + Y, h)]
        # front sloped face from lo at y0 to h at Y-back
        faces = [(0, 2, 1), (0, 3, 2), (0, 1, 5), (0, 5, 4), (4, 5, 6), (4, 6, 7), (7, 6, 9), (7, 9, 8),
                 (3, 8, 9), (3, 9, 2), (1, 2, 9), (1, 9, 6), (1, 6, 5), (0, 4, 7), (0, 7, 8), (0, 8, 3)]
        tris += [(v[a], v[b], v[c]) for a, b, c in faces]
        vol += X * Y * lo + X * (Y - back) * (h - lo) / 2 + X * back * (h - lo)
    else:
        # top skin + four walls = hollow shell open at the bottom
        tris += _box(x0, y0, h - TOP, x0 + X, y0 + Y, h)
        vol += X * Y * TOP
        wall_h = h - TOP
        tris += _box(x0, y0, 0, x0 + X, y0 + WALL, wall_h)
        tris += _box(x0, y0 + Y - WALL, 0, x0 + X, y0 + Y, wall_h)
        tris += _box(x0, y0, 0, x0 + WALL, y0 + Y, wall_h)
        tris += _box(x0 + X - WALL, y0, 0, x0 + X, y0 + Y, wall_h)
        vol += wall_h * (2 * X * WALL + 2 * (Y - 2 * WALL) * WALL)
        # underside tubes / pins
        if nx >= 2 and ny >= 2:
            for i in range(1, nx):
                for j in range(1, ny):
                    tris += _tube(i * PITCH, j * PITCH, TUBE_OD / 2, TUBE_ID / 2, 0, wall_h)
                    vol += math.pi * ((TUBE_OD / 2) ** 2 - (TUBE_ID / 2) ** 2) * wall_h
        elif nx >= 2 or ny >= 2:
            n = max(nx, ny)
            for i in range(1, n):
                cx, cy = (i * PITCH, PITCH / 2) if nx >= ny else (PITCH / 2, i * PITCH)
                tris += _cyl(cx, cy, PIN_D / 2, 0, wall_h)
                vol += math.pi * (PIN_D / 2) ** 2 * wall_h
    if part.studs:
        for i in range(nx):
            for j in range(ny):
                tris += _cyl((i + 0.5) * PITCH, (j + 0.5) * PITCH, STUD_D / 2, h - 0.01, h + STUD_H)
                vol += math.pi * (STUD_D / 2) ** 2 * STUD_H
    return tris, vol


def stl_bytes(part: Part, name: str = "brick") -> bytes:
    tris, _ = mesh(part)
    buf = io.BytesIO()
    buf.write(name.encode()[:80].ljust(80, b" "))
    buf.write(struct.pack("<I", len(tris)))
    for a, b, c in tris:
        ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
        vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
        n = (uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)
        ln = math.sqrt(sum(k * k for k in n)) or 1
        buf.write(struct.pack("<12fH", n[0] / ln, n[1] / ln, n[2] / ln, *a, *b, *c, 0))
    return buf.getvalue()


def grams(part: Part, density: float = 1.24, infill: float = 0.35) -> float:
    """Rough filament estimate: walls are solid-ish, so blend 60% solid + infill."""
    _, vol = mesh(part)
    effective = vol * (0.6 + 0.4 * infill)
    return round(effective / 1000 * density, 2)
