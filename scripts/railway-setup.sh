#!/bin/bash

# Cavaticus Railway Deployment Setup Script
# This script helps generate required secrets and validate your Railway setup

set -e

echo "═══════════════════════════════════════════════════════════════"
echo "  Cavaticus Railway Deployment Setup"
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check dependencies
echo -e "${BLUE}Checking dependencies...${NC}"
if ! command -v openssl &> /dev/null; then
    echo -e "${RED}✗ openssl is required but not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ openssl found${NC}"

if ! command -v git &> /dev/null; then
    echo -e "${RED}✗ git is required but not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓ git found${NC}"

echo ""
echo -e "${BLUE}═══ STEP 1: Generate Secrets ${NC}"
echo ""
echo "Generate the following secrets and save them securely (e.g., in a password manager):"
echo ""

# Generate SESSION_SECRET
echo -e "${YELLOW}1. SESSION_SECRET${NC} (for Fastify sessions)"
SESSION_SECRET=$(openssl rand -hex 32)
echo "   Value: ${GREEN}${SESSION_SECRET}${NC}"
echo ""

# Generate ENCRYPTION_KEY
echo -e "${YELLOW}2. ENCRYPTION_KEY${NC} (for API key encryption)"
ENCRYPTION_KEY=$(openssl rand -hex 32)
echo "   Value: ${GREEN}${ENCRYPTION_KEY}${NC}"
echo ""

# Generate POSTGRES_PASSWORD
echo -e "${YELLOW}3. POSTGRES_PASSWORD${NC} (for database)"
POSTGRES_PASSWORD=$(openssl rand -base64 32)
echo "   Value: ${GREEN}${POSTGRES_PASSWORD}${NC}"
echo ""

# Save to temporary file
TEMP_SECRETS="/tmp/cavaticus-secrets-$$.txt"
cat > "$TEMP_SECRETS" << EOF
CAVATICUS RAILWAY DEPLOYMENT SECRETS
Generated: $(date)
=====================================

SESSION_SECRET
$SESSION_SECRET

ENCRYPTION_KEY
$ENCRYPTION_KEY

POSTGRES_PASSWORD
$POSTGRES_PASSWORD

VITE_API_URL
http://api.railway.internal:8080

AGENT_SERVICE_URL
http://agent.railway.internal:8000

POSTGRES_USER
cavaticus

POSTGRES_DB
cavaticus

NODE_ENV
production

=====================================
Keep this file secure and delete after adding to Railway!
EOF

echo -e "${GREEN}Secrets saved to: ${TEMP_SECRETS}${NC}"
echo ""

# Verification checklist
echo ""
echo -e "${BLUE}═══ STEP 2: Pre-Deployment Checklist ${NC}"
echo ""

checklist=(
    "[ ] Railway project created"
    "[ ] GitHub repository connected to Railway"
    "[ ] SSH key configured for git operations"
    "[ ] Railway CLI installed (npm i -g @railway/cli)"
    "[ ] You are logged into Railway (railway login)"
    "[ ] Postgres service created in Railway"
)

for item in "${checklist[@]}"; do
    echo "  $item"
done

echo ""
echo -e "${BLUE}═══ STEP 3: Environment Variables Setup ${NC}"
echo ""
echo "In Railway Dashboard, add these environment variables:"
echo ""
echo -e "${YELLOW}API Service:${NC}"
echo "  • DATABASE_URL = [auto-linked from Postgres]"
echo "  • SESSION_SECRET = $SESSION_SECRET"
echo "  • ENCRYPTION_KEY = $ENCRYPTION_KEY"
echo "  • NODE_ENV = production"
echo "  • AGENT_SERVICE_URL = http://agent.railway.internal:8000"
echo ""
echo -e "${YELLOW}Web Service:${NC}"
echo "  • VITE_API_URL = http://api.railway.internal:8080"
echo ""
echo -e "${YELLOW}Postgres Service:${NC}"
echo "  • POSTGRES_PASSWORD = $POSTGRES_PASSWORD"
echo "  • POSTGRES_USER = cavaticus"
echo "  • POSTGRES_DB = cavaticus"
echo ""

# Verify file structure
echo ""
echo -e "${BLUE}═══ STEP 4: Verify Project Structure ${NC}"
echo ""

required_files=(
    "railway.toml"
    "RAILWAY_DEPLOYMENT.md"
    "apps/web/package.json"
    "apps/api/package.json"
    "apps/api/src/index.ts"
    "apps/agent/Dockerfile"
    "apps/agent/pyproject.toml"
    "package.json"
)

all_exist=true
for file in "${required_files[@]}"; do
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓ $file${NC}"
    else
        echo -e "${RED}✗ $file${NC}"
        all_exist=false
    fi
done

if [ "$all_exist" = true ]; then
    echo ""
    echo -e "${GREEN}All required files found!${NC}"
else
    echo ""
    echo -e "${RED}Some required files are missing. Check your project structure.${NC}"
    exit 1
fi

# Next steps
echo ""
echo ""
echo -e "${BLUE}═══ NEXT STEPS ${NC}"
echo ""
echo "1. Copy secrets to Railway Dashboard (API, Web, Postgres services)"
echo "2. Link Postgres service to API service in Railway UI"
echo "3. Push to your GitHub repository:"
echo "   git add ."
echo "   git commit -m 'Railway deployment configuration'"
echo "   git push origin main"
echo ""
echo "4. Monitor deployment:"
echo "   railway logs --service api --tail"
echo ""
echo "5. Run database migrations (after first deploy):"
echo "   railway run --service api -- npm run db:push"
echo ""
echo "6. Test the deployment:"
echo "   curl https://your-web-service.railway.app"
echo ""
echo -e "${YELLOW}Important: Delete the secrets file when done:${NC}"
echo "   rm $TEMP_SECRETS"
echo ""
echo -e "${GREEN}For detailed documentation, see RAILWAY_DEPLOYMENT.md${NC}"
echo ""
