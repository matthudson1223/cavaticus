"""Skill templates — predefined prompts for common tasks."""

from __future__ import annotations

from dataclasses import dataclass, field
from .registry import ToolDef, ToolParam, registry


@dataclass
class SkillDef:
    """Skill definition with name, triggers, and system prompt."""
    name: str
    description: str
    triggers: list[str]  # e.g. ["/commit", "/commit-changes"]
    prompt: str          # The system prompt / instruction for this skill
    tools: list[str] | None = None   # Allowed tools (None = all)
    model: str | None = None          # Model override (None = default)


# ------------------------------------------------------------------
# Built-in Skills
# ------------------------------------------------------------------

BUILTIN_SKILLS = [
    SkillDef(
        name="commit",
        description="Stage changes, analyze, and create a git commit.",
        triggers=["/commit"],
        prompt="""You are helping the user commit code changes. Your task is to:
1. Review what files will be staged (use `git diff --cached`)
2. Analyze the changes for clarity and correctness
3. Write a clear, concise commit message (one line summary + optional details)
4. Execute `git commit -m "message"`

Important rules:
- NEVER use --no-verify or skip hooks
- NEVER commit changes containing secrets, passwords, or API keys
- Focus on the 'why' in the commit message, not just 'what'
- Keep commit messages under 72 characters for the summary line
- Use imperative mood: "Add feature" not "Added feature"
""",
        tools=["run_command", "git_diff"],
    ),

    SkillDef(
        name="review",
        description="Review code changes in a PR or git diff.",
        triggers=["/review", "/review-pr"],
        prompt="""You are a code reviewer. Your task is to:
1. Get the diff using `git diff` or `gh pr view <number>`
2. Analyze the code for:
   - Correctness and logic errors
   - Security vulnerabilities
   - Performance issues
   - Code style and consistency
   - Test coverage
3. Provide structured feedback

Format your review as:
## Summary
[1-2 sentence overview]

## Issues
[List any critical or high-priority issues]

## Suggestions
[Style, clarity, and minor improvements]

## Verdict
[Approved, request changes, or comment]
""",
        tools=["run_command", "read_file", "search_files"],
    ),

    SkillDef(
        name="refactor",
        description="Refactor code for clarity, maintainability, or performance.",
        triggers=["/refactor"],
        prompt="""You are a code refactoring assistant. Your task is to:
1. Identify what code needs refactoring (ask for file paths or read current context)
2. Suggest and implement improvements for:
   - Variable/function naming clarity
   - Reducing code duplication (DRY)
   - Simplifying complex logic
   - Better separation of concerns
   - Performance optimizations

3. Preserve all functionality — this is not about feature changes
4. Explain each refactoring change before making it

Use the edit_file tool to make changes, one logical change at a time.
""",
        tools=["read_file", "edit_file", "list_files"],
    ),
]


# ------------------------------------------------------------------
# Helper Functions
# ------------------------------------------------------------------

def find_skill(trigger: str) -> SkillDef | None:
    """Find a skill by trigger (e.g. '/commit') or name."""
    # Check triggers first
    for skill in BUILTIN_SKILLS:
        if trigger in skill.triggers or trigger == f"/{skill.name}":
            return skill
    # Check names
    for skill in BUILTIN_SKILLS:
        if trigger.lstrip("/") == skill.name:
            return skill
    return None


# ------------------------------------------------------------------
# Tool Registration
# ------------------------------------------------------------------

async def handle_skill_list(ctx) -> str:
    """List all available skills."""
    lines = ["## Available Skills\n"]
    for skill in BUILTIN_SKILLS:
        triggers = ", ".join(skill.triggers)
        lines.append(f"**{skill.name}** ({triggers})")
        lines.append(f"  {skill.description}\n")
    return "\n".join(lines)


registry.register(ToolDef(
    name="skill_list",
    description="List all available skills (templates for common tasks).",
    params=[],
    handler=handle_skill_list,
))
