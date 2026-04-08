# Railway Deployment Quick Reference

This is a quick reference for deploying and managing Cavaticus on Railway. For detailed information, see [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md).

## Generate Secrets

```bash
./scripts/railway-setup.sh
```

Generates and displays:
- `SESSION_SECRET` (32 bytes hex)
- `ENCRYPTION_KEY` (32 bytes hex)
- `POSTGRES_PASSWORD` (random base64)

## Deploy to Railway

```bash
# 1. Create project at railway.app (connect GitHub repo)
railway init

# 2. Create services (or via UI)
railway service add web
railway service add api
railway service add agent

# 3. Add Postgres database (via UI or CLI)
railway add postgres

# 4. Set environment variables (via UI):
# API: DATABASE_URL, SESSION_SECRET, ENCRYPTION_KEY, NODE_ENV, AGENT_SERVICE_URL
# Web: VITE_API_URL
# Postgres: POSTGRES_PASSWORD, POSTGRES_USER, POSTGRES_DB

# 5. Deploy
git push origin main
```

## Common Commands

### Logs
```bash
railway logs --service api --tail
railway logs --service agent --tail
railway logs --service web --tail
railway logs --service postgres --tail
```

### Database Operations
```bash
# Run migrations
railway run --service api -- npm run db:push

# Seed database
railway run --service api -- npm run db:seed

# Shell into service
railway shell --service api
```

### Deployment Info
```bash
# List services
railway service list

# View service details
railway service info --service api

# View environment variables
railway variables

# View deployments
railway logs --service api --deployment
```

## Environment Variables

### Required

| Service | Variable | Value |
|---------|----------|-------|
| API | `DATABASE_URL` | `postgresql://cavaticus:password@postgres.railway.internal:5432/cavaticus` |
| API | `SESSION_SECRET` | 32-byte hex string |
| API | `ENCRYPTION_KEY` | 32-byte hex string |
| API | `NODE_ENV` | `production` |
| API | `AGENT_SERVICE_URL` | `http://agent.railway.internal:8000` |
| Web | `VITE_API_URL` | `http://api.railway.internal:8080` |
| Postgres | `POSTGRES_PASSWORD` | Strong password |
| Postgres | `POSTGRES_USER` | `cavaticus` |
| Postgres | `POSTGRES_DB` | `cavaticus` |

### Optional

| Service | Variable | Purpose |
|---------|----------|---------|
| API | `OPENROUTER_API_KEY` | Fallback LLM routing |

## Troubleshooting

### Service won't deploy
```bash
# Check build logs
railway logs --service api --deployment

# Verify railway.toml syntax
cat railway.toml

# Check if dependencies are locked
ls pnpm-lock.yaml
```

### Database connection error
```bash
# Verify DATABASE_URL is set
railway variables | grep DATABASE_URL

# Test connection
railway run --service api -- psql $DATABASE_URL
```

### WebSocket connection issues
```bash
# Check session cookie
# Browser DevTools → Application → Cookies → session

# Verify CORS settings
# Check API logs for CORS errors
railway logs --service api --tail
```

### Agent service can't be reached
```bash
# Check agent is running
railway logs --service agent --tail

# Verify URL: should be http://agent.railway.internal:8000
# Check API's AGENT_SERVICE_URL
railway variables --service api | grep AGENT_SERVICE_URL
```

## Service Architecture

```
User Browser
     ↓
   Web Service (Vite) — PORT 3000
     ↓ (VITE_API_URL=http://api.railway.internal:8080)
   API Service (Fastify) — PORT 8080
     ├─→ Postgres (DATABASE_URL)
     └─→ Agent Service (AGENT_SERVICE_URL=http://agent.railway.internal:8000)
           ↓
         FastAPI — PORT 8000
```

## Monitoring

### Health Checks
- **Web**: `GET /` → HTML response
- **API**: `GET /health` → `{"status":"ok"}`
- **Agent**: `GET /docs` → FastAPI Swagger UI

### Metrics
- CPU/Memory usage
- Request/response times
- Error rates
- Active connections

Check in Railway Dashboard → Metrics

## Scaling

### Increase Replicas
```bash
railway service update --replicas 2
```

### Update Service
```bash
# Push to GitHub (auto-deploys)
git push origin main

# Or manually deploy
railway up
```

## Emergency Operations

### Reset Database
```bash
# WARNING: This deletes all data!
railway run --service postgres -- dropdb cavaticus
railway run --service postgres -- createdb cavaticus
railway run --service api -- npm run db:push
```

### Force Redeploy
```bash
railway service restart --service api
railway service restart --service agent
```

### View Recent Logs
```bash
# Last 50 lines
railway logs --service api --lines 50

# Stream live
railway logs --service api --tail
```

## Links

- [Railway Docs](https://docs.railway.app)
- [Project Dashboard](https://dashboard.railway.app)
- [API Health Check](https://your-api.railway.app/health)
- [Agent Docs](https://your-agent.railway.app/docs)

## Support

- Check [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md) for detailed guide
- Review service logs: `railway logs --service <name> --tail`
- Check Railway status: https://status.railway.app
