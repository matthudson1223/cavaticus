"""Unified provider — drives all 10+ model providers via clawspring's stream().

Supports any model string:
  "claude-opus-4-6"       → Anthropic
  "gpt-4o"                → OpenAI
  "gemini-2.0-flash"      → Gemini (OpenAI-compat endpoint)
  "deepseek-chat"         → DeepSeek
  "ollama/llama3.3"       → local Ollama (no API key needed)
  "lmstudio/my-model"     → local LM Studio (no API key needed)
  "kimi-latest"           → Moonshot AI
  "qwen-max"              → Alibaba DashScope
  "glm-4-plus"            → Zhipu AI
  "custom/my-model"       → any OpenAI-compatible endpoint via CUSTOM_BASE_URL

NOTE: Text chunks are buffered per LLM turn (sync→async boundary).
      True per-token streaming can be added later with an asyncio.Queue bridge.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import AsyncGenerator

from ..models import AgentRequest, Task, Memory
from ..tools import ToolContext, dispatch_tool, registry
from ..tools.skills import find_skill
from .shared import SYSTEM_PROMPT, build_file_tree, shell_tools_excluded, format_memory_context
from .clawspring_providers import (
    PROVIDERS,
    AssistantTurn,
    TextChunk,
    ThinkingChunk,
    bare_model,
    detect_provider,
    stream,
)

logger = logging.getLogger(__name__)


def _collect_turn(gen) -> tuple[list[str], list[str], AssistantTurn | None]:
    """Run a sync stream generator in a thread.

    Returns:
        (text_chunks, thinking_chunks, AssistantTurn | None)
    """
    text_chunks: list[str] = []
    thinking_chunks: list[str] = []
    turn: AssistantTurn | None = None

    for event in gen:
        if isinstance(event, TextChunk):
            text_chunks.append(event.text)
        elif isinstance(event, ThinkingChunk):
            thinking_chunks.append(event.text)
        elif isinstance(event, AssistantTurn):
            turn = event

    return text_chunks, thinking_chunks, turn


async def run_unified(request: AgentRequest) -> AsyncGenerator[str, None]:
    model = request.model
    if not model:
        yield json.dumps({"type": "error", "text": "No model specified for unified provider."}) + "\n"
        return

    fs: dict[str, str] = {f.path: f.content for f in request.projectFiles}

    # Seed tasks and memory from request
    tasks = [t.model_dump() for t in (request.existingTasks or [])]
    memory = {}
    for name, mem in (request.projectMemory or {}).items():
        if isinstance(mem, Memory):
            mem_dict = mem.model_dump()
        else:
            mem_dict = mem
        memory[name] = mem_dict

    ctx = ToolContext(
        fs=fs,
        original_fs=dict(fs),
        project_id=request.projectId,
        tasks=tasks,
        memory=memory,
    )

    system = SYSTEM_PROMPT.format(file_tree=build_file_tree(fs))

    # Inject memory context if present
    if memory:
        memory_context = format_memory_context(memory)
        system = memory_context + "\n\n" + system

    # Inject skill prompt if active
    if request.activeSkill:
        skill = find_skill(request.activeSkill)
        if skill:
            system = skill.prompt + "\n\n" + system

    # Unified provider always passes Anthropic-style tool schemas;
    # clawspring's stream() handles conversion to the right format internally.
    # Exclude shell tools when there's no package.json — they won't work anyway.
    tool_schemas = registry.to_anthropic(exclude=shell_tools_excluded(fs))

    # Build history in clawspring's neutral format
    messages: list[dict] = []
    for turn in request.chatHistory[-20:]:
        messages.append({"role": turn.role, "content": turn.content})

    # Handle image attachments in the user message
    if request.attachments:
        # Anthropic-style — clawspring's messages_to_anthropic handles this
        user_content: list = []
        for att in request.attachments:
            user_content.append({
                "type": "image",
                "source": {"type": "base64", "media_type": att.mimeType, "data": att.data},
            })
        user_content.append({"type": "text", "text": request.userMessage})
        messages.append({"role": "user", "content": user_content})
    else:
        messages.append({"role": "user", "content": request.userMessage})

    # Build config: pass API key under the provider-specific key name.
    # For OpenRouter, preserve the full org/model string and use the openrouter
    # provider entry so the correct base URL is used.
    provider_name = (
        "openrouter"
        if request.provider == "openrouter"
        else detect_provider(model)
    )
    # OpenRouter models arrive as "org/model" (e.g. "openai/gpt-4o"); pass
    # them as-is — do NOT strip the prefix or OpenRouter won't route correctly.
    if provider_name == "openrouter":
        model = model  # keep full string, e.g. "openai/gpt-4o"
    config: dict = {
        f"{provider_name}_api_key": request.apiKey,
        "max_tokens": 8192,
    }
    # For custom provider, pass base_url if provided (future: add to AgentRequest)
    if provider_name == "custom" and request.customBaseUrl:
        config["custom_base_url"] = request.customBaseUrl
    # Pass explicit provider override so stream() skips auto-detection
    config["_provider_override"] = provider_name

    response_text = ""
    logger.debug(
        f"Unified: model={model}, provider={provider_name}, "
        f"tools={len(tool_schemas)}, files={len(fs)}"
    )

    while True:
        # Run the sync LLM call in a thread pool to avoid blocking the event loop
        gen = stream(model, system, messages, tool_schemas, config)
        text_chunks, thinking_chunks, assistant_turn = await asyncio.to_thread(
            _collect_turn, gen
        )

        if assistant_turn is None:
            logger.warning("Unified: stream ended without AssistantTurn")
            if not response_text:
                yield json.dumps({"type": "error", "text": "Model returned an empty response. It may not support the tool schemas or the context was too large."}) + "\n"
            break

        # Emit thinking chunks first (collapsed, for debugging)
        if thinking_chunks:
            thinking_text = "".join(thinking_chunks)
            yield json.dumps({"type": "thinking", "text": thinking_text}) + "\n"

        # Emit text chunks
        for chunk in text_chunks:
            response_text += chunk
            yield json.dumps({"type": "chunk", "text": chunk}) + "\n"

        # Add assistant turn to neutral message history
        messages.append({
            "role": "assistant",
            "content": assistant_turn.text,
            "tool_calls": assistant_turn.tool_calls,
        })

        if not assistant_turn.tool_calls:
            if not response_text:
                yield json.dumps({"type": "error", "text": "Model returned an empty response. It may not support tool use or the context was too large."}) + "\n"
            break

        # Dispatch each tool call asynchronously
        for tc in assistant_turn.tool_calls:
            name = tc["name"]
            args = tc["input"]
            tc_id = tc["id"]

            logger.debug(f"Tool call: {name} args={list(args.keys()) if isinstance(args, dict) else args}")
            yield json.dumps({"type": "tool_use", "name": name}) + "\n"

            result = await dispatch_tool(name, args, ctx)
            logger.debug(f"Tool result: {result[:120]}")

            messages.append({
                "role": "tool",
                "tool_call_id": tc_id,
                "name": name,
                "content": result,
            })

    seen = {fc.path: fc for fc in ctx.file_changes}

    # Prepare task and memory updates
    task_updates = ctx.task_updates
    memory_updates = {}
    for name, mem in ctx.memory_updates.items():
        if mem is None:
            memory_updates[name] = None  # deletion marker
        else:
            memory_updates[name] = mem

    yield json.dumps({
        "type": "done",
        "responseText": response_text,
        "fileChanges": [fc.model_dump() for fc in seen.values()],
        "taskUpdates": task_updates,
        "memoryUpdates": memory_updates,
    }) + "\n"
