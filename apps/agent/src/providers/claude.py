import json
from typing import AsyncGenerator
import anthropic
from ..models import AgentRequest, FileChange

SYSTEM_PROMPT = """You are an AI web developer assistant. The user is building a website.
You have access to the following project files:
{file_tree}

Use the provided tools to read and modify files. Make targeted edits.
Always explain what you changed and why."""

TOOLS = [
    {
        "name": "read_file",
        "description": "Read the content of a file in the project.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path to read"}
            },
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": "Create or overwrite a file in the project.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "content": {"type": "string"},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "edit_file",
        "description": "Replace a specific substring in a file with new content.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "old_string": {"type": "string"},
                "new_string": {"type": "string"},
            },
            "required": ["path", "old_string", "new_string"],
        },
    },
    {
        "name": "list_files",
        "description": "List all files in the project.",
        "input_schema": {"type": "object", "properties": {}},
    },
]


async def run_claude(request: AgentRequest) -> AsyncGenerator[str, None]:
    client = anthropic.Anthropic(api_key=request.apiKey)

    # Build in-memory file system
    fs: dict[str, str] = {f.path: f.content for f in request.projectFiles}
    file_changes: list[FileChange] = []

    file_tree = "\n".join(f"  - {path}" for path in sorted(fs.keys()))
    system = SYSTEM_PROMPT.format(file_tree=file_tree)

    # Build message history
    messages = []
    for turn in request.chatHistory[-20:]:  # last 20 turns
        messages.append({"role": turn.role, "content": turn.content})

    # Build the new user message (with optional image attachments)
    if request.attachments:
        content: list = []
        for att in request.attachments:
            content.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": att.mimeType,
                        "data": att.data,
                    },
                }
            )
        content.append({"type": "text", "text": request.userMessage})
    else:
        content = request.userMessage  # type: ignore[assignment]

    messages.append({"role": "user", "content": content})

    response_text = ""

    # Agentic tool-use loop
    while True:
        response = client.messages.create(
            model="claude-opus-4-6",
            max_tokens=8096,
            system=system,
            messages=messages,
            tools=TOOLS,  # type: ignore[arg-type]
        )

        # Collect text from this turn
        for block in response.content:
            if block.type == "text":
                response_text += block.text
                yield json.dumps({"type": "chunk", "text": block.text}) + "\n"

        if response.stop_reason == "end_turn":
            break

        if response.stop_reason == "tool_use":
            tool_results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue
                tool_input = block.input  # type: ignore[attr-defined]
                name = block.name  # type: ignore[attr-defined]
                tool_use_id = block.id  # type: ignore[attr-defined]

                if name == "list_files":
                    result = "\n".join(sorted(fs.keys()))

                elif name == "read_file":
                    path = tool_input["path"]
                    result = fs.get(path, f"Error: file '{path}' not found")

                elif name == "write_file":
                    path = tool_input["path"]
                    new_content = tool_input["content"]
                    action = "modified" if path in fs else "created"
                    fs[path] = new_content
                    file_changes.append(
                        FileChange(path=path, action=action, content=new_content)
                    )
                    result = f"Wrote {len(new_content)} bytes to {path}"

                elif name == "edit_file":
                    path = tool_input["path"]
                    if path not in fs:
                        result = f"Error: file '{path}' not found"
                    else:
                        old = tool_input["old_string"]
                        new = tool_input["new_string"]
                        if old not in fs[path]:
                            result = f"Error: string not found in {path}"
                        else:
                            fs[path] = fs[path].replace(old, new, 1)
                            file_changes.append(
                                FileChange(
                                    path=path, action="modified", content=fs[path]
                                )
                            )
                            result = f"Edited {path}"
                else:
                    result = f"Unknown tool: {name}"

                tool_results.append(
                    {"type": "tool_result", "tool_use_id": tool_use_id, "content": result}
                )

            # Add assistant turn and tool results
            messages.append({"role": "assistant", "content": response.content})  # type: ignore[arg-type]
            messages.append({"role": "user", "content": tool_results})
        else:
            # Unexpected stop reason
            break

    # Deduplicate file changes — last write wins per path
    seen: dict[str, FileChange] = {}
    for fc in file_changes:
        seen[fc.path] = fc

    yield json.dumps(
        {
            "type": "done",
            "responseText": response_text,
            "fileChanges": [fc.model_dump() for fc in seen.values()],
        }
    ) + "\n"
