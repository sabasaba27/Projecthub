from pathlib import Path
from sqlalchemy.orm import Session
from app.models import ComplianceResult, Document, DocumentChunk, Evidence, Report
from app.utils.config import settings


def _format_citation(document: Document, chunk: DocumentChunk, confidence: str) -> str:
    page_info = f"page {chunk.page_number}" if chunk.page_number else "page n/a"
    paragraph_info = f"paragraph {chunk.paragraph_index}" if chunk.paragraph_index else "paragraph n/a"
    return f"- {document.title} ({page_info}, {paragraph_info}, confidence: {confidence})"


def build_report_content(db: Session, run_id: int) -> str:
    results = db.query(ComplianceResult).filter(ComplianceResult.run_id == run_id).all()
    lines = ["Compliance Report", "================="]
    for result in results:
        lines.append(f"Requirement: {result.requirement_id}")
        lines.append(f"Status: {result.status}")
        lines.append("Rationale:")
        lines.append(result.rationale)
        lines.append("Evidence:")
        evidence_rows = (
            db.query(Evidence, DocumentChunk, Document)
            .join(DocumentChunk, Evidence.chunk_id == DocumentChunk.id)
            .join(Document, Evidence.document_id == Document.id)
            .filter(Evidence.requirement_id == result.requirement_id)
            .all()
        )
        if evidence_rows:
            for evidence, chunk, document in evidence_rows:
                lines.append(_format_citation(document, chunk, evidence.confidence))
        else:
            lines.append("- No evidence found")
        lines.append("")
    return "\n".join(lines)


def generate_report(db: Session, run_id: int, title: str, output_format: str) -> Report:
    output_dir = Path(settings.storage_dir) / "reports"
    output_dir.mkdir(parents=True, exist_ok=True)
    extension = "pdf" if output_format.lower() == "pdf" else "docx"
    output_path = output_dir / f"{title.replace(' ', '_')}.{extension}"
    content = build_report_content(db, run_id)
    output_path.write_text(content, encoding="utf-8")
    report = Report(run_id=run_id, title=title, output_path=str(output_path))
    db.add(report)
    db.commit()
    db.refresh(report)
    return report
