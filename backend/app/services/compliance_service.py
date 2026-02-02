from collections import Counter
from sqlalchemy.orm import Session
from app.models import ComplianceResult, DocumentChunk, Evidence
from app.services.openai_client import OpenAIClient


def _tokenize(text: str) -> list[str]:
    return [token.lower() for token in text.replace("/", " ").split() if len(token) > 3]


def _score_chunk(requirement_tokens: list[str], content: str) -> int:
    chunk_tokens = Counter(_tokenize(content))
    return sum(chunk_tokens.get(token, 0) for token in requirement_tokens)


def find_candidate_chunks(db: Session, requirement: str, limit: int = 5) -> list[tuple[int, DocumentChunk]]:
    tokens = _tokenize(requirement)
    if not tokens:
        return []
    candidates = db.query(DocumentChunk).limit(2000).all()
    scored: list[tuple[int, DocumentChunk]] = []
    for chunk in candidates:
        score = _score_chunk(tokens, chunk.content)
        if score > 0:
            scored.append((score, chunk))
    scored.sort(key=lambda item: item[0], reverse=True)
    return scored[:limit]


def evaluate_requirements(db: Session, run_id: int, requirements: list[str]) -> list[ComplianceResult]:
    client = OpenAIClient()
    results: list[ComplianceResult] = []
    for requirement in requirements:
        scored_chunks = find_candidate_chunks(db, requirement)
        evidence_texts = [chunk.content for _, chunk in scored_chunks]
        rationale = client.summarize_with_evidence(requirement, evidence_texts)
        status = "fail"
        if scored_chunks:
            has_high = any(score >= 3 for score, _ in scored_chunks)
            status = "pass" if has_high else "partial"

        result = ComplianceResult(
            run_id=run_id,
            requirement_id=requirement,
            status=status,
            rationale=rationale,
        )
        db.add(result)
        for score, chunk in scored_chunks:
            confidence = "high" if score >= 3 else "medium" if score == 2 else "low"
            db.add(
                Evidence(
                    requirement_id=requirement,
                    document_id=chunk.document_id,
                    chunk_id=chunk.id,
                    confidence=confidence,
                )
            )
        results.append(result)
    db.commit()
    return results
