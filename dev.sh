#!/bin/bash

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

set -e

echo -e "${BLUE}Starting Cavaticus development environment...${NC}\n"

# Change to project root
cd "$(dirname "$0")"

# Function to cleanup processes on exit
cleanup() {
  echo -e "\n${RED}Shutting down services...${NC}"
  jobs -p | xargs -r kill 2>/dev/null || true
  wait 2>/dev/null || true
  echo -e "${GREEN}Services stopped.${NC}"
}

trap cleanup EXIT INT TERM

# Start npm dev
echo -e "${BLUE}Starting npm dev server...${NC}"
npm run dev &
NPM_PID=$!

# Start Python agent with venv
echo -e "${BLUE}Starting Python agent...${NC}"
source apps/agent/venv/bin/activate
cd apps/agent
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000 &
AGENT_PID=$!
cd - > /dev/null

echo -e "${GREEN}✓ npm dev running (PID: $NPM_PID)${NC}"
echo -e "${GREEN}✓ Python agent running on http://0.0.0.0:8000 (PID: $AGENT_PID)${NC}\n"

# Wait for all background jobs
wait
