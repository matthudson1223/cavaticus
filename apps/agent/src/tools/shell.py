"""Shell execution tools — run commands, tests, linters, and version control ops."""

from __future__ import annotations

import difflib
import shlex

from .context import ToolContext
from .registry import ToolDef, ToolParam, registry
from .sandbox import ALLOWED_COMMANDS, Sandbox

_OUTPUT_LIMIT = 5000


def _truncate(text: str, limit: int = _OUTPUT_LIMIT) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n\n[Truncated — {len(text) - limit} more bytes]"


async def _npm_install(sb: Sandbox) -> None:
    """Install node_modules if package.json is present."""
    if "package.json" in sb._ctx.fs:
        await sb.run(
            ["npm", "install", "--no-audit", "--no-fund", "--prefer-offline"],
            timeout=120,
        )


# ------------------------------------------------------------------
# run_command
# ------------------------------------------------------------------

async def handle_run_command(ctx: ToolContext, command: str) -> str:
    try:
        parts = shlex.split(command)
    except ValueError as e:
        return f"Error parsing command: {e}"

    if not parts:
        return "Error: empty command"

    if parts[0] not in ALLOWED_COMMANDS:
        allowed = ", ".join(sorted(ALLOWED_COMMANDS))
        return f"Error: '{parts[0]}' is not allowed. Permitted commands: {allowed}"

    async with Sandbox(ctx) as sb:
        rc, stdout, stderr = await sb.run(parts)
        # For npm install, sync back package files
        if parts[:2] == ["npm", "install"]:
            await sb.sync_back()
        combined = stdout + ("\n" + stderr if stderr.strip() else "")
        return f"Exit {rc}:\n{_truncate(combined)}"


# ------------------------------------------------------------------
# run_tests
# ------------------------------------------------------------------

async def handle_run_tests(ctx: ToolContext, test_command: str = "npm test") -> str:
    try:
        parts = shlex.split(test_command)
    except ValueError as e:
        return f"Error parsing command: {e}"

    if not parts or parts[0] not in ALLOWED_COMMANDS:
        return f"Error: command not allowed. Must start with one of: {', '.join(sorted(ALLOWED_COMMANDS))}"

    async with Sandbox(ctx) as sb:
        await _npm_install(sb)
        rc, stdout, stderr = await sb.run(parts, timeout=60)
        combined = stdout + ("\n" + stderr if stderr.strip() else "")
        status = "PASSED" if rc == 0 else "FAILED"
        return f"Tests {status} (exit {rc}):\n{_truncate(combined)}"


# ------------------------------------------------------------------
# lint_files
# ------------------------------------------------------------------

async def handle_lint_files(ctx: ToolContext, paths: str = ".") -> str:
    async with Sandbox(ctx) as sb:
        await _npm_install(sb)
        rc, stdout, stderr = await sb.run(
            ["npx", "eslint", paths, "--format", "compact"], timeout=30
        )
        combined = stdout + ("\n" + stderr if stderr.strip() else "")
        status = "Clean" if rc == 0 else f"{rc} issue(s)"
        return f"ESLint ({status}):\n{_truncate(combined)}"


# ------------------------------------------------------------------
# type_check
# ------------------------------------------------------------------

async def handle_type_check(ctx: ToolContext) -> str:
    async with Sandbox(ctx) as sb:
        await _npm_install(sb)
        rc, stdout, stderr = await sb.run(
            ["npx", "tsc", "--noEmit", "--pretty"], timeout=30
        )
        combined = stdout + ("\n" + stderr if stderr.strip() else "")
        status = "No errors" if rc == 0 else "Type errors found"
        return f"TypeScript ({status}, exit {rc}):\n{_truncate(combined)}"


# ------------------------------------------------------------------
# git_diff  (no sandbox — pure difflib)
# ------------------------------------------------------------------

async def handle_git_diff(ctx: ToolContext) -> str:
    diffs: list[str] = []

    all_paths = sorted(set(ctx.fs.keys()) | set(ctx.original_fs.keys()))
    for path in all_paths:
        old = ctx.original_fs.get(path, "")
        new = ctx.fs.get(path, "")
        if old == new:
            continue
        diff = list(difflib.unified_diff(
            old.splitlines(keepends=True),
            new.splitlines(keepends=True),
            fromfile=f"a/{path}",
            tofile=f"b/{path}",
        ))
        if diff:
            diffs.extend(diff)

    if not diffs:
        return "No changes since session started."

    result = "".join(diffs)
    return _truncate(result)


# ------------------------------------------------------------------
# git_commit  (snapshot recording)
# ------------------------------------------------------------------

async def handle_git_commit(ctx: ToolContext, message: str) -> str:
    changed = [fc.path for fc in ctx.file_changes]
    if not changed:
        return "Nothing to commit — no file changes in this session."

    unique = sorted(set(changed))
    return (
        f"Snapshot recorded: '{message}'\n"
        f"Files ({len(unique)}):\n"
        + "\n".join(f"  {p}" for p in unique)
        + "\n\nNote: Changes are persisted automatically when your message completes."
    )


# ------------------------------------------------------------------
# analyze_performance  (in-memory, no sandbox)
# ------------------------------------------------------------------

async def handle_analyze_performance(ctx: ToolContext) -> str:
    if not ctx.fs:
        return "Project is empty."

    by_ext: dict[str, list[tuple[str, int]]] = {}
    total = 0

    for path, content in ctx.fs.items():
        size = len(content.encode())
        total += size
        ext = path.rsplit(".", 1)[-1].lower() if "." in path else "other"
        by_ext.setdefault(ext, []).append((path, size))

    lines = [
        f"Project size: {total:,} bytes ({len(ctx.fs)} files)\n",
        "By file type:",
    ]
    for ext in sorted(by_ext.keys()):
        files = by_ext[ext]
        ext_total = sum(s for _, s in files)
        lines.append(f"  .{ext}: {len(files)} file(s), {ext_total:,} bytes")

    lines.append("\nLargest files:")
    all_files = sorted(
        ((p, s) for files in by_ext.values() for p, s in files),
        key=lambda x: -x[1],
    )
    for path, size in all_files[:10]:
        lines.append(f"  {path}: {size:,} bytes")

    # Minification suggestion
    unminified_js = [
        p for p, _ in all_files
        if p.endswith(".js") and not p.endswith(".min.js")
    ]
    if unminified_js:
        lines.append(
            f"\nConsider minifying {len(unminified_js)} JS file(s) for production."
        )

    return "\n".join(lines)


# ------------------------------------------------------------------
# Registration
# ------------------------------------------------------------------

registry.register(ToolDef(
    name="run_command",
    description=(
        f"Run a shell command in the project directory. "
        f"Allowed commands: {', '.join(sorted(ALLOWED_COMMANDS))}."
    ),
    params=[
        ToolParam(name="command", type="string", description="Command to run (e.g. 'npm install', 'npx prettier --write .')"),
    ],
    handler=handle_run_command,
))

registry.register(ToolDef(
    name="run_tests",
    description="Execute the test suite and report results. Installs dependencies first if package.json exists.",
    params=[
        ToolParam(
            name="test_command",
            type="string",
            description="Test command to run (default: 'npm test')",
            required=False,
        ),
    ],
    handler=handle_run_tests,
))

registry.register(ToolDef(
    name="lint_files",
    description="Run ESLint on project files and report style/error issues.",
    params=[
        ToolParam(
            name="paths",
            type="string",
            description="Files or directories to lint (default: '.')",
            required=False,
        ),
    ],
    handler=handle_lint_files,
))

registry.register(ToolDef(
    name="type_check",
    description="Run TypeScript type checking (tsc --noEmit) and report type errors.",
    params=[],
    handler=handle_type_check,
))

registry.register(ToolDef(
    name="git_diff",
    description="Show what has changed since the start of this session (unified diff format).",
    params=[],
    handler=handle_git_diff,
))

registry.register(ToolDef(
    name="git_commit",
    description="Record a named snapshot of the current changes with a commit message.",
    params=[
        ToolParam(name="message", type="string", description="Commit message describing the changes"),
    ],
    handler=handle_git_commit,
))

registry.register(ToolDef(
    name="analyze_performance",
    description="Analyze project bundle: file sizes by type, total size, largest files, and optimization suggestions.",
    params=[],
    handler=handle_analyze_performance,
))
