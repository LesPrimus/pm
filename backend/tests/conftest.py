from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

CREDENTIALS = {"username": "user", "password": "password"}


@pytest.fixture
def static_dir(tmp_path: Path) -> Path:
    """A stand-in for the built frontend, shaped like a NextJS export."""
    root = tmp_path / "static"
    (root / "_next" / "static" / "chunks").mkdir(parents=True)
    (root / "index.html").write_text("<html><body>Kanban Studio</body></html>")
    (root / "404.html").write_text("<html><body>Not found</body></html>")
    (root / "_next" / "static" / "chunks" / "main.js").write_text("console.log('hi');")
    return root


@pytest.fixture
def database_path(tmp_path: Path) -> Path:
    """Deliberately nested, so the directory has to be created too."""
    return tmp_path / "data" / "pm.db"


@pytest.fixture
def client(static_dir: Path, database_path: Path) -> Iterator[TestClient]:
    # The context manager runs the lifespan, which creates the schema.
    with TestClient(create_app(static_dir, database_path)) as client:
        yield client


@pytest.fixture
def signed_in(client: TestClient) -> TestClient:
    client.post("/api/auth/login", json=CREDENTIALS)
    return client
