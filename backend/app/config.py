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

# Signs the session cookie. Set a real value in .env for anything beyond local use.
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-not-for-production")

# The MVP has one hardcoded account. The database is built for more users later.
AUTH_USERNAME = os.getenv("AUTH_USERNAME", "user")
AUTH_PASSWORD = os.getenv("AUTH_PASSWORD", "password")

# Set to the frontend dev server origin (for example http://localhost:3000) to
# allow cross-origin calls while developing. Unset in Docker, where the API and
# the site share an origin.
DEV_CORS_ORIGIN = os.getenv("DEV_CORS_ORIGIN")
