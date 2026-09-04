# Project Management MVP

A single-board Kanban app with an AI chat sidebar. NextJS frontend, statically built and served by a
Python FastAPI backend, packaged in one Docker container with a local SQLite database.

## Status

Under construction, built in the parts listed in [docs/PLAN.md](docs/PLAN.md). Parts 1 and 2 are done:
the container runs and serves a placeholder page that calls the API. The NextJS board is wired in at Part 3;
until then the demo in `frontend/` runs standalone.

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

Then open http://localhost:8000. To stop:

```bash
./scripts/stop.sh      # Windows: .\scripts\stop.ps1
```

The frontend demo still runs on its own with `cd frontend && npm install && npm run dev`.

## Configuration

Copy `.env.example` to `.env` in the project root and set `OPENROUTER_API_KEY`. Needed from Part 8 onward;
the app starts without it. `.env` is gitignored.

## Documentation

- [AGENTS.md](AGENTS.md) - requirements, technical decisions, coding standards
- [docs/PLAN.md](docs/PLAN.md) - the 10-part build plan with tests and success criteria
- [backend/AGENTS.md](backend/AGENTS.md), [frontend/AGENTS.md](frontend/AGENTS.md) - per-directory detail
