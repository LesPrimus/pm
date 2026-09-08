from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from fastapi.testclient import TestClient

from app.api.auth import require_user
from app.db import connect, get_or_create_user_id, init_db
from app.main import create_app
from app.seed import SEED_BOARD
from tests.conftest import CREDENTIALS

MINIMAL = {
    "columns": [
        {"id": "col-a", "title": "A", "cardIds": ["card-1"]},
        {"id": "col-b", "title": "B", "cardIds": []},
    ],
    "cards": {"card-1": {"id": "card-1", "title": "One", "details": "First"}},
}


def test_schema_is_created_when_the_file_is_absent(
    static_dir: Path, database_path: Path
) -> None:
    assert not database_path.exists()

    with TestClient(create_app(static_dir, database_path)) as client:
        client.post("/api/auth/login", json=CREDENTIALS)
        assert client.get("/api/board").status_code == 200

    assert database_path.exists()


def test_a_new_user_gets_the_seeded_board(signed_in: TestClient) -> None:
    response = signed_in.get("/api/board")
    assert response.status_code == 200
    assert response.json() == SEED_BOARD.model_dump()


def test_put_then_get_round_trips_the_board(signed_in: TestClient) -> None:
    ordered = {
        "columns": [
            {"id": "col-a", "title": "A", "cardIds": ["card-2", "card-1"]},
            {"id": "col-b", "title": "B", "cardIds": ["card-3"]},
        ],
        "cards": {
            "card-1": {"id": "card-1", "title": "One", "details": ""},
            "card-2": {"id": "card-2", "title": "Two", "details": ""},
            "card-3": {"id": "card-3", "title": "Three", "details": ""},
        },
    }
    assert signed_in.put("/api/board", json=ordered).status_code == 200

    stored = signed_in.get("/api/board").json()
    assert stored == ordered
    # Order is data, not incidental: both column order and card order must survive.
    assert [column["id"] for column in stored["columns"]] == ["col-a", "col-b"]
    assert stored["columns"][0]["cardIds"] == ["card-2", "card-1"]


def test_put_with_an_unknown_card_id_is_rejected(signed_in: TestClient) -> None:
    signed_in.put("/api/board", json=MINIMAL)

    broken = {
        "columns": [{"id": "col-a", "title": "A", "cardIds": ["card-1", "ghost"]}],
        "cards": MINIMAL["cards"],
    }
    assert signed_in.put("/api/board", json=broken).status_code == 422
    assert signed_in.get("/api/board").json() == MINIMAL


def test_put_with_a_duplicated_card_is_rejected(signed_in: TestClient) -> None:
    signed_in.put("/api/board", json=MINIMAL)

    duplicated = {
        "columns": [
            {"id": "col-a", "title": "A", "cardIds": ["card-1"]},
            {"id": "col-b", "title": "B", "cardIds": ["card-1"]},
        ],
        "cards": MINIMAL["cards"],
    }
    assert signed_in.put("/api/board", json=duplicated).status_code == 422
    assert signed_in.get("/api/board").json() == MINIMAL


def test_put_with_an_orphan_card_is_rejected(signed_in: TestClient) -> None:
    orphan = {
        "columns": [{"id": "col-a", "title": "A", "cardIds": []}],
        "cards": MINIMAL["cards"],
    }
    assert signed_in.put("/api/board", json=orphan).status_code == 422


def test_both_routes_require_a_session(client: TestClient) -> None:
    assert client.get("/api/board").status_code == 401
    assert client.put("/api/board", json=MINIMAL).status_code == 401


def test_users_have_independent_boards(static_dir: Path, database_path: Path) -> None:
    app = create_app(static_dir, database_path)

    app.dependency_overrides[require_user] = lambda: "ada"
    with TestClient(app) as ada:
        ada.put("/api/board", json=MINIMAL)

    app.dependency_overrides[require_user] = lambda: "grace"
    with TestClient(app) as grace:
        # Untouched by ada's write, so still on the seed.
        assert grace.get("/api/board").json() == SEED_BOARD.model_dump()

    app.dependency_overrides[require_user] = lambda: "ada"
    with TestClient(app) as ada:
        assert ada.get("/api/board").json() == MINIMAL


def test_the_board_survives_a_restart(static_dir: Path, database_path: Path) -> None:
    with TestClient(create_app(static_dir, database_path)) as client:
        client.post("/api/auth/login", json=CREDENTIALS)
        client.put("/api/board", json=MINIMAL)

    # A brand new app over the same file, as if the container had been restarted.
    with TestClient(create_app(static_dir, database_path)) as restarted:
        restarted.post("/api/auth/login", json=CREDENTIALS)
        assert restarted.get("/api/board").json() == MINIMAL


def test_a_connection_survives_a_thread_hop(database_path: Path) -> None:
    """FastAPI opens, uses, and closes a sync dependency on different worker
    threads. A connection pinned to its creating thread 500s under concurrency."""
    init_db(database_path)
    connection = connect(database_path)
    with ThreadPoolExecutor(max_workers=1) as elsewhere:
        elsewhere.submit(get_or_create_user_id, connection, "ada").result()
        elsewhere.submit(connection.close).result()
