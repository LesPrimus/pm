import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.auth import CurrentUser
from app.db import (
    get_connection,
    get_or_create_user_id,
    load_or_seed_board,
    save_board,
)
from app.models import BoardData

router = APIRouter(prefix="/board", tags=["board"])

Connection = Annotated[sqlite3.Connection, Depends(get_connection)]


@router.get("")
def read_board(username: CurrentUser, connection: Connection) -> BoardData:
    """The user's board, seeded on first read."""
    user_id = get_or_create_user_id(connection, username)
    return load_or_seed_board(connection, user_id)


@router.put("")
def replace_board(
    board: BoardData, username: CurrentUser, connection: Connection
) -> BoardData:
    """Replace the board. An invalid board is rejected by BoardData with a 422."""
    user_id = get_or_create_user_id(connection, username)
    save_board(connection, user_id, board)
    return board
