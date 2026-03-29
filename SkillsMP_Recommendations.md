# SkillsMP Skills — Recommended for VettdRE

Curated from [skillsmp.com](https://skillsmp.com) based on VettdRE's tech stack (Next.js 16, Supabase, Prisma, Tailwind CSS, Docker/GCP Cloud Run) and domain (NYC real estate CRM).

---

## Tier 1 — Highly Relevant to Your Stack

### nextjs-supabase-auth
- **Source:** `davila7/claude-code-templates` (22.1k stars)
- **What it does:** Expert integration of Supabase Auth with Next.js App Router. Covers login, authentication flows, and session management.
- **Why you need it:** This is your exact auth stack. Could help with your middleware auth/approval flow improvements.
- **Install:** `npx skills add davila7/claude-code-templates`

### supabase-postgres-best-practices
- **Source:** `davila7/claude-code-templates` (22.1k stars)
- **What it does:** Postgres performance optimization and best practices from Supabase. Use when writing, reviewing, or optimizing Postgres queries.
- **Why you need it:** With 30 models and 17+ NYC Open Data API integrations, query performance matters. Can help with your Prisma queries and raw SQL.

### postgres-patterns
- **Source:** `affaan-m/everything-claude-code` (60.5k stars)
- **What it does:** PostgreSQL database patterns for query optimization, schema design, indexing, and security based on Supabase best practices.
- **Why you need it:** Complement to the above — covers schema design patterns that map well to your Prisma schema with 30 models.

### prisma-orm
- **Source:** `a5c-ai/babysitter` (388 stars, 96% AI match)
- **What it does:** Prisma ORM schema design, migrations, relations, query optimization, and database integration patterns.
- **Why you need it:** Direct match for your Prisma 5.22 setup. Helps with schema migrations, relation modeling, and query optimization.

### infra-deploy
- **Source:** `terrylica/cc-skills` (15 stars)
- **What it does:** Self-hosted deployment to GCP Cloud Run with Supabase PostgreSQL, Docker Compose for local dev.
- **Why you need it:** This is almost exactly your deployment setup — GCP Cloud Run + Supabase + Docker. Could help optimize your `cloudbuild.yaml` and Dockerfile.

---

## Tier 2 — Useful for Development Workflow

### tailwind / tailwind-css / styling-with-tailwind
- **Multiple sources** (99% AI match across several)
- **What they do:** Tailwind CSS utility class patterns, component styling, responsive design.
- **Why useful:** You use Tailwind 4 extensively. Good for consistent styling patterns, especially for the remaining mobile responsiveness work in `MOBILE_SPEC.md`.

### frontend-development / frontend-ultimate
- **Source:** Various (98% AI match)
- **What it does:** Production-ready Next.js projects with TypeScript, Tailwind CSS, shadcn/ui, and API integration patterns.
- **Why useful:** Matches your component architecture and could help standardize patterns across your 14+ dashboard pages.

### docker-containerization
- **Source:** `openclaw/skills` (2.0k stars)
- **What it does:** Creating Dockerfiles, docker-compose configurations, containerizing applications.
- **Why useful:** General Docker best practices for your multi-stage Dockerfile setup.

### context7-docs-lookup
- **Source:** `upstash/context7`
- **What it does:** Fetches up-to-date library documentation. Activates when asking about libraries, frameworks, API references, or code examples.
- **Why useful:** Keeps Claude current on Next.js 16, Prisma 5, Supabase, and other rapidly-evolving libraries in your stack.

### vitest
- **Source:** `supabase/supabase` (98.5k stars)
- **What it does:** Fast unit testing framework powered by Vite with Jest-compatible API. Covers writing tests, mocking, configuring coverage.
- **Why useful:** Official Supabase testing skill — great for adding test coverage to VettdRE.

---

## Tier 3 — Domain-Specific (Real Estate & Sales)

### lead-qualification
- **Source:** `quadradois/antigravity-kit-v2.0` (3 stars)
- **What it does:** Expert framework for qualifying leads through conversational AI. Covers BANT methodology, scoring algorithms.
- **Why useful:** Could inform improvements to your AI lead scoring system (qualification scores, grading thresholds).

### revops
- **Source:** `coreyhaines31/marketingskills` (11.0k stars)
- **What it does:** Revenue operations, lead lifecycle management, marketing-to-sales handoff processes.
- **Why useful:** Relevant for pipeline management and deal flow optimization in your CRM.

### commercial-lease-expert
- **Source:** `NeverSight/learn-skills.dev` (52 stars)
- **What it does:** Expert in commercial real estate lease agreements for industrial and office properties.
- **Why useful:** If expanding VettdRE to cover commercial real estate deals.

### managing-property-due-diligence
- **Source:** `CaseMark/skills` (3 stars)
- **What it does:** Structures real estate due diligence with physical inspection, environmental review, and title analysis coordination.
- **Why useful:** Could enhance your Market Intel building profiles with due diligence checklists.

### commercial-psa (Purchase and Sale Agreement)
- **Source:** `CaseMark/skills` (3 stars)
- **What it does:** Drafts Purchase and Sale Agreements for commercial real estate transactions (office, retail, industrial, multifamily).
- **Why useful:** Document generation for closing deals in your pipeline.

### alta-settlement-statement
- **Source:** `CaseMark/skills` (3 stars)
- **What it does:** Drafts ALTA Settlement Statements for U.S. real estate closings with debit/credit allocations.
- **Why useful:** Closing document automation for "Under Contract → Closed" pipeline stage.

---

## How to Install Skills

Most skills can be installed globally via:

```bash
npx skills add <author>/<repo>
# or
bunx skills add <author>/<repo>
```

Or download individually from each skill's page on [skillsmp.com](https://skillsmp.com).

---

*Generated March 2026 from SkillsMP search results*
