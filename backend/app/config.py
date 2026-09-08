"""Settings, read from the environment."""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parent.parent


def _default_static_dir() -> Path:
    """Built frontend: copied to app/static in Docker, left in frontend/out locally."""
    packaged = BASE_DIR / "static"
    return packaged if packaged.is_dir() else REPO_ROOT / "frontend" / "out"


STATIC_DIR = Path(os.getenv("STATIC_DIR") or _default_static_dir())

# The SQLite file. Set explicitly in the image: the backend lives at /app/app there,
# so walking up from the source lands on / rather than the mounted volume.
DATABASE_PATH = Path(os.getenv("DATABASE_PATH") or REPO_ROOT / "data" / "pm.db")

# Signs the session cookie. Set a real value in .env for anything beyond local use.
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-not-for-production")

# The MVP has one hardcoded account. The database is built for more users later.
AUTH_USERNAME = os.getenv("AUTH_USERNAME", "user")
AUTH_PASSWORD = os.getenv("AUTH_PASSWORD", "password")

# OpenRouter, called through the OpenAI SDK. The key lives in .env at the project
# root and reaches the container through env_file in compose.yaml.
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
AI_MODEL = os.getenv("AI_MODEL", "openai/gpt-oss-120b")

# Set to the frontend dev server origin (for example http://localhost:3000) to
# allow cross-origin calls while developing. Unset in Docker, where the API and
# the site share an origin.
DEV_CORS_ORIGIN = os.getenv("DEV_CORS_ORIGIN")
