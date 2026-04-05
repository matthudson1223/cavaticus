import json
from typing import AsyncGenerator
from google import genai
from google.genai import types
from ..models import AgentRequest, FileChange

SYSTEM_PROMPT = """You are an AI web developer assistant. The user is building a website.
You have access to the following project files:
{file_tree}

Use the provided tools to read and modify files. Make targeted edits.
Always explain what you changed and why."""


def _make_tools(fs: dict[str, str]) -> list:
    def read_file(path: str) -> str:
        return fs.get(path, f"Error: file '{path}' not found")

    def list_files() -> str:
        return "\n".join(sorted(fs.keys()))

    return [read_file, list_files]


async def run_gemini(request: AgentRequest) -> AsyncGenerator[str, None]:
    client = genai.Client(api_key=request.apiKey)
    fs: dict[str, str] = {f.path: f.content for f in request.projectFiles}
    file_changes: list[FileChange] = []

    file_tree = "\n".join(f"  - {p}" for p in sorted(fs.keys()))
    system = SYSTEM_PROMPT.format(file_tree=file_tree)

    # Build conversation
    history = []
    for turn in request.chatHistory[-20:]:
        role = "user" if turn.role == "user" else "model"
        history.append(types.Content(role=role, parts=[types.Part(text=turn.content)]))

    response_text = ""

    # Gemini doesn't have a clean tool-use loop like Claude/OpenAI in the same way,
    # so we use a simplified single-call approach with function declarations
    write_file_decl = types.FunctionDeclaration(
        name="write_file",
        description="Create or overwrite a file.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "path": types.Schema(type="STRING"),
                "content": types.Schema(type="STRING"),
            },
            required=["path", "content"],
        ),
    )
    edit_file_decl = types.FunctionDeclaration(
        name="edit_file",
        description="Replace a substring in a file.",
        parameters=types.Schema(
            type="OBJECT",
            properties={
                "path": types.Schema(type="STRING"),
                "old_string": types.Schema(type="STRING"),
                "new_string": types.Schema(type="STRING"),
            },
            required=["path", "old_string", "new_string"],
        ),
    )

    tools = [types.Tool(function_declarations=[write_file_decl, edit_file_decl])]

    messages = history + [
        types.Content(role="user", parts=[types.Part(text=request.userMessage)])
    ]

    while True:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=messages,
            config=types.GenerateContentConfig(
                system_instruction=system,
                tools=tools,
            ),
        )

        candidate = response.candidates[0]  # type: ignore[index]
        text_parts = []
        func_calls = []

        for part in candidate.content.parts:
            if part.text:
                text_parts.append(part.text)
            if part.function_call:
                func_calls.append(part.function_call)

        if text_parts:
            chunk = "".join(text_parts)
            response_text += chunk
            yield json.dumps({"type": "chunk", "text": chunk}) + "\n"

        if not func_calls:
            break

        # Execute tool calls
        tool_results = []
        messages.append(candidate.content)

        for fc in func_calls:
            name = fc.name
            args = dict(fc.args)

            if name == "write_file":
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

            tool_results.append(
                types.Part(
                    function_response=types.FunctionResponse(
                        name=name, response={"result": result}
                    )
                )
            )

        messages.append(types.Content(role="user", parts=tool_results))

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
