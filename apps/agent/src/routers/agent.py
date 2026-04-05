from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from ..models import AgentRequest
from ..providers.claude import run_claude
from ..providers.openai import run_openai
from ..providers.gemini import run_gemini

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.post("/run")
async def run_agent(request: AgentRequest):
    if request.provider == "claude":
        generator = run_claude(request)
    elif request.provider == "openai":
        generator = run_openai(request)
    elif request.provider == "gemini":
        generator = run_gemini(request)
    else:
        return {"error": f"Unknown provider: {request.provider}"}

    return StreamingResponse(generator, media_type="application/x-ndjson")
