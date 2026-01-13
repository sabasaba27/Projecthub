from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import List

from flask import Flask, jsonify, render_template, request, redirect, url_for, flash, abort
from werkzeug.utils import secure_filename


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = BASE_DIR / "static" / "uploads"
ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "svg"}
ALLOWED_VIDEO_EXTENSIONS = {"mp4", "mov", "webm"}
ADMIN_UPLOAD_TOKEN = os.environ.get("ADMIN_UPLOAD_TOKEN", "")

app = Flask(__name__)
app.secret_key = os.urandom(24)


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


def is_allowed(filename: str, extensions: set[str]) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in extensions


def tokenize(text: str) -> List[str]:
    words = re.findall(r"[a-zA-Z']+", text.lower())
    stop_words = {
        "the", "and", "that", "with", "from", "this", "have", "were", "their",
        "about", "into", "they", "them", "when", "what", "your", "you", "for",
        "are", "was", "has", "had", "who", "why", "how", "our", "out", "but",
        "not", "his", "her", "she", "him", "its", "our", "we", "us", "a", "an",
        "to", "of", "in", "on", "by", "as", "it", "is", "be", "or", "at"
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


def generate_answer(question: str, matches: List[VideoEntry]) -> str:
    if not matches:
        return "No analyzed testimonies match that question yet. Try a broader question or upload more videos."
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


@app.route("/")
def home() -> str:
    videos = load_videos()
    return render_template("index.html", videos=videos)


@app.route("/ask")
def ask() -> str:
    return render_template("ask.html")


@app.route("/videos")
def videos() -> str:
    entries = load_videos()
    return render_template("videos.html", videos=entries)


@app.route("/about")
def about() -> str:
    return render_template("about.html")


@app.route("/admin/upload", methods=["GET", "POST"])
def admin_upload() -> str:
    abort(404)


@app.route("/admin/<token>/upload", methods=["GET", "POST"])
def admin_upload_token(token: str) -> str:
    if not ADMIN_UPLOAD_TOKEN or token != ADMIN_UPLOAD_TOKEN:
        abort(404)

    if request.method == "POST":
        title = request.form.get("title", "").strip()
        speaker = request.form.get("speaker", "").strip()
        year = request.form.get("year", "").strip() or str(datetime.now().year)
        summary = request.form.get("summary", "").strip()
        transcript = request.form.get("transcript", "").strip()
        key_word = request.form.get("key_word", "").strip()
        thumbnail = request.files.get("thumbnail")
        video_file = request.files.get("video")

        if not title or not speaker or not summary or not transcript:
            flash("Please fill in all required fields.", "error")
            return redirect(url_for("admin_upload_token", token=token))

        thumbnail_path = ""
        video_path = ""

        if thumbnail and is_allowed(thumbnail.filename, ALLOWED_IMAGE_EXTENSIONS):
            filename = secure_filename(thumbnail.filename)
            saved_path = UPLOAD_DIR / filename
            thumbnail.save(saved_path)
            thumbnail_path = f"/static/uploads/{filename}"

        if video_file and is_allowed(video_file.filename, ALLOWED_VIDEO_EXTENSIONS):
            filename = secure_filename(video_file.filename)
            saved_path = UPLOAD_DIR / filename
            video_file.save(saved_path)
            video_path = f"/static/uploads/{filename}"

        ai_summary, ai_keywords = analyze_transcript(transcript)
        key_word = key_word or (ai_keywords[0].title() if ai_keywords else "Story")

        videos = load_videos()
        next_id = max((video.id for video in videos), default=0) + 1
        if not thumbnail_path:
            thumbnail_path = "/static/uploads/sample-ani.svg"

        new_video = VideoEntry(
            id=next_id,
            title=title,
            speaker=speaker,
            year=year,
            summary=summary,
            key_word=key_word,
            thumbnail=thumbnail_path,
            video=video_path,
            transcript=transcript,
            ai_summary=ai_summary,
            ai_keywords=ai_keywords,
        )
        videos.append(new_video)
        save_videos(videos)
        flash("Video entry saved. It will now appear across the site.", "success")
        return redirect(url_for("videos"))

    return render_template("admin_upload.html", admin_token=token)


@app.route("/api/ask", methods=["POST"])
def api_ask() -> tuple[str, int]:
    payload = request.get_json(silent=True) or {}
    question = str(payload.get("question", "")).strip()
    if not question:
        return jsonify({"answer": "Please enter a question so the archive can respond.", "matches": []}), 400

    videos = load_videos()
    question_tokens = set(tokenize(question))
    ranked = []
    for video in videos:
        transcript_tokens = set(tokenize(video.transcript))
        keyword_tokens = set(tokenize(" ".join(video.ai_keywords)))
        overlap = len(question_tokens & (transcript_tokens | keyword_tokens))
        if overlap:
            ranked.append((overlap, video))
    ranked.sort(key=lambda item: item[0], reverse=True)

    matches = [video for _, video in ranked][:3]
    answer = generate_answer(question, matches)

    return jsonify(
        {
            "answer": answer,
            "matches": [
                {
                    "title": video.title,
                    "summary": video.ai_summary or video.summary,
                    "speaker": video.speaker,
                    "year": video.year,
                    "thumbnail": video.thumbnail,
                    "video": video.video,
                }
                for video in matches
            ],
        }
    ), 200


if __name__ == "__main__":
    app.run(debug=True)
