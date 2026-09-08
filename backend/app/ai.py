"""OpenRouter, called through the OpenAI SDK."""

from fastapi import HTTPException
from openai import OpenAI, OpenAIError

from app.config import AI_MODEL, OPENROUTER_API_KEY, OPENROUTER_BASE_URL
from app.models import BoardData, ChatMessage, ChatReply

SYSTEM_PROMPT = """\
You are the assistant inside a Kanban project management app. You answer questions
about the user's board and change it when they ask you to.

The board is a fixed set of columns and a flat list of cards. A column has an `id`, a
`title`, and `cardIds`, the ids of its cards in top-to-bottom order. A card has an
`id`, a `title`, and `details`. A card belongs to exactly one column: every card id
appears in exactly one `cardIds` list, and every id in a `cardIds` list has a matching
card.

Rules for changing the board:

- Return the whole board, not a fragment. Carry over every column and every card you
  did not change.
- Keep the existing `id` of any column or card you edit or move. Never renumber them.
- Give a new card an id that no other card has, such as `card-<short-description>`.
- Use only the columns that already exist. Never add, remove, or reorder columns. You
  may rename one by changing its `title`.
- To move a card, take its id out of one column's `cardIds` and put it in another's.
- To delete a card, remove it from `cardIds` and from the card list.

Set `board` to null when the user is only asking a question, and put your answer in
`reply`. When you do change the board, keep `reply` to one short sentence saying what
you did.

This is the current board:

{board}"""


def get_client() -> OpenAI:
    """The configured client, or a 503 saying what is missing."""
    if not OPENROUTER_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="OPENROUTER_API_KEY is not set. Add it to .env in the project root.",
        )
    return OpenAI(api_key=OPENROUTER_API_KEY, base_url=OPENROUTER_BASE_URL)


def chat(board: BoardData, message: str, history: list[ChatMessage]) -> ChatReply:
    """Ask about the board, and get back an answer and an optional new board."""
    client = get_client()
    messages = [
        {
            "role": "system",
            "content": SYSTEM_PROMPT.format(board=board.model_dump_json()),
        },
        *({"role": turn.role, "content": turn.content} for turn in history),
        {"role": "user", "content": message},
    ]
    try:
        completion = client.chat.completions.parse(
            model=AI_MODEL,
            messages=messages,
            response_format=ChatReply,
        )
    except OpenAIError as exc:
        # The key is present but the call did not get through.
        raise HTTPException(
            status_code=502, detail=f"AI request failed: {exc}"
        ) from exc

    parsed = completion.choices[0].message.parsed
    if parsed is None:
        raise HTTPException(status_code=502, detail="The AI returned no usable answer.")
    return parsed
