"""SQLite storage. See docs/DATABASE.md for the design."""

import json
import sqlite3
from collections.abc import Iterator
from contextlib import closing
from pathlib import Path

from fastapi import Request

from app.models import BoardData

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS boards (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  data       TEXT NOT NULL CHECK (json_valid(data)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    # Per connection, and not stored in the file: without this the foreign keys
    # and the cascade are silently ignored.
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db(path: Path) -> None:
    """Create the file, its directory, and the tables if they are not there."""
    with closing(connect(path)) as connection, connection:
        connection.executescript(SCHEMA)
        connection.execute("PRAGMA user_version = 1")


def get_connection(request: Request) -> Iterator[sqlite3.Connection]:
    """One connection per request: a sqlite3 connection is not thread safe."""
    connection = connect(request.app.state.database_path)
    try:
        yield connection
    finally:
        connection.close()


def get_or_create_user_id(connection: sqlite3.Connection, username: str) -> int:
    """Part 4 authenticates against the environment, so the row may not exist yet."""
    with connection:
        connection.execute(
            "INSERT OR IGNORE INTO users (username) VALUES (?)", (username,)
        )
    row = connection.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    return int(row["id"])


def load_board(connection: sqlite3.Connection, user_id: int) -> BoardData | None:
    row = connection.execute(
        "SELECT data FROM boards WHERE user_id = ?", (user_id,)
    ).fetchone()
    return BoardData.model_validate_json(row["data"]) if row else None


def save_board(connection: sqlite3.Connection, user_id: int, board: BoardData) -> None:
    data = json.dumps(board.model_dump())
    with connection:
        connection.execute(
            """
            INSERT INTO boards (user_id, data) VALUES (?, ?)
            ON CONFLICT (user_id) DO UPDATE
              SET data = excluded.data, updated_at = datetime('now')
            """,
            (user_id, data),
        )
