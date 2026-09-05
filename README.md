# Project Management MVP

A single-board Kanban app with an AI chat sidebar. NextJS frontend, statically built and served by a
Python FastAPI backend, packaged in one Docker container with a local SQLite database.

## Status

Under construction, built in the parts listed in [docs/PLAN.md](docs/PLAN.md). Parts 1 to 4 are done:
sign in with `user` / `password` to reach the Kanban board. Board edits are not saved yet; persistence and
the AI sidebar come in Parts 5 to 10.

## Layout

```
backend/    FastAPI app, serves the API at /api and the built frontend at /
frontend/   NextJS app (see frontend/AGENTS.md)
scripts/    Start and stop scripts for Mac, Linux, and Windows
docs/       Plan and design documents
```

## Run

Requires Docker.

```bash
./scripts/start.sh     # Windows: .\scripts\start.ps1
```

Then open http://localhost:8000 and sign in with `user` / `password`. To stop:

```bash
./scripts/stop.sh      # Windows: .\scripts\stop.ps1
```

Without Docker, build the frontend once and run the backend against it:

```bash
cd frontend && npm ci && npm run build
cd ../backend && uv run uvicorn app.main:app --port 8000
```

## Configuration

Copy `.env.example` to `.env` in the project root and set `OPENROUTER_API_KEY`. Needed from Part 8 onward;
the app starts without it. `.env` is gitignored.

## Development

```bash
uv tool install pre-commit   # once
pre-commit install           # once, installs the git hook
pre-commit run --all-files   # lint and format everything
```

Commits run ruff over the backend. If a hook rewrites a file the commit stops, so re-stage and commit again.

Tests:

```bash
cd backend  && uv run pytest      # backend
cd frontend && npm run test:unit  # vitest
cd frontend && npm run test:e2e   # playwright, builds and serves the app itself
```

## Documentation

- [AGENTS.md](AGENTS.md) - requirements, technical decisions, coding standards
- [docs/PLAN.md](docs/PLAN.md) - the 10-part build plan with tests and success criteria
- [backend/AGENTS.md](backend/AGENTS.md), [frontend/AGENTS.md](frontend/AGENTS.md) - per-directory detail
