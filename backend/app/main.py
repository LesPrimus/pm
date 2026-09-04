from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.health import router as health_router
from app.config import DEV_CORS_ORIGIN, STATIC_DIR

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
    """Keep unmatched API paths on the API, rather than falling through to the site."""
    raise HTTPException(status_code=404, detail="Not Found")


# Mounted last so every API route is matched first.
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")
