from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app import ai
from app.models import ChatReply
from app.seed import SEED_BOARD

AI_BOARD = {
    "columns": [
        {"id": column.id, "title": column.title, "cardIds": list(column.cardIds)}
        for column in SEED_BOARD.columns
    ],
    "cards": [card.model_dump() for card in SEED_BOARD.cards.values()],
}


def moved(from_column: str, to_column: str, card_id: str) -> dict:
    """The seed board with one card moved, in the shape the AI returns."""
    board = {
        "columns": [
            dict(column, cardIds=list(column["cardIds"]))
            for column in AI_BOARD["columns"]
        ],
        "cards": AI_BOARD["cards"],
    }
    for column in board["columns"]:
        if column["id"] == from_column:
            column["cardIds"].remove(card_id)
        if column["id"] == to_column:
            column["cardIds"].append(card_id)
    return board


@pytest.fixture
def parse(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Stand in for the SDK call, so the route runs with no network and no key."""
    monkeypatch.setattr(ai, "OPENROUTER_API_KEY", "test-key")
    client = MagicMock()
    monkeypatch.setattr(ai, "OpenAI", MagicMock(return_value=client))
    return client.chat.completions.parse


def answer(parse: MagicMock, reply: str, board: dict | None) -> None:
    parsed = ChatReply.model_validate({"reply": reply, "board": board})
    parse.return_value = SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(parsed=parsed))]
    )


def test_a_question_leaves_the_board_alone(
    signed_in: TestClient, parse: MagicMock
) -> None:
    answer(parse, "There are eight cards.", None)

    response = signed_in.post("/api/chat", json={"message": "How many cards?"})

    assert response.status_code == 200
    assert response.json()["reply"] == "There are eight cards."
    assert response.json()["board_updated"] is False
    assert signed_in.get("/api/board").json() == SEED_BOARD.model_dump()


def test_a_returned_board_is_saved(signed_in: TestClient, parse: MagicMock) -> None:
    answer(parse, "Moved it to Done.", moved("col-review", "col-done", "card-6"))

    response = signed_in.post("/api/chat", json={"message": "Move card 6 to Done"})

    assert response.json()["board_updated"] is True
    done = next(c for c in response.json()["board"]["columns"] if c["id"] == "col-done")
    assert done["cardIds"] == ["card-7", "card-8", "card-6"]
    # And it is the board the next reader gets, not just the one in the reply.
    assert signed_in.get("/api/board").json() == response.json()["board"]


def test_an_invalid_board_is_rejected_and_the_reply_still_comes_back(
    signed_in: TestClient, parse: MagicMock
) -> None:
    orphaned = {"columns": AI_BOARD["columns"], "cards": AI_BOARD["cards"][:-1]}
    answer(parse, "Done.", orphaned)

    response = signed_in.post("/api/chat", json={"message": "Break the board"})

    assert response.status_code == 200
    assert response.json()["reply"] == "Done."
    assert response.json()["board_updated"] is False
    assert signed_in.get("/api/board").json() == SEED_BOARD.model_dump()


def test_the_history_reaches_the_model_in_order(
    signed_in: TestClient, parse: MagicMock
) -> None:
    answer(parse, "Sure.", None)

    signed_in.post(
        "/api/chat",
        json={
            "message": "and the third?",
            "history": [
                {"role": "user", "content": "first"},
                {"role": "assistant", "content": "second"},
            ],
        },
    )

    assert parse.call_args.kwargs["messages"][1:] == [
        {"role": "user", "content": "first"},
        {"role": "assistant", "content": "second"},
        {"role": "user", "content": "and the third?"},
    ]


def test_the_stored_board_is_sent_to_the_model(
    signed_in: TestClient, parse: MagicMock
) -> None:
    answer(parse, "Moved it.", moved("col-review", "col-done", "card-6"))
    signed_in.post("/api/chat", json={"message": "Move card 6 to Done"})

    answer(parse, "Yes.", None)
    signed_in.post("/api/chat", json={"message": "Is it done?"})

    # The second call carries the board the first call saved, not the seed.
    system = parse.call_args.kwargs["messages"][0]["content"]
    assert '"cardIds":["card-7","card-8","card-6"]' in system


def test_chat_requires_a_session(client: TestClient) -> None:
    assert client.post("/api/chat", json={"message": "hello"}).status_code == 401


def test_chat_reports_a_missing_key(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(ai, "OPENROUTER_API_KEY", None)
    response = signed_in.post("/api/chat", json={"message": "hello"})
    assert response.status_code == 503


def test_a_duplicate_card_id_is_rejected(
    signed_in: TestClient, parse: MagicMock
) -> None:
    # A list can carry the same id twice where the stored dict cannot, so keying by
    # id would quietly drop one. to_board refuses instead.
    duplicated = {
        "columns": AI_BOARD["columns"],
        "cards": [*AI_BOARD["cards"], {**AI_BOARD["cards"][0], "title": "Copy"}],
    }
    answer(parse, "Added it.", duplicated)

    response = signed_in.post("/api/chat", json={"message": "Duplicate a card"})

    assert response.json()["board_updated"] is False
    assert signed_in.get("/api/board").json() == SEED_BOARD.model_dump()
