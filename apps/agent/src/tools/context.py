"""Shared mutable state passed to every tool handler during one agent run."""

from __future__ import annotations

from dataclasses import dataclass, field

from ..models import FileChange


@dataclass
class ToolContext:
    fs: dict[str, str]                          # mutable in-memory filesystem
    original_fs: dict[str, str]                 # immutable snapshot at construction (for git_diff)
    file_changes: list[FileChange] = field(default_factory=list)
    project_id: str = ""                        # needed by preview bridge tools
