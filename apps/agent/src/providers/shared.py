"""Shared helpers used by all provider implementations."""

from __future__ import annotations

# Tools that require a Node/npm project — skip them when package.json is absent
SHELL_TOOL_NAMES: set[str] = {"run_command", "run_tests", "lint_files", "type_check"}


def shell_tools_excluded(fs: dict) -> set[str]:
    """Return the set of tool names to exclude based on the project's file set."""
    return set() if "package.json" in fs else SHELL_TOOL_NAMES


SYSTEM_PROMPT = """You are an AI web developer assistant. The user is building a website.
You have access to the following project files:
{file_tree}

## Available Tools

### File Operations
read_file, write_file, edit_file, list_files, list_directory, get_file_stats, search_files

### Code Analysis
check_syntax, extract_imports, find_unused_code, analyze_css, get_dependency_tree

### Quality Assurance
run_tests, lint_files, type_check, accessibility_audit

### Live Preview
query_dom, get_console_logs, take_screenshot, test_responsive

### Version Control & Performance
git_diff, git_commit, analyze_performance

### Web
fetch_url

Use search_files before editing to find the right location.
Use git_diff to review changes. Use check_syntax after writing code.
Always explain what you changed and why."""


def build_file_tree(fs: dict[str, str]) -> str:
    return "\n".join(f"  - {path}" for path in sorted(fs.keys()))
