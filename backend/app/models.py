"""The board, mirroring BoardData in frontend/src/lib/kanban.ts, and the chat shapes."""

from typing import Literal, Self

from pydantic import BaseModel, Field, model_validator


class Card(BaseModel):
    id: str = Field(min_length=1)
    title: str
    details: str


class Column(BaseModel):
    id: str = Field(min_length=1)
    title: str
    cardIds: list[str]  # noqa: N815 - matches the frontend field name


class BoardData(BaseModel):
    columns: list[Column]
    cards: dict[str, Card]

    @model_validator(mode="after")
    def check_invariants(self) -> Self:
        """Cross references a schema cannot express. Also guards AI output in Part 9."""
        column_ids = [column.id for column in self.columns]
        if len(column_ids) != len(set(column_ids)):
            raise ValueError("duplicate column id")

        placed = [card_id for column in self.columns for card_id in column.cardIds]
        if len(placed) != len(set(placed)):
            raise ValueError("a card appears in more than one place")

        missing = sorted(set(placed) - set(self.cards))
        if missing:
            raise ValueError(f"cardIds reference cards that do not exist: {missing}")

        orphans = sorted(set(self.cards) - set(placed))
        if orphans:
            raise ValueError(f"cards that are in no column: {orphans}")

        mismatched = sorted(key for key, card in self.cards.items() if key != card.id)
        if mismatched:
            raise ValueError(f"cards not keyed by their own id: {mismatched}")

        return self


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AiBoard(BaseModel):
    """The board as the model returns it: cards as a list rather than a dict.

    A strict JSON schema cannot describe an object with arbitrary keys, so `cards`
    is a list here and `to_board` keys it by id and applies the BoardData invariants.
    """

    columns: list[Column]
    cards: list[Card]

    def to_board(self) -> BoardData:
        cards = {card.id: card for card in self.cards}
        if len(cards) != len(self.cards):
            raise ValueError("duplicate card id")
        return BoardData(columns=self.columns, cards=cards)


class ChatReply(BaseModel):
    """The model's structured answer. `board` is null when nothing needs changing."""

    reply: str
    board: AiBoard | None
