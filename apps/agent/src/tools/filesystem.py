"""Filesystem tools — operate on the in-memory fs dict."""

from __future__ import annotations

from .context import ToolContext
from .registry import ToolDef, ToolParam, registry
from ..models import FileChange


# ------------------------------------------------------------------
# Handlers
# ------------------------------------------------------------------

async def handle_read_file(ctx: ToolContext, path: str) -> str:
    return ctx.fs.get(path, f"Error: file '{path}' not found")


async def handle_write_file(ctx: ToolContext, path: str, content: str) -> str:
    action = "modified" if path in ctx.fs else "created"
    ctx.fs[path] = content
    ctx.file_changes.append(FileChange(path=path, action=action, content=content))
    return f"Wrote {len(content)} bytes to {path}"


async def handle_edit_file(
    ctx: ToolContext, path: str, old_string: str, new_string: str
) -> str:
    if path not in ctx.fs:
        return f"Error: file '{path}' not found"
    if old_string not in ctx.fs[path]:
        return f"Error: string not found in {path}"
    ctx.fs[path] = ctx.fs[path].replace(old_string, new_string, 1)
    ctx.file_changes.append(
        FileChange(path=path, action="modified", content=ctx.fs[path])
    )
    return f"Edited {path}"


async def handle_list_files(ctx: ToolContext) -> str:
    return "\n".join(sorted(ctx.fs.keys()))


async def handle_list_directory(ctx: ToolContext, path: str = "") -> str:
    prefix = path.rstrip("/") + "/" if path else ""
    entries = []
    for fpath in sorted(ctx.fs.keys()):
        if prefix and not fpath.startswith(prefix):
            continue
        content = ctx.fs[fpath]
        size = len(content.encode())
        lines = content.count("\n") + 1
        entries.append(f"{fpath}  ({size:,} bytes, {lines} lines)")
    if not entries:
        return f"No files found under '{path}'" if path else "Project is empty."
    return "\n".join(entries)


async def handle_get_file_stats(ctx: ToolContext, path: str) -> str:
    content = ctx.fs.get(path)
    if content is None:
        return f"Error: file '{path}' not found"
    size = len(content.encode())
    lines = content.count("\n") + 1
    ext = path.rsplit(".", 1)[-1] if "." in path else "unknown"
    chars = len(content)
    return (
        f"Path:       {path}\n"
        f"Type:       {ext}\n"
        f"Size:       {size:,} bytes\n"
        f"Characters: {chars:,}\n"
        f"Lines:      {lines:,}"
    )


# ------------------------------------------------------------------
# Registration
# ------------------------------------------------------------------

registry.register(ToolDef(
    name="read_file",
    description="Read the content of a file in the project.",
    params=[ToolParam(name="path", type="string", description="File path to read")],
    handler=handle_read_file,
))

registry.register(ToolDef(
    name="write_file",
    description="Create or overwrite a file in the project.",
    params=[
        ToolParam(name="path", type="string", description="File path to write"),
        ToolParam(name="content", type="string", description="Full file content"),
    ],
    handler=handle_write_file,
))

registry.register(ToolDef(
    name="edit_file",
    description="Replace a specific substring in a file with new content.",
    params=[
        ToolParam(name="path", type="string", description="File path to edit"),
        ToolParam(name="old_string", type="string", description="Exact string to replace"),
        ToolParam(name="new_string", type="string", description="Replacement string"),
    ],
    handler=handle_edit_file,
))

registry.register(ToolDef(
    name="list_files",
    description="List all files in the project.",
    params=[],
    handler=handle_list_files,
))

registry.register(ToolDef(
    name="list_directory",
    description="List files under a directory path with sizes and line counts.",
    params=[
        ToolParam(
            name="path",
            type="string",
            description="Directory prefix to filter by (e.g. 'src'). Empty = all files.",
            required=False,
        )
    ],
    handler=handle_list_directory,
))

registry.register(ToolDef(
    name="get_file_stats",
    description="Get metadata for a file: size, line count, type.",
    params=[ToolParam(name="path", type="string", description="File path")],
    handler=handle_get_file_stats,
))
