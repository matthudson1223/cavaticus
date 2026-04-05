# Cavaticus

An AI-powered web editor. Bring your own LLM key (Claude, OpenAI, or Gemini), chat with an AI agent to build and modify websites in real time, and see changes reflected instantly in a live preview.

## Features

- **AI chat interface** — describe changes in natural language; the agent reads and rewrites your project files using tool use
- **Live preview** — iframe updates automatically as files change
- **CodeMirror editor** — syntax highlighting for HTML, CSS, and JavaScript with auto-save
- **Resizable workspace** — file tree, code/preview panel, and chat panel in a three-column split layout
- **BYOK** — API keys for Claude, OpenAI, and Gemini stored encrypted (AES-256-GCM) in the database
- **Multi-provider** — switch between Claude Opus 4.6, GPT-4o, and Gemini 2.0 Flash
- **Session auth** — cookie-based sessions, no JWTs

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 6, TanStack Router, TanStack Query, Zustand, CodeMirror 6, Tailwind CSS 4, Socket.IO client |
| Backend | Fastify 5, TypeScript, Drizzle ORM, PostgreSQL, Socket.IO |
| Agent sidecar | Python 3.12, FastAPI, Anthropic / OpenAI / Google GenAI SDKs |
| Infrastructure | Railway, pnpm monorepo, Turborepo |

## Project structure

```
cavaticus/
├── apps/
│   ├── api/          # Fastify API server
│   ├── agent/        # Python FastAPI agent sidecar
│   └── web/          # React frontend
├── packages/
│   └── shared/       # Shared TypeScript types and WebSocket event enums
├── .env.example
├── railway.toml
└── turbo.json
```

## Getting started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Python 3.12+
- PostgreSQL (or a Railway/Supabase connection string)

### Install

```bash
pnpm install
```

### Environment variables

Copy `.env.example` to `.env` in `apps/api/`:

```bash
cp .env.example apps/api/.env
```

Edit the values:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Random 32+ byte string (`openssl rand -hex 32`) |
| `ENCRYPTION_KEY` | Exactly 64 hex chars / 32 bytes (`openssl rand -hex 32`) |
| `AGENT_SERVICE_URL` | URL of the Python agent, default `http://localhost:8000` |
| `VITE_API_URL` | Public URL of the API (used by the frontend in production) |

### Database

```bash
pnpm --filter @cavaticus/api db:push
```

### Run locally

Start all services in parallel:

```bash
# Terminal 1 — API
pnpm --filter @cavaticus/api dev

# Terminal 2 — Web
pnpm --filter @cavaticus/web dev

# Terminal 3 — Agent
cd apps/agent
pip install -e .
uvicorn src.main:app --reload --port 8000
```

Or with Turborepo (starts all three):

```bash
pnpm dev
```

The frontend will be at `http://localhost:5173`. The API runs on `:8080` and the agent on `:8000`.

### Build

```bash
pnpm turbo build
```

## Deployment (Railway)

1. Push this repo to GitHub.
2. Create a new Railway project and link the repo.
3. Railway will detect the `railway.toml` and provision three services: `web`, `api`, and `agent`.
4. Add a PostgreSQL and Redis plugin to the project — Railway injects `DATABASE_URL` and `REDIS_URL` automatically.
5. Set the remaining environment variables (`SESSION_SECRET`, `ENCRYPTION_KEY`, `AGENT_SERVICE_URL`, `VITE_API_URL`) in the Railway dashboard.
6. Deploy.

## How the agent loop works

1. User sends a message via WebSocket (`chat:send`).
2. The API decrypts the user's stored API key, loads the project's files and recent chat history, and POSTs to the Python agent sidecar.
3. The agent runs a tool-use loop: it can call `read_file`, `write_file`, `edit_file`, and `list_files` against an in-memory copy of the project.
4. Text chunks stream back to the API, which forwards them to the browser via `chat:chunk`.
5. On completion, file changes are persisted to PostgreSQL and `file:changed` events are emitted to the client, updating the editor and preview in real time.

## Adding a provider

1. Implement `run_<provider>(request: AgentRequest) -> AsyncGenerator[str, None]` in `apps/agent/src/providers/`.
2. Dispatch it in `apps/agent/src/routers/agent.py`.
3. Add the provider ID to the `ApiKeyProvider` union in `packages/shared/src/types.ts`.
4. Add a UI entry in `apps/web/src/routes/settings.tsx`.
