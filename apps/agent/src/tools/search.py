"""Search tool — regex search across all in-memory project files."""

from __future__ import annotations

import fnmatch
import re

from .context import ToolContext
from .registry import ToolDef, ToolParam, registry


async def handle_search_files(
    ctx: ToolContext, pattern: str, file_glob: str = ""
) -> str:
    try:
        regex = re.compile(pattern, re.IGNORECASE)
    except re.error as e:
        return f"Error: invalid regex pattern: {e}"

    results: list[str] = []
    for path in sorted(ctx.fs.keys()):
        if file_glob and not fnmatch.fnmatch(path, file_glob):
            continue
        for i, line in enumerate(ctx.fs[path].splitlines(), 1):
            if regex.search(line):
                results.append(f"{path}:{i}: {line.strip()}")
                if len(results) >= 100:
                    results.append("[Truncated — first 100 matches shown]")
                    return "\n".join(results)

    return "\n".join(results) if results else "No matches found."


registry.register(ToolDef(
    name="search_files",
    description=(
        "Search for a regex pattern across all project files. "
        "Returns matching lines with file path and line number."
    ),
    params=[
        ToolParam(name="pattern", type="string", description="Regex pattern to search for"),
        ToolParam(
            name="file_glob",
            type="string",
            description="Optional glob pattern to filter files (e.g. '*.css', '*.js')",
            required=False,
        ),
    ],
    handler=handle_search_files,
))
