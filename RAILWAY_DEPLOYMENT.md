# Railway Deployment Guide

This guide covers deploying the complete Cavaticus platform (frontend, backend, Python agent, and database) to Railway.

## Prerequisites

- Railway account with active subscription
- `railway` CLI installed (`npm i -g @railway/cli`)
- Git repository connected to Railway
- Docker installed (for local testing)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Railway Project                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────┐ │
│  │   Web      │  │    API     │  │     Agent        │ │
│  │ (Vite)     │─→│  (Fastify) │─→│   (FastAPI)      │ │
│  └────────────┘  └────────────┘  └──────────────────┘ │
│        ↓              ↓                                  │
│        └──────────────┴──────────────────────┐         │
│                                               ↓         │
│                                         ┌──────────┐    │
│                                         │ Postgres │    │
│                                         │   (DB)   │    │
│                                         └──────────┘    │
└─────────────────────────────────────────────────────────┘
```

## Environment Variables

### Required Variables (Set in Railway UI)

#### API Service
- **`DATABASE_URL`** - Automatically provided when you link the Postgres service
  - Format: `postgresql://user:password@postgres.railway.internal:5432/cavaticus`
- **`SESSION_SECRET`** - Session signing key for Fastify
  - Generate: `openssl rand -hex 32`
  - Example: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`
- **`ENCRYPTION_KEY`** - AES-256-GCM encryption key for API keys
  - Generate: `openssl rand -hex 32`
  - Must be exactly 32 bytes (64 hex characters)
- **`NODE_ENV`** - Set to `production`
- **`AGENT_SERVICE_URL`** - Automatically set in railway.toml
  - Value: `http://agent.railway.internal:8000`

#### Web Service
- **`VITE_API_URL`** - Automatically set in railway.toml
  - Value: `http://api.railway.internal:8080`

#### Postgres Service (Database)
- **`POSTGRES_PASSWORD`** - Database password
  - Generate something strong: `openssl rand -base64 32`
- **`POSTGRES_USER`** - Set to `cavaticus` (defined in railway.toml)
- **`POSTGRES_DB`** - Set to `cavaticus` (defined in railway.toml)

### Optional Variables

- **`OPENROUTER_API_KEY`** - For fallback LLM routing (optional)

## Step-by-Step Deployment

### 1. Create Railway Project

```bash
# Clone the repository locally
git clone https://github.com/YOUR_ORG/cavaticus.git
cd cavaticus

# Login to Railway
railway login

# Initialize Railway project
railway init
# Follow prompts and select your GitHub repository
```

### 2. Create Postgres Service

In Railway Dashboard:
1. Go to your project
2. Click "New Service" → "Database" → "PostgreSQL"
3. Select PostgreSQL 15
4. Click "Create"

### 3. Set Up Services

Create services for web, api, and agent:

```bash
# From project root:
railway service add web
railway service add api
railway service add agent
```

Or via Railway Dashboard:
- Click "New Service" → "GitHub Repo"
- Select the cavaticus repo for each service

### 4. Configure Services

**Each service needs a name that matches `railway.toml`:**
- Web service → name: `web`
- API service → name: `api`
- Agent service → name: `agent`
- Database service → name: `postgres` (auto-named by Railway)

### 5. Set Environment Variables

Go to each service's settings and configure variables:

#### API Service Variables
```
DATABASE_URL          = [auto-linked from Postgres]
SESSION_SECRET        = [generate with: openssl rand -hex 32]
ENCRYPTION_KEY        = [generate with: openssl rand -hex 32]
NODE_ENV              = production
AGENT_SERVICE_URL     = http://agent.railway.internal:8000
```

#### Web Service Variables
```
VITE_API_URL          = http://api.railway.internal:8080
```

#### Postgres Service Variables
```
POSTGRES_PASSWORD     = [generate with: openssl rand -base64 32]
POSTGRES_USER         = cavaticus
POSTGRES_DB           = cavaticus
```

### 6. Link Postgres to API Service

1. Go to API service settings
2. Under "Variables", click "Add reference"
3. Select "Postgres" service
4. This auto-populates `DATABASE_URL`

### 7. Deploy

Push to your connected GitHub branch:

```bash
git add .
git commit -m "Railway deployment configuration"
git push origin main
```

Railway will automatically deploy all services. Check logs:

```bash
railway logs --service web
railway logs --service api
railway logs --service agent
railway logs --service postgres
```

### 8. Run Database Migrations

After first deploy, run migrations:

```bash
# SSH into API service and run migrations
railway run --service api -- npm run db:push
```

Or manually via Railway shell:
1. Go to API service
2. Click "Connect" → "Terminal"
3. Run: `npm run db:push`

## Post-Deployment

### Domain Setup

1. Railway auto-generates a domain for the web service (e.g., `cavaticus.up.railway.app`)
2. To use custom domain:
   - Go to Web service settings
   - Under "Domains", add custom domain
   - Update DNS records (CNAME pointing to Railway domain)

### WebSocket Configuration

The API service uses WebSocket (Socket.IO). Ensure:
- Web service can reach API service via internal network
- WebSocket upgrade is handled by Railway (automatic)
- Test in browser: check Network tab for WebSocket connections

### Health Checks

Railway automatically monitors health endpoints:
- **Web**: `GET /` (returns HTML)
- **API**: `GET /health` (returns `{ status: "ok" }`)
- **Agent**: `GET /docs` (FastAPI Swagger docs)

If health checks fail, the service will be marked unhealthy. Check logs:
```bash
railway logs --service api
```

### Monitoring

#### Logs
```bash
railway logs --service api --tail
railway logs --service agent --tail
railway logs --service postgres --tail
```

#### Metrics
In Railway Dashboard:
- CPU/Memory usage per service
- Network I/O
- Deployment history

## Troubleshooting

### "DATABASE_URL is not set"
**Solution**: Link Postgres service to API service in Railway UI
```bash
railway service link postgres
```

### "Connection refused: Agent service"
**Solution**: Verify `AGENT_SERVICE_URL` is correct
- Check agent service is running: `railway logs --service agent`
- Verify URL: `http://agent.railway.internal:8000` (internal network)

### WebSocket disconnections
**Solution**: Check session cookie and CORS
1. Verify `SESSION_SECRET` is set and consistent
2. Check browser console for WebSocket errors
3. Verify API is accessible from web service domain

### Database migrations failed
**Solution**: Manually run in service terminal
```bash
# Via Railway CLI
railway run --service api -- npm run db:push

# Or use Railway Dashboard terminal
cd apps/api
npm run db:push
```

### Services can't communicate
**Solution**: Use `.railway.internal` domains
- API → Agent: `http://agent.railway.internal:8000`
- API → Postgres: Automatic via `DATABASE_URL`
- Web → API: Via public domain or internal network

### Build failures
**Solution**: Check build logs
```bash
railway logs --service api --deployment
railway logs --service agent --deployment
```

Common issues:
- Missing environment variables at build time
- pnpm lock file out of sync: run `pnpm install` locally and commit
- Python dependencies: check `apps/agent/pyproject.toml`

## Security Checklist

- [ ] `SESSION_SECRET` is generated and unique
- [ ] `ENCRYPTION_KEY` is generated and unique
- [ ] Database password is strong (use `openssl rand -base64 32`)
- [ ] Environment variables are secrets (marked as secret in Railway UI)
- [ ] CORS headers are configured in API (check `@fastify/cors`)
- [ ] CSP headers are set (check `@fastify/helmet`)
- [ ] Database is not publicly accessible (Railway private network only)
- [ ] WebSocket uses secure connection in production (wss://)

## Advanced Configuration

### Auto-redeploy on Git Push
Railway automatically redeploys when you push to your connected branch. Disable by:
1. Service settings → Deployments
2. Uncheck "Autodeploy"

### Custom Build Commands
If you need to modify build/start commands, edit `railway.toml`:
```toml
[service.api]
buildCommand = "custom build command"
startCommand = "custom start command"
```

### Environment-Specific Configuration
Use Railway environments for staging/production:
1. Create new environment in project settings
2. Configure separate database for each environment
3. Deploy from different git branches

### Scaling
- Increase replicas: Service settings → "Replica Count"
- Auto-scaling: Use Railway's recommended settings
- Load balancing: Automatic across replicas

## Support & Resources

- [Railway Docs](https://docs.railway.app)
- [Fastify Documentation](https://www.fastify.io)
- [FastAPI Documentation](https://fastapi.tiangolo.com)
- [Drizzle ORM Docs](https://orm.drizzle.team)
