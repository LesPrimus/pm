# Project Management MVP

A single-board Kanban app with an AI chat sidebar. NextJS frontend, statically built and served by a
Python FastAPI backend, packaged in one Docker container with a local SQLite database.

## Status

Under construction, built in the parts listed in [docs/PLAN.md](docs/PLAN.md). Part 1 (planning) is done.
The frontend demo in `frontend/` runs standalone; the backend, Docker setup, and run scripts arrive in Part 2.

## Layout

```
backend/    FastAPI app, serves the API at /api and the built frontend at /
frontend/   NextJS app (see frontend/AGENTS.md)
scripts/    Start and stop scripts for Mac, Linux, and Windows
docs/       Plan and design documents
```

## Run

Not available yet. Until Part 2 lands, run the frontend demo on its own:

```bash
cd frontend
npm install
npm run dev
```

## Configuration

`.env` in the project root holds `OPENROUTER_API_KEY`. It is gitignored and needed from Part 8 onward.
A committed `.env.example` lands with the Docker setup in Part 2.

## Documentation

- [AGENTS.md](AGENTS.md) - requirements, technical decisions, coding standards
- [docs/PLAN.md](docs/PLAN.md) - the 10-part build plan with tests and success criteria
