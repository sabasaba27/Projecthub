from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session
from app.models import RegulatorySource
from app.schemas import RegulatorySourceCreate, RegulatorySourceResponse
from app.services.regulatory_service import ingest_regulatory_source
from app.utils.dependencies import get_db

router = APIRouter()


@router.post("/sources", response_model=RegulatorySourceResponse)
def create_source(
    payload: RegulatorySourceCreate,
    db: Session = Depends(get_db),
) -> RegulatorySourceResponse:
    source = RegulatorySource(**payload.model_dump())
    db.add(source)
    db.commit()
    db.refresh(source)
    return source


@router.get("/sources", response_model=list[RegulatorySourceResponse])
def list_sources(db: Session = Depends(get_db)) -> list[RegulatorySourceResponse]:
    return db.query(RegulatorySource).all()


@router.post("/ingest/{source_id}")
def ingest_source(
    source_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> dict:
    source = db.query(RegulatorySource).filter(RegulatorySource.id == source_id).first()
    if not source:
        return {"status": "not_found"}
    background_tasks.add_task(ingest_regulatory_source, db, source)
    return {"status": "queued", "source_id": source_id}
