# Cavaticus — Agent Enhancements

## Overview

Two major additions to the Python agent sidecar (`apps/agent/`):

1. **21 new agent tools** — the agent can now search code, run tests, lint, diff, audit accessibility, and more
2. **10+ model providers** — expanded from 4 providers to support DeepSeek, Kimi, Qwen, Zhipu, Ollama (local), LM Studio (local), and any custom OpenAI-compatible endpoint

---

## 1. Tool Registry Refactor

**Problem:** The original 5 tools (`read_file`, `write_file`, `edit_file`, `list_files`, `fetch_url`) were copy-pasted across all 4 provider files with duplicated schemas and dispatch logic.

**Solution:** A shared tool registry that defines each tool once and adapts schemas per provider.

### New files

| File | Purpose |
|------|---------|
| `apps/agent/src/tools/registry.py` | `ToolDef` / `ToolParam` dataclasses + `ToolRegistry` with schema adapters (`to_anthropic()`, `to_openai()`, `to_gemini()`) |
| `apps/agent/src/tools/context.py` | `ToolContext` — mutable state shared across all tool calls in one agent run (`fs`, `original_fs`, `file_changes`, `project_id`) |
| `apps/agent/src/tools/dispatch.py` | `dispatch_tool(name, args, ctx)` — single dispatch function replacing all if/elif chains |
| `apps/agent/src/tools/filesystem.py` | `read_file`, `write_file`, `edit_file`, `list_files` extracted from providers and registered |
| `apps/agent/src/providers/shared.py` | Shared `SYSTEM_PROMPT` and `build_file_tree()` extracted from all 4 provider files |

### Modified files

- `apps/agent/src/tools/web.py` — `fetch_url` now registered in the registry
- `apps/agent/src/tools/__init__.py` — imports all tool modules (triggers registration), re-exports `registry`, `dispatch_tool`, `ToolContext`
- `apps/agent/src/providers/claude.py` — replaced 80 lines of tool defs + dispatch with `registry.to_anthropic()` + `dispatch_tool()`
- `apps/agent/src/providers/openai.py` — same, uses `registry.to_openai()`
- `apps/agent/src/providers/gemini.py` — same, uses `registry.to_gemini()`
- `apps/agent/src/providers/openrouter.py` — same, uses `registry.to_openai()`
- `apps/agent/src/models.py` — added `projectId: str`, `model: str`, `customBaseUrl: str` to `AgentRequest`; loosened `provider` from `Literal` to `str`

All 4 providers also now emit `{"type": "tool_use", "name": "..."}` NDJSON events before each tool call.

---

## 2. New Tools (21 total)

### In-memory tools — `apps/agent/src/tools/search.py` and `apps/agent/src/tools/analysis.py`

Operate purely on the in-memory filesystem (`ctx.fs`). No shell or network required.

| Tool | What it does |
|------|-------------|
| `search_files` | Regex search across all project files; returns `path:line: content` matches (capped at 100) |
| `list_directory` | List files under a path prefix with sizes and line counts |
| `get_file_stats` | File size, character count, line count, and type for a single file |
| `extract_imports` | Finds all `import`, `require()`, `<script src>`, `<link href>`, `@import` statements |
| `get_dependency_tree` | Parses `package.json` and returns `dependencies`, `devDependencies`, and `scripts` |
| `find_unused_code` | Cross-references CSS selectors and JS function names against HTML to find unused code (approximate) |
| `analyze_css` | Duplicate selectors, unused classes, color palette extraction, per-file stats |
| `check_syntax` | HTML tag balance (`html.parser`), CSS errors (`tinycss2`), JS bracket balance |
| `accessibility_audit` | Checks missing `alt`, unlabeled `<input>`, heading hierarchy, missing `lang`/`title`, empty links |

New dependency: `tinycss2>=1.3.0` (pure-Python CSS parser).

### Shell execution tools — `apps/agent/src/tools/sandbox.py` and `apps/agent/src/tools/shell.py`

Since project files live in PostgreSQL (not on disk), shell tools use a `Sandbox` context manager that materializes `ctx.fs` to a temp directory, runs the command, then cleans up.

**Allowed commands:** `npm`, `npx`, `node`, `git`, `eslint`, `prettier`, `tsc`

| Tool | What it does |
|------|-------------|
| `run_command` | Run any allowlisted command in the project directory |
| `run_tests` | `npm install` (if `package.json` present) then run test command (default: `npm test`) |
| `lint_files` | `npx eslint <paths> --format compact` |
| `type_check` | `npx tsc --noEmit --pretty` |
| `git_diff` | Pure-Python unified diff of `ctx.fs` vs `ctx.original_fs` (no sandbox needed) |
| `git_commit` | Records a named snapshot; returns summary of changed files |
| `analyze_performance` | File sizes by type, total size, largest files, minification suggestions (no sandbox needed) |

---

## 3. Multi-Provider Expansion

**Source:** Adapted from [clawspring](https://github.com/chauncygu/collection-claude-code-source-code) — a Python Claude Code reimplementation.

### New files

| File | Purpose |
|------|---------|
| `apps/agent/src/providers/clawspring_providers.py` | Provider registry, streaming backends, message format converters (copied from clawspring) |
| `apps/agent/src/providers/unified.py` | Async wrapper — drives the tool loop using `clawspring_providers.stream()` for any model |
| `apps/agent/src/routers/providers.py` | `GET /providers` endpoint — returns all supported providers and their model lists; probes Ollama for locally installed models |

### Supported providers (was 4, now 10+)

| Provider | Models | Key required |
|----------|--------|-------------|
| Anthropic | claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5, … | Yes |
| OpenAI | gpt-4o, gpt-4o-mini, gpt-4.1, o3-mini, … | Yes |
| Gemini | gemini-2.5-pro, gemini-2.0-flash, gemini-1.5-pro, … | Yes |
| OpenRouter | Any model on openrouter.ai | Yes |
| **DeepSeek** | deepseek-chat, deepseek-coder, deepseek-reasoner | Yes |
| **Kimi (Moonshot)** | moonshot-v1-8k/32k/128k, kimi-latest | Yes |
| **Qwen (Alibaba)** | qwen-max, qwen-plus, qwq-32b, qwen2.5-coder-32b, … | Yes |
| **Zhipu GLM** | glm-4-plus, glm-4, glm-4-flash, … | Yes |
| **Ollama** | llama3.3, phi4, mistral, deepseek-r1, gemma3, … | No (local) |
| **LM Studio** | Any loaded model | No (local) |
| **Custom** | Any OpenAI-compatible endpoint via `CUSTOM_BASE_URL` | Optional |

### How routing works

When a `model` string is included in the agent request, the router sends it to `run_unified` regardless of the `provider` field. Provider is auto-detected from the model name prefix:

```
"claude-opus-4-6"   → anthropic
"gpt-4o"            → openai
"deepseek-chat"     → deepseek
"ollama/llama3.3"   → ollama   (no API key needed)
"custom/my-model"   → custom   (reads CUSTOM_BASE_URL)
```

Old provider-specific paths (`run_claude`, `run_openai`, etc.) remain as fallback when no `model` string is provided.

> **Note:** Text chunks are buffered per LLM turn due to the sync→async boundary in `asyncio.to_thread()`. True per-token streaming within a turn can be added later with an `asyncio.Queue` bridge.

---

## 4. API & Frontend Changes

### `apps/api/src/ws/handler.ts`
- Auto-detects provider from `modelId` sent by the frontend (`detectProviderFromModel()`)
- Looks up API key for the detected provider (falls back to saved default)
- Local providers (Ollama, LM Studio) skip key lookup entirely
- Passes `model`, `projectId` through to the agent request

### `apps/api/src/routes/settings.ts`
- `PUT /api/v1/settings/api-keys` now accepts any provider string (was restricted to 4 hardcoded values)
- `defaultProvider` field likewise accepts any string

### `packages/shared/src/types.ts`
- `ApiKeyProvider` union extended with `'unified'`
- `AgentRequest` interface gains `projectId?`, `model?`, `customBaseUrl?`

### `apps/web/src/routes/settings.tsx`
- API Keys section expanded with DeepSeek, Kimi, Qwen, Zhipu rows
- "OpenRouter Models" renamed to "Saved Models" and shown unconditionally
- Model input placeholder updated to show examples for all provider types
- "Local Models" info section added explaining Ollama/LM Studio usage
- Default Provider dropdown includes Ollama and LM Studio options
