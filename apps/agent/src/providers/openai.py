import json
import logging
from typing import AsyncGenerator

from openai import OpenAI

from ..models import AgentRequest
from ..tools import ToolContext, dispatch_tool, registry
from .shared import SYSTEM_PROMPT, build_file_tree

logger = logging.getLogger(__name__)


async def run_openai(request: AgentRequest) -> AsyncGenerator[str, None]:
    client = OpenAI(api_key=request.apiKey)

    fs: dict[str, str] = {f.path: f.content for f in request.projectFiles}
    ctx = ToolContext(fs=fs, original_fs=dict(fs), project_id=request.projectId)

    system = SYSTEM_PROMPT.format(file_tree=build_file_tree(fs))
    tools = registry.to_openai()

    messages: list = [{"role": "system", "content": system}]
    for turn in request.chatHistory[-20:]:
        messages.append({"role": turn.role, "content": turn.content})
    messages.append({"role": "user", "content": request.userMessage})

    response_text = ""
    model = request.model or "gpt-4o"
    logger.debug(f"OpenAI: model={model}, tools={len(tools)}, files={len(fs)}")

    while True:
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            tools=tools,  # type: ignore[arg-type]
            tool_choice="auto",
        )
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
        "taskUpdates": [],
        "memoryUpdates": {},
    }) + "\n"
