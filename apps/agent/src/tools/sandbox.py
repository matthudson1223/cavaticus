"""Sandbox — materializes the in-memory fs to a temp directory for command execution."""

from __future__ import annotations

import asyncio
import atexit
import glob
import os
import shutil
import tempfile
from types import TracebackType

from .context import ToolContext
from ..models import FileChange

# Allowlist of binaries that may be executed in the sandbox
ALLOWED_COMMANDS = frozenset({
    "npm", "npx", "node", "git", "eslint", "prettier", "tsc",
})

# Cleanup temp dirs on process exit
_active_dirs: list[str] = []

@atexit.register
def _cleanup_on_exit() -> None:
    for d in _active_dirs:
        shutil.rmtree(d, ignore_errors=True)


class Sandbox:
    """Async context manager that materializes ctx.fs to a temp directory."""

    def __init__(self, ctx: ToolContext, timeout: int = 30) -> None:
        self._ctx = ctx
        self._timeout = timeout
        self._dir: str | None = None

    async def __aenter__(self) -> "Sandbox":
        self._dir = tempfile.mkdtemp(prefix="cavaticus_")
        _active_dirs.append(self._dir)

        # Write all files from ctx.fs to disk
        for path, content in self._ctx.fs.items():
            full = os.path.join(self._dir, path)
            os.makedirs(os.path.dirname(full), exist_ok=True)
            with open(full, "w", encoding="utf-8") as f:
                f.write(content)

        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: TracebackType | None,
    ) -> None:
        if self._dir:
            shutil.rmtree(self._dir, ignore_errors=True)
            try:
                _active_dirs.remove(self._dir)
            except ValueError:
                pass
            self._dir = None

    @property
    def cwd(self) -> str:
        if self._dir is None:
            raise RuntimeError("Sandbox is not active")
        return self._dir

    async def run(
        self, cmd: list[str], timeout: int | None = None
    ) -> tuple[int, str, str]:
        """Run a command in the sandbox directory.

        Returns:
            (returncode, stdout, stderr)
        """
        if not cmd or cmd[0] not in ALLOWED_COMMANDS:
            return 1, "", f"Command '{cmd[0] if cmd else ''}' is not allowed"

        t = timeout or self._timeout
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=self._dir,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={
                **os.environ,
                "NODE_NO_WARNINGS": "1",
                "CI": "true",  # suppresses interactive prompts
            },
        )
        try:
            stdout_b, stderr_b = await asyncio.wait_for(
                proc.communicate(), timeout=float(t)
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            return -1, "", f"Command timed out after {t}s"

        return (proc.returncode or 0), stdout_b.decode(errors="replace"), stderr_b.decode(errors="replace")

    async def sync_back(self, skip_dirs: tuple[str, ...] = ("node_modules", ".git")) -> None:
        """Read files changed on disk back into ctx.fs (skips large dirs)."""
        if self._dir is None:
            return

        for root, dirs, fnames in os.walk(self._dir):
            dirs[:] = [d for d in dirs if d not in skip_dirs]
            for fname in fnames:
                full = os.path.join(root, fname)
                relpath = os.path.relpath(full, self._dir)
                try:
                    with open(full, "r", encoding="utf-8", errors="replace") as f:
                        new_content = f.read()
                    if self._ctx.fs.get(relpath) != new_content:
                        action = "modified" if relpath in self._ctx.fs else "created"
                        self._ctx.fs[relpath] = new_content
                        self._ctx.file_changes.append(
                            FileChange(path=relpath, action=action, content=new_content)
                        )
                except (PermissionError, IsADirectoryError):
                    pass
