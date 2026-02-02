from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from app.api import audit, compliance, documents, regulatory, reports
from app.utils.config import settings

app = FastAPI(title="Compliance AI Backend", version="0.1.0")

app.mount("/web", StaticFiles(directory="/workspace/Projecthub/backend/web", html=True), name="web")

app.include_router(documents.router, prefix="/documents", tags=["documents"])
app.include_router(regulatory.router, prefix="/regulatory", tags=["regulatory"])
app.include_router(compliance.router, prefix="/compliance", tags=["compliance"])
app.include_router(reports.router, prefix="/reports", tags=["reports"])
app.include_router(audit.router, prefix="/audit", tags=["audit"])


@app.get("/")
def health_check() -> dict:
    return {
        "status": "ok",
        "service": "compliance-ai-backend",
        "model": settings.openai_model,
    }
