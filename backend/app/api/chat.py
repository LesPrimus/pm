import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app import ai
from app.api.auth import CurrentUser
from app.db import (
    get_connection,
    get_or_create_user_id,
    load_or_seed_board,
    save_board,
)
from app.models import BoardData, ChatMessage

router = APIRouter(prefix="/chat", tags=["chat"])

Connection = Annotated[sqlite3.Connection, Depends(get_connection)]


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


class ChatResponse(BaseModel):
    reply: str
    board_updated: bool
    board: BoardData


@router.post("")
def send_message(
    request: ChatRequest, username: CurrentUser, connection: Connection
) -> ChatResponse:
    """Answer about the board, and save the board back when the AI changed it.

    The history comes from the client on every call, so the backend holds no chat state.
    """
    user_id = get_or_create_user_id(connection, username)
    board = load_or_seed_board(connection, user_id)
    answer = ai.chat(board, request.message, request.history)

    updated = False
    if answer.board is not None:
        try:
            # The same invariants as PUT /api/board. ValidationError is a ValueError.
            new_board = answer.board.to_board()
        except ValueError:
            pass
        else:
            save_board(connection, user_id, new_board)
            board = new_board
            updated = True

    return ChatResponse(reply=answer.reply, board_updated=updated, board=board)
