from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def static_dir(tmp_path: Path) -> Path:
    """A stand-in for the built frontend, shaped like a NextJS export."""
    (tmp_path / "index.html").write_text("<html><body>Kanban Studio</body></html>")
    (tmp_path / "404.html").write_text("<html><body>Not found</body></html>")
    asset = tmp_path / "_next" / "static" / "chunks"
    asset.mkdir(parents=True)
    (asset / "main.js").write_text("console.log('hi');")
    return tmp_path


@pytest.fixture
def client(static_dir: Path) -> TestClient:
    return TestClient(create_app(static_dir))
