# Backend

FastAPI app that serves the JSON API under `/api` and the static frontend at `/`.
Dependencies are managed by uv. Python 3.13, pinned in `.python-version`.

## Layout

```
pyproject.toml    uv project (non-package), dependencies, pytest config
uv.lock           Locked dependency set, used by the Docker build
app/
  main.py         FastAPI app: CORS (dev only), routers, API 404 guard, static mount
  config.py       Settings read from the environment
  api/
    health.py     GET /api/health
  static/         Files served at /. Currently a placeholder page; replaced by the
                  built NextJS export in Part 3
tests/
  conftest.py     TestClient fixture
  test_health.py  Health endpoint
  test_static.py  Static serving and the API 404 guard
```

## Route ordering

`main.py` registers routers first, then a catch-all `/api/{path:path}` that raises 404, and mounts
`StaticFiles(html=True)` at `/` last. Starlette matches routes in registration order, so:

- `/api/health` hits the router.
- Any other `/api/...` path returns a JSON 404 from the guard. Without it, the static mount would answer,
  and once the NextJS export ships a `404.html` an unknown API path would return an HTML page.
- Everything else is served from `app/static`.

The mount is constructed at import time, so `STATIC_DIR` must exist before the app is imported.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `STATIC_DIR` | `app/static` | Directory served at `/` |
| `DEV_CORS_ORIGIN` | unset | When set, enables CORS with credentials for that one origin. Used for `npm run dev` against a local backend. Unset in Docker, where API and site share an origin. |

## Commands

```bash
cd backend
uv sync                 # create .venv and install, including the dev group
uv run pytest           # test suite
uv run uvicorn app.main:app --reload --port 8000
```

Run from `backend/`: the project is non-package, so `app` is imported from the working directory
(`pythonpath = ["."]` covers pytest, uvicorn adds the cwd itself).

## Notes

- `httpx2` is the test HTTP client. Starlette's `TestClient` deprecates plain `httpx`.
- Coming in later parts: session auth (Part 4), SQLite persistence and board routes (Part 6),
  OpenRouter calls (Part 8), chat with structured outputs (Part 9).
