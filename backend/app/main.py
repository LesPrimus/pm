from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app.api.auth import router as auth_router
from app.api.board import router as board_router
from app.api.health import router as health_router
from app.config import DATABASE_PATH, DEV_CORS_ORIGIN, SECRET_KEY, STATIC_DIR
from app.db import init_db


def create_app(
    static_dir: Path = STATIC_DIR, database_path: Path = DATABASE_PATH
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        init_db(database_path)
        yield

    app = FastAPI(title="Project Management MVP", lifespan=lifespan)
    app.state.database_path = database_path

    if DEV_CORS_ORIGIN:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=[DEV_CORS_ORIGIN],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.add_middleware(SessionMiddleware, secret_key=SECRET_KEY, same_site="lax")

    app.include_router(health_router, prefix="/api")
    app.include_router(auth_router, prefix="/api")
    app.include_router(board_router, prefix="/api")

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
