# Cavaticus: Phase 1 Loose Ends + Phase 2 Plan

## Context

ARCHITECTURE.md marks Phase 1 as complete, but a thorough audit reveals significant gaps between documented and actual implementation. Several claimed-complete features are missing entirely (export, screenshot markup), security measures are unimplemented (WS auth, CSRF, CSP), and the architecture doc itself is inaccurate in places (claims JWT but uses Fastify sessions). Before moving to Phase 2, we need to close these gaps and update documentation to reflect reality.

---

## Part A: Phase 1 Loose Ends (10 items + docs fix)

### A1. Fix `requireAuth` middleware — security bug
**File:** `apps/api/src/middleware/auth.ts`
- Add `return` before `reply.status(401).send(...)` so the route handler doesn't execute after a 401
- One-line fix: `return reply.status(401).send({ error: 'Unauthorized' });`

### A2. Remove ghost tools from system prompt
**File:** `apps/agent/src/providers/shared.py`
- Delete the "Live Preview" line (line 30): `query_dom, get_console_logs, take_screenshot, test_responsive`
- These tools have no handlers — LLM calling them gets "Unknown tool" errors

### A3. Respect user's model selection in OpenAI/Gemini providers
**Files:**
- `apps/agent/src/providers/openai.py` — change `model="gpt-4o"` to `model=request.model or "gpt-4o"`
- `apps/agent/src/providers/gemini.py` — change `model="gemini-2.5-flash"` to `model=request.model or "gemini-2.5-flash"`

### A4. Add `taskUpdates`/`memoryUpdates` to non-unified provider done events
**Files:** `apps/agent/src/providers/claude.py`, `openai.py`, `gemini.py`, `openrouter.py`
- Add `"taskUpdates": [], "memoryUpdates": {}` to each provider's `done` JSON payload

### A5. WebSocket authentication
**File:** `apps/api/src/ws/handler.ts`, `apps/api/src/index.ts`
- Pass `app` (FastifyInstance) to `createSocketServer`
- Add `io.use()` middleware that parses the session cookie from `socket.request.headers.cookie`, decodes the session ID, and attaches `userId` to `socket.data`
- In `CHAT_SEND`, verify `socket.data.userId` owns the project before proceeding
- Reject unauthenticated connections

### A6. Load chat history from server on workspace entry
**New file:** `apps/api/src/routes/chat.ts`
- `GET /api/v1/projects/:projectId/chat` — returns last 50 messages ordered by `createdAt ASC`, with `requireAuth` + ownership check
- Register in `apps/api/src/index.ts`

**Modify:** `apps/web/src/routes/project.$id.tsx`
- Fetch chat history alongside project/files on mount
- Call `useChatStore.getState().setMessages(messages)` (or add a `setMessages` action)

**Modify:** `apps/web/src/stores/chatStore.ts`
- Add `setMessages` action if not present

### A7. Implement project export
**New file:** `apps/api/src/routes/export.ts`
- `POST /api/v1/projects/:id/export` with `requireAuth` + ownership check
- Query all project files, create ZIP via `archiver` (already installed), stream to response
- Set `Content-Disposition: attachment; filename="${project.name}.zip"`
- Register in `apps/api/src/index.ts`

**Modify:** `apps/web/src/components/layout/WorkspaceLayout.tsx` (or toolbar area)
- Add "Export" button that triggers download via blob URL

### A8. Add "New File" button to file tree
**File:** `apps/web/src/components/filetree/FileTree.tsx`
- Add a "+" button next to the "Files" header
- On click, show a filename input dialog (same pattern as rename dialog)
- On submit, POST to `/api/v1/projects/:id/files` (existing endpoint), then update project store

### A9. Apply editor font size setting
**File:** `apps/web/src/components/editor/CodeEditor.tsx`
- Use `useQuery({ queryKey: ['settings'] })` to read cached settings
- Replace hardcoded `fontSize: 14` with `settings?.editorFontSize ?? 14`

### A10. Add React error boundary
**New file:** `apps/web/src/components/ErrorBoundary.tsx`
- Class component that catches errors, shows fallback with error message + reload button

**Modify:** `apps/web/src/routes/__root.tsx`
- Wrap `<Outlet />` with `<ErrorBoundary>`

### A11. Update ARCHITECTURE.md to match reality
**File:** `ARCHITECTURE.md`
- Auth section: replace JWT references with Fastify session (httpOnly cookie)
- Remove `sessions` table from DB schema (not used)
- Remove Redis/BullMQ from current tech stack (move to Phase 2)
- Mark Screenshot Markup as "Phase 2" not complete
- Remove GitHub service from project structure (not yet built)
- Ensure export is listed once A7 is done

### Implementation order
1. A1 (requireAuth fix) — 2 min, security
2. A2 (ghost tools) — 5 min, prevents agent errors
3. A3 (model selection) — 5 min, UX fix
4. A4 (done event fields) — 10 min, robustness
5. A5 (WS auth) — 30 min, security
6. A6 (chat history) — 30 min, UX
7. A7 (export) — 45 min, missing feature
8. A8 (new file button) — 30 min, UX
9. A9 (font size) — 15 min, settings actually work
10. A10 (error boundary) — 20 min, resilience
11. A11 (docs) — 20 min, accuracy

---

## Part B: Phase 2 Detailed Plan

### Phase 2 Dependency Graph
```
Security Hardening ─────────┐
Testing Infrastructure ─────┤── Foundation (parallel)
Markdown in Chat ───────────┘
         │
Redis/BullMQ ───────────────┐
         │                   │
         ├── GitHub Integration
         │
         └── Real-time Collaboration (Yjs)

Template Gallery ───────────┐── Independent (parallel)
Component Library ──────────┘

Custom Domains ──────> SSL Auto-Provisioning
```

### 2.1 Security Hardening
- **CSRF:** `@fastify/csrf-protection` registered after session; frontend sends `X-CSRF-Token` header from `apps/web/src/lib/api.ts`
- **CSP/Headers:** `@fastify/helmet` with policy allowing same-origin scripts, inline styles (CodeMirror/GrapesJS need them)
- **Session store:** Move to Redis once 2.4 lands (replace in-memory with `connect-redis`)
- **Session rotation:** Regenerate session ID on login in `apps/api/src/routes/auth.ts`
- Files: `apps/api/src/index.ts`, `apps/web/src/lib/api.ts`, `apps/api/src/routes/auth.ts`

### 2.2 Testing Infrastructure
- **API (Jest + Supertest):** `apps/api/jest.config.ts`, `apps/api/src/__tests__/` — auth, projects, files, export
- **Agent (pytest):** `apps/agent/tests/` — tool dispatch, provider mocking, system prompt
- **E2E (Playwright):** `apps/web/e2e/` — register -> create project -> chat -> file change -> export
- **CI:** Add `test` task to `turbo.json`, scripts to each app's package.json

### 2.3 Markdown Rendering in Chat
- Install `react-markdown`, `remark-gfm`, `react-syntax-highlighter` in `apps/web`
- Replace plain-text rendering in `ChatPanel.tsx` MessageBubble for assistant messages with `<ReactMarkdown>` + code block syntax highlighting
- Style markdown elements for dark theme

### 2.4 Redis/BullMQ Infrastructure
- Add Redis service to `railway.toml`
- Create `apps/api/src/services/redis.ts` — Redis client singleton via `ioredis` (already installed)
- Switch `@fastify/session` to `connect-redis` store (package already installed)
- Create `apps/api/src/services/queue.ts` — BullMQ queues for `export-queue`, `github-queue`

### 2.5 GitHub Integration
- **OAuth:** `GET /api/v1/auth/github` + callback, store encrypted GitHub token
- **DB:** New `project_github` table (projectId, repoUrl, branch, lastCommitSha)
- **Service:** `apps/api/src/services/github.ts` using `octokit` — clone repo files into project, commit changes via Git Data API
- **UI:** GitHub panel in workspace toolbar — connect, commit & push, pull
- **Queue:** Git operations run via BullMQ job queue

### 2.6 Real-time Collaboration (Yjs/CRDT)
- Install `yjs`, `y-websocket`, `y-codemirror.next`
- **Server:** `apps/api/src/ws/yjs.ts` — Yjs WebSocket provider, loads file content from DB, persists Y.Doc state periodically
- **Client:** Replace CodeEditor's `onChange` with Yjs binding via `y-codemirror.next`
- **Awareness:** Show collaborator cursors/selections
- **Sharing:** New `project_collaborators` table + `apps/api/src/routes/collaborators.ts` + invite flow

### 2.7 Template Gallery
- New `templates` DB table (name, description, thumbnail_url, category, files as JSONB)
- Seed with 5-6 starter templates (landing page, portfolio, blog, etc.)
- `GET /api/v1/templates`, `POST /api/v1/projects/from-template/:templateId`
- Template selection cards in dashboard project creation flow

### 2.8 Component Library + Reusable Blocks
- New `blocks` DB table (userId nullable for system blocks, name, category, html, css)
- Seed system blocks (header, footer, hero, pricing, contact form)
- Load blocks into GrapesJS block manager via `apps/web/src/components/editor/GrapesEditor.tsx`
- "Save as Block" action from GrapesJS selection

### 2.9 Custom Domains + SSL
- New `custom_domains` DB table (projectId, domain, status, sslStatus)
- Domain verification flow (user adds domain -> API returns CNAME record -> background job checks DNS)
- Caddy reverse proxy with on-demand TLS, or leverage Railway's native custom domains
- Lightweight serving layer that maps domain -> project -> serve files

### Suggested Sprint Plan
| Sprint | Duration | Features |
|--------|----------|----------|
| 1 | 2 weeks | Security Hardening (2.1) + Testing (2.2) + Markdown Chat (2.3) |
| 2 | 2 weeks | Redis/BullMQ (2.4) + GitHub Integration (2.5) |
| 3 | 3 weeks | Real-time Collaboration (2.6) |
| 4 | 2 weeks | Template Gallery (2.7) + Component Library (2.8) |
| 5 | 2 weeks | Custom Domains + SSL (2.9) |

---

## Verification

### Part A verification
- **A1:** Write a test or manually call a protected route without session — should get 401 and handler should NOT execute
- **A2:** Start agent, send a chat message, verify LLM doesn't attempt `query_dom` etc.
- **A3:** Select a non-default OpenAI/Gemini model in settings, send chat, verify agent logs show correct model
- **A5:** Open browser devtools, attempt WS connection without valid session cookie — should be rejected
- **A6:** Send chat messages, reload page, verify messages persist in the UI
- **A7:** Create a project with files, click Export, verify ZIP downloads with correct contents
- **A8:** Click "+" in file tree, enter filename, verify file appears and is editable
- **A9:** Change font size in settings, verify CodeEditor updates
- **A10:** Intentionally throw in a component, verify error boundary catches it

### Part B verification
- Each sprint should include tests written as part of 2.2
- E2E Playwright tests for new workflows (GitHub connect, collaboration, template creation)
- Security audit after 2.1 (CSRF token validation, CSP headers in response)
- Load test collaboration with multiple concurrent Yjs clients
