"""Tool registry — define tools once, adapt schemas per provider."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable


@dataclass
class ToolParam:
    name: str
    type: str  # "string", "integer", "boolean", "number"
    description: str = ""
    required: bool = True


@dataclass
class ToolDef:
    name: str
    description: str
    params: list[ToolParam]
    handler: Callable[..., Awaitable[str]]


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, ToolDef] = {}

    def register(self, tool: ToolDef) -> None:
        self._tools[tool.name] = tool

    def get(self, name: str) -> ToolDef | None:
        return self._tools.get(name)

    def all(self) -> list[ToolDef]:
        return list(self._tools.values())

    # ------------------------------------------------------------------
    # Schema adapters
    # ------------------------------------------------------------------

    def to_anthropic(self, exclude: set[str] | None = None) -> list[dict[str, Any]]:
        """Anthropic format: {name, description, input_schema}.

        Pass exclude={'tool_name', ...} to omit tools not relevant to the project.
        Cache breakpoint is added to the last tool so Anthropic can cache the
        full system-prompt + tool-list block across turns.
        """
        result = []
        for t in self._tools.values():
            if exclude and t.name in exclude:
                continue
            props: dict[str, Any] = {}
            required: list[str] = []
            for p in t.params:
                props[p.name] = {"type": p.type}
                if p.description:
                    props[p.name]["description"] = p.description
                if p.required:
                    required.append(p.name)
            schema: dict[str, Any] = {"type": "object", "properties": props}
            if required:
                schema["required"] = required
            result.append({
                "name": t.name,
                "description": t.description,
                "input_schema": schema,
            })
        # Cache breakpoint on last tool — caches system prompt + entire tool list
        if result:
            result[-1]["cache_control"] = {"type": "ephemeral"}
        return result

    def to_openai(self, exclude: set[str] | None = None) -> list[dict[str, Any]]:
        """OpenAI / OpenRouter function-calling format."""
        result = []
        for t in self._tools.values():
            if exclude and t.name in exclude:
                continue
            props: dict[str, Any] = {}
            required: list[str] = []
            for p in t.params:
                props[p.name] = {"type": p.type}
                if p.description:
                    props[p.name]["description"] = p.description
                if p.required:
                    required.append(p.name)
            parameters: dict[str, Any] = {"type": "object", "properties": props}
            if required:
                parameters["required"] = required
            result.append({
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": parameters,
                },
            })
        return result

    def to_gemini(self) -> list:
        """Google GenAI types.Tool wrapping all FunctionDeclarations."""
        from google.genai import types

        type_map = {
            "string": "STRING",
            "integer": "INTEGER",
            "boolean": "BOOLEAN",
            "number": "NUMBER",
        }

        declarations = []
        for t in self._tools.values():
            props: dict[str, Any] = {}
            required: list[str] = []
            for p in t.params:
                schema_kwargs: dict[str, Any] = {"type": type_map.get(p.type, "STRING")}
                if p.description:
                    schema_kwargs["description"] = p.description
                props[p.name] = types.Schema(**schema_kwargs)
                if p.required:
                    required.append(p.name)
            declarations.append(
                types.FunctionDeclaration(
                    name=t.name,
                    description=t.description,
                    parameters=types.Schema(
                        type="OBJECT",
                        properties=props,
                        required=required or None,
                    ),
                )
            )
        return [types.Tool(function_declarations=declarations)]


registry = ToolRegistry()
