# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Authoritative documentation

`AGENTS.md` files are kept current and hold the detail this file summarizes. Read the root one plus the one
for the directory being edited before changing code:

- `AGENTS.md` - requirements, technical decisions, coding standards
- `backend/AGENTS.md`, `frontend/AGENTS.md`, `scripts/AGENTS.md`
- `docs/PLAN.md` - the 10-part build plan (all parts complete), `docs/DATABASE.md` + `docs/schema.json`

## Coding standards (from the root AGENTS.md)

1. Latest library versions and idiomatic approaches.
2. Keep it simple. Never over-engineer, no unnecessary defensive programming, no speculative features.
3. Be concise. Keep the README minimal. No emojis, ever.
4. Identify the root cause with evidence before fixing. Do not guess.

## Working conventions (from docs/PLAN.md)

Work ends green across all four suites: `npm run lint`, `npm run test:unit`, backend `pytest`, and
`npm run test:e2e`. Keep the `AGENTS.md` for the directory you edited current in the same change - they are
treated as part of the deliverable, not as afterthoughts. Live AI checks are run by hand and recorded in the
plan; nothing in either suite makes a real OpenRouter call.

## Commands

Backend, run from `backend/` (non-package uv project, so `app` is imported from the cwd):

```bash
uv sync                                     # venv + deps including the dev group
uv run pytest                               # full suite
uv run pytest tests/test_board.py::test_a_new_user_gets_the_seeded_board   # single test
uv run ruff check . --fix && uv run ruff format .
uv run uvicorn app.main:app --reload --port 8000
```

Frontend, run from `frontend/`:

```bash
npm run test:unit                     # vitest run
npm run test:unit -- src/lib/api.test.ts   # single file
npm run test:e2e                      # playwright: builds the export, serves it via FastAPI on :8000
npm run lint
npm run build                         # static export to out/
```

Whole app: `./scripts/start.sh` (`.\scripts\start.ps1`) builds and runs the container on
http://localhost:8000; `./scripts/stop.sh` tears it down and keeps `data/`. Sign in with `user` / `password`.

Lint hooks: `uv tool install pre-commit && pre-commit install`. Commits run ruff over the backend, pinned in
`.pre-commit-config.yaml` to the same version as the backend dev dependency - keep the two in step.

`npm run dev` needs `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000` and the backend needs `DEV_CORS_ORIGIN`
set to the dev server origin. In Docker both are unset because API and site share an origin.

## Architecture

One Python process serves everything on port 8000: the JSON API under `/api` and the NextJS static export
at `/`. There is no Node runtime in production, so no SSR, no NextJS API routes, no middleware - anything
that looks like a server-side guard is client-side React, and the real boundary is the backend's
`require_user` dependency.

Request path, in registration order inside `create_app` (`backend/app/main.py`):

1. routers (`health`, `auth`, `board`, `chat`), all under `/api`
2. a catch-all `/api/{path:path}` that raises 404, so unknown API paths never fall through to the site
3. `StaticFiles(html=True)` mounted at `/`, skipped when the export directory is absent

`create_app(static_dir, database_path)` takes both as arguments so tests can point an app at a fixture
export and a temp database. `app = create_app()` at module scope keeps `uvicorn app.main:app` working.
`STATIC_DIR` resolves as: env var, then `backend/app/static` (Docker), then `frontend/out` (local build).

Auth is a signed session cookie. `login` compares against `AUTH_USERNAME` / `AUTH_PASSWORD` with
`secrets.compare_digest`; it does not touch the database, and `users.password_hash` stays NULL. The
frontend calls `/api/auth/me` on load and treats the 401 as "show the login screen", so that 401 in the
console is the gate working.

### The board is one JSON document

SQLite, one file, one board row per user, holding the exact `BoardData` shape the frontend uses. Every
write is a whole-board write (a drag reorders two columns; the AI returns a revised board), so there is no
translation layer in either direction and no per-card SQL.

`backend/app/models.py` `BoardData` mirrors `frontend/src/lib/kanban.ts` field for field, `cardIds`
included. Change one and change the other. Its `model_validator` enforces the four invariants a schema
cannot express: every `cardIds` entry exists in `cards`, every card sits in exactly one column,
`cards[key].id == key`, column ids are unique. Because the check lives on the model, `PUT /api/board`
returns 422 and the AI's structured output gets the identical check for free, with the stored board left
untouched either way.

`backend/app/seed.py` is the only definition of a fresh board; the frontend's `initialData` was removed.
`db.load_or_seed_board` applies it on first read, shared by the board and chat routes.

### AI and chat

OpenRouter through the OpenAI SDK (`base_url` pointed at OpenRouter), model `openai/gpt-oss-120b`.
`ai.get_client()` raises 503 when `OPENROUTER_API_KEY` is unset; a call that does not get through raises
502. The distinction is deliberate: 503 means unconfigured, 502 means configured but failed.

`POST /api/chat` is stateless - the client sends the whole history every time and always gets the stored
board back, so it can resync from any reply. The current board goes into the system message on every call,
so the model never guesses an id.

The strict JSON schema is a hint that `gpt-oss-120b` does not hard enforce, which drives two constraints:
`ChatReply.board` is an `AiBoard` whose `cards` is a **list** (a strict schema cannot describe a dict with
arbitrary keys), and the board shown in the prompt is serialized as an `AiBoard` too - show the model a
dict and it copies that shape into its answer. `AiBoard.to_board()` keys the list by id (catching duplicate
ids) and builds a `BoardData`, so a bad AI board costs an answer, never the board.

### Frontend state

`useBoard` owns the board and all saving: optimistic update, revert to the last server-confirmed board on
failure, debounced column renames, and a `pagehide` flush with `keepalive` (without it, renaming and
reloading immediately loses the rename - the e2e suite caught this). `replace(board)` adopts the AI's board
without writing it back and drops any pending debounced write, which was computed from the older board.

`KanbanBoard` is the single stateful component; everything below it is presentational.
`src/lib/api.ts` is the only module that talks to the backend, and reads `NEXT_PUBLIC_API_BASE_URL` lazily
inside a function so tests can stub it.

## Things that bite

- **`with TestClient(app)`, not `TestClient(app)`.** `init_db` runs from the app lifespan; a bare client
  never triggers it.
- **`PRAGMA foreign_keys = ON` is per connection** and is not stored in the file. `connect()` issues it
  every time; skip it and cascades and foreign keys are silently ignored.
- **One sqlite connection per request, with `check_same_thread=False`.** FastAPI runs a sync dependency's
  setup, endpoint, and teardown as three separate threadpool jobs on possibly different threads. Serial
  requests hide this; concurrent ones failed 39 of 40 times in `connection.close()`.
- **`data-testid` hooks are contracts.** Both the vitest and Playwright suites select on them - see the
  list in `frontend/AGENTS.md`. Select the login error by test id, not `getByRole("alert")`: NextJS renders
  its own route announcer with that role.
- **E2E runs with `workers: 1`** against its own `data/e2e.db`, wiped per run. One account and one board
  means parallel tests would overwrite each other.
- **The container runs as the host user** (`APP_UID` / `APP_GID`, exported by the start scripts). As root it
  made the bind-mounted `data/pm.db` root-owned and a local uvicorn then failed with "readonly database".
- **`DATABASE_PATH` is set explicitly in the image** (`/app/data/pm.db`): the backend lives at `/app/app`
  there, so deriving it from the source layout lands off the mounted volume.
- **`httpx2` is the test HTTP client**; Starlette's `TestClient` deprecates plain `httpx`.