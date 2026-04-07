import json
import logging
from typing import AsyncGenerator

from google import genai
from google.genai import types

from ..models import AgentRequest
from ..tools import ToolContext, dispatch_tool, registry
from .shared import SYSTEM_PROMPT, build_file_tree

logger = logging.getLogger(__name__)


async def run_gemini(request: AgentRequest) -> AsyncGenerator[str, None]:
    client = genai.Client(api_key=request.apiKey)

    fs: dict[str, str] = {f.path: f.content for f in request.projectFiles}
    ctx = ToolContext(fs=fs, original_fs=dict(fs), project_id=request.projectId)

    system = SYSTEM_PROMPT.format(file_tree=build_file_tree(fs))
    tools = registry.to_gemini()

    history = []
    for turn in request.chatHistory[-20:]:
        role = "user" if turn.role == "user" else "model"
        history.append(types.Content(role=role, parts=[types.Part(text=turn.content)]))

    messages = history + [
        types.Content(role="user", parts=[types.Part(text=request.userMessage)])
    ]

    response_text = ""
    logger.debug(f"Gemini: model=gemini-2.5-flash, tools={len(tools)}, files={len(fs)}")

    while True:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=messages,
            config=types.GenerateContentConfig(
                system_instruction=system,
                tools=tools,
            ),
        )

        candidate = response.candidates[0]  # type: ignore[index]
        text_parts = []
        func_calls = []

        for part in candidate.content.parts:
            if part.text:
                text_parts.append(part.text)
            if part.function_call:
                func_calls.append(part.function_call)

        if text_parts:
            chunk = "".join(text_parts)
            response_text += chunk
            yield json.dumps({"type": "chunk", "text": chunk}) + "\n"

        if not func_calls:
            break

        messages.append(candidate.content)
        tool_results = []

        for fc in func_calls:
            name = fc.name
            args = dict(fc.args)

            logger.debug(f"Tool call: {name} args={list(args.keys())}")
            yield json.dumps({"type": "tool_use", "name": name}) + "\n"

            result = await dispatch_tool(name, args, ctx)
            logger.debug(f"Tool result: {result[:100]}")

            tool_results.append(
                types.Part(
                    function_response=types.FunctionResponse(
                        name=name, response={"result": result}
                    )
                )
            )

        messages.append(types.Content(role="user", parts=tool_results))

    seen = {fc.path: fc for fc in ctx.file_changes}
    yield json.dumps({
        "type": "done",
        "responseText": response_text,
        "fileChanges": [fc.model_dump() for fc in seen.values()],
    }) + "\n"
