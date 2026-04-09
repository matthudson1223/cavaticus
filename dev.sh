#!/bin/bash

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Starting Cavaticus development environment...${NC}\n"

# Change to project root
cd "$(dirname "$0")"

# Function to cleanup process groups on exit
cleanup() {
  echo -e "\n${RED}Shutting down services...${NC}"
  # Kill entire process group to catch child processes (turbo, vite, fastify, uvicorn)
  kill -- -$PNPM_PID 2>/dev/null || true
  kill -- -$AGENT_PID 2>/dev/null || true
  wait 2>/dev/null || true
  echo -e "${GREEN}Services stopped.${NC}"
}

trap cleanup EXIT INT TERM

# Start pnpm dev (turbo runs web + api in parallel)
echo -e "${BLUE}Starting pnpm dev server...${NC}"
setsid pnpm run dev &
PNPM_PID=$!

# Start Python agent with venv
echo -e "${BLUE}Starting Python agent...${NC}"
setsid apps/agent/venv/bin/uvicorn src.main:app --reload --host 0.0.0.0 --port 8000 --app-dir apps/agent &
AGENT_PID=$!

echo -e "${GREEN}✓ pnpm dev running (PID: $PNPM_PID)${NC}"
echo -e "${GREEN}✓ Python agent running on http://0.0.0.0:8000 (PID: $AGENT_PID)${NC}\n"

# Wait for all background jobs
wait
