from sqlalchemy.orm import Session
from app.models import AuditLog


def log_event(db: Session, tenant_id: int, user_id: int | None, action: str, details: str) -> AuditLog:
    entry = AuditLog(tenant_id=tenant_id, user_id=user_id, action=action, details=details)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry
