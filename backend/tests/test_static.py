from fastapi.testclient import TestClient


def test_root_serves_html(client: TestClient) -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    assert "Hello world" in response.text


def test_unknown_api_path_returns_json_404(client: TestClient) -> None:
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/json")


def test_unknown_site_path_returns_404(client: TestClient) -> None:
    response = client.get("/no-such-page")
    assert response.status_code == 404
