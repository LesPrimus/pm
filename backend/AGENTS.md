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
  db.py           SQLite: schema, connections, and the board queries
  models.py       Pydantic Card, Column, BoardData, and the board invariants
  seed.py         The board a new user starts with
  api/
    health.py     GET /api/health
    auth.py       Login, logout, me, and the require_user dependency
    board.py      GET and PUT /api/board
  static/         The built NextJS export, copied in by Docker. Not in git.
tests/
  conftest.py     Fixtures: a stand-in export directory and a TestClient over it
  test_health.py  Health endpoint
  test_auth.py    Sign in, sign out, session, and the route guard
  test_board.py   Board routes, seeding, validation, isolation, and persistence
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
no user table yet: `login` compares against `AUTH_USERNAME` and `AUTH_PASSWORD` with `secrets.compare_digest`
and stores the username in the session. Part 6 moves this to the database.

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
the AI's structured output in Part 9 gets the identical check for free. A rejected write leaves the stored
board untouched.

`seed.py` holds the board a new user gets, generated from the frontend's `initialData` and verified equal to
it. After Part 7 removes `initialData` from the bundle it is the only definition of a fresh board.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `STATIC_DIR` | `app/static`, else `frontend/out` | Directory served at `/` |
| `SECRET_KEY` | a dev placeholder | Signs the session cookie |
| `AUTH_USERNAME` | `user` | The MVP account |
| `AUTH_PASSWORD` | `password` | The MVP password |
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
- Coming in later parts: OpenRouter calls (Part 8), chat with structured outputs (Part 9).
