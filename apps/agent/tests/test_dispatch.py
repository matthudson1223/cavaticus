"""Tests for the tool dispatch function."""
import pytest
from src.tools.dispatch import dispatch_tool
from src.tools.context import ToolContext


def make_ctx(fs: dict[str, str] | None = None) -> ToolContext:
    fs = fs or {"index.html": "<html><body>Hello</body></html>"}
    return ToolContext(fs=fs, original_fs=dict(fs), project_id="test-project")


class TestDispatchTool:
    @pytest.mark.asyncio
    async def test_unknown_tool_returns_error_string(self):
        ctx = make_ctx()
        result = await dispatch_tool("nonexistent_tool", {}, ctx)
        assert "Unknown tool" in result

    @pytest.mark.asyncio
    async def test_read_file_returns_content(self):
        ctx = make_ctx({"index.html": "<html>test</html>"})
        result = await dispatch_tool("read_file", {"path": "index.html"}, ctx)
        assert "<html>test</html>" in result

    @pytest.mark.asyncio
    async def test_read_file_not_found(self):
        ctx = make_ctx({"index.html": ""})
        result = await dispatch_tool("read_file", {"path": "missing.html"}, ctx)
        assert "not found" in result.lower() or "error" in result.lower()

    @pytest.mark.asyncio
    async def test_list_files_returns_file_paths(self):
        ctx = make_ctx({
            "index.html": "<html/>",
            "styles.css": "body {}",
        })
        result = await dispatch_tool("list_files", {}, ctx)
        assert "index.html" in result
        assert "styles.css" in result

    @pytest.mark.asyncio
    async def test_write_file_updates_context(self):
        ctx = make_ctx({"index.html": "<html/>"})
        result = await dispatch_tool(
            "write_file",
            {"path": "new_file.txt", "content": "hello world"},
            ctx,
        )
        assert "new_file.txt" in ctx.fs
        assert ctx.fs["new_file.txt"] == "hello world"
