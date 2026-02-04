from datetime import datetime
from pydantic import BaseModel


class DocumentCreate(BaseModel):
    tenant_id: int
    title: str
    source_type: str = "internal"


class DocumentResponse(BaseModel):
    id: int
    tenant_id: int
    title: str
    source_type: str
    storage_path: str
    created_at: datetime

    class Config:
        from_attributes = True


class RegulatorySourceCreate(BaseModel):
    name: str
    url: str
    category: str


class RegulatorySourceResponse(RegulatorySourceCreate):
    id: int
    last_ingested_at: datetime | None

    class Config:
        from_attributes = True


class ComplianceRequest(BaseModel):
    tenant_id: int
    report_type: str
    requirements: list[str]


class ComplianceResultResponse(BaseModel):
    requirement_id: str
    status: str
    rationale: str


class ReportRequest(BaseModel):
    run_id: int
    title: str
    format: str = "pdf"


class ReportResponse(BaseModel):
    id: int
    title: str
    output_path: str

    class Config:
        from_attributes = True


class AuditLogResponse(BaseModel):
    id: int
    tenant_id: int
    user_id: int | None
    action: str
    details: str
    created_at: datetime

    class Config:
        from_attributes = True
