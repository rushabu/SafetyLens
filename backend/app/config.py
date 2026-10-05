"""Application settings. Everything comes from environment variables (or a local .env).

Secrets (LLM_API_KEY) are only read server-side and are never returned by any API.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal
from urllib.parse import urlparse

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BACKEND_DIR.parent
KNOWLEDGE_DIR = Path(__file__).resolve().parent / "knowledge"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_DIR / ".env", BACKEND_DIR / ".env"), env_file_encoding="utf-8", extra="ignore"
    )

    database_url: str = f"sqlite:///{(REPO_DIR / 'data' / 'db' / 'safetylens.db').as_posix()}"
    taxonomy_path: Path = KNOWLEDGE_DIR / "taxonomy_v1.yaml"
    rubric_path: Path = KNOWLEDGE_DIR / "rubric_v1.yaml"
    lexicon_path: Path = KNOWLEDGE_DIR / "baseline_lexicon_v1.yaml"

    # Default engine offered in the UI. "baseline" always works without credentials.
    analysis_engine: Literal["baseline", "llm"] = "baseline"

    # LLM adapter (optional). Provider-neutral: anthropic or any OpenAI-compatible endpoint.
    llm_provider: Literal["anthropic", "openai_compatible", "none"] = "none"
    llm_model: str = ""
    llm_base_url: str = ""
    llm_api_key: str = ""
    # Alternative to LLM_API_KEY: path to a file that contains only the key (relative paths are
    # resolved from the repository root). Keeps the secret out of .env and source code.
    llm_api_key_file: str = ""
    # Optional JSON object merged into OpenAI-compatible request bodies, e.g. {"reasoning_effort": "medium"}.
    llm_extra_body: str = ""
    # Prompt version for the LLM engine (A/B evaluation); empty = current default.
    llm_prompt_version: str = ""
    llm_timeout_s: float = 60.0
    llm_max_retries: int = 2
    llm_max_output_tokens: int = 8000
    # Anthropic only: effort level and server-side refusal fallbacks (served model is recorded).
    llm_effort: Literal["low", "medium", "high", "xhigh", "max"] = "medium"
    llm_anthropic_fallbacks: bool = True
    # synthetic_only: a non-local endpoint may only receive reports labelled synthetic.
    # all: any report may be sent (explicit opt-in for real data).
    llm_data_policy: Literal["synthetic_only", "all"] = "synthetic_only"

    worker_poll_interval_s: float = 0.5
    worker_enabled: bool = True
    max_upload_mb: int = 10
    max_report_chars: int = 10000
    near_duplicate_threshold: int = 92
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @model_validator(mode="after")
    def _load_key_file(self) -> "Settings":
        if not self.llm_api_key and self.llm_api_key_file:
            path = Path(self.llm_api_key_file)
            if not path.is_absolute():
                path = REPO_DIR / path
            try:
                self.llm_api_key = path.read_text(encoding="utf-8").strip()
            except OSError:
                pass  # surfaced as "not configured" / authentication errors, never logged
        return self

    @property
    def llm_configured(self) -> bool:
        if self.llm_provider == "none" or not self.llm_model:
            return False
        if self.llm_provider == "anthropic":
            return bool(self.llm_api_key)
        if not self.llm_base_url:
            return False
        # Hosted OpenAI-compatible APIs (e.g. Groq) need a key; local model servers usually do not.
        return self.llm_endpoint_is_local or bool(self.llm_api_key)

    @property
    def llm_endpoint_is_local(self) -> bool:
        if self.llm_provider != "openai_compatible" or not self.llm_base_url:
            return False
        host = (urlparse(self.llm_base_url).hostname or "").lower()
        return host in {"localhost", "127.0.0.1", "::1", "host.docker.internal", "ollama"} or host.endswith(
            ".localhost"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
