import logging
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from ..models import AgentRequest
from ..providers.claude import run_claude
from ..providers.openai import run_openai
from ..providers.gemini import run_gemini
from ..providers.openrouter import run_openrouter
from ..providers.unified import run_unified

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.post("/run")
async def run_agent(request: AgentRequest):
    logger.debug(
        f"Agent request: provider={request.provider}, model={request.model or '(none)'}, "
        f"files={len(request.projectFiles)}, "
        f"history_turns={len(request.chatHistory)}, "
        f"message_len={len(request.userMessage)}"
    )

    # If a model string is provided, use the unified multi-provider path
    if request.model:
        generator = run_unified(request)
    elif request.provider == "claude":
        generator = run_claude(request)
    elif request.provider == "openai":
        generator = run_openai(request)
    elif request.provider == "gemini":
        generator = run_gemini(request)
    elif request.provider == "openrouter":
        generator = run_openrouter(request)
    else:
        return {"error": f"Unknown provider: {request.provider}"}

    return StreamingResponse(generator, media_type="application/x-ndjson")
