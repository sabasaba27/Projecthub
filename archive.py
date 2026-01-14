from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import List, Optional

from config import DATA_DIR


@dataclass
class VideoEntry:
    id: int
    title: str
    speaker: str
    year: str
    summary: str
    key_word: str
    thumbnail: str
    video: str
    transcript: str = ""
    ai_summary: str = ""
    ai_keywords: List[str] = field(default_factory=list)


def load_videos() -> List[VideoEntry]:
    data_path = DATA_DIR / "videos.json"
    if not data_path.exists():
        return []
    payload = json.loads(data_path.read_text(encoding="utf-8"))
    return [VideoEntry(**item) for item in payload]


def save_videos(videos: List[VideoEntry]) -> None:
    data_path = DATA_DIR / "videos.json"
    payload = [video.__dict__ for video in videos]
    data_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def tokenize(text: str) -> List[str]:
    words = re.findall(r"[^\W\d_']+", text.lower(), flags=re.UNICODE)
    stop_words = {
        "the", "and", "that", "with", "from", "this", "have", "were", "their",
        "about", "into", "they", "them", "when", "what", "your", "you", "for",
        "are", "was", "has", "had", "who", "why", "how", "our", "out", "but",
        "not", "his", "her", "she", "him", "its", "our", "we", "us", "a", "an",
        "to", "of", "in", "on", "by", "as", "it", "is", "be", "or", "at",
    }
    return [word for word in words if word not in stop_words]


def analyze_transcript(transcript: str) -> tuple[str, List[str]]:
    if not transcript.strip():
        return "", []
    sentences = re.split(r"(?<=[.!?])\s+", transcript.strip())
    summary = sentences[0] if sentences else transcript.strip()
    words = tokenize(transcript)
    frequency: dict[str, int] = {}
    for word in words:
        frequency[word] = frequency.get(word, 0) + 1
    keywords = sorted(frequency, key=frequency.get, reverse=True)[:5]
    return summary, keywords


def build_context(videos: List[VideoEntry], max_chars: int) -> str:
    chunks = []
    total = 0
    for video in videos:
        summary = video.ai_summary or video.summary
        keywords = ", ".join(video.ai_keywords)
        entry = (
            f"Title: {video.title}\n"
            f"Speaker: {video.speaker}\n"
            f"Year: {video.year}\n"
            f"Summary: {summary}\n"
            f"Keywords: {keywords}\n"
            f"Transcript: {video.transcript}\n"
        )
        if total + len(entry) > max_chars:
            break
        chunks.append(entry)
        total += len(entry)
    return "\n".join(chunks)


def generate_answer(question: str, matches: List[VideoEntry], ai_client: Optional[object]) -> str:
    if not matches:
        return "No analyzed testimonies match that question yet. Try a broader question or upload more videos."
    if ai_client and getattr(ai_client, "is_ready", lambda: False)():
        combined_context = build_context(matches, getattr(ai_client.settings, "local_model_max_chars", 6000))
        ai_response = ai_client.answer(question, combined_context)
        if ai_response:
            return ai_response
    question_tokens = set(tokenize(question))
    combined_keywords: List[str] = []
    supporting_points: List[str] = []

    for video in matches:
        combined_keywords.extend(video.ai_keywords)
        if video.ai_summary:
            supporting_points.append(video.ai_summary)
        elif video.summary:
            supporting_points.append(video.summary)

    keyword_frequency: dict[str, int] = {}
    for keyword in combined_keywords:
        keyword_frequency[keyword] = keyword_frequency.get(keyword, 0) + 1
    top_keywords = sorted(keyword_frequency, key=keyword_frequency.get, reverse=True)[:5]

    focused_points: List[str] = []
    for point in supporting_points:
        point_tokens = set(tokenize(point))
        if question_tokens & point_tokens:
            focused_points.append(point)
    if not focused_points:
        focused_points = supporting_points[:2]

    themes = ", ".join(top_keywords) if top_keywords else "shared experiences"
    details = " ".join(focused_points)
    return (
        "Based on the analyzed testimonies, the archive suggests that "
        f"{details} Themes most connected to your question include {themes}."
    )
