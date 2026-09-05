import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.config import AUTH_PASSWORD, AUTH_USERNAME

router = APIRouter(prefix="/auth", tags=["auth"])


class Credentials(BaseModel):
    username: str
    password: str


class User(BaseModel):
    username: str


def require_user(request: Request) -> str:
    """Depend on this to restrict a route to a signed in user."""
    username = request.session.get("username")
    if not username:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return username


CurrentUser = Annotated[str, Depends(require_user)]


@router.post("/login")
def login(credentials: Credentials, request: Request) -> User:
    valid = secrets.compare_digest(
        credentials.username, AUTH_USERNAME
    ) and secrets.compare_digest(credentials.password, AUTH_PASSWORD)
    if not valid:
        # One message for both fields, so a wrong username is not distinguishable.
        raise HTTPException(status_code=401, detail="Invalid username or password")

    request.session["username"] = credentials.username
    return User(username=credentials.username)


@router.post("/logout")
def logout(request: Request) -> dict[str, str]:
    request.session.clear()
    return {"status": "signed out"}


@router.get("/me")
def me(username: CurrentUser) -> User:
    return User(username=username)
