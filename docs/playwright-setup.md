# Playwright e2e setup

Foundation/Speed Audit Z.0b — playwright harness for end-to-end testing.

**Target:** local dev (`http://localhost:3000`). NOT wired to GitHub Actions yet — see `z0b-followup-ci-integration` and `z0b-followup-staging-target` in `SLICES-speed.md`.

## One-time setup

### 1. Provision a dedicated test user

**Don't use Nathan's super_admin account** — playwright runs will pollute your CRM with test contacts. Create a dedicated user instead.

Two options:

**Option A — UI signup (simplest):**
1. Run `npm run dev`
2. Open `http://localhost:3000/signup` in a private/incognito window
3. Sign up with an email like `playwright-test@vettdre.local` and a strong password
4. Approve the user in the local DB (auto-approval may already happen on first signup; if not, log in as super_admin and approve via `/settings/admin/users`)

**Option B — Supabase admin dashboard (faster if you already have the local Supabase open):**
1. Open Supabase Studio for the local project
2. Auth → Users → Add user → fill email + password, mark email-confirmed
3. The middleware auto-provisions the Organization + User records on first login

### 2. Add credentials to `.env.local`

```env
PLAYWRIGHT_TEST_EMAIL=playwright-test@vettdre.local
PLAYWRIGHT_TEST_PASSWORD=<the-password-you-set>
```

`.env.local` is gitignored — credentials never enter the repo.

### 3. Install playwright browser binaries

The first time you run playwright, you need the chromium binary. One-time:

```bash
npx playwright install chromium
```

## Running the suite

```bash
# Headless run (CI-style)
npm run e2e

# Watch a specific spec run in a real browser window
npm run e2e:headed -- 01-login.spec.ts

# Interactive mode — best for debugging or writing new specs
npm run e2e:ui
```

The config has `webServer.reuseExistingServer: true` for local dev — if `npm run dev` is already running in another terminal, playwright reuses it. Otherwise it auto-starts `next dev` and waits up to 90s for first-build.

## Spec inventory

The `tests/e2e/*.spec.ts` numbering maps to methodology §"Required infrastructure" canonical flow numbers. See SLICES-speed.md Z.0b plan-of-record for the full mapping table.

| File | Methodology flow | Status |
|---|---|---|
| `01-login.spec.ts` | #1 — login + redirect to dashboard | Active |
| `02-create-contact.spec.ts` | #2 (simplified) — create contact | Active |
| _(gap at 03)_ | #3 — public deal submission | Deferred → `z0b-followup-flow-3-deal-submission-seed` |
| `04-send-gmail-reply.spec.ts` | #4 — Gmail reply with templates | `test.skip()` — needs test user with Gmail OAuth |
| `05-market-intel-search.spec.ts` | #6 — market intel address search (kickoff substituted for #5) | Active |

The gap at `03-*.spec.ts` is intentional — the visual signal that flow 3 was deferred. When `z0b-followup-flow-3-deal-submission-seed` ships, it fills the `03` slot.

## Troubleshooting

- **"Missing required env var PLAYWRIGHT_TEST_EMAIL"** — `.env.local` not loaded or var not set. See step 2 above.
- **Login spec times out** — test user not provisioned or not approved; see step 1.
- **`webServer` timeout after 90s** — Next.js Turbopack first-build on a cold cache can sometimes exceed 90s. Run `npm run dev` once manually to warm it, then run `npm run e2e` (the config will reuse the running server).
- **Specs flake on slow CI runners** — that's why this is local-only for now. CI integration is `z0b-followup-ci-integration` and lives behind the staging-target decision.
