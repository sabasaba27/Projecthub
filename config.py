from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = BASE_DIR / "static" / "uploads"
ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "svg"}
ALLOWED_VIDEO_EXTENSIONS = {"mp4", "mov", "webm"}


def _resolve_local_model_path() -> str:
    env_path = os.environ.get("LOCAL_MODEL_PATH", "")
    if env_path:
        return env_path
    path_file = DATA_DIR / "local_model_path.txt"
    if path_file.exists():
        return path_file.read_text(encoding="utf-8").strip()
    return ""


@dataclass(frozen=True)
class Settings:
    admin_upload_token: str
    admin_password: str
    secret_key: bytes
    local_model_path: str
    local_model_ctx: int
    local_model_threads: int
    local_model_max_chars: int
    local_model_prompt_max_chars: int


def get_settings() -> Settings:
    secret = os.environ.get("SECRET_KEY")
    if secret:
        secret_key = secret.encode("utf-8")
    else:
        secret_key = os.urandom(24)
    local_model_ctx = int(os.environ.get("LOCAL_MODEL_CTX", "2048"))
    return Settings(
        admin_upload_token=os.environ.get("ADMIN_UPLOAD_TOKEN", ""),
        admin_password=os.environ.get("ADMIN_PASSWORD", "iloveitalians"),
        secret_key=secret_key,
        local_model_path=_resolve_local_model_path(),
        local_model_ctx=local_model_ctx,
        local_model_threads=int(os.environ.get("LOCAL_MODEL_THREADS", "4")),
        local_model_max_chars=int(os.environ.get("LOCAL_MODEL_MAX_CHARS", "6000")),
        local_model_prompt_max_chars=int(
            os.environ.get("LOCAL_MODEL_PROMPT_MAX_CHARS", str(local_model_ctx * 3))
        ),
    )
