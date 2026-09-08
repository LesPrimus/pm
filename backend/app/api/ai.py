from fastapi import APIRouter

from app.ai import ask
from app.api.auth import CurrentUser

router = APIRouter(prefix="/ai", tags=["ai"])

PING_PROMPT = "What is 2+2? Reply with just the number."


@router.post("/ping")
def ping(username: CurrentUser) -> dict[str, str]:
    """Connectivity check. Removed in Part 9, once /api/chat exists."""
    return {"answer": ask(PING_PROMPT)}
