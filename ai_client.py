from __future__ import annotations

import re
from typing import List

from config import Settings


class LocalAI:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._llm = None

    def is_ready(self) -> bool:
        return bool(self.settings.local_model_path)

    def _load(self) -> None:
        if self._llm or not self.settings.local_model_path:
            return
        try:
            from llama_cpp import Llama
        except ImportError:
            return
        self._llm = Llama(
            model_path=self.settings.local_model_path,
            n_ctx=self.settings.local_model_ctx,
            n_threads=self.settings.local_model_threads,
        )

    def _complete(self, prompt: str, max_tokens: int = 256) -> str:
        self._load()
        if not self._llm:
            return ""
        try:
            output = self._llm(
                prompt=prompt,
                max_tokens=max_tokens,
                temperature=0.2,
                top_p=0.9,
                stop=["</answer>"],
            )
        except ValueError:
            return ""
        text = output["choices"][0]["text"].strip()
        return text

    def _clip_text(self, text: str, max_chars: int) -> str:
        if len(text) <= max_chars:
            return text
        return text[:max_chars].rsplit(" ", 1)[0] + "…"

    def summarize(self, transcript: str) -> tuple[str, List[str]]:
        if not self.is_ready():
            return "", []
        clipped_transcript = self._clip_text(transcript, self.settings.local_model_prompt_max_chars)
        prompt = (
            "<task>Summarize and extract keywords from the transcript.</task>\n"
            "<transcript>\n"
            f"{clipped_transcript}\n"
            "</transcript>\n"
            "<answer>Summary:</answer>"
        )
        summary_text = self._complete(prompt, max_tokens=160)
        keywords_prompt = (
            "<task>Extract 5 single-word keywords.</task>\n"
            "<transcript>\n"
            f"{clipped_transcript}\n"
            "</transcript>\n"
            "<answer>Keywords:</answer>"
        )
        keywords_text = self._complete(keywords_prompt, max_tokens=60)
        keywords = [word.strip().strip(",") for word in re.split(r"[,\n]", keywords_text) if word.strip()]
        return summary_text, keywords[:5]

    def answer(self, question: str, context: str) -> str:
        if not self.is_ready():
            return ""
        clipped_context = self._clip_text(context, self.settings.local_model_prompt_max_chars)
        prompt = (
            "<task>Answer the question using only the context provided.</task>\n"
            "If the context does not contain enough information, say so plainly.\n"
            "Keep the response in 2-4 sentences and avoid quoting the prompt.\n"
            "<context>\n"
            f"{clipped_context}\n"
            "</context>\n"
            f"<question>{question}</question>\n"
            "<answer>"
        )
        return self._complete(prompt, max_tokens=220)
