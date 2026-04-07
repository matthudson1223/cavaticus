"""Memory tools — remember, recall, and search project context."""

from __future__ import annotations

import math
import time

from .context import ToolContext
from .registry import ToolDef, ToolParam, registry


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _score_memory(memory_entry: dict) -> float:
    """Score a memory by confidence with exponential age decay (30-day half-life)."""
    confidence = memory_entry.get("confidence", 1.0)
    age_seconds = time.time() - memory_entry.get("created_at", time.time())
    age_days = age_seconds / 86400
    # Exponential decay: e^(-age_days / 30)
    decay = math.exp(-age_days / 30)
    return confidence * decay


# ------------------------------------------------------------------
# Handlers
# ------------------------------------------------------------------

async def handle_remember(
    ctx: ToolContext,
    name: str,
    content: str,
    memory_type: str = "project",
    description: str = "",
) -> str:
    """Save or update a memory."""
    if not hasattr(ctx, "memory"):
        ctx.memory = {}
    if not hasattr(ctx, "memory_updates"):
        ctx.memory_updates = {}

    memory_entry = {
        "name": name,
        "content": content,
        "type": memory_type,
        "description": description,
        "confidence": 1.0,
        "created_at": time.time(),
    }

    ctx.memory[name] = memory_entry
    ctx.memory_updates[name] = memory_entry

    return f"Remembered: {name}"


async def handle_recall(ctx: ToolContext, name: str) -> str:
    """Retrieve a specific memory by name."""
    if not hasattr(ctx, "memory"):
        return f"No memory found: '{name}'"

    if name not in ctx.memory:
        return f"No memory found: '{name}'"

    entry = ctx.memory[name]
    return (
        f"Name:        {entry.get('name')}\n"
        f"Type:        {entry.get('type')}\n"
        f"Description: {entry.get('description', '(none)')}\n"
        f"Content:     {entry.get('content')}"
    )


async def handle_search_memory(ctx: ToolContext, query: str, max_results: int = 5) -> str:
    """Search memories by keyword."""
    if not hasattr(ctx, "memory") or not ctx.memory:
        return "No memories to search."

    # Case-insensitive substring match across name, description, content
    query_lower = query.lower()
    matches = []

    for name, entry in ctx.memory.items():
        score = _score_memory(entry)
        if (query_lower in name.lower() or
            query_lower in entry.get("description", "").lower() or
            query_lower in entry.get("content", "").lower()):
            matches.append((name, entry, score))

    if not matches:
        return f"No memories matching '{query}'"

    # Sort by score (confidence * decay) descending
    matches.sort(key=lambda x: x[2], reverse=True)
    matches = matches[:max_results]

    lines = []
    for name, entry, score in matches:
        description = entry.get("description", "")
        desc_preview = f" — {description[:50]}" if description else ""
        lines.append(f"• {name} [{entry.get('type')}]{desc_preview}")

    return "\n".join(lines)


async def handle_forget(ctx: ToolContext, name: str) -> str:
    """Delete a memory."""
    if not hasattr(ctx, "memory"):
        return f"No memory to forget: '{name}'"

    if name not in ctx.memory:
        return f"No memory to forget: '{name}'"

    del ctx.memory[name]

    # Mark as deleted in updates (if tracking)
    if not hasattr(ctx, "memory_updates"):
        ctx.memory_updates = {}

    # Store deletion marker (empty string = deleted)
    ctx.memory_updates[name] = None

    return f"Forgot: {name}"


async def handle_list_memories(ctx: ToolContext) -> str:
    """List all memories in the project."""
    if not hasattr(ctx, "memory") or not ctx.memory:
        return "No memories yet."

    lines = []
    for name, entry in sorted(ctx.memory.items()):
        mem_type = entry.get("type", "unknown")
        description = entry.get("description", "")
        desc_preview = f" — {description[:40]}" if description else ""
        lines.append(f"[{mem_type:12}] {name}{desc_preview}")

    return "\n".join(lines)


# ------------------------------------------------------------------
# Registration
# ------------------------------------------------------------------

registry.register(ToolDef(
    name="remember",
    description="Save or update a memory about the project or user.",
    params=[
        ToolParam(name="name", type="string", description="Memory name/key"),
        ToolParam(name="content", type="string", description="What to remember"),
        ToolParam(name="memory_type", type="string", description="Type: user/feedback/project/reference", required=False),
        ToolParam(name="description", type="string", description="Brief description of this memory", required=False),
    ],
    handler=handle_remember,
))

registry.register(ToolDef(
    name="recall",
    description="Retrieve a specific memory by name.",
    params=[
        ToolParam(name="name", type="string", description="Memory name to recall"),
    ],
    handler=handle_recall,
))

registry.register(ToolDef(
    name="search_memory",
    description="Search memories by keyword or phrase.",
    params=[
        ToolParam(name="query", type="string", description="Search query"),
        ToolParam(name="max_results", type="integer", description="Maximum number of results", required=False),
    ],
    handler=handle_search_memory,
))

registry.register(ToolDef(
    name="forget",
    description="Delete a memory.",
    params=[
        ToolParam(name="name", type="string", description="Memory name to delete"),
    ],
    handler=handle_forget,
))

registry.register(ToolDef(
    name="list_memories",
    description="List all memories in the project.",
    params=[],
    handler=handle_list_memories,
))
