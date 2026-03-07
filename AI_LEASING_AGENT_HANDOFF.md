# AI Leasing Agent — Handoff Document

**Date:** March 4, 2026
**Prompts completed:** 1–32 (all delivered)
**Build status:** `tsc --noEmit` and `next build` pass clean

---

## What We Built

A full-stack AI leasing agent that answers tenant inquiries, qualifies leads, books showings, and escalates to landlords — all via SMS, email, web chat, and voice. Landlords sign up, add a property, and go live in 3 minutes with a dedicated Twilio phone number.

---

## Prompt-by-Prompt Summary

| # | Feature | Key Files |
|---|---------|-----------|
| 1–4 | **Core SMS Engine** — Twilio inbound/outbound, Claude conversation loop, intent detection (showing request, qualification, opt-out, escalation), conversation state machine | `leasing-engine.ts`, `api/leasing/sms/route.ts` |
| 5–6 | **Onboarding Wizard** — 3-step setup (address → amenities → go live), PLUTO auto-enrichment, Twilio number provisioning, test SMS | `leasing/setup/page.tsx`, `actions.ts` |
| 7–8 | **Dashboard Command Center** — Three-pane layout (property selector, conversation list, detail panel), manual reply, escalation resolution, showing confirm/decline | `leasing/page.tsx` |
| 9 | **System Prompt Generator** — Building-specific AI personality from config fields, qualification criteria, office hours, language instructions | `leasing-prompt.ts` |
| 10 | **Follow-Up Cadence Engine** — Scheduled multi-touch follow-ups (free=1, pro=3, team=10), send-window enforcement (9am-8pm ET), cron route every 15 min | `leasing-followups.ts`, `api/leasing/follow-ups/route.ts` |
| 11 | **Bulk Unit Import** — CSV/XLSX upload, fuzzy column mapping, validation, batch upsert | `leasing-import.ts`, `leasing/setup/bulk-import/page.tsx`, `api/leasing/import/route.ts` |
| 12 | **Usage Metering & Limits** — Tier-based daily message caps (25/200/1000), property/listing limits, feature gating, queued message delivery | `leasing-limits.ts` |
| 13 | **Waitlist System** — Auto-waitlist when no matching units, waitlist-to-listing matching, dashboard alerts | `leasing-waitlist.ts` |
| 14 | **Delivery Status Tracking** — Twilio status callbacks, retry logic for failed messages, `WifiOff` indicator in dashboard | `api/leasing/sms/status/route.ts` |
| 15 | **Analytics Dashboard** — Volume charts, response time metrics, lead temperature pie, day/hour heatmap, funnel visualization (Recharts) | `leasing-analytics.ts`, `leasing/analytics/page.tsx` |
| 16 | **Knowledge Base Editor** — Per-property FAQ, competitor intel, concession rules, custom instructions (Pro/Team) | `leasing/[configId]/knowledge/page.tsx` |
| 17 | **Stripe Billing** — Checkout sessions for Pro ($149/mo) and Team ($399/mo), webhook handler, billing portal | `api/leasing/upgrade/route.ts`, `api/webhooks/stripe/route.ts` |
| 18 | **Email Channel** — Inbound email webhook, ILS parser (StreetEasy/Apartments.com/Zillow), Gmail send for replies | `leasing-email.ts`, `ils-parser.ts`, `api/leasing/email/route.ts` |
| 19 | **ROI Calculator** — Interactive calculator on analytics page: time saved, revenue generated, net ROI vs subscription cost | `components/leasing/ROICalculator.tsx` |
| 20 | **Google Calendar Auto-Booking** — Availability slot discovery from Google Calendar, one-click booking, calendar event creation (Pro/Team) | `leasing-calendar.ts` |
| 21 | **Upgrade Prompt Component** — Feature-aware upgrade modal with Pro vs Team comparison, triggers from feature gates | `components/leasing/UpgradePrompt.tsx` |
| 22 | **Web Chat Channel** — Public hosted chat widget (`/chat/[slug]`), pre-chat form, embeddable script tag (Team), config toggle | `chat/[configSlug]/`, `api/leasing/chat/route.ts`, `leasing/[configId]/web-chat/page.tsx` |
| 23 | **Voice Channel** — Twilio inbound voice with TwiML, speech-to-text transcription, AI response via `<Say>`, Team tier gate | `api/leasing/voice/route.ts`, `api/leasing/voice/transcription/route.ts` |
| 24 | **A/B Testing Framework** — Deterministic variant assignment, chi-squared significance testing, auto-promotion of winners | `leasing-ab.ts` |
| 25 | **Spanish Language Support** — Unicode detection, system prompt injection, Pro tier gate, knowledge base language selector | `leasing-engine.ts` (detectLanguage), `leasing-prompt.ts` |
| 26 | **Error Boundary + Limit Banner** — Graceful error handling per panel, dismissible limit-reached banner with upgrade CTA | `components/leasing/LeasingErrorBoundary.tsx`, `LimitBanner.tsx` |
| 27 | **Round-Robin Escalation + Custom Cadences** — Team agent assignment rotation, custom multi-step cadence builder, condition-based follow-ups | `leasing/[configId]/team/page.tsx` |
| 28 | **Cross-Building Benchmarking** — Anonymous percentile comparison across all active configs, segmented by geography × size | `leasing-benchmarks.ts`, `api/leasing/benchmarks/route.ts` |
| 29 | **Multi-Language (ZH/RU/HE)** — Mandarin, Russian, Hebrew detection + prompts, Team tier gate, analytics language breakdown | `leasing-engine.ts`, `leasing-prompt.ts` |
| 30 | **Marketing Landing Page** — Public page at `/leasing-agent` with hero, phone mockup, pricing table, FAQ accordion | `leasing-agent/page.tsx` |
| 31 | **Referral System** — "Give 1 month, get 1 month" referral links, cookie-based attribution, Stripe balance credits, referral stats page | `leasing/referral/page.tsx`, `api/webhooks/stripe/route.ts` |
| 32 | **Web Push Notifications** — Service worker, VAPID push, escalation alerts, notification click deep-links, permission banner | `push-notifications.ts`, `public/sw.js`, `api/push/subscribe/route.ts` |

---

## Architecture Overview

```
Inbound Message (SMS/Email/WebChat/Voice)
    │
    ▼
API Route (rate limit, auth, signature validation)
    │
    ▼
leasing-engine.ts :: processInboundMessage()
    │
    ├── Load LeasingConfig + conversation history
    ├── Check usage limits (leasing-limits.ts)
    ├── Detect language (EN/ES/ZH/RU/HE)
    ├── Generate system prompt (leasing-prompt.ts)
    ├── Call Claude API (claude-sonnet-4-5-20250514)
    ├── Parse tool calls: schedule_showing, qualify, escalate, waitlist, update_summary
    ├── Update conversation state in DB
    ├── Send reply (Twilio SMS / Gmail / web chat response / TwiML)
    ├── Schedule follow-ups (leasing-followups.ts)
    └── Fire push notification on escalation (push-notifications.ts)
```

### Tier System

| Feature | Free | Pro ($149/mo) | Team ($399/mo) |
|---------|------|---------------|----------------|
| Messages/day | 25 | 200 | 1,000 |
| Properties | 3 | 10 | 50 |
| Listings | 15 | 100 | 500 |
| Follow-ups/conv | 1 | 5 | 10 |
| Email channel | - | Yes | Yes |
| Web chat | - | - | Yes |
| Voice | - | - | Yes |
| Knowledge base | - | Yes | Yes |
| Analytics | - | Yes | Yes |
| Auto-book (Calendar) | - | Yes | Yes |
| A/B testing | - | Yes | Yes |
| Spanish | - | Yes | Yes |
| ZH/RU/HE | - | - | Yes |
| Custom cadences | - | - | Yes |
| Round-robin agents | - | - | Yes |
| Benchmarks | - | Yes | Yes |

---

## File Inventory

### Dashboard Pages (`src/app/(dashboard)/leasing/`)
| Path | Lines | Purpose |
|------|-------|---------|
| `page.tsx` | 1,341 | Main dashboard — conversation list + detail + stats bar + push banner |
| `actions.ts` | 2,120 | All server actions (40+ exported functions) |
| `setup/page.tsx` | 705 | 3-step onboarding wizard |
| `setup/bulk-import/page.tsx` | 519 | CSV/XLSX bulk unit import |
| `analytics/page.tsx` | 904 | Charts, benchmarks, ROI calculator |
| `referral/page.tsx` | 140 | Referral link + stats |
| `[configId]/knowledge/page.tsx` | 773 | Knowledge base editor |
| `[configId]/team/page.tsx` | 500 | Team agent + cadence config |
| `[configId]/web-chat/page.tsx` | 220 | Web chat toggle + embed snippet |
| `upgrade/success/` | 133 | Post-checkout confirmation |

### API Routes (`src/app/api/leasing/`)
| Path | Purpose |
|------|---------|
| `sms/route.ts` | Twilio inbound SMS webhook |
| `sms/status/route.ts` | Twilio delivery status callback |
| `email/route.ts` | Inbound email webhook |
| `chat/route.ts` | Public web chat endpoint |
| `voice/route.ts` | Twilio inbound voice |
| `voice/transcription/route.ts` | Speech transcription callback |
| `follow-ups/route.ts` | Cron: process due follow-ups + queued messages |
| `benchmarks/route.ts` | Cron: daily benchmark computation |
| `import/route.ts` | Bulk unit import + template download |
| `upgrade/route.ts` | Stripe checkout session creation |

### Core Libraries (`src/lib/leasing-*.ts`)
| File | Lines | Purpose |
|------|-------|---------|
| `leasing-engine.ts` | 2,350 | Message processing pipeline + Claude orchestration |
| `leasing-prompt.ts` | 576 | System prompt assembly |
| `leasing-types.ts` | 323 | Shared types + constants |
| `leasing-followups.ts` | 419 | Follow-up scheduling + cadences |
| `leasing-limits.ts` | 364 | Usage metering + feature gates |
| `leasing-analytics.ts` | 415 | Analytics data queries |
| `leasing-benchmarks.ts` | 415 | Anonymous benchmarking |
| `leasing-ab.ts` | 325 | A/B testing framework |
| `leasing-email.ts` | 205 | Email channel utilities |
| `leasing-calendar.ts` | 382 | Google Calendar auto-booking |
| `leasing-import.ts` | 235 | CSV/XLSX import utilities |
| `leasing-waitlist.ts` | 241 | Waitlist management |

### Supporting Files
| File | Purpose |
|------|---------|
| `src/lib/push-notifications.ts` | Web push via VAPID + web-push |
| `src/lib/ils-parser.ts` | ILS email parser (StreetEasy, etc.) |
| `src/lib/twilio.ts` | Twilio client singleton |
| `src/lib/stripe.ts` | Stripe client + price mappings |
| `src/lib/geocodio.ts` | Address geocoding |
| `src/components/leasing/LeasingErrorBoundary.tsx` | Error boundary wrapper |
| `src/components/leasing/LimitBanner.tsx` | Limit-reached banner |
| `src/components/leasing/UpgradePrompt.tsx` | Upgrade modal |
| `src/components/leasing/ROICalculator.tsx` | ROI calculator |
| `public/sw.js` | Service worker for push |
| `src/app/leasing-agent/page.tsx` | Marketing landing page |
| `src/app/chat/[configSlug]/` | Public hosted chat widget |

### Database Models (Prisma)
| Model | Purpose |
|-------|---------|
| `LeasingConfig` | Per-property agent config (tier, AI personality, knowledge, billing) |
| `LeasingConversation` | Per-prospect conversation state (status, temperature, qualification) |
| `LeasingMessage` | Individual messages (sender, body, delivery status, AI metadata) |
| `LeasingFollowUp` | Scheduled follow-up messages (cadence, variant, status) |
| `LeasingDailyUsage` | Daily usage counters per config |
| `LeasingBenchmark` | Aggregated anonymous benchmarks |

### Migrations (13 leasing-related)
`20260304000000` through `20260304290000` — all under `prisma/migrations/`

---

## Environment Variables (Leasing-Specific)

```
# Twilio (SMS + Voice)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=

# Stripe (Billing)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_LEASING_PRO_PRICE_ID=
STRIPE_LEASING_TEAM_PRICE_ID=

# Push Notifications
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:support@vettdre.com
NEXT_PUBLIC_VAPID_PUBLIC_KEY=   # Same as VAPID_PUBLIC_KEY, exposed to client

# Cron Auth
CRON_SECRET=                    # Bearer token for follow-up + benchmark crons

# Email Webhook
EMAIL_WEBHOOK_SECRET=           # Bearer token for inbound email webhook

# AI
ANTHROPIC_API_KEY=              # Claude API for conversation engine

# Google Calendar (existing)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
```

---

## Cron Jobs Required

| Schedule | Endpoint | Auth | Purpose |
|----------|----------|------|---------|
| Every 15 min | `GET /api/leasing/follow-ups` | Bearer CRON_SECRET | Process due follow-ups + queued messages |
| Daily 3 AM ET | `POST /api/leasing/benchmarks` | Bearer CRON_SECRET | Compute daily benchmarks |

---

## Public Routes (No Auth)

All added to `src/lib/supabase/middleware.ts`:
- `/leasing-agent` — Marketing landing page
- `/chat/*` — Hosted web chat widget
- `/api/leasing/sms` — Twilio SMS webhook
- `/api/leasing/sms/status` — Twilio status callback
- `/api/leasing/email` — Inbound email webhook
- `/api/leasing/chat` — Web chat API
- `/api/leasing/voice` — Twilio voice webhook
- `/api/leasing/voice/transcription` — Voice transcription callback

---

## Known Considerations

1. **Twilio number provisioning** happens during onboarding — requires active Twilio account with available local numbers
2. **Google Calendar integration** requires the user to connect Gmail first (via existing `/settings/gmail` flow)
3. **ILS email parsing** is regex-based; new listing services may need parser updates in `ils-parser.ts`
4. **Benchmarks** require minimum 5 active configs per segment to publish — new deployments will show "Not enough data" initially
5. **Referral pending credits** are stored as `pendingReferralCredit` on Organization and applied when the referring org first creates a Stripe customer
6. **Push notifications** require VAPID keys generated once with `npx web-push generate-vapid-keys` — both public and private keys must be in env vars
7. **Voice channel** uses Twilio's `<Gather>` with `Polly.Joanna-Neural` — cost is per-minute Twilio voice + Amazon Polly pricing
8. **A/B test auto-promotion** triggers at 100+ samples with p < 0.05 significance

---

## Total Codebase Size (Leasing Feature Only)

- **Dashboard pages:** ~5,200 lines
- **API routes:** ~1,700 lines
- **Core libraries:** ~5,700 lines
- **Components:** ~530 lines
- **Supporting files:** ~1,200 lines
- **Total:** ~14,300 lines of TypeScript/React
- **Migrations:** 13 SQL files
- **Prisma models:** 6 models, 6 enums
