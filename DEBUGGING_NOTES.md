# WebSocket and Agent Response Issues - Debugging Summary

## Problem Statement

The Cavaticus application has two interconnected issues preventing the chat feature from functioning:

1. **WebSocket Connection Failures** - Socket.IO connections were not establishing
2. **Agent Non-Response** - Even when messages reach the system, the agent service is not responding

## Issues Fixed

### 1. useSocket Hook Not Being Called

**Problem:** The `useSocket` hook was never being invoked in the `WorkspaceLayout` component, so the WebSocket connection was never initiated.

**Root Cause:** The hook was conditionally called inside an `if (project)` statement, violating React's Rules of Hooks (hooks must be called unconditionally in the same order every render).

**Error Message:** 
```
React has detected a change in the order of Hooks called by WorkspaceLayout
Cannot read properties of undefined (reading 'length')
```

**Fix Applied:** Changed from conditional to unconditional call using optional chaining:
```typescript
// Before (broken):
if (project) { useSocket(project.id); }

// After (fixed):
useSocket(project?.id);
```

**File:** `/home/ubuntu/cavaticus/apps/web/src/components/layout/WorkspaceLayout.tsx` (line 58)

---

### 2. Session Cookie Not Sent with WebSocket Upgrade

**Problem:** The `sessionId` cookie was being set by the login endpoint but wasn't being sent with the WebSocket upgrade request, causing authentication to fail at the socket.io middleware.

**Root Cause:** Cross-origin cookie issue - browsers don't send cookies from different ports/origins unless the `SameSite` cookie attribute is configured correctly. Since the web app runs on `localhost:5173` and the API on `localhost:8080`, they're different origins.

**Error Message:**
```
No sessionId found in cookies
Invalid or expired session
```

**Fix Applied:** Added `sameSite: false` for development environment (allows cookies to be sent across origins in dev):
```typescript
// File: /home/ubuntu/cavaticus/apps/api/src/index.ts (line 82-90)
await app.register(session, {
  secret: process.env['SESSION_SECRET'] ?? 'change-me-in-production-please',
  cookie: {
    secure: process.env['NODE_ENV'] === 'production',
    httpOnly: true,
    sameSite: process.env['NODE_ENV'] === 'production' ? 'strict' : false,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  },
  store: sessionStore,
});
```

---

### 3. Socket.IO Client Connecting to Wrong Origin

**Problem:** The socket.io client was initially configured to connect through a Vite proxy route, but the proxy configuration wasn't working correctly, and the client was trying to connect to `localhost:5173` instead of the API.

**Error Message:**
```
WebSocket connection to 'ws://localhost:5173/socket.io/?...' failed: 
WebSocket is closed before the connection is established
```

**Fix Applied:** Updated socket client to use `window.location.origin` (ensures same-origin connection) with the Vite proxy handling the routing:

```typescript
// File: /home/ubuntu/cavaticus/apps/web/src/lib/socket.ts
socket = io(window.location.origin, {
  path: '/socket.io',
  withCredentials: true,
  autoConnect: false,
});
```

This allows:
- Cookie sending (same-origin policy)
- Vite dev proxy at `/socket.io` to forward to `localhost:8080`
- Production to use relative path

---

## Current Status

### ✅ Working
- WebSocket connection now establishes successfully
- Session authentication passes
- Messages are created in the chat store
- No connection errors in browser console

### ❌ Not Working
- **Agent service is not responding to messages**
- Messages appear locally but agent doesn't generate responses
- Unknown which provider is being used or called
- Unknown if messages are reaching the agent service

---

## Next Steps for Debugging

### 1. Verify API Receives Messages
Enable debug logging and send a test message:
```bash
DEBUG=cavaticus pnpm dev
```

**Expected API logs:** Should see `[cavaticus:ws] CHAT_SEND:` debug lines

### 2. Check Provider Detection
The API should log which provider is being used:
```
Calling agent: provider=XXX, model=YYY
```

**File:** `/home/ubuntu/cavaticus/apps/api/src/ws/handler.ts` (line 250)

Provider detection logic:
```typescript
const detectedProvider = modelId ? detectProviderFromModel(modelId) : null;
const provider = detectedProvider
  ?? (settings?.defaultProvider as ApiKeyProvider | null)
  ?? 'claude';  // defaults to Claude if no provider set
```

### 3. Verify Agent Service Connection
- Check if Python agent at `http://localhost:8000` is running and healthy
- Verify API can reach agent service
- Check for API key configuration for the selected provider

### 4. Check Model Selection
The selected model in the UI is: `google/gemini-3-flash-preview`
- This should route to the Gemini provider or possibly OpenRouter (due to the `/` in the model ID)
- Verify corresponding API key is configured in Settings

---

## Related Files

| File | Purpose |
|------|---------|
| `apps/web/src/components/layout/WorkspaceLayout.tsx` | Calls useSocket hook |
| `apps/web/src/hooks/useSocket.ts` | Creates and manages WebSocket connection |
| `apps/web/src/lib/socket.ts` | Socket.IO client initialization |
| `apps/api/src/ws/handler.ts` | WebSocket event handler, provider detection, agent communication |
| `apps/api/src/index.ts` | Session configuration |
| `apps/api/src/services/agent.ts` | Communication with Python agent service |
| `apps/web/vite.config.ts` | Vite proxy configuration for `/socket.io` |

---

## Key Insights

1. **Cross-Origin Complexity:** The web app (port 5173) and API (port 8080) being different origins created several authentication and cookie-sharing issues.

2. **Hook Rules Matter:** React's hook rules aren't just guidelines—violating them causes subtle state management issues that cascade through the component tree.

3. **Provider Architecture:** The system supports multiple LLM providers (Claude, OpenAI, Gemini, OpenRouter, Ollama) with automatic detection based on model ID prefix or user's default setting.

4. **Session Store:** Uses in-memory session store (`MemoryStore` class) for development, suitable only for development—would need persistent store for production.
