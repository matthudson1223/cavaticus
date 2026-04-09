"""Tests for the tool registry schema generation."""
import pytest
from src.tools import registry


class TestToolRegistry:
    def test_registry_has_tools_registered(self):
        tools = registry.all()
        assert len(tools) > 0, "Registry should have tools registered"

    def test_to_anthropic_schema_format(self):
        schemas = registry.to_anthropic()
        assert len(schemas) > 0

        for schema in schemas:
            assert "name" in schema
            assert "description" in schema
            assert "input_schema" in schema
            assert schema["input_schema"]["type"] == "object"
            assert "properties" in schema["input_schema"]

    def test_to_anthropic_cache_control_on_last_tool(self):
        schemas = registry.to_anthropic()
        assert len(schemas) > 0
        last = schemas[-1]
        assert "cache_control" in last
        assert last["cache_control"]["type"] == "ephemeral"
        # Only the last tool should have cache_control
        for schema in schemas[:-1]:
            assert "cache_control" not in schema

    def test_to_openai_schema_format(self):
        schemas = registry.to_openai()
        assert len(schemas) > 0

        for schema in schemas:
            assert schema["type"] == "function"
            assert "function" in schema
            fn = schema["function"]
            assert "name" in fn
            assert "description" in fn
            assert "parameters" in fn
            assert fn["parameters"]["type"] == "object"

    def test_exclude_filter_removes_tools(self):
        all_schemas = registry.to_anthropic()
        all_names = {s["name"] for s in all_schemas}

        if not all_names:
            pytest.skip("No tools registered")

        first_name = next(iter(all_names))
        filtered = registry.to_anthropic(exclude={first_name})
        filtered_names = {s["name"] for s in filtered}

        assert first_name not in filtered_names
        assert len(filtered) == len(all_schemas) - 1

    def test_get_returns_tool_by_name(self):
        tools = registry.all()
        if not tools:
            pytest.skip("No tools registered")

        first_tool = tools[0]
        found = registry.get(first_tool.name)
        assert found is not None
        assert found.name == first_tool.name

    def test_get_returns_none_for_unknown_tool(self):
        result = registry.get("nonexistent_tool_xyz")
        assert result is None
