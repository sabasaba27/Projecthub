from openai import OpenAI
from app.utils.config import settings


class OpenAIClient:
    def __init__(self) -> None:
        self.disabled = settings.openai_disabled
        self.client = None
        if not self.disabled:
            if not settings.openai_api_key:
                raise ValueError("OPENAI_API_KEY is required")
            self.client = OpenAI(api_key=settings.openai_api_key)

    def summarize_with_evidence(self, requirement: str, evidence: list[str]) -> str:
        if self.disabled:
            if not evidence:
                return f"Requirement: {requirement}\nEvidence missing."
            snippet = evidence[0][:600]
            return f"Requirement: {requirement}\nEvidence snippet: {snippet}"

        prompt = (
            "Summarize the compliance status for the requirement using only the evidence. "
            "If evidence is missing, say so explicitly.\n\n"
            f"Requirement: {requirement}\n\nEvidence:\n" + "\n".join(evidence)
        )
        response = self.client.responses.create(
            model=settings.openai_model,
            input=prompt,
        )
        return response.output_text
