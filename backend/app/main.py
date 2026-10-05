from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api import analytics, batches, imports, reports
from .config import get_settings
from .db import init_db
from .worker import Worker, recover_interrupted

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("safetylens")


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ANN201
    settings = get_settings()
    init_db()
    n = recover_interrupted()
    if n:
        log.warning("Recovered %d interrupted analysis job(s); their batches can be resumed from the UI.", n)
    worker = None
    if settings.worker_enabled:
        worker = Worker()
        worker.start()
    log.info(
        "SafetyLens ready. Default engine=%s, LLM configured=%s",
        settings.analysis_engine,
        settings.llm_configured,
    )
    yield
    if worker:
        worker.stop()


app = FastAPI(title="SafetyLens API", version="0.1.0-prototype", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in get_settings().cors_origins.split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)
for r in (imports.router, batches.router, reports.router, analytics.router):
    app.include_router(r)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


# Optional: serve the built frontend from the same process (STATIC_DIR=frontend/dist).
_static = os.environ.get("STATIC_DIR")
if _static and Path(_static).is_dir():
    _dist = Path(_static)
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str) -> FileResponse:
        candidate = (_dist / full_path).resolve()
        if full_path and candidate.is_relative_to(_dist.resolve()) and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_dist / "index.html")
