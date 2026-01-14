from __future__ import annotations

from datetime import datetime

from flask import Flask, abort, flash, jsonify, redirect, render_template, request, session, url_for
from werkzeug.utils import secure_filename

from ai_client import LocalAI
from archive import VideoEntry, analyze_transcript, build_context, generate_answer, load_videos, save_videos, tokenize
from config import ALLOWED_IMAGE_EXTENSIONS, ALLOWED_VIDEO_EXTENSIONS, UPLOAD_DIR, Settings


def _is_allowed(filename: str, extensions: set[str]) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in extensions


def register_routes(app: Flask, settings: Settings, ai_client: LocalAI) -> None:
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

    @app.route("/admin/<token>/login", methods=["GET", "POST"])
    def admin_login(token: str) -> str:
        if not settings.admin_upload_token or token != settings.admin_upload_token:
            abort(404)
        if request.method == "POST":
            password = request.form.get("password", "").strip()
            if password == settings.admin_password:
                session["admin_authed"] = True
                return redirect(url_for("admin_upload_token", token=token))
            flash("Incorrect password. Please try again.", "error")
        return render_template("admin_login.html", admin_token=token)

    @app.route("/admin/<token>/upload", methods=["GET", "POST"])
    def admin_upload_token(token: str) -> str:
        if not settings.admin_upload_token or token != settings.admin_upload_token:
            abort(404)
        if not session.get("admin_authed"):
            return redirect(url_for("admin_login", token=token))

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

            if thumbnail and _is_allowed(thumbnail.filename, ALLOWED_IMAGE_EXTENSIONS):
                filename = secure_filename(thumbnail.filename)
                saved_path = UPLOAD_DIR / filename
                thumbnail.save(saved_path)
                thumbnail_path = f"/static/uploads/{filename}"

            if video_file and _is_allowed(video_file.filename, ALLOWED_VIDEO_EXTENSIONS):
                filename = secure_filename(video_file.filename)
                saved_path = UPLOAD_DIR / filename
                video_file.save(saved_path)
                video_path = f"/static/uploads/{filename}"

            ai_summary, ai_keywords = analyze_transcript(transcript)
            if ai_client.is_ready():
                ai_summary_local, ai_keywords_local = ai_client.summarize(transcript)
                if ai_summary_local:
                    ai_summary = ai_summary_local
                if ai_keywords_local:
                    ai_keywords = ai_keywords_local
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
        if ai_client.is_ready():
            context_videos = matches or videos
            answer = ai_client.answer(question, build_context(context_videos, settings.local_model_max_chars))
            if not answer:
                answer = "The archive does not contain enough information to answer that question yet."
        else:
            answer = generate_answer(question, matches, ai_client)

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
