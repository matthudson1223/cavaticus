"""Single dispatch function — all providers call this instead of if/elif chains."""

from __future__ import annotations

from .context import ToolContext
from .registry import registry


async def dispatch_tool(name: str, args: dict, ctx: ToolContext) -> str:
    tool = registry.get(name)
    if tool is None:
        return f"Unknown tool: {name}"
    return await tool.handler(ctx=ctx, **args)
