#!/bin/bash
# ═══════════════════════════════════════════════════════
# Rental Index — One-Command Setup
# ═══════════════════════════════════════════════════════
# This script handles everything:
#   1. Checks Python version
#   2. Creates a virtual environment
#   3. Installs the Agent SDK + dependencies
#   4. Installs Playwright + Chromium
#   5. Creates your .env file
#   6. Runs a test pull against Austin's open data API
#
# Usage:
#   cd rental-index-agents
#   bash setup.sh
# ═══════════════════════════════════════════════════════

set -e  # Stop on errors

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  RENTAL INDEX — SETUP"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── Step 1: Check Python ─────────────────────────────
echo "Step 1/6: Checking Python..."
if command -v python3 &> /dev/null; then
    PY_VERSION=$(python3 --version 2>&1)
    echo "  ✅ Found $PY_VERSION"
else
    echo "  ❌ Python 3 not found. Install it from https://python.org"
    exit 1
fi

# Check version is 3.10+
PY_MINOR=$(python3 -c "import sys; print(sys.version_info.minor)")
PY_MAJOR=$(python3 -c "import sys; print(sys.version_info.major)")
if [ "$PY_MAJOR" -lt 3 ] || ([ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 10 ]); then
    echo "  ❌ Need Python 3.10+. You have $PY_VERSION"
    exit 1
fi
echo ""

# ── Step 2: Create virtual environment ───────────────
echo "Step 2/6: Creating virtual environment..."
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "  ✅ Created venv/"
else
    echo "  ✅ venv/ already exists"
fi
source venv/bin/activate
echo "  ✅ Activated virtual environment"
echo ""

# ── Step 3: Install dependencies ─────────────────────
echo "Step 3/6: Installing dependencies..."
pip install --upgrade pip -q
pip install -r requirements.txt -q 2>&1 | tail -3
echo "  ✅ Dependencies installed"
echo ""

# ── Step 4: Install Playwright + Chromium ────────────
echo "Step 4/6: Installing Playwright..."
pip install playwright -q
python3 -m playwright install chromium 2>&1 | tail -3
echo "  ✅ Playwright + Chromium installed"
echo ""

# ── Step 5: Create .env file ────────────────────────
echo "Step 5/6: Setting up .env..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo "  ✅ Created .env from .env.example"
    echo ""
    echo "  ⚠️  IMPORTANT: You need to add your Anthropic API key!"
    echo "  Open .env in a text editor and replace 'sk-ant-xxxxx' with your real key."
    echo ""
    echo "  Don't have one? Get it at: https://console.anthropic.com/settings/keys"
    echo ""
else
    echo "  ✅ .env already exists"
fi
echo ""

# ── Step 6: Test Austin open data pull ───────────────
echo "Step 6/6: Testing Austin open data API..."
python3 -c "
import requests
import json

url = 'https://data.austintexas.gov/resource/3syk-w9eu.json'
params = {
    'permittype': 'BP',
    'work_class': 'New',
    '\$where': 'housing_units > 5 AND issue_date > \'2019-01-01\'',
    '\$select': 'count(*) as total'
}
resp = requests.get(url, params=params, timeout=15)
data = resp.json()
total = data[0]['total'] if data else 'ERROR'
print(f'  ✅ Austin API is live! Found {total} multifamily permits (5+ units, 2019+)')
"
echo ""

# ── Done! ────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════"
echo "  ✅ SETUP COMPLETE"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  Next steps:"
echo "  1. Add your Anthropic API key to .env"
echo "  2. Activate the venv:  source venv/bin/activate"
echo "  3. Run the pipeline:   python main.py --stage discovery --market austin"
echo ""
echo "  Your Austin building inventory (379 buildings) is already"
echo "  in this folder: austin_building_inventory.json"
echo ""
