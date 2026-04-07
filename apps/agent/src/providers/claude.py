import json
import logging
from typing import AsyncGenerator

import anthropic

from ..models import AgentRequest
from ..tools import ToolContext, dispatch_tool, registry
from .shared import SYSTEM_PROMPT, build_file_tree, shell_tools_excluded

logger = logging.getLogger(__name__)


async def run_claude(request: AgentRequest) -> AsyncGenerator[str, None]:
    client = anthropic.Anthropic(api_key=request.apiKey)

    fs: dict[str, str] = {f.path: f.content for f in request.projectFiles}
    ctx = ToolContext(fs=fs, original_fs=dict(fs), project_id=request.projectId)

    system_text = SYSTEM_PROMPT.format(file_tree=build_file_tree(fs))
    # Cache the system prompt — stable across all turns in the same project
    system = [{"type": "text", "text": system_text, "cache_control": {"type": "ephemeral"}}]

    tools = registry.to_anthropic(exclude=shell_tools_excluded(fs))
    # cache_control is already on the last tool entry from registry.to_anthropic()

    model = request.model or "claude-haiku-4-5-20251001"

    # Build message history
    messages = []
    for turn in request.chatHistory[-20:]:
        messages.append({"role": turn.role, "content": turn.content})

    if request.attachments:
        content: list = []
        for att in request.attachments:
            content.append({
                "type": "image",
                "source": {"type": "base64", "media_type": att.mimeType, "data": att.data},
            })
        content.append({"type": "text", "text": request.userMessage})
    else:
        content = request.userMessage  # type: ignore[assignment]

    messages.append({"role": "user", "content": content})

    response_text = ""
    logger.debug(f"Claude: model={model}, tools={len(tools)}, files={len(fs)}")

    while True:
        logger.debug(f"Claude API call: {len(messages)} messages")
        response = client.messages.create(
            model=model,
            max_tokens=8096,
            system=system,  # type: ignore[arg-type]
            messages=messages,
            tools=tools,  # type: ignore[arg-type]
        )
        logger.debug(f"Claude response: stop_reason={response.stop_reason}, blocks={len(response.content)}")

        for block in response.content:
            if block.type == "text":
                response_text += block.text
                yield json.dumps({"type": "chunk", "text": block.text}) + "\n"

        if response.stop_reason == "end_turn":
            break

        if response.stop_reason == "tool_use":
            tool_results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue
                name = block.name  # type: ignore[attr-defined]
                args = block.input  # type: ignore[attr-defined]
                tool_use_id = block.id  # type: ignore[attr-defined]

                logger.debug(f"Tool call: {name} args={list(args.keys())}")
                yield json.dumps({"type": "tool_use", "name": name}) + "\n"

                result = await dispatch_tool(name, args, ctx)
                logger.debug(f"Tool result: {result[:100]}")

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use_id,
                    "content": result,
                })

            messages.append({"role": "assistant", "content": response.content})  # type: ignore[arg-type]
            messages.append({"role": "user", "content": tool_results})
        else:
            break

    seen = {fc.path: fc for fc in ctx.file_changes}
    yield json.dumps({
        "type": "done",
        "responseText": response_text,
        "fileChanges": [fc.model_dump() for fc in seen.values()],
        "taskUpdates": [],
        "memoryUpdates": {},
    }) + "\n"
