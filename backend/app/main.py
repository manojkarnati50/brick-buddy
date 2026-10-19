"""Brick Buddy API (FastAPI)."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import library
from .config import settings
from .db import init_db
from .routes import backup, generate, inventory, kid, projects, stats, system, voice
from .seed import seed_if_empty

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_app):
    init_db()
    seed_if_empty()
    yield


app = FastAPI(title="Brick Buddy", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
                   allow_methods=["*"], allow_headers=["*"])

for r in (system.router, projects.router, generate.router, inventory.router, stats.router, kid.router,
          voice.router, backup.router):
    app.include_router(r)

# Model files, thumbnails and build photos. Her private avatar art is served only via /api/avatar/art.
app.mount("/files/models", StaticFiles(directory=settings.models_dir), name="models")
app.mount("/files/thumbs", StaticFiles(directory=settings.thumbs_dir), name="thumbs")
app.mount("/files/uploads", StaticFiles(directory=settings.uploads_dir), name="uploads")


@app.get("/ldraw/{path:path}")
def ldraw_file(path: str):
    """Serve the LDraw parts library to three.js LDrawLoader ("real parts" view)."""
    root = library.library_dir()
    if not root:
        raise HTTPException(404, "LDraw library not installed")
    f = (root / path).resolve()
    if root.resolve() not in f.parents or not f.is_file():
        # LDrawLoader probes several folders; fall back to a case-insensitive lookup
        alt = library.find_file(Path(path).name)
        if not alt:
            raise HTTPException(404)
        f = alt
    return FileResponse(f, media_type="text/plain", headers={"Cache-Control": "public, max-age=604800"})


# Production: serve the built frontend from the same origin.
_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if _dist.is_dir():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        f = _dist / full_path
        if full_path and f.is_file() and _dist in f.resolve().parents:
            return FileResponse(f)
        return FileResponse(_dist / "index.html")


