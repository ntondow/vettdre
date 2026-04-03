#!/bin/bash
# ─────────────────────────────────────────────────────────────
# VettdRE Mobile — First-Time Setup
# ─────────────────────────────────────────────────────────────
# Run this once on a new machine to set up everything you need
# for local development and EAS builds.
#
# Usage:
#   cd mobile
#   bash scripts/setup.sh
# ─────────────────────────────────────────────────────────────

set -e

echo ""
echo "🏗  VettdRE Mobile Setup"
echo "─────────────────────────────────"
echo ""

# ── 1. Check Node ──────────────────────────────────────────
NODE_VERSION=$(node -v 2>/dev/null || echo "none")
if [ "$NODE_VERSION" = "none" ]; then
  echo "❌ Node.js is not installed. Install v18+ from https://nodejs.org"
  exit 1
fi
echo "✓ Node.js $NODE_VERSION"

# ── 2. Install EAS CLI ────────────────────────────────────
if ! command -v eas &> /dev/null; then
  echo "📦 Installing EAS CLI..."
  npm install -g eas-cli
else
  echo "✓ EAS CLI $(eas --version)"
fi

# ── 3. Install dependencies ───────────────────────────────
echo ""
echo "📦 Installing project dependencies..."
npm install

# ── 4. Check EAS login ────────────────────────────────────
echo ""
if eas whoami &> /dev/null; then
  echo "✓ Logged in to EAS as: $(eas whoami)"
else
  echo "🔑 You need to log in to Expo/EAS:"
  echo "   Run: eas login"
  echo "   (Create an account at https://expo.dev/signup if needed)"
fi

# ── 5. Check EAS project link ─────────────────────────────
echo ""
if grep -q "YOUR_EAS_PROJECT_ID" app.json; then
  echo "⚠  EAS project not linked yet."
  echo "   Run: eas init"
  echo "   This will create the project on expo.dev and update app.json"
else
  echo "✓ EAS project linked"
fi

# ── 6. Environment variables ──────────────────────────────
echo ""
if [ -f .env ]; then
  echo "✓ .env file exists"
else
  echo "📝 Creating .env from template..."
  cat > .env << 'ENVEOF'
# VettdRE Mobile — Environment Variables
# Copy this to .env and fill in your values.

# API — points to your Next.js backend
EXPO_PUBLIC_API_URL=http://localhost:3000

# Supabase — same project as the web app
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=

# EAS — filled in by `eas init`
EXPO_PUBLIC_PROJECT_ID=
ENVEOF
  echo "   Created .env — fill in your Supabase keys"
fi

# ── Done ──────────────────────────────────────────────────
echo ""
echo "─────────────────────────────────"
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo ""
echo "  1. Fill in .env with your Supabase URL and anon key"
echo "  2. Run: eas login"
echo "  3. Run: eas init          (links project to expo.dev)"
echo "  4. Run: npx expo start    (start dev server)"
echo "  5. Scan QR code with Expo Go on your phone"
echo ""
echo "To build for TestFlight/Play Store:"
echo "  eas build --profile preview --platform ios"
echo "  eas build --profile preview --platform android"
echo ""
echo "To build for App Store/Play Store release:"
echo "  eas build --profile production --platform all"
echo ""
