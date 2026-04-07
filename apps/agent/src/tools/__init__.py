"""Agent tools — importing modules triggers registry.register() calls."""

from . import filesystem, web, search, analysis, shell  # noqa: F401  — registration side-effects
from .registry import registry
from .dispatch import dispatch_tool
from .context import ToolContext

__all__ = ["registry", "dispatch_tool", "ToolContext"]
