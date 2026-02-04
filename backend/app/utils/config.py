import os
from pydantic import BaseModel


class Settings(BaseModel):
    database_url: str = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/compliance_ai")
    storage_dir: str = os.getenv("STORAGE_DIR", "/workspace/Projecthub/backend/app/storage")
    openai_api_key: str | None = os.getenv("OPENAI_API_KEY")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4o")
    openai_disabled: bool = os.getenv("OPENAI_DISABLED", "false").lower() == "true"


settings = Settings()
