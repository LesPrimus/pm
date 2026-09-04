"""Settings, read from the environment."""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

STATIC_DIR = Path(os.getenv("STATIC_DIR", BASE_DIR / "static"))

# Set to the frontend dev server origin (for example http://localhost:3000) to
# allow cross-origin calls while developing. Unset in Docker, where the API and
# the site share an origin.
DEV_CORS_ORIGIN = os.getenv("DEV_CORS_ORIGIN")
