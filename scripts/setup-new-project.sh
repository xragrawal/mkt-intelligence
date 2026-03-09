#!/bin/bash

# BD Pulse LeadGen - New Supabase Project Setup
# This script automates database schema replication
#
# Usage: bash scripts/setup-new-project.sh

set -e  # Exit on error

echo "═══════════════════════════════════════════"
echo "  BD Pulse LeadGen - Supabase Setup"
echo "═══════════════════════════════════════════"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if npx is available
if ! command -v npx &> /dev/null; then
    echo -e "${RED}❌ npx not found. Please install Node.js and npm first.${NC}"
    exit 1
fi

# Check if TypeScript script exists
if [ ! -f "scripts/setup-new-supabase-project.ts" ]; then
    echo -e "${RED}❌ setup-new-supabase-project.ts not found${NC}"
    echo "   Please run this script from the project root directory"
    exit 1
fi

echo -e "${BLUE}ℹ️  This script will help you set up a new Supabase project${NC}"
echo ""
echo "You will need:"
echo "  1. A new Supabase project (from supabase.com/dashboard)"
echo "  2. Your project URL (Settings → API)"
echo "  3. Your Service Role Key (Settings → API → Service Role)"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo -e "${BLUE}📦 Running setup script...${NC}"
echo ""

# Run the TypeScript setup script
npx tsx scripts/setup-new-supabase-project.ts

echo ""
echo -e "${GREEN}✅ Setup script completed!${NC}"
echo ""
echo "Next steps:"
echo "  1. If schema wasn't executed, run this in Supabase SQL Editor:"
echo "     → Open: scripts/replicate-schema.sql"
echo "     → Copy all contents and paste into SQL Editor"
echo "     → Click Run"
echo ""
echo "  2. Deploy Edge Functions:"
echo "     → npx supabase functions deploy"
echo ""
echo "  3. Restart dev server:"
echo "     → npm run dev"
echo ""
echo "📚 For detailed instructions, see: SETUP_NEW_PROJECT.md"
echo ""
