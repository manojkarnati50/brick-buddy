"""Server-side isometric PNG thumbnails (Pillow only; no GPU, no LDView needed)."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

from .catalog import colour, get_part
from .ldraw import Brick, local_bounds

C30, S30 = 0.8660254, 0.5
VIEW = (1.0, -1.0, 1.0)  # towards the camera (LDraw: -Y is up)


def _hex(h: str):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def _shade(rgb, f):
    if f >= 1:
        return tuple(min(255, int(c + (255 - c) * (f - 1))) for c in rgb)
    return tuple(int(c * f) for c in rgb)


def _proj(x, y, z):
    return ((x - z) * C30, (x + z) * S30 + y)


def _world(b: Brick, p):
    m = b.matrix
    return (m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + b.pos[0],
            m[3] * p[0] + m[4] * p[1] + m[5] * p[2] + b.pos[1],
            m[6] * p[0] + m[7] * p[1] + m[8] * p[2] + b.pos[2])


def _faces(b: Brick):
    """Faces (world-space polygons, outward order) of the brick body; slopes become wedges."""
    (x0, y0, z0), (x1, y1, z1) = local_bounds(b.part)
    p = get_part(b.part)
    if p and p.kind == "slope":
        flat = min(20.0, (z1 - z0) / 2)
        lip = y1 - 4.0
        v = {
            "fbl": (x0, y1, z0), "fbr": (x1, y1, z0), "bbl": (x0, y1, z1), "bbr": (x1, y1, z1),
            "ftl": (x0, lip, z0), "ftr": (x1, lip, z0),
            "rtl": (x0, y0, z1 - flat), "rtr": (x1, y0, z1 - flat), "btl": (x0, y0, z1), "btr": (x1, y0, z1),
        }
        faces = [["fbl", "fbr", "ftr", "ftl"], ["ftl", "ftr", "rtr", "rtl"], ["rtl", "rtr", "btr", "btl"],
                 ["bbl", "btl", "btr", "bbr"], ["fbl", "ftl", "rtl", "btl", "bbl"], ["fbr", "bbr", "btr", "rtr", "ftr"],
                 ["fbl", "bbl", "bbr", "fbr"]]
    else:
        v = {"a": (x0, y0, z0), "b": (x1, y0, z0), "c": (x1, y0, z1), "d": (x0, y0, z1),
             "e": (x0, y1, z0), "f": (x1, y1, z0), "g": (x1, y1, z1), "h": (x0, y1, z1)}
        faces = [["a", "b", "c", "d"], ["e", "h", "g", "f"], ["a", "e", "f", "b"], ["d", "c", "g", "h"],
                 ["a", "d", "h", "e"], ["b", "f", "g", "c"]]
    centre = [sum(c) / len(v) for c in zip(*v.values())]
    out = []
    for f in faces:
        pts = [_world(b, v[k]) for k in f]
        # outward normal (orientation-agnostic: flip towards outside of the body centre)
        a, bb, c = pts[0], pts[1], pts[2]
        u = (bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]); w = (c[0] - a[0], c[1] - a[1], c[2] - a[2])
        n = (u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0])
        fc = [sum(q[i] for q in pts) / len(pts) for i in range(3)]
        wc = _world(b, centre)
        if sum(n[i] * (fc[i] - wc[i]) for i in range(3)) < 0:
            n = (-n[0], -n[1], -n[2])
        out.append((pts, n))
    return out


def _order(bricks: list[Brick]) -> list[Brick]:
    """Topological painter's order for axis-aligned boxes viewed from +x, -y, +z."""
    n = len(bricks)
    before = [set() for _ in range(n)]  # before[j] = bricks that must be drawn before j
    for i in range(n):
        a = bricks[i].bbox
        for j in range(i + 1, n):
            c = bricks[j].bbox
            if a[3] <= c[0] + 0.01:      # a is west of c -> farther
                before[j].add(i)
            elif c[3] <= a[0] + 0.01:
                before[i].add(j)
            elif a[5] <= c[2] + 0.01:    # a is north of c -> farther
                before[j].add(i)
            elif c[5] <= a[2] + 0.01:
                before[i].add(j)
            elif a[1] >= c[4] - 0.01:    # a is below c -> drawn first
                before[j].add(i)
            elif c[1] >= a[4] - 0.01:
                before[i].add(j)
    done, order = [False] * n, []
    key = sorted(range(n), key=lambda k: (bricks[k].bbox[0] + bricks[k].bbox[2], -bricks[k].bbox[4]))
    visiting = set()

    def visit(k):
        if done[k] or k in visiting:
            return
        visiting.add(k)
        for d in sorted(before[k], key=key.index):
            visit(d)
        visiting.discard(k)
        done[k] = True
        order.append(bricks[k])

    for k in key:
        visit(k)
    return order


def render_png(bricks: list[Brick], out: Path, size: int = 512, background=(255, 248, 238, 255)) -> None:
    ss = 2
    W = size * ss
    img = Image.new("RGBA", (W, W), background)
    out.parent.mkdir(parents=True, exist_ok=True)
    if not bricks:
        img.resize((size, size)).save(out)
        return
    pts = []
    for b in bricks:
        x0, y0, z0, x1, y1, z1 = b.bbox
        for x in (x0, x1):
            for z in (z0, z1):
                for y in (y0 - 5, y1):
                    pts.append(_proj(x, y, z))
    minx = min(p[0] for p in pts); maxx = max(p[0] for p in pts)
    miny = min(p[1] for p in pts); maxy = max(p[1] for p in pts)
    span = max(maxx - minx, maxy - miny, 1)
    scale = (W * 0.84) / span
    ox = W / 2 - (minx + maxx) / 2 * scale
    oy = W / 2 - (miny + maxy) / 2 * scale

    def P(x, y, z):
        px, py = _proj(x, y, z)
        return (ox + px * scale, oy + py * scale)

    draw = ImageDraw.Draw(img)
    gx0 = min(b.bbox[0] for b in bricks); gx1 = max(b.bbox[3] for b in bricks)
    gz0 = min(b.bbox[2] for b in bricks); gz1 = max(b.bbox[5] for b in bricks)
    gy = max(b.bbox[4] for b in bricks)
    pad = 10
    draw.polygon([P(gx0 - pad, gy, gz0 - pad), P(gx1 + pad, gy, gz0 - pad), P(gx1 + pad, gy, gz1 + pad), P(gx0 - pad, gy, gz1 + pad)],
                 fill=(221, 242, 230, 255))
    edge_w = max(1, int(scale * 0.6))
    for b in _order(bricks):
        rgb = _hex(colour(b.colour).hex)
        line = _shade(rgb, 0.62)
        for poly, n in _faces(b):
            if n[0] * VIEW[0] + n[1] * VIEW[1] + n[2] * VIEW[2] <= 1e-6:
                continue
            ln = (n[0] ** 2 + n[1] ** 2 + n[2] ** 2) ** 0.5 or 1
            up, east, south = -n[1] / ln, n[0] / ln, n[2] / ln
            f = 0.72 + 0.36 * up + 0.04 * south - 0.02 * east
            draw.polygon([P(*q) for q in poly], fill=_shade(rgb, f), outline=line, width=edge_w)
        p = get_part(b.part)
        if p and p.studs:
            x0, y0, z0, x1, _, z1 = b.bbox
            r = 6.0
            rx, ry = r * C30 * 1.4 * scale, r * S30 * 1.4 * scale
            for sx in range(int(round((x1 - x0) / 20))):
                for sz in range(int(round((z1 - z0) / 20))):
                    cx, cz = x0 + 10 + sx * 20, z0 + 10 + sz * 20
                    a = P(cx, y0 - 4, cz)
                    base = P(cx, y0, cz)
                    draw.rectangle([a[0] - rx, a[1], base[0] + rx, base[1]], fill=_shade(rgb, 0.8))
                    draw.ellipse([base[0] - rx, base[1] - ry, base[0] + rx, base[1] + ry], fill=_shade(rgb, 0.8))
                    draw.ellipse([a[0] - rx, a[1] - ry, a[0] + rx, a[1] + ry], fill=_shade(rgb, 1.15), outline=line)
    img = img.resize((size, size), Image.LANCZOS)
    img.save(out)
