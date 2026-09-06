from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.middleware.sessions import SessionMiddleware

from app.api.auth import CurrentUser
from app.api.auth import router as auth_router
from tests.conftest import CREDENTIALS


def test_me_is_401_before_signing_in(client: TestClient) -> None:
    assert client.get("/api/auth/me").status_code == 401


def test_login_starts_a_session(client: TestClient) -> None:
    response = client.post("/api/auth/login", json=CREDENTIALS)
    assert response.status_code == 200
    assert response.json() == {"username": "user"}
    assert "session" in response.cookies

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json() == {"username": "user"}


def test_wrong_password_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login", json={"username": "user", "password": "nope"}
    )
    assert response.status_code == 401
    assert client.get("/api/auth/me").status_code == 401


def test_wrong_username_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login", json={"username": "someone", "password": "password"}
    )
    assert response.status_code == 401


def test_the_two_failures_are_indistinguishable(client: TestClient) -> None:
    """A wrong username must not be told apart from a wrong password."""
    bad_user = client.post(
        "/api/auth/login", json={"username": "someone", "password": "password"}
    )
    bad_password = client.post(
        "/api/auth/login", json={"username": "user", "password": "nope"}
    )
    assert bad_user.json() == bad_password.json()


def test_logout_ends_the_session(client: TestClient) -> None:
    client.post("/api/auth/login", json=CREDENTIALS)
    assert client.get("/api/auth/me").status_code == 200

    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401


def test_missing_fields_are_rejected(client: TestClient) -> None:
    assert client.post("/api/auth/login", json={"username": "user"}).status_code == 422


def test_require_user_guards_a_route() -> None:
    app = FastAPI()
    app.add_middleware(SessionMiddleware, secret_key="test-secret")
    app.include_router(auth_router, prefix="/api")

    @app.get("/guarded")
    def guarded(username: CurrentUser) -> dict[str, str]:
        return {"username": username}

    client = TestClient(app)
    assert client.get("/guarded").status_code == 401

    client.post("/api/auth/login", json=CREDENTIALS)
    assert client.get("/guarded").json() == {"username": "user"}
