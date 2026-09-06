from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app


def test_app_starts_without_a_built_frontend(tmp_path: Path) -> None:
    """A fresh clone has no export yet; the API must still work."""
    app = create_app(tmp_path / "missing", tmp_path / "data" / "pm.db")
    with TestClient(app) as client:
        assert client.get("/api/health").status_code == 200
        assert client.get("/").status_code == 404
