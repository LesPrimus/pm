from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from openai import APIConnectionError

from app import ai

KEY = "test-key"


def completion(text: str) -> SimpleNamespace:
    """The slice of the SDK response that ask() reads."""
    message = SimpleNamespace(content=text)
    return SimpleNamespace(choices=[SimpleNamespace(message=message)])


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


def test_ask_uses_the_configured_model(
    openai_class: MagicMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(ai, "AI_MODEL", "openai/gpt-oss-120b")
    create = openai_class.return_value.chat.completions.create
    create.return_value = completion("4")

    assert ai.ask("What is 2+2?") == "4"

    sent = create.call_args.kwargs
    assert sent["model"] == "openai/gpt-oss-120b"
    assert sent["messages"] == [{"role": "user", "content": "What is 2+2?"}]


def test_a_transport_failure_is_a_502(openai_class: MagicMock) -> None:
    openai_class.return_value.chat.completions.create.side_effect = APIConnectionError(
        request=MagicMock()
    )
    with pytest.raises(HTTPException) as raised:
        ai.ask("anything")
    assert raised.value.status_code == 502


def test_an_empty_answer_is_a_string(openai_class: MagicMock) -> None:
    openai_class.return_value.chat.completions.create.return_value = completion(None)
    assert ai.ask("anything") == ""


def test_ping_returns_the_answer(
    signed_in: TestClient, openai_class: MagicMock
) -> None:
    openai_class.return_value.chat.completions.create.return_value = completion("4")
    response = signed_in.post("/api/ai/ping")
    assert response.status_code == 200
    assert response.json() == {"answer": "4"}


def test_ping_requires_a_session(client: TestClient) -> None:
    assert client.post("/api/ai/ping").status_code == 401


def test_ping_reports_a_missing_key(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(ai, "OPENROUTER_API_KEY", None)
    assert signed_in.post("/api/ai/ping").status_code == 503
