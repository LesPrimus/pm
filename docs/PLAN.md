# Project Plan

The build is split into 10 parts. Each part lists steps as a checklist, the tests that must exist,
and the success criteria that decide whether the part is done.

Rules for the agent:

- Work one part at a time, in order. Do not start the next part until the current one meets its success criteria.
- Tick each `- [ ]` box in this file as the step lands. Keep the file honest: an unticked box means not done.
- Every part ends green: `npm run lint`, `npm run test:unit`, backend `pytest`, and (from Part 3) `npm run test:e2e`.
- Read `AGENTS.md` at the repo root and in the directory being worked on before editing it.
- Coding standards from the root `AGENTS.md` apply throughout: latest idiomatic libraries, simplest thing that
  works, no speculative features, no emojis, root-cause fixes only.

Status: Parts 1 to 8 complete. Part 9 next.

## Target repo layout

```
AGENTS.md               Business requirements, technical decisions, standards
Dockerfile              Multi-stage: node builds the frontend, python runs the app
compose.yaml            Single service, published port 8000, ./data volume
.env                    OPENROUTER_API_KEY (gitignored, not committed)
.env.example            Documented placeholder values (committed)
backend/
  AGENTS.md             Backend description, kept current
  pyproject.toml        uv-managed, Python 3.14
  app/
    main.py             FastAPI app: routers, session middleware, static mount
    config.py           Settings from environment
    db.py               SQLite connection and schema bootstrap
    models.py           Pydantic models shared by API and AI layers
    api/                health, auth, board, chat routers
    ai.py               OpenRouter client and structured-output call
    static/             Built frontend, copied in by Docker; gitignored
  tests/                pytest suite
frontend/
  AGENTS.md             Description of the existing NextJS app
  ...                   Existing Next 16 app, statically exported to frontend/out
scripts/
  start.sh stop.sh      Mac and Linux
  start.ps1 stop.ps1    Windows
docs/
  PLAN.md               This file
  DATABASE.md           Database approach, written in Part 5
  schema.json           Machine-readable schema proposal, written in Part 5
data/                   SQLite file, created at runtime, gitignored
```

## Shared conventions

- One container serves everything on port 8000. API under `/api`, static site at `/`.
- API routes are registered before the static mount, so `/api/*` never falls through to `index.html`.
- Frontend calls the API through a single client module using `process.env.NEXT_PUBLIC_API_BASE_URL ?? ""`.
  Empty string means same origin (the Docker case). Local `npm run dev` sets it to `http://127.0.0.1:8000`.
- All fetches that touch auth use `credentials: "include"`.
- CORS is enabled only when `DEV_CORS_ORIGIN` is set, so production has no CORS surface.
- Secrets come from the environment. Nothing is hardcoded outside `.env.example`.

---

## Part 1: Plan

Goal: an agreed, detailed plan and an accurate description of the existing frontend code.

- [x] Read the root `AGENTS.md`, the existing `frontend/` source, and the current tooling versions.
- [x] Enrich `docs/PLAN.md` with per-part checklists, tests, and success criteria.
- [x] Write `frontend/AGENTS.md` describing the existing frontend: stack, layout, data model, state, styling,
      test hooks, commands, and known gaps.
- [x] Resolve the open questions below with the user.
- [x] Get explicit user approval of this plan before starting Part 2.

Tests: none (documentation only).

Success criteria:

- `docs/PLAN.md` covers all 10 parts with checkboxes, tests, and success criteria.
- `frontend/AGENTS.md` matches the code actually in `frontend/` (verified by reading it, not assumed).
- The user has approved the plan and answered the open questions.

### Decisions

1. **Storage shape (settled).** The board is stored as one JSON document per user. Tables:
   `users(id, username, password_hash, created_at)` and `boards(id, user_id, data JSON, updated_at)`, where
   `data` matches the frontend `BoardData` shape. Chosen over normalized `columns`/`cards` tables because the
   AI returns a whole board in one structured output, so an update is a single write. Part 5 also writes the
   proposal to `docs/schema.json`.
2. **`OPENROUTER_API_KEY` (settled).** The user is adding `.env` to the project root now. Part 8 reads the key
   from there via `compose.yaml`; `.env` stays gitignored and `.env.example` is committed alongside it.
3. **Published port (settled).** 8000.

---

## Part 2: Scaffolding

Goal: a Docker container that runs FastAPI, serves a placeholder static page at `/`, and answers an API call
from that page.

- [x] Create `backend/pyproject.toml` managed by uv: `fastapi`, `uvicorn[standard]`, dev group `pytest`, `httpx2`
      (Starlette's `TestClient` deprecates plain `httpx`).
- [x] Create `backend/app/config.py` reading settings from the environment with sane local defaults.
- [x] Create `backend/app/main.py`: FastAPI app, `/api` router included first, `StaticFiles(html=True)` mounted at `/`.
- [x] Add `GET /api/health` returning `{"status": "ok"}`.
- [x] Add `backend/app/static/index.html`: a placeholder page that fetches `/api/health` and renders the result.
- [x] Write the `Dockerfile` (python slim base, `uv` copied from the official image, `uv sync --frozen --no-dev`).
- [x] Write `compose.yaml`: one service, `8000:8000`, `./data` volume, env file `.env`.
- [x] Write `scripts/start.sh` and `scripts/stop.sh` (Mac and Linux, `chmod +x`), `scripts/start.ps1` and
      `scripts/stop.ps1` (Windows). Start builds and brings the stack up, stop tears it down.
- [x] Add `.env.example`; gitignore `.env` and `data/`. `backend/app/static/` stays committed for now because
      it holds the placeholder page; it becomes build output and gets gitignored in Part 3.
- [x] Update `backend/AGENTS.md` and `scripts/AGENTS.md` to describe what now exists.

Tests (`backend/tests/`, run with `uv run pytest`):

- `GET /api/health` returns 200 and `{"status": "ok"}`.
- `GET /` returns 200 with `text/html`.
- An unknown `/api/...` path returns 404 JSON, not the HTML shell.

Success criteria:

- `./scripts/start.sh` builds and starts the container with no manual steps.
- `http://localhost:8000/` shows the placeholder page and displays the health response fetched from the API.
- `./scripts/stop.sh` stops and removes the container.
- Backend tests pass locally outside Docker.

---

## Part 3: Add in Frontend

Goal: the real NextJS Kanban board is statically built and served by FastAPI at `/`.

- [x] Set `output: "export"` and `images: { unoptimized: true }` in `frontend/next.config.ts`; confirm
      `npm run build` produces `frontend/out` with `index.html`.
- [x] Add a frontend build stage to the `Dockerfile` (`npm ci`, `npm run build`) and copy `frontend/out`
      into `backend/app/static` in the runtime stage.
- [x] Delete the Part 2 placeholder HTML and gitignore `backend/app/static/`; the static mount now serves the export.
- [x] Add `frontend/src/lib/api.ts` with the base-URL rule and a typed `getHealth()` call, used by the board
      header to prove the frontend reaches the API.
- [x] Point `playwright.config.ts` at the served build (`http://127.0.0.1:8000`) instead of `next dev`, so e2e
      exercises the real deployment path.
- [x] Update `frontend/AGENTS.md` and `backend/AGENTS.md`.

Tests:

- Unit (vitest): existing `moveCard` and `KanbanBoard` suites still pass; add coverage for `KanbanColumn`
  rendering, `NewCardForm` validation (empty title is rejected), card delete, and `api.ts` base-URL resolution.
- Backend (pytest): `GET /` returns the exported HTML; a static asset under `/_next/` returns 200;
  `/api/health` still returns JSON.
- E2E (playwright): board loads at `/` with five columns, a card can be added, a card can be dragged between columns.

Success criteria:

- `http://localhost:8000/` renders the Kanban board with the correct fonts and brand colors.
- No 404s in the browser console for `_next` assets.
- All three suites pass.

---

## Part 4: Add in a fake user sign in experience

Goal: `/` requires a login with `user` / `password`; the user can log out.

- [x] Add Starlette `SessionMiddleware` with a `SECRET_KEY` from config.
- [x] Add `backend/app/api/auth.py`: `POST /api/auth/login` (validates against configured credentials, sets the
      session), `POST /api/auth/logout` (clears it), `GET /api/auth/me` (200 with the username, else 401).
- [x] Add a `require_user` FastAPI dependency for protecting routes in later parts.
- [x] Frontend: an auth context that calls `/api/auth/me` on mount; render the login form while unauthenticated
      and the board once authenticated. Client-side gate, since the site is a static export.
- [x] Build the login screen using the brand palette; submit button uses `--secondary-purple`.
- [x] Show the signed-in username and a Log out control in the board header.
- [x] Show an inline error on bad credentials; never leak which field was wrong.
- [x] Update `frontend/AGENTS.md` and `backend/AGENTS.md`.

Tests:

- Backend: login with correct credentials returns 200 and sets a session cookie; wrong password returns 401;
  `/api/auth/me` is 401 before login and 200 after; logout clears the session so `/api/auth/me` is 401 again;
  a route guarded by `require_user` returns 401 when anonymous.
- Unit: login form renders when `/api/auth/me` returns 401; board renders when it returns 200; submitting
  valid credentials swaps to the board; invalid credentials show the error and keep the form.
- E2E: hitting `/` shows the login screen; signing in reveals the board; reloading keeps the session;
  logging out returns to the login screen and a reload does not restore the board.

Success criteria:

- The board is unreachable in the browser without signing in.
- The session survives a page reload and is gone after logout.
- All suites pass.

---

## Part 5: Database modeling

Goal: an agreed, documented database design. No implementation in this part.

- [x] Propose the schema: `users` (id, username, password hash or MVP placeholder, created_at) and
      `boards` (id, user_id, data JSON, updated_at), with the board JSON matching the frontend `BoardData`
      shape (`columns[]` with ordered `cardIds`, `cards` keyed by id).
- [x] Write `docs/schema.json` as the machine-readable proposal: tables, columns, types, constraints, plus a
      JSON Schema for the board document.
- [x] Write `docs/DATABASE.md`: the approach, why JSON-per-board rather than normalized tables, where the
      SQLite file lives, how it is created on first run, seeding of a new user's board from the demo data,
      and how a future migration to multiple boards or normalized tables would work.
- [x] Confirm the design supports multiple users even though the MVP has one.
- [x] Get user sign-off before Part 6.

Tests: none (documentation only). `docs/schema.json` must parse as valid JSON.

Success criteria:

- `docs/DATABASE.md` and `docs/schema.json` exist and agree with each other.
- The board JSON shape matches `frontend/src/lib/kanban.ts` exactly, field for field.
- The user has signed off.

---

## Part 6: Backend

Goal: API routes that read and change the Kanban for the signed-in user, backed by SQLite.

- [x] Add `backend/app/db.py`: connection helper, `CREATE TABLE IF NOT EXISTS` bootstrap on startup, foreign
      keys on. The database file and its parent directory are created if absent.
- [x] Add `backend/app/models.py`: Pydantic models `Card`, `Column`, `BoardData` mirroring the frontend types.
- [x] Seed a board from the demo data the first time a user has none.
- [x] Add `backend/app/api/board.py`: `GET /api/board` returns the current user's board; `PUT /api/board`
      replaces it after validation. Both require auth.
- [x] Validate on write: unique card and column ids, every `cardIds` entry present in `cards`, no orphan cards,
      no duplicate card across columns. Reject with 422.
- [x] Update `backend/AGENTS.md`.

Tests (backend pytest, against a temporary database file per test):

- The database file and schema are created when the file does not exist.
- A fresh user gets the seeded demo board on first `GET /api/board`.
- `PUT` then `GET` round-trips the board unchanged, including column order and card order.
- `PUT` with an unknown id in `cardIds` returns 422 and leaves the stored board untouched.
- `PUT` with a duplicate card id returns 422.
- Both routes return 401 when anonymous.
- Two different users have independent boards.
- Data survives an application restart (reopen the database, read the board back).

Success criteria:

- All backend tests pass; the board round-trips exactly.
- Deleting `data/` and restarting recreates a working database.

---

## Part 7: Frontend + Backend

Goal: the board is persistent, reading and writing through the API.

- [x] Extend `frontend/src/lib/api.ts` with `getBoard()` and `putBoard(board)`.
- [x] Load the board from the API after sign-in; show a loading state and an error state.
- [x] Persist every mutation (move, rename, add, delete) with an optimistic local update and a `PUT`.
- [x] Debounce column rename writes so typing does not fire a request per keystroke.
- [x] On a failed write, revert to the last server-confirmed board and show a non-blocking error.
- [x] Remove `initialData` from the frontend bundle; the backend owns seed data.
- [x] Update `frontend/AGENTS.md`.

Tests:

- Unit: board renders from a mocked `getBoard`; each mutation triggers a `putBoard` with the expected payload;
  a rejected `putBoard` reverts the UI; renames are debounced into a single call.
- Backend: unchanged suite still passes.
- E2E: sign in, add a card, reload, the card is still there; move a card between columns, reload, it stays
  moved; rename a column, reload, the name persists; log out and back in, the board is unchanged.

Success criteria:

- No board state is lost across reload, logout, or container restart.
- All suites pass.

---

## Part 8: AI connectivity

Goal: the backend can call an LLM through OpenRouter.

- [x] Confirm `OPENROUTER_API_KEY` is in the root `.env` and reaches the container via `compose.yaml`.
- [x] Add the `openai` SDK to `backend/pyproject.toml`, pointed at `https://openrouter.ai/api/v1`.
- [x] Add `backend/app/ai.py` with the client and the model id `openai/gpt-oss-120b` from config.
- [x] Add a temporary `POST /api/ai/ping` that asks the model for `2+2` and returns the answer.
- [x] Handle a missing key with a clear 503 rather than a stack trace.
- [x] Update `backend/AGENTS.md`.

Tests:

- Unit: the client is constructed with the OpenRouter base URL and the configured model; a missing key yields
  503; a transport error yields 502. The SDK is mocked, so this suite needs no network.
- Live check (run once, manually, not part of CI): `POST /api/ai/ping` returns an answer containing `4`.

Success criteria:

- The live `2+2` call returns a correct answer through OpenRouter.
- The mocked suite passes with no network and no API key present.

---

## Part 9: AI over the Kanban

Goal: a chat endpoint that sends the board JSON, the user's question, and the conversation history, and gets
back a structured reply plus an optional board update.

- [ ] Define the response model: `reply: str` and `board: BoardData | None` (null when no change is needed).
- [ ] Call the model with `response_format` json_schema (strict) built from that Pydantic model.
- [ ] Add `POST /api/chat`: accepts the user message and prior turns, loads the current board, calls the model,
      validates the returned board, saves it when present, and returns `{reply, board_updated, board}`.
- [ ] Write the system prompt: describe the board schema, require ids to be preserved when editing existing
      cards, require new ids for new cards, and forbid inventing columns beyond the existing five.
- [ ] Validate the AI board with the same rules as `PUT /api/board`; on failure keep the stored board, return
      the reply, and set `board_updated: false`.
- [ ] Store conversation history client-side and pass it in; the backend stays stateless for chat.
- [ ] Remove the temporary `/api/ai/ping` route.
- [ ] Update `backend/AGENTS.md`.

Tests (backend, model mocked):

- A question-only response leaves the stored board untouched and `board_updated` is false.
- A response with a board saves it; a subsequent `GET /api/board` returns the new board.
- An invalid AI board (bad ids, orphan cards) is rejected, the stored board is unchanged, `board_updated` is false.
- Conversation history is forwarded to the model in order.
- The board JSON is included in the request sent to the model.
- `/api/chat` returns 401 when anonymous.
- Live check (manual): ask "move the QA card to Done" and confirm the stored board actually changes.

Success criteria:

- Structured output validates against the schema on every call in the mocked suite.
- A real request that asks for a board change produces a persisted change.

---

## Part 10: AI chat sidebar

Goal: a chat sidebar in the UI that can drive the board.

- [ ] Build a `ChatSidebar` component: message list, input, send button, pending indicator, error state.
- [ ] Style it with the brand palette: purple submit, blue accents, yellow highlight for AI-applied changes.
      Collapsible, so the board keeps its width when the sidebar is closed.
- [ ] Keep conversation history in React state and send it with each message.
- [ ] When the response has `board_updated`, apply the returned board immediately and show a brief confirmation.
- [ ] Keep the board readable while a request is in flight; do not block board interaction.
- [ ] Update `frontend/AGENTS.md`.

Tests:

- Unit: messages render in order; sending posts to `/api/chat` with history; a reply with `board_updated`
  refreshes the board; a reply without it leaves the board alone; a failed request shows an error and keeps
  the typed message recoverable; the sidebar collapses and expands.
- E2E (mocked `/api/chat` route so it is deterministic): sign in, open the sidebar, send a message, see the
  reply, and see the board update without a manual reload.
- Live check (manual): a real prompt that moves a card updates the board on screen and survives a reload.

Success criteria:

- The sidebar looks like part of the product, not a bolt-on.
- An AI board change appears in the UI with no manual refresh and persists across reload.
- All suites pass.
