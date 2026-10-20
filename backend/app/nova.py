"""Wrapper around LDraw Nova (https://github.com/anteloc/ldraw-nova, v0.6.0, AGPL-3.0).

We call `ldraw_tools.builder.build_plan`, `ldraw_tools.geometry.analyze_geometry`
and `ldraw_tools.common.get_parts` exactly as in LDraw Nova's examples/python_api.py.
If LDraw Nova or the LDraw parts library is not installed (e.g. a quick local dev
run without Docker), we fall back to our own MPD writer + stud-grid checks so the
app keeps working.
"""
from __future__ import annotations

import logging
import threading
from pathlib import Path

from . import library
from .config import settings
from .ldraw import write_mpd

log = logging.getLogger("brickbuddy.nova")
_lock = threading.Lock()
_parts = None
_status = {"installed": False, "library": False, "error": ""}

try:  # pragma: no cover - depends on the environment
    from ldraw_tools.builder import build_plan as _build_plan
    from ldraw_tools.common import get_parts as _get_parts
    from ldraw_tools.geometry import analyze_geometry as _analyze_geometry
    _status["installed"] = True
except Exception as exc:  # noqa: BLE001
    _status["error"] = f"ldraw_tools not importable: {exc}"


def parts():
    global _parts
    if _parts is None and _status["installed"] and library.available():
        with _lock:
            if _parts is None:
                try:
                    _parts = _get_parts()
                    _status["library"] = True
                except Exception as exc:  # noqa: BLE001
                    _status["error"] = f"get_parts failed: {exc}"
    return _parts


def warm_up() -> None:
    """Index the LDraw library in the background (minutes on first run) so requests never wait for it."""
    if _status["installed"] and library.available():
        threading.Thread(target=parts, name="nova-warmup", daemon=True).start()


def status() -> dict:
    """Never blocks: reports 'loading' while the library index is still being built."""
    loading = _status["installed"] and library.available() and _parts is None
    return {**_status, "loading": loading, "ldraw_dir": str(library.library_dir() or ""), "nova_dir": str(settings.nova_dir or "")}


def enabled() -> bool:
    return parts() is not None


def build(plan: dict) -> tuple[str, list[dict]]:
    """Return (mpd_text, diagnostics). Diagnostics use LDraw Nova's issue dicts.

    While the library index is still warming up we use our own writer + stud-grid checks
    instead of making a child wait minutes.
    """
    p = _parts
    if p is None:
        return write_mpd(plan["sections"][0]["name"], plan["sections"], author=plan.get("author", "Brick Buddy")), []
    try:
        text, model, issues = _build_plan(plan, p)
    except Exception as exc:  # schema / unknown part / bad colour
        return "", [{"code": "nova.build", "severity": "error", "message": str(exc)}]
    diags = [dict(i) for i in issues]
    if not any(i.get("severity") == "error" for i in diags):
        try:
            report = _analyze_geometry(model, p, detail="summary")
            for d in report.get("diagnostics", []):
                # Our stud-grid check is stricter for kid models; keep Nova's errors + warnings for the log.
                diags.append(dict(d))
        except Exception as exc:  # noqa: BLE001
            diags.append({"code": "nova.geometry", "severity": "warning", "message": str(exc)})
    return text, diags


def example_dirs() -> list[Path]:
    """Directories holding LDraw Nova's ready-made example models."""
    roots = []
    if settings.nova_dir:
        roots.append(settings.nova_dir / "examples")
    out = []
    for r in roots:
        for atlas in ("building-atlas", "vehicle-atlas"):
            d = r / atlas
            if d.is_dir():
                out += sorted(p for p in d.iterdir() if p.is_dir() and any(p.glob("*.mpd")))
    return out
