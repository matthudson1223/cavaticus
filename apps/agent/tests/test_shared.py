"""Tests for shared helpers used by all providers."""
import pytest
from src.providers.shared import build_file_tree, shell_tools_excluded, SYSTEM_PROMPT


class TestBuildFileTree:
    def test_empty_filesystem(self):
        assert build_file_tree({}) == ""

    def test_single_file(self):
        result = build_file_tree({"index.html": "<html/>"})
        assert "index.html" in result

    def test_multiple_files_sorted(self):
        fs = {
            "styles.css": "body {}",
            "index.html": "<html/>",
            "app.js": "console.log()",
        }
        result = build_file_tree(fs)
        lines = result.strip().split("\n")
        paths = [line.strip().lstrip("- ") for line in lines]
        assert paths == sorted(paths), "Files should be listed in sorted order"

    def test_file_prefix_format(self):
        result = build_file_tree({"index.html": ""})
        assert result.startswith("  - ")


class TestShellToolsExcluded:
    def test_excludes_shell_tools_when_no_package_json(self):
        fs = {"index.html": "<html/>", "styles.css": "body {}"}
        excluded = shell_tools_excluded(fs)
        assert "run_command" in excluded
        assert "run_tests" in excluded
        assert "lint_files" in excluded
        assert "type_check" in excluded

    def test_includes_all_tools_when_package_json_present(self):
        fs = {"package.json": "{}", "index.js": ""}
        excluded = shell_tools_excluded(fs)
        assert len(excluded) == 0

    def test_empty_fs_excludes_shell_tools(self):
        excluded = shell_tools_excluded({})
        assert len(excluded) > 0


class TestSystemPrompt:
    def test_system_prompt_has_file_tree_placeholder(self):
        assert "{file_tree}" in SYSTEM_PROMPT

    def test_system_prompt_formats_correctly(self):
        fs = {"index.html": ""}
        file_tree = build_file_tree(fs)
        formatted = SYSTEM_PROMPT.format(file_tree=file_tree)
        assert "index.html" in formatted
        assert "{file_tree}" not in formatted
