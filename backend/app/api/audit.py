from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.models import AuditLog
from app.utils.dependencies import get_db

router = APIRouter()


@router.get("/")
def list_audit_logs(tenant_id: int, db: Session = Depends(get_db)) -> list[AuditLog]:
    return db.query(AuditLog).filter(AuditLog.tenant_id == tenant_id).order_by(AuditLog.created_at.desc()).all()
