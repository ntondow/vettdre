# VettdRE Mobile

React Native / Expo app for NYC real estate agents. Building intelligence, client onboarding, pipeline tracking, and earnings — all from your phone.

## Prerequisites

- Node.js 20+
- Expo CLI: `npm install -g expo-cli`
- iOS: Xcode 15+ (for simulator) or Expo Go app on your phone
- Android: Android Studio (for emulator) or Expo Go app on your phone

## Setup

```bash
# From the mobile/ directory
cd mobile

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Fill in your Supabase URL, anon key, and API URL in .env.local
# These are the same values as your web app's NEXT_PUBLIC_SUPABASE_URL etc.

# Start the dev server
npx expo start
```

Then:
- Press `i` for iOS simulator
- Press `a` for Android emulator
- Scan QR code with Expo Go on your phone for device testing

## Project Structure

```
mobile/
├── app.json                    # Expo config (bundle ID, permissions, plugins)
├── package.json                # Dependencies
├── tsconfig.json               # TypeScript config with path aliases
├── .env.example                # Environment variable template
│
└── src/
    ├── app/                    # Expo Router — file-based navigation
    │   ├── _layout.tsx         # Root layout (QueryClient, AuthProvider)
    │   ├── (auth)/
    │   │   └── login.tsx       # Login screen
    │   └── (tabs)/
    │       ├── _layout.tsx     # Tab navigation (Home, Scout, Pipeline, Clients, Alerts)
    │       ├── index.tsx       # Dashboard (Home tab)
    │       ├── scout.tsx       # Building research
    │       ├── pipeline.tsx    # Buildings + Clients pipeline
    │       ├── clients.tsx     # Client registration hub
    │       └── alerts.tsx      # Notifications
    │
    ├── lib/
    │   ├── supabase.ts         # Supabase client (expo-secure-store for tokens)
    │   ├── auth-context.tsx    # Auth provider (user, org, agent state)
    │   └── api.ts              # API client (hits existing Next.js endpoints)
    │
    ├── types/
    │   └── index.ts            # Shared types matching Prisma schema
    │
    ├── hooks/                  # Custom hooks (TODO)
    ├── components/             # Shared UI components (TODO)
    └── assets/                 # Icons, splash screen, etc. (TODO)
```

## Architecture

The mobile app shares the same Supabase project and hits the same backend as the web app.

- **Auth:** Supabase Auth with email/password. Tokens stored in expo-secure-store.
- **Data:** React Query with 5-min stale time. Pull-to-refresh everywhere.
- **API:** Calls `/api/mobile/*` endpoints on the Next.js backend.
- **Navigation:** Expo Router (file-based) with native bottom tabs.

## What's Built

- [x] Project scaffold (Expo 52, TypeScript strict)
- [x] Supabase auth with secure token storage
- [x] API client with typed endpoints
- [x] 5-tab navigation (Home, Scout, Pipeline, Clients, Alerts)
- [x] Dashboard screen (earnings, schedule, quick actions)
- [x] Scout screen (camera/screenshot/URL input methods)
- [x] Pipeline screen (buildings + clients toggle)
- [x] Clients screen (invite list, status cards, doc progress)
- [x] Alerts screen (notification feed)
- [x] Login screen
- [x] Full type definitions matching Prisma schema

## What's Next

1. **Backend:** Create `/api/mobile/*` routes in the Next.js app (thin wrappers around existing server actions)
2. **Scout flow:** Camera screen, screenshot upload, URL paste, resolving animation, building profile card
3. **Client invite form:** Full invite flow with document selection and delivery method
4. **Offline:** SQLite cache for saved buildings and client list
5. **Push notifications:** Wire expo-notifications to existing VAPID setup
6. **App Store:** Icons, splash screen, screenshots, TestFlight submission
