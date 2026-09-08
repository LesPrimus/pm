from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from openai import APIConnectionError

from app import ai
from app.models import AiBoard, ChatMessage, ChatReply
from app.seed import SEED_BOARD

KEY = "test-key"


def completion(reply: ChatReply | None) -> SimpleNamespace:
    """The slice of the SDK response that chat() reads."""
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(parsed=reply))]
    )


@pytest.fixture
def openai_class(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    """Replace the SDK, so the suite needs no network and no real key."""
    monkeypatch.setattr(ai, "OPENROUTER_API_KEY", KEY)
    fake = MagicMock()
    monkeypatch.setattr(ai, "OpenAI", fake)
    return fake


def test_client_points_at_openrouter(openai_class: MagicMock) -> None:
    ai.get_client()
    openai_class.assert_called_once_with(
        api_key=KEY, base_url="https://openrouter.ai/api/v1"
    )


def test_a_missing_key_is_a_503(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ai, "OPENROUTER_API_KEY", None)
    with pytest.raises(HTTPException) as raised:
        ai.get_client()
    assert raised.value.status_code == 503
    assert "OPENROUTER_API_KEY" in raised.value.detail


def test_chat_sends_the_board_the_history_and_the_model(
    openai_class: MagicMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(ai, "AI_MODEL", "openai/gpt-oss-120b")
    parse = openai_class.return_value.chat.completions.parse
    parse.return_value = completion(ChatReply(reply="Eight.", board=None))

    history = [
        ChatMessage(role="user", content="hello"),
        ChatMessage(role="assistant", content="hi"),
    ]
    assert ai.chat(SEED_BOARD, "How many cards?", history).reply == "Eight."

    sent = parse.call_args.kwargs
    assert sent["model"] == "openai/gpt-oss-120b"
    assert sent["response_format"] is ChatReply

    system, *rest = sent["messages"]
    assert system["role"] == "system"
    # The whole board goes with every call, so the model never guesses at ids, and
    # it goes in the shape the answer must take, not the stored shape.
    assert AiBoard.from_board(SEED_BOARD).model_dump_json() in system["content"]
    assert SEED_BOARD.model_dump_json() not in system["content"]
    assert rest == [
        {"role": "user", "content": "hello"},
        {"role": "assistant", "content": "hi"},
        {"role": "user", "content": "How many cards?"},
    ]


def test_a_transport_failure_is_a_502(openai_class: MagicMock) -> None:
    openai_class.return_value.chat.completions.parse.side_effect = APIConnectionError(
        request=MagicMock()
    )
    with pytest.raises(HTTPException) as raised:
        ai.chat(SEED_BOARD, "anything", [])
    assert raised.value.status_code == 502


def test_an_unparsed_answer_is_a_502(openai_class: MagicMock) -> None:
    openai_class.return_value.chat.completions.parse.return_value = completion(None)
    with pytest.raises(HTTPException) as raised:
        ai.chat(SEED_BOARD, "anything", [])
    assert raised.value.status_code == 502


def test_an_answer_that_ignores_the_schema_is_a_502(openai_class: MagicMock) -> None:
    # Seen live: the model returns cards as a dict rather than a list, because the
    # strict schema is a hint to OpenRouter, not a rule. parse() raises, and that
    # has to read as an upstream failure, not a 500.
    def bad_shape(**_: object) -> None:
        ChatReply.model_validate_json(
            '{"reply":"ok","board":{"columns":[],"cards":{}}}'
        )

    openai_class.return_value.chat.completions.parse.side_effect = bad_shape

    with pytest.raises(HTTPException) as raised:
        ai.chat(SEED_BOARD, "anything", [])
    assert raised.value.status_code == 502
