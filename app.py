from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import List

from flask import Flask, render_template, request, redirect, url_for, flash
from werkzeug.utils import secure_filename


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = BASE_DIR / "static" / "uploads"
ALLOWED_IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "svg"}
ALLOWED_VIDEO_EXTENSIONS = {"mp4", "mov", "webm"}

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


@app.route("/")
def home() -> str:
    videos = load_videos()
    return render_template("index.html", videos=videos)


@app.route("/ask")
def ask() -> str:
    videos = load_videos()
    return render_template("ask.html", videos=videos)


@app.route("/videos")
def videos() -> str:
    entries = load_videos()
    return render_template("videos.html", videos=entries)


@app.route("/about")
def about() -> str:
    return render_template("about.html")


@app.route("/admin/upload", methods=["GET", "POST"])
def admin_upload() -> str:
    if request.method == "POST":
        title = request.form.get("title", "").strip()
        speaker = request.form.get("speaker", "").strip()
        year = request.form.get("year", "").strip() or str(datetime.now().year)
        summary = request.form.get("summary", "").strip()
        key_word = request.form.get("key_word", "").strip()
        thumbnail = request.files.get("thumbnail")
        video_file = request.files.get("video")

        if not title or not speaker or not summary or not key_word:
            flash("Please fill in all required fields.", "error")
            return redirect(url_for("admin_upload"))

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
        )
        videos.append(new_video)
        save_videos(videos)
        flash("Video entry saved. It will now appear across the site.", "success")
        return redirect(url_for("videos"))

    return render_template("admin_upload.html")


if __name__ == "__main__":
    app.run(debug=True)
