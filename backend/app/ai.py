"""OpenRouter, called through the OpenAI SDK."""

from fastapi import HTTPException
from openai import OpenAI, OpenAIError

from app.config import AI_MODEL, OPENROUTER_API_KEY, OPENROUTER_BASE_URL


def get_client() -> OpenAI:
    """The configured client, or a 503 saying what is missing."""
    if not OPENROUTER_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="OPENROUTER_API_KEY is not set. Add it to .env in the project root.",
        )
    return OpenAI(api_key=OPENROUTER_API_KEY, base_url=OPENROUTER_BASE_URL)


def ask(prompt: str) -> str:
    """One prompt, one answer. Part 9 replaces this with the structured call."""
    client = get_client()
    try:
        completion = client.chat.completions.create(
            model=AI_MODEL,
            messages=[{"role": "user", "content": prompt}],
        )
    except OpenAIError as exc:
        # The key is present but the call did not get through.
        raise HTTPException(
            status_code=502, detail=f"AI request failed: {exc}"
        ) from exc

    return completion.choices[0].message.content or ""
