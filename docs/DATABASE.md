# Database

SQLite, one file, created on first run. Each user owns one board, stored as a single JSON document.
The machine-readable version of everything here is `docs/schema.json`.

## Decision

The board is saved as JSON in a `TEXT` column rather than spread across `columns` and `cards` tables.

Why:

- The frontend already holds the board as one normalized object (`BoardData` in
  `frontend/src/lib/kanban.ts`). Storing that object as-is means no translation layer in either direction.
- Every write is a whole-board write. Dragging a card changes the order of two columns; the AI in Part 9
  returns an entire revised board. A JSON column makes each of those one `UPDATE`, not a multi-table diff
  with ordering columns to renumber.
- The MVP has one board per user and no queries that look inside a board. Nothing needs to ask "which
  cards mention X" or "how many cards are in Done", which is where normalized tables would earn their cost.

What this gives up, stated plainly:

- No SQL against card fields. Anything of that kind means reading the document and filtering in Python.
- No database-level integrity between columns and cards. The invariants below are enforced in application
  code instead, on every write.
- Concurrent edits are last-write-wins for the whole board, not per card. With one board per user and one
  session, that is not a practical problem; if it becomes one, add `updated_at` to the write as a
  precondition and reject a stale save.

If the app later needs per-card queries or real collaborative editing, migrate to normalized tables. The
migration path is at the end of this document.

## Where the file lives

| | Path |
| --- | --- |
| Local | `data/pm.db` in the project root |
| Container | `/app/data/pm.db`, set explicitly via `DATABASE_PATH` |

`compose.yaml` already bind mounts `./data` to `/app/data`, so the database survives
`docker compose down` and image rebuilds. `data/` is gitignored.

The container path is set with an explicit `DATABASE_PATH` environment variable rather than derived from
the source layout, because in the image the backend lives at `/app/app` and a relative walk upward lands
on `/`, not on the volume.

## Created if it does not exist

On startup the backend creates the parent directory if needed, opens the file (SQLite creates it), and runs
the `CREATE TABLE IF NOT EXISTS` statements. Deleting `data/` and restarting produces a working, empty
database. No migration tool, no separate init step.

`PRAGMA foreign_keys = ON` is per connection and is not stored in the file, so it has to be issued on every
connection, not once at setup.

## Tables

```sql
PRAGMA foreign_keys = ON;

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

PRAGMA user_version = 1;
```

Notes on specific choices:

- **`password_hash` is nullable and unused in the MVP.** Part 4 authenticates against `AUTH_USERNAME` and
  `AUTH_PASSWORD` from the environment. The column is here so real accounts have somewhere to go, but it is
  left NULL rather than filled with a placeholder hash, so no code can mistake a fake value for a real one.
- **`boards.user_id` is UNIQUE.** That is what enforces one board per user. It is also the single line to
  remove when multiple boards per user are wanted.
- **`CHECK (json_valid(data))`** stops a malformed document reaching the column even if application
  validation is bypassed.
- **`ON DELETE CASCADE`** removes a user's board with the user.
- **`PRAGMA user_version = 1`** is the version marker for future migrations.

Verified: the DDL runs, a duplicate username is rejected, a second board for the same user is rejected,
non-JSON `data` is rejected, a board referencing a missing user is rejected, and deleting a user removes
their board.

## The board document

`boards.data` holds exactly the shape the frontend uses, field for field:

```json
{
  "columns": [
    { "id": "col-backlog", "title": "Backlog", "cardIds": ["card-1", "card-2"] }
  ],
  "cards": {
    "card-1": { "id": "card-1", "title": "Align roadmap themes", "details": "..." }
  }
}
```

Columns are an ordered array and carry the order of their cards in `cardIds`. Cards live in a lookup keyed
by id, so a card is stored once regardless of which column holds it. The full JSON Schema is
`boardDocument` in `docs/schema.json`, checked against the current `initialData` from
`frontend/src/lib/kanban.ts`.

### Invariants

JSON Schema cannot express cross references, so these are enforced in application code on every write:

1. Every id in a column's `cardIds` exists as a key in `cards`.
2. Every key in `cards` appears in exactly one column's `cardIds`: no orphans, no duplicates.
3. `cards[key].id` equals `key`.
4. Column ids are unique within the board.

The same check runs for `PUT /api/board` and for a board returned by the AI in Part 9. A board that fails
is rejected with 422 and the stored board is left untouched.

## Seeding

A user with no board row gets one on first read, seeded with the five demo columns and eight demo cards that
currently live in `initialData`. That seed moves into the backend in Part 6 and is removed from the frontend
bundle in Part 7, so there is one source of truth for a new board.

## Multiple users

The MVP signs in one hardcoded account, but nothing in the schema assumes that. `users` is keyed by a unique
username, `boards` is keyed by owner, and every query in Part 6 is scoped by the session's user. Adding a
second account is an insert, not a schema change. What is missing for real multi-user is only the
authentication work: populating `password_hash` and checking against it instead of the environment.

## Connections and concurrency

FastAPI runs sync endpoints in a thread pool, and a `sqlite3` connection must not be shared across threads.
Part 6 opens a connection per request and closes it at the end, which is cheap for a local file. Each
connection sets `PRAGMA foreign_keys = ON`.

One uvicorn process, one writer at a time, one user: the default journal mode is fine. If concurrent readers
ever matter, enabling WAL is a one-line change and is persisted in the file.

## Migration path

`PRAGMA user_version` records the schema version. A future change bumps it and runs the matching steps at
startup, in the same place the tables are created.

**Several boards per user:** drop `UNIQUE` on `boards.user_id` and add a `name` column. Existing rows are
already valid; the API gains a board id in its paths.

**Normalized cards and columns:** add `columns` and `cards` tables with a `position` integer, then backfill
by reading each JSON document and inserting its rows in order. The document stays the source of truth until
the backfill is verified, so the migration is reversible. This is worth doing only when something needs to
query inside a board.

## What Part 6 implements

- `app/db.py`: connection helper, directory and file creation, the DDL above, foreign keys per connection.
- `app/models.py`: Pydantic `Card`, `Column`, `BoardData` mirroring the frontend types.
- `GET /api/board` and `PUT /api/board`, both requiring a signed in user, with the invariant checks on write.
