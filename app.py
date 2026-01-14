from flask import Flask

from ai_client import LocalAI
from config import get_settings
from routes import register_routes


def create_app() -> Flask:
    settings = get_settings()
    app = Flask(__name__)
    app.secret_key = settings.secret_key
    ai_client = LocalAI(settings)
    register_routes(app, settings, ai_client)
    return app


if __name__ == "__main__":
    create_app().run(debug=True)
