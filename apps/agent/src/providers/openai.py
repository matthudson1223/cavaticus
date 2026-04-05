import json
from typing import AsyncGenerator
from openai import OpenAI
from ..models import AgentRequest, FileChange

SYSTEM_PROMPT = """You are an AI web developer assistant. The user is building a website.
You have access to the following project files:
{file_tree}

Use the provided tools to read and modify files. Make targeted edits.
Always explain what you changed and why."""

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read the content of a file.",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Create or overwrite a file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "edit_file",
            "description": "Replace a substring in a file.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "old_string": {"type": "string"},
                    "new_string": {"type": "string"},
                },
                "required": ["path", "old_string", "new_string"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_files",
            "description": "List all project files.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]


async def run_openai(request: AgentRequest) -> AsyncGenerator[str, None]:
    client = OpenAI(api_key=request.apiKey)
    fs: dict[str, str] = {f.path: f.content for f in request.projectFiles}
    file_changes: list[FileChange] = []

    file_tree = "\n".join(f"  - {p}" for p in sorted(fs.keys()))
    system = SYSTEM_PROMPT.format(file_tree=file_tree)

    messages: list = [{"role": "system", "content": system}]
    for turn in request.chatHistory[-20:]:
        messages.append({"role": turn.role, "content": turn.content})
    messages.append({"role": "user", "content": request.userMessage})

    response_text = ""

    while True:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=TOOLS,  # type: ignore[arg-type]
            tool_choice="auto",
        )
        msg = response.choices[0].message
        if msg.content:
            response_text += msg.content
            yield json.dumps({"type": "chunk", "text": msg.content}) + "\n"

        if not msg.tool_calls:
            break

        messages.append(msg)  # type: ignore[arg-type]

        for tc in msg.tool_calls:
            name = tc.function.name
            args = json.loads(tc.function.arguments)

            if name == "list_files":
                result = "\n".join(sorted(fs.keys()))
            elif name == "read_file":
                result = fs.get(args["path"], f"Error: file not found")
            elif name == "write_file":
                path, content = args["path"], args["content"]
                action = "modified" if path in fs else "created"
                fs[path] = content
                file_changes.append(FileChange(path=path, action=action, content=content))
                result = f"Wrote {path}"
            elif name == "edit_file":
                path = args["path"]
                if path not in fs:
                    result = "Error: file not found"
                else:
                    old, new = args["old_string"], args["new_string"]
                    if old not in fs[path]:
                        result = "Error: string not found"
                    else:
                        fs[path] = fs[path].replace(old, new, 1)
                        file_changes.append(
                            FileChange(path=path, action="modified", content=fs[path])
                        )
                        result = f"Edited {path}"
            else:
                result = f"Unknown tool: {name}"

            messages.append(
                {"role": "tool", "tool_call_id": tc.id, "content": result}
            )

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
