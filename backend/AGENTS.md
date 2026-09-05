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
  api/
    health.py     GET /api/health
    auth.py       Login, logout, me, and the require_user dependency
  static/         The built NextJS export, copied in by Docker. Not in git.
tests/
  conftest.py     Fixtures: a stand-in export directory and a TestClient over it
  test_health.py  Health endpoint
  test_auth.py    Sign in, sign out, session, and the route guard
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

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `STATIC_DIR` | `app/static`, else `frontend/out` | Directory served at `/` |
| `SECRET_KEY` | a dev placeholder | Signs the session cookie |
| `AUTH_USERNAME` | `user` | The MVP account |
| `AUTH_PASSWORD` | `password` | The MVP password |
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
- Coming in later parts: SQLite persistence and board routes (Part 6), OpenRouter calls (Part 8),
  chat with structured outputs (Part 9).
