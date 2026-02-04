from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.schemas import ReportRequest, ReportResponse
from app.services.report_service import generate_report
from app.utils.dependencies import get_db

router = APIRouter()


@router.post("/", response_model=ReportResponse)
def create_report(payload: ReportRequest, db: Session = Depends(get_db)) -> ReportResponse:
    report = generate_report(db, payload.run_id, payload.title, payload.format)
    return report
