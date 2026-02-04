from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.models import AuditLog
from app.schemas import AuditLogResponse
from app.utils.dependencies import get_db

router = APIRouter()


@router.get("/", response_model=list[AuditLogResponse])
def list_audit_logs(
    tenant_id: int, db: Session = Depends(get_db)
) -> list[AuditLogResponse]:
    return (
        db.query(AuditLog)
        .filter(AuditLog.tenant_id == tenant_id)
        .order_by(AuditLog.created_at.desc())
        .all()
    )
