from fastapi.testclient import TestClient


def test_root_serves_the_export(client: TestClient) -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Kanban Studio" in response.text


def test_next_asset_is_served(client: TestClient) -> None:
    response = client.get("/_next/static/chunks/main.js")
    assert response.status_code == 200
    assert "console.log" in response.text


def test_unknown_api_path_returns_json_404(client: TestClient) -> None:
    """The export ships a 404.html, so without the guard this would return HTML."""
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")
    assert response.json() == {"detail": "Not Found"}


def test_unknown_site_path_returns_404(client: TestClient) -> None:
    response = client.get("/no-such-page")
    assert response.status_code == 404
