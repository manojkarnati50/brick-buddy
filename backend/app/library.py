"""Access to the official LDraw parts library (optional).

When LDRAW_DIR points at an unzipped LDraw library (complete.zip from
ldraw.org), we can compute true bounding boxes for any part and serve part
files to the browser's three.js LDrawLoader. Without it, catalogue parts still
work everywhere; unknown parts fall back to a small box.
"""
from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

from .config import settings

_SUBDIRS = ["parts", "p", "parts/s", "p/48", "models"]
_cache_file = settings.data_dir / "cache" / "part-bounds.json"
_bounds_cache: dict[str, list] | None = None


def library_dir() -> Path | None:
    d = os.environ.get("LDRAW_DIR") or os.environ.get("LDRAWDIR")
    if d and (Path(d) / "parts").is_dir():
        return Path(d)
    return None


def available() -> bool:
    return library_dir() is not None


@lru_cache(maxsize=4096)
def find_file(name: str) -> Path | None:
    root = library_dir()
    if not root:
        return None
    name = name.replace("\\", "/").strip()
    for sub in [""] + _SUBDIRS:
        for cand in (name, name.lower()):
            p = root / sub / cand if sub else root / cand
            if p.is_file():
                return p
    return None


def _load_cache():
    global _bounds_cache
    if _bounds_cache is None:
        try:
            _bounds_cache = json.loads(_cache_file.read_text())
        except Exception:
            _bounds_cache = {}
    return _bounds_cache


def _save_cache():
    try:
        _cache_file.parent.mkdir(parents=True, exist_ok=True)
        _cache_file.write_text(json.dumps(_bounds_cache))
    except Exception:
        pass


def _mul(a, b):
    return tuple(sum(a[r * 3 + k] * b[k * 3 + c] for k in range(3)) for r in range(3) for c in range(3))


def _points(path: Path, depth=0):
    """Yield every vertex of a .dat file in its own frame (recursive)."""
    if depth > 12:
        return
    try:
        lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except Exception:
        return
    for raw in lines:
        t = raw.split()
        if not t:
            continue
        kind = t[0]
        if kind in ("2", "3", "4", "5"):
            n = {"2": 2, "3": 3, "4": 4, "5": 2}[kind]
            vals = [float(v) for v in t[2:2 + 3 * n]]
            for i in range(n):
                yield tuple(vals[i * 3:i * 3 + 3])
        elif kind == "1" and len(t) >= 15:
            sub = find_file(" ".join(t[14:]))
            if not sub:
                continue
            x, y, z = (float(v) for v in t[2:5])
            m = tuple(float(v) for v in t[5:14])
            for p in _sub_points(str(sub), depth + 1):
                yield (m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + x,
                       m[3] * p[0] + m[4] * p[1] + m[5] * p[2] + y,
                       m[6] * p[0] + m[7] * p[1] + m[8] * p[2] + z)


@lru_cache(maxsize=512)
def _sub_points(path: str, depth: int) -> tuple:
    # primitives are reused thousands of times; cache their (deduplicated) extreme points
    pts = list(_points(Path(path), depth))
    if len(pts) > 64:
        xs = sorted(pts, key=lambda p: p[0]); ys = sorted(pts, key=lambda p: p[1]); zs = sorted(pts, key=lambda p: p[2])
        pts = [xs[0], xs[-1], ys[0], ys[-1], zs[0], zs[-1]]
    return tuple(pts)


def part_bounds(part: str):
    cache = _load_cache()
    key = part.lower()
    if key in cache:
        lo, hi = cache[key]
        return tuple(lo), tuple(hi)
    f = find_file(part if part.lower().endswith(".dat") else part + ".dat")
    if not f:
        return None
    pts = list(_points(f))
    if not pts:
        return None
    lo = [min(p[i] for p in pts) for i in range(3)]
    hi = [max(p[i] for p in pts) for i in range(3)]
    # body only: ignore studs poking above y=0 for regular parts
    if lo[1] < 0 and hi[1] > 0 and lo[1] >= -4.5:
        lo[1] = 0.0
    cache[key] = [lo, hi]
    _save_cache()
    return tuple(lo), tuple(hi)
