from io import BytesIO
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.utils.config import settings

router = APIRouter()


@router.get("/bundle")
def download_bundle() -> StreamingResponse:
    storage_dir = Path(settings.storage_dir)
    buffer = BytesIO()
    with ZipFile(buffer, "w", ZIP_DEFLATED) as zip_file:
        if storage_dir.exists():
            for path in storage_dir.rglob("*"):
                if path.is_file():
                    zip_file.write(path, path.relative_to(storage_dir))
    buffer.seek(0)
    headers = {"Content-Disposition": "attachment; filename=compliance_bundle.zip"}
    return StreamingResponse(buffer, media_type="application/zip", headers=headers)
