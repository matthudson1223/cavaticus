"""Task management tools — create, update, and track tasks."""

from __future__ import annotations

import json
from datetime import datetime

from .context import ToolContext
from .registry import ToolDef, ToolParam, registry


# ------------------------------------------------------------------
# Handlers
# ------------------------------------------------------------------

async def handle_create_task(
    ctx: ToolContext,
    subject: str,
    description: str = "",
    active_form: str = "",
) -> str:
    """Create a new task in the current project."""
    # Generate a simple ID: use current timestamp + small counter
    task_id = f"task_{int(datetime.now().timestamp() * 1000)}"

    task = {
        "id": task_id,
        "subject": subject,
        "description": description,
        "status": "pending",
        "activeForm": active_form,
        "blocks": [],
        "blockedBy": [],
        "metadata": {},
    }

    # Store in context
    if not hasattr(ctx, "tasks"):
        ctx.tasks = []
    if not hasattr(ctx, "task_updates"):
        ctx.task_updates = []

    ctx.tasks.append(task)
    ctx.task_updates.append(task)

    return f"Created task '{subject}' (ID: {task_id})"


async def handle_list_tasks(ctx: ToolContext) -> str:
    """List all tasks in the current project."""
    if not hasattr(ctx, "tasks") or not ctx.tasks:
        return "No tasks in this project."

    lines = []
    for task in ctx.tasks:
        status = task.get("status", "pending")
        subject = task.get("subject", "")
        task_id = task.get("id", "")

        # Filter out completed tasks from block dependencies display
        blocked_by = task.get("blockedBy", [])
        active_blockers = [
            bid for bid in blocked_by
            if any(t.get("id") == bid and t.get("status") != "completed"
                   for t in ctx.tasks)
        ]

        if active_blockers:
            lines.append(f"[{status:12}] {subject} (blocked by: {', '.join(active_blockers)})")
        else:
            lines.append(f"[{status:12}] {subject}")

    return "\n".join(lines) if lines else "No tasks."


async def handle_update_task(
    ctx: ToolContext,
    task_id: str,
    status: str | None = None,
    subject: str | None = None,
    description: str | None = None,
) -> str:
    """Update an existing task."""
    if not hasattr(ctx, "tasks"):
        ctx.tasks = []
    if not hasattr(ctx, "task_updates"):
        ctx.task_updates = []

    # Find task
    task = None
    for t in ctx.tasks:
        if t.get("id") == task_id:
            task = t
            break

    if not task:
        return f"Error: task '{task_id}' not found"

    # Update fields
    if status:
        task["status"] = status
    if subject:
        task["subject"] = subject
    if description is not None:
        task["description"] = description

    # Record update
    if task not in ctx.task_updates:
        ctx.task_updates.append(task)

    return f"Updated task '{task_id}'"


async def handle_get_task(ctx: ToolContext, task_id: str) -> str:
    """Get details of a specific task."""
    if not hasattr(ctx, "tasks"):
        return f"Error: task '{task_id}' not found"

    for task in ctx.tasks:
        if task.get("id") == task_id:
            # Format as readable text
            return (
                f"ID:          {task.get('id')}\n"
                f"Subject:     {task.get('subject')}\n"
                f"Description: {task.get('description', '(none)')}\n"
                f"Status:      {task.get('status')}\n"
                f"Active Form: {task.get('activeForm', '(none)')}\n"
                f"Blocks:      {', '.join(task.get('blocks', [])) or '(none)'}\n"
                f"Blocked By:  {', '.join(task.get('blockedBy', [])) or '(none)'}"
            )

    return f"Error: task '{task_id}' not found"


# ------------------------------------------------------------------
# Registration
# ------------------------------------------------------------------

registry.register(ToolDef(
    name="create_task",
    description="Create a new task to track work.",
    params=[
        ToolParam(name="subject", type="string", description="Task title"),
        ToolParam(name="description", type="string", description="Task description", required=False),
        ToolParam(name="active_form", type="string", description="Present-continuous form (e.g. 'Implementing dark mode')", required=False),
    ],
    handler=handle_create_task,
))

registry.register(ToolDef(
    name="list_tasks",
    description="List all tasks in the project.",
    params=[],
    handler=handle_list_tasks,
))

registry.register(ToolDef(
    name="update_task",
    description="Update task status, subject, or description.",
    params=[
        ToolParam(name="task_id", type="string", description="Task ID"),
        ToolParam(name="status", type="string", description="New status (pending/in_progress/completed/cancelled)", required=False),
        ToolParam(name="subject", type="string", description="New task subject", required=False),
        ToolParam(name="description", type="string", description="New description", required=False),
    ],
    handler=handle_update_task,
))

registry.register(ToolDef(
    name="get_task",
    description="Get details of a specific task.",
    params=[
        ToolParam(name="task_id", type="string", description="Task ID"),
    ],
    handler=handle_get_task,
))
