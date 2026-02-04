from datetime import datetime
from pathlib import Path
from urllib.request import urlretrieve
from sqlalchemy.orm import Session
from app.models import Document, DocumentChunk, RegulatorySource
from app.services.document_service import extract_paragraphs
from app.utils.config import settings


def ingest_regulatory_source(db: Session, source: RegulatorySource) -> Document:
    storage_dir = Path(settings.storage_dir) / "regulatory" / source.category
    storage_dir.mkdir(parents=True, exist_ok=True)
    file_name = source.url.split("/")[-1]
    file_path = storage_dir / file_name
    urlretrieve(source.url, file_path)

    document = Document(
        tenant_id=0,
        source_type="regulatory",
        title=source.name,
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

    source.last_ingested_at = datetime.utcnow()
    db.commit()
    db.refresh(document)
    return document
