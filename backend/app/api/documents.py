from pathlib import Path
from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session
from app.models import Document, DocumentChunk
from app.schemas import DocumentResponse
from app.services.audit_service import log_event
from app.services.document_service import extract_paragraphs
from app.utils.config import settings
from app.utils.dependencies import get_db

router = APIRouter()


@router.post("/upload", response_model=DocumentResponse)
def upload_document(
    tenant_id: int,
    title: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> DocumentResponse:
    storage_dir = Path(settings.storage_dir) / "uploads" / str(tenant_id)
    storage_dir.mkdir(parents=True, exist_ok=True)
    file_path = storage_dir / file.filename
    file_path.write_bytes(file.file.read())

    document = Document(
        tenant_id=tenant_id,
        source_type="internal",
        title=title,
        storage_path=str(file_path),
    )
    db.add(document)
    db.flush()

    file_type = file_path.suffix.replace(".", "")
    for page_number, paragraph_index, content in extract_paragraphs(file_path, file_type):
        db.add(
            DocumentChunk(
                document_id=document.id,
                page_number=page_number,
                paragraph_index=paragraph_index,
                content=content,
            )
        )

    db.commit()
    db.refresh(document)
    log_event(db, tenant_id, None, "document.upload", f"Uploaded {file.filename}")
    return document


@router.get("/", response_model=list[DocumentResponse])
def list_documents(tenant_id: int, db: Session = Depends(get_db)) -> list[DocumentResponse]:
    return db.query(Document).filter(Document.tenant_id == tenant_id).all()
