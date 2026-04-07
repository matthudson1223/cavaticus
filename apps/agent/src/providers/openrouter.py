import json
import logging
from typing import AsyncGenerator

from openai import OpenAI, APIStatusError

from ..models import AgentRequest
from ..tools import ToolContext, dispatch_tool, registry
from .shared import SYSTEM_PROMPT, build_file_tree

logger = logging.getLogger(__name__)


async def run_openrouter(request: AgentRequest) -> AsyncGenerator[str, None]:
    model = request.openrouterModel
    if not model:
        yield json.dumps({
            "type": "error",
            "text": "OpenRouter requires selecting a model that supports function calling. "
                    "Visit https://openrouter.ai/models?supported_parameters=tools to choose one.",
        }) + "\n"
        return

    client = OpenAI(api_key=request.apiKey, base_url="https://openrouter.ai/api/v1")

    fs: dict[str, str] = {f.path: f.content for f in request.projectFiles}
    ctx = ToolContext(fs=fs, original_fs=dict(fs), project_id=request.projectId)

    system = SYSTEM_PROMPT.format(file_tree=build_file_tree(fs))
    tools = registry.to_openai()

    messages: list = [{"role": "system", "content": system}]
    for turn in request.chatHistory[-20:]:
        messages.append({"role": turn.role, "content": turn.content})
    messages.append({"role": "user", "content": request.userMessage})

    response_text = ""
    logger.debug(f"OpenRouter: model={model}, tools={len(tools)}, files={len(fs)}")

    while True:
        try:
            response = client.chat.completions.create(
                model=model,
                messages=messages,
                tools=tools,  # type: ignore[arg-type]
                tool_choice="auto",
            )
        except APIStatusError as e:
            error_detail = ""
            try:
                error_body = e.response.json() if hasattr(e, "response") else {}
                if error_body:
                    error_detail = f" Details: {json.dumps(error_body)}"
            except Exception:
                pass

            if e.status_code == 405:
                logger.error(f"405 from OpenRouter for model '{model}'{error_detail}")
                yield json.dumps({
                    "type": "error",
                    "text": f"Model '{model}' does not support function calling. "
                            f"See https://openrouter.ai/models?supported_parameters=tools",
                }) + "\n"
            else:
                logger.error(f"OpenRouter API error {e.status_code}{error_detail}")
                yield json.dumps({
                    "type": "error",
                    "text": f"OpenRouter API error: {e.status_code}{error_detail}",
                }) + "\n"
            return

        msg = response.choices[0].message

        if msg.content:
            response_text += msg.content
            yield json.dumps({"type": "chunk", "text": msg.content}) + "\n"

        if not msg.tool_calls:
            break

        messages.append(msg)  # type: ignore[arg-type]

        for tc in msg.tool_calls:
            name = tc.function.name
            args = json.loads(tc.function.arguments)

            logger.debug(f"Tool call: {name} args={list(args.keys())}")
            yield json.dumps({"type": "tool_use", "name": name}) + "\n"

            result = await dispatch_tool(name, args, ctx)
            logger.debug(f"Tool result: {result[:100]}")

            messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})

    seen = {fc.path: fc for fc in ctx.file_changes}
    yield json.dumps({
        "type": "done",
        "responseText": response_text,
        "fileChanges": [fc.model_dump() for fc in seen.values()],
    }) + "\n"
