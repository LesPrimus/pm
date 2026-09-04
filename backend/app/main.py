from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.health import router as health_router
from app.config import DEV_CORS_ORIGIN, STATIC_DIR


def create_app(static_dir: Path = STATIC_DIR) -> FastAPI:
    app = FastAPI(title="Project Management MVP")

    if DEV_CORS_ORIGIN:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=[DEV_CORS_ORIGIN],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(health_router, prefix="/api")

    @app.api_route(
        "/api/{path:path}",
        methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        include_in_schema=False,
    )
    def api_not_found(path: str) -> None:
        """Keep unmatched API paths on the API, not on the static site."""
        raise HTTPException(status_code=404, detail="Not Found")

    # Mounted last so every API route is matched first. Skipped when the frontend
    # has not been built, so the API still runs on a fresh clone.
    if static_dir.is_dir():
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

    return app


app = create_app()
