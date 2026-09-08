# Backend

FastAPI app that serves the JSON API under `/api` and the static frontend at `/`.
Dependencies are managed by uv. Python 3.14, pinned in `.python-version` and matched by the Docker base image.

## Layout

```
pyproject.toml    uv project (non-package), dependencies, ruff and pytest config
uv.lock           Locked dependency set, used by the Docker build
app/
  main.py         create_app factory: session middleware, CORS (dev only), routers,
                  API 404 guard, static mount
  config.py       Settings read from the environment
  ai.py           OpenRouter client, the system prompt, and the structured chat call
  db.py           SQLite: schema, connections, and the board queries
  models.py       Pydantic Card, Column, BoardData, the board invariants, and the chat shapes
  seed.py         The board a new user starts with
  api/
    health.py     GET /api/health
    auth.py       Login, logout, me, and the require_user dependency
    board.py      GET and PUT /api/board
    chat.py       POST /api/chat
  static/         The built NextJS export, copied in by Docker. Not in git.
tests/
  conftest.py     Fixtures: a stand-in export directory and a TestClient over it
  test_health.py  Health endpoint
  test_auth.py    Sign in, sign out, session, and the route guard
  test_board.py   Board routes, seeding, validation, isolation, and persistence
  test_ai.py      The OpenRouter client and the structured call, with the SDK mocked
  test_chat.py    The chat route: saving, rejecting, history, and the session guard
  test_static.py  Static serving and the API 404 guard
  test_app.py     The app still runs when the frontend has not been built
```

## Route ordering

`main.py` registers routers first, then a catch-all `/api/{path:path}` that raises 404, and mounts
`StaticFiles(html=True)` at `/` last. Starlette matches routes in registration order, so:

- `/api/health` hits the router.
- Any other `/api/...` path returns a JSON 404 from the guard. Without it, the static mount would answer,
  and once the NextJS export ships a `404.html` an unknown API path would return an HTML page.
- Everything else is served from `app/static`.

The mount is skipped when the directory is absent, so the API still runs on a fresh clone that has not
built the frontend. `check_dir=False` is not enough on its own: Starlette re-checks the directory on the
first request and raises there instead.

## Serving the frontend

`create_app(static_dir)` takes the directory as an argument, so tests can point it at a fixture export
instead of requiring a real build. `app = create_app()` at module scope keeps `uvicorn app.main:app` working.

`STATIC_DIR` resolves in this order: the `STATIC_DIR` environment variable, then `app/static` if it exists
(the Docker layout, where the build copies the export in), then `frontend/out` (the local layout, where
`npm run build` leaves it). So `uv run uvicorn app.main:app` serves a locally built frontend with no setup.

## Auth

Session cookie auth via Starlette's `SessionMiddleware`, which signs the cookie with `SECRET_KEY`. There is
no lookup against the database: `login` compares against `AUTH_USERNAME` and `AUTH_PASSWORD` with
`secrets.compare_digest` and stores the username in the session. The `users` row exists and the board hangs
off it, but `password_hash` stays NULL. Moving the credential check onto it is future work, not MVP scope.

| Route | Behaviour |
| --- | --- |
| `POST /api/auth/login` | 200 with the user and a session cookie, or 401 |
| `POST /api/auth/logout` | Clears the session |
| `GET /api/auth/me` | 200 with the user, or 401 when anonymous |

Both failure modes return the same body, so a wrong username cannot be told apart from a wrong password.
Guard a route by depending on `CurrentUser` (`Annotated[str, Depends(require_user)]`), which yields the
username or raises 401. The frontend calls `/api/auth/me` on load and treats the 401 as "show the login
screen", so that 401 is expected traffic, not an error.

## Storage

SQLite, one file, one JSON board document per user. `docs/DATABASE.md` has the design and the reasoning;
`docs/schema.json` has the machine-readable schema.

`init_db` runs from the app lifespan, creating the directory, the file, and the tables if absent. Tests
therefore need `with TestClient(app)`, not a bare `TestClient(app)`, or the lifespan never runs.

Two things that bite:

- **`PRAGMA foreign_keys = ON` is per connection** and is not stored in the file. `connect()` issues it every
  time. Skip it and the cascade and the foreign keys are silently ignored.
- **A sqlite3 connection is not thread safe**, and FastAPI runs sync endpoints in a thread pool, so
  `get_connection` opens one per request and closes it after. Cheap for a local file.
- **`connect` passes `check_same_thread=False`**, and must. FastAPI runs a sync dependency's setup, the
  endpoint, and its teardown as three separate threadpool jobs, and anyio does not pin them to one worker,
  so the connection is opened, used, and closed on different threads. Without the flag, 39 of 40 concurrent
  `GET /api/board` calls returned 500 from `connection.close()`. It is safe because the connection is per
  request: the steps are sequential, so only one thread ever touches it at a time. Serial requests hid this
  for two parts, because the pool kept handing back the same thread.

`create_app(static_dir, database_path)` takes the path, and stores it on `app.state`, so a test can point a
whole app at a temporary file. There is no module level connection.

Part 4 authenticates against the environment, not the database, so no user row exists until the board is
first touched. `get_or_create_user_id` inserts it on demand and leaves `password_hash` NULL.

The container runs as the host user (`user:` in `compose.yaml`, exported by the start scripts). It ran as
root at first, which made the bind mounted `data/pm.db` root owned, and a local `uvicorn` then failed with
"attempt to write a readonly database". Playwright points `DATABASE_PATH` at `data/e2e.db` so a test run
cannot overwrite the board you were using.

## The board and its invariants

`BoardData` mirrors `frontend/src/lib/kanban.ts` field for field, `cardIds` included. Its `model_validator`
enforces what a schema cannot:

1. every id in a column's `cardIds` exists in `cards`
2. every card is in exactly one column: no orphans, no duplicates
3. `cards[key].id == key`
4. column ids are unique

Because the check lives on the model, `PUT /api/board` returns 422 for a bad board with no extra code, and
the AI's structured output gets the identical check for free. A rejected write leaves the stored board
untouched.

`seed.py` holds the board a new user gets, generated from the frontend's `initialData` and verified equal to
it. Part 7 removed `initialData` from the bundle, so it is now the only definition of a fresh board.
`db.load_or_seed_board` applies it on first read, shared by `GET /api/board` and `POST /api/chat`.

## AI

OpenRouter, called through the OpenAI SDK by pointing its `base_url` at
`https://openrouter.ai/api/v1`. The model is `openai/gpt-oss-120b`.

`ai.get_client()` raises **503** when `OPENROUTER_API_KEY` is unset, naming the variable and where it goes,
rather than failing deeper with something unreadable. A call that gets no answer raises **502**. The two are
kept apart on purpose: 503 means the app is not configured, 502 means it is configured but the request did
not get through.

The test suite replaces `ai.OpenAI` outright, so it needs no network and no key. Nothing in the suite makes
a real call: the live check is run by hand.

## Chat

`POST /api/chat` takes `{message, history}` and returns `{reply, board_updated, board}`. `board` is always
the stored board, so the client can resync from any reply. History comes from the client on every call and
the backend keeps no chat state, which is what lets a static export own the conversation.

`ai.chat` sends one system message holding `SYSTEM_PROMPT` and the current board JSON, then the history, then
the new message. The board goes with every call, so the model never has to guess an id, and a stale history
cannot make it edit a board that has since changed.

Structured output goes through `client.chat.completions.parse(response_format=ChatReply)`, which builds a
strict JSON schema from the model and parses the answer back.

**The strict schema is a hint, not a rule.** OpenRouter passes it to the provider, and `openai/gpt-oss-120b`
does not hard enforce it. Seen live: asked to move a card, it returned `cards` as a dict keyed by id instead
of the list the schema asks for, and `parse` raised. So two things hold the line:

- The board in the prompt is serialised as an `AiBoard`, not a `BoardData`. Shown the board with `cards` as
  a dict, the model copies that shape into its answer. Prompt and schema have to agree, or the example wins.
- `chat` catches the `ValidationError` from `parse` and returns **502**. A model that ignores the schema is
  an upstream failure, not a 500.

**`ChatReply.board` is an `AiBoard`, not a `BoardData`, and the difference matters.** `BoardData.cards` is a
dict keyed by card id, and a strict JSON schema cannot describe an object with arbitrary keys: every object
needs `additionalProperties: false`. So `AiBoard.cards` is a list, and `AiBoard.to_board()` keys it by id.
That conversion is also where a duplicate card id is caught, since a list can hold one where a dict cannot
and keying it would silently drop a card.

`to_board()` then builds a `BoardData`, so the AI board goes through the identical invariants as
`PUT /api/board`. The route catches `ValueError` (pydantic's `ValidationError` is one), keeps the stored
board, and answers with `board_updated: false` and the reply. A bad board costs the user an answer about
their board, never the board itself.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `STATIC_DIR` | `app/static`, else `frontend/out` | Directory served at `/` |
| `SECRET_KEY` | a dev placeholder | Signs the session cookie |
| `AUTH_USERNAME` | `user` | The MVP account |
| `AUTH_PASSWORD` | `password` | The MVP password |
| `OPENROUTER_API_KEY` | unset | OpenRouter key. Unset means every AI route answers 503. |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | The OpenAI-compatible endpoint |
| `AI_MODEL` | `openai/gpt-oss-120b` | Model id |
| `DATABASE_PATH` | `data/pm.db` in the repo root | The SQLite file. Set explicitly to `/app/data/pm.db` in the image: the backend lives at `/app/app` there, so deriving it from the source layout lands on `/`, off the mounted volume. |
| `DEV_CORS_ORIGIN` | unset | When set, enables CORS with credentials for that one origin. Used for `npm run dev` against a local backend. Unset in Docker, where API and site share an origin. |

## Commands

```bash
cd backend
uv sync                 # create .venv and install, including the dev group
uv run pytest           # test suite
uv run ruff check .     # lint (add --fix to apply)
uv run ruff format .    # format
uv run uvicorn app.main:app --reload --port 8000
```

Run from `backend/`: the project is non-package, so `app` is imported from the working directory
(`pythonpath = ["."]` covers pytest, uvicorn adds the cwd itself).

## Lint and format

ruff, configured under `[tool.ruff.lint]` in `pyproject.toml`: the defaults plus import sorting (`I`),
pyupgrade (`UP`), and bugbear (`B`). `.pre-commit-config.yaml` in the project root runs `ruff-check --fix`
and `ruff-format` on every commit, pinned to the same ruff version as the dev dependency. Keep the two in
step when bumping.

## Notes

- `httpx2` is the test HTTP client. Starlette's `TestClient` deprecates plain `httpx`.
