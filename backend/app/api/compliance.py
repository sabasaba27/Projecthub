from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.models import ComplianceRun
from app.schemas import ComplianceRequest, ComplianceResultResponse
from app.services.audit_service import log_event
from app.services.compliance_service import evaluate_requirements
from app.utils.dependencies import get_db

router = APIRouter()


@router.post("/run", response_model=list[ComplianceResultResponse])
def run_compliance(payload: ComplianceRequest, db: Session = Depends(get_db)) -> list[ComplianceResultResponse]:
    run = ComplianceRun(tenant_id=payload.tenant_id, report_type=payload.report_type, status="running")
    db.add(run)
    db.commit()
    db.refresh(run)

    results = evaluate_requirements(db, run.id, payload.requirements)
    run.status = "completed"
    db.commit()
    log_event(db, payload.tenant_id, None, "compliance.run", f"Run {run.id} for {payload.report_type}")
    return [
        ComplianceResultResponse(
            requirement_id=result.requirement_id,
            status=result.status,
            rationale=result.rationale,
        )
        for result in results
    ]
