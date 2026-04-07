# Cavaticus — AI-Powered Website Editor

## Context
Building a greenfield web-based website editor where users collaborate with AI agents to create and modify websites. Users control text, elements, and layout while AI handles code generation. Users bring their own LLM subscriptions (Claude, OpenAI, Gemini). Deployed on Railway.

## Tech Stack
- **Frontend**: React 19 + TypeScript, Vite 6, CodeMirror 6, GrapesJS (visual editor), Zustand, TanStack Query/Router, Tailwind CSS 4, Radix UI, Socket.IO client
- **Backend**: Fastify 5 + TypeScript, Drizzle ORM, PostgreSQL, Fastify sessions (httpOnly cookies), AES-256-GCM encryption for API keys
- **Agent Sidecar**: Python 3.12, FastAPI, anthropic/openai/google-genai SDKs, in-memory file tool execution
- **Infra**: Railway (web, api, agent, postgres services), pnpm monorepo with Turborepo

## Project Structure
```
cavaticus/
├── package.json, pnpm-workspace.yaml, turbo.json, railway.toml
├── apps/
│   ├── web/          # React frontend (Vite)
│   │   └── src/
│   │       ├── routes/          # dashboard, project workspace, settings, auth
│   │       ├── components/
│   │       │   ├── editor/      # CodeEditor (CodeMirror), VisualEditor (GrapesJS), EditorTabs
│   │       │   ├── chat/        # ChatPanel, ChatMessage, ChatInput
│   │       │   ├── filetree/    # FileTree, FileNode
│   │       │   ├── toolbar/     # Toolbar, ScreenshotButton, MarkupCanvas (Konva)
│   │       │   ├── preview/     # PreviewFrame (iframe)
│   │       │   └── layout/      # WorkspaceLayout (resizable panels), Sidebar
│   │       ├── stores/          # Zustand (project, chat, ui)
│   │       ├── hooks/           # useSocket, useAgent
│   │       └── lib/             # api client, socket singleton
│   ├── api/          # Fastify backend
│   │   └── src/
│   │       ├── db/              # Drizzle schema + migrations
│   │       ├── routes/          # auth, projects, files, settings, export, chat, tasks, memories
│   │       ├── ws/              # WebSocket handler + events (Socket.IO with session auth)
│   │       ├── services/        # crypto, agent client
│   │       └── middleware/      # auth (requireAuth)
│   └── agent/        # Python FastAPI sidecar
│       └── src/
│           ├── routers/agent.py # POST /run — LLM tool-use loop
│           ├── providers/       # claude.py, openai.py, gemini.py
│           ├── sandbox/         # in-memory file execution
│           └── models.py
└── packages/shared/  # shared TypeScript types + event enums
```

## Database Schema (Drizzle + PostgreSQL)
- **users**: id, email, password_hash, created_at
- **api_keys**: id, user_id FK, provider, encrypted_key, iv, auth_tag (AES-256-GCM)
- **projects**: id, user_id FK, name, description, timestamps
- **files**: id, project_id FK, path, content, mime_type, timestamps; UNIQUE(project_id, path)
- **chat_messages**: id, project_id FK, role (user|assistant|system), content, model, tokens, timestamps
- **tasks**: id, project_id FK, user_id FK, subject, description, status, activeForm, blocks, blockedBy, metadata, timestamps
- **memories**: id, user_id FK, project_id FK (optional), name, content, type, description, confidence, scope, timestamps

## Core Workflows

### 1. Authentication
- Signup/login with email + password
- Password hashed with bcrypt, salted
- Session ID issued on login, stored in httpOnly cookie via Fastify sessions
- Protected routes check session cookie via `requireAuth` middleware
- WebSocket connections authenticated via session cookie parsing in Socket.IO middleware

### 2. Project Creation
- User creates project (name, description)
- Backend generates `project_id` (uuid)
- Frontend creates empty `index.html` file in project
- User navigates to workspace

### 3. Chat → Agent Loop
```
Frontend (ChatPanel)
  └─ emit CHAT_SEND {projectId, content, attachments?, provider, model}
       └─ WebSocket → Backend (ws/handler.ts)
            └─ fetch project files
            └─ POST /agent/run {projectId, files, provider, model, messages}
                 └─ Python Agent (FastAPI)
                      └─ 1. system prompt: "You are a website editor. You have tools: read_file, write_file, edit_file, list_files, fetch_url."
                      └─ 2. add user message + previous chat history
                      └─ 3. call LLM (claude.py/openai.py/gemini.py selected by provider)
                      └─ 4. LLM responds with tool_calls or text
                      └─ 5a. if tool_calls: execute tools in sandbox, append results, loop to step 3
                      └─ 5b. if text: yield chunks back to backend
                           └─ Backend streams chunks to frontend via ws emit CHAT_CHUNK
                           └─ Frontend appends to chat history
                      └─ 6. on done: POST back metadata (tokens, model, provider)
                           └─ Backend stores in chat_messages table
                           └─ emit CHAT_DONE
```

### 4. File Operations
- User opens file in editor → `GET /api/projects/:id/files/:path`
- User edits + saves → `PATCH /api/projects/:id/files/:path` (optimistic lock: if-match etag)
- Agent writes file via tool → sandbox executes, backend verifies output, stores via Drizzle
- File changes broadcast to all clients via `FILE_CHANGED` event (WebSocket)

### 5. Visual Editor (GrapesJS)
- Loads project `index.html` in GrapesJS editor
- Drag/drop components → GrapesJS generates HTML/CSS
- On save: calls `PATCH /api/projects/:id/files/index.html`
- Agent can also modify HTML directly via `edit_file` tool

### 6. Screenshot Markup
- User clicks "Annotate" → screenshot page via html2canvas
- Canvas rendered in Konva.js overlay
- User draws boxes/lines with labels
- Save → stores as PNG attachment (Base64 in DB or object store)
- Attachment passed to agent in next message

### 7. Export
- User clicks "Export" → calls `POST /api/projects/:id/export`
- Backend zips all project files
- S3 presigned URL returned (or download directly)

## Key Design Decisions

### 1. Python Agent Sidecar
- Separate service (can scale independently)
- Provides vendor abstraction (anthropic/openai/google-genai all use same tool interface)
- In-memory sandbox (tools read/write files, no system exec)
- Streaming responses back to backend via HTTP long-poll or gRPC

### 2. API Key Encryption
- User provides API key in Settings
- AES-256-GCM encryption with random IV per key
- Key derivation from user's auth token (not stored separately)
- Decrypted only when calling agent service
- Never logged or exposed to frontend

### 3. Monorepo + Turborepo
- Shared types between frontend/backend in `packages/shared`
- Each app (web, api, agent) has independent `package.json`
- `turbo.json` defines build pipeline (install → build → test)
- Deployment: Turborepo builds all in parallel, Railway runs 3 services

### 4. WebSocket for Real-Time Chat
- Single persistent connection per user session
- All events typed via shared enums (`CHAT_SEND`, `CHAT_CHUNK`, `FILE_CHANGED`, etc.)
- Fallback to HTTP long-poll if WebSocket unavailable
- Auto-reconnect with exponential backoff

## Feature Roadmap (Future)

### Phase 1 (Current)
- ✅ Basic editor (code + visual)
- ✅ Chat with AI agent
- ✅ Multi-LLM support (Claude, OpenAI, Gemini)
- ✅ File management
- ✅ Project export
- ✅ Chat history persistence
- ✅ Task & memory management
- ✅ WebSocket authentication
- ✅ Font size settings

### Phase 2 (Planned)
- Security hardening (CSRF protection, CSP headers, Redis session store)
- Screenshot markup (Konva.js based)
- Real-time collaboration (CRDT-based, Yjs)
- GitHub integration (clone repo, auto-commit)
- Component library + reusable blocks
- Template gallery
- Custom domains
- SSL certificate auto-provisioning

### Phase 3 (Exploration)
- Visual AI training (teach agent your design system)
- Voice annotations
- Mobile app (React Native)
- Plugin system for custom tools
- WebAssembly sandbox (safer than in-memory)

## Deployment (Railway)

**Services:**
1. **web** (Node.js) — React build artifact + static server
2. **api** (Node.js) — Fastify backend
3. **agent** (Python) — FastAPI sidecar
4. **postgres** (PostgreSQL 15) — Drizzle migrations auto-run

**Environment Variables:**
- `DATABASE_URL` — PostgreSQL connection
- `SESSION_SECRET` — signing key for Fastify sessions
- `ENCRYPTION_KEY` — root key for API key encryption
- `OPENROUTER_API_KEY` (optional) — for openrouter/auto fallback
- `NODE_ENV` — 'development' or 'production' (affects session cookie security)

**Monitoring:**
- Railway logs aggregation (stderr captured)
- Metrics: request latency, error rate, active connections
- Alerts: deploy failures, service crashes, quota overages

## Development Setup

```bash
# Install dependencies
pnpm install

# Create .env (copy from .env.example)
cp .env.example .env

# Start dev servers (Vite, Fastify, FastAPI)
./dev.sh

# Frontend: http://localhost:3000
# API: http://localhost:3001
# Agent: http://localhost:8000
# Postgres: localhost:5432 (docker)
# Redis: localhost:6379 (docker)
```

**Hot reload:** Vite watches web/, Fastify watches api/, nodemon watches agent/. Changes auto-apply.

## Testing Strategy

- **Unit**: Jest (web, api) + pytest (agent)
- **Integration**: Supertest (api endpoints) + agent e2e (file operations)
- **E2E**: Playwright (full workflow: create project → edit → chat → export)
- **Load**: k6 (simulate concurrent users)

## Security Considerations

1. **SQL Injection** — Drizzle ORM (parameterized queries)
2. **XSS** — React sanitization, CSP headers
3. **CSRF** — SameSite cookies, CSRF token in forms
4. **API Key Exposure** — AES-256-GCM encryption at rest, TLS in transit
5. **Sandbox Escape** — In-memory file system (no system exec, no network)
6. **Supply Chain** — Lock dependencies (pnpm-lock.yaml), verify signatures

## Troubleshooting

**Agent hangs on tool execution:**
- Check logs: `railway logs --service agent`
- Verify files are readable/writable in sandbox
- Check API key validity for selected provider

**WebSocket disconnections:**
- Verify session cookie is present and valid
- Check network (firewall, proxy, CORS origin)
- Ensure Socket.IO middleware is not rejecting connections

**Chat history not loading:**
- Verify `GET /api/v1/projects/:id/chat` returns 200
- Check user owns the project (ownership check in endpoint)
- Clear browser cache and reload

**Database migrations fail:**
- Check `DATABASE_URL` format
- Verify PostgreSQL is running
- Run manually: `drizzle-kit push`

**Files not saving:**
- Check project `project_id` in URL
- Verify session cookie is valid
- Check disk space (Railway ephemeral storage limit)
