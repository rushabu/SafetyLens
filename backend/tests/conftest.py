from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import db as dbmod  # noqa: E402
from app.config import get_settings  # noqa: E402


@pytest.fixture()
def db_url(tmp_path, monkeypatch):
    url = f"sqlite:///{(tmp_path / 'test.db').as_posix()}"
    s = get_settings()
    # Tests never use a developer's local .env LLM configuration.
    monkeypatch.setattr(s, "llm_provider", "none")
    monkeypatch.setattr(s, "llm_api_key", "")
    monkeypatch.setattr(s, "analysis_engine", "baseline")
    monkeypatch.setattr(s, "worker_enabled", False)
    monkeypatch.setattr(s, "database_url", url)
    dbmod.configure(url)
    dbmod.init_db()
    yield url
    dbmod.get_engine().dispose()


@pytest.fixture()
def session(db_url):
    s = dbmod.SessionLocal()
    yield s
    s.close()


@pytest.fixture()
def client(db_url):
    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app) as c:
        yield c


def drain() -> int:
    """Run the worker synchronously until the queue is empty."""
    from app.worker import process_one

    n = 0
    while process_one():
        n += 1
    return n


def upload(client, csv_text: str, *, source_type="operational", engine="baseline", name="reports.csv", force=False):
    files = {"file": (name, csv_text.encode("utf-8"), "text/csv")}
    data = {"source_type": source_type, "engine": engine, "force": str(force).lower()}
    return client.post("/api/imports/commit", files=files, data=data)
