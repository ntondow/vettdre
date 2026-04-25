# Rental Index — Agent Pipeline

Multi-agent system for building a real-time rental inventory index across Sun Belt markets. Uses the Claude Agent SDK to autonomously discover buildings, find their leasing portals, scrape unit-level data, and normalize everything into a clean dataset.

## Architecture

5 agents + 1 orchestrator, running in sequence:

```
Discovery → Classifier → PMS Discovery → Scraper → Normalizer
```

| Agent | What It Does | Key Tools |
|-------|-------------|-----------|
| **Discovery** | Pulls permits + COs from city open data APIs | WebFetch, Bash |
| **Classifier** | Deduplicates buildings, assigns lifecycle status | Read, Write (reasoning) |
| **PMS Discovery** | Finds RentCafe/Entrata/RealPage URLs via web search | WebSearch, WebFetch |
| **Scraper** | Extracts unit-level data with Playwright | Bash (Playwright) |
| **Normalizer** | Geocodes, parses concessions, calculates net rent, scores quality | WebFetch, Bash |

See `ARCHITECTURE.md` for the full design doc.

## Target Markets

| Market | Est. Buildings | Why |
|--------|---------------|-----|
| Austin, TX | ~480 | Highest vacancy, best open data, pilot market |
| Dallas-Fort Worth, TX | ~1,100 | Largest volume, same TX ecosystem |
| Phoenix, AZ | ~450 | High oversupply, institutional ownership |
| Denver, CO | ~370 | Heavy concessions, growing market |
| Nashville, TN | ~340 | Stabilizing market, good data |

## Quick Start

```bash
# 1. Clone and install
cd rental-index-agents
pip install -r requirements.txt
playwright install chromium

# 2. Set up environment
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY

# 3. Start local Supabase (if using DB)
npx supabase start
psql -h localhost -p 54322 -U postgres -d postgres -f db/schema.sql

# 4. Run the Austin pipeline
python main.py --market austin

# Or run a single stage
python main.py --stage discovery --market austin

# Or run everything
python main.py --full
```

## Running Individual Agents

Each agent can run standalone for testing:

```bash
python -m agents.discovery austin
python -m agents.classifier austin
python -m agents.pms_discovery austin
python -m agents.scraper austin
python -m agents.normalizer austin
```

## Project Structure

```
rental-index-agents/
├── main.py                     # Orchestrator — chains all agents
├── ARCHITECTURE.md             # Full system design doc
├── agents/
│   ├── discovery.py            # Agent 1: Open data → building registry
│   ├── classifier.py           # Agent 2: Deduplicate + assign status
│   ├── pms_discovery.py        # Agent 3: Find scrape URLs
│   ├── scraper.py              # Agent 4: Playwright unit extraction
│   └── normalizer.py           # Agent 5: Geocode, concessions, net rent
├── config/
│   ├── markets.py              # Market endpoints + PMS patterns
│   └── settings.py             # DB, API keys, rate limits
├── db/
│   └── schema.sql              # Full Postgres schema (5 tables)
├── utils/
│   └── db.py                   # Async DB connection + helpers
├── requirements.txt
└── .env.example
```

## Key Design Decisions

1. **Agents over scripts** — Claude handles edge cases (ambiguous addresses, weird concession text, unexpected API formats) that would require endless if/else branches in traditional code.
2. **File-based handoffs** — Agents pass data via JSON files between stages. Simple, debuggable, and you can inspect/edit intermediate results.
3. **Append-only price history** — The `price_history` table never updates or deletes. Every daily snapshot is preserved. This time-series is the most valuable asset.
4. **Sonnet for speed, Opus for reasoning** — Most agents use Sonnet. The concession parser subagent uses Opus for ambiguous text.
5. **One market at a time** — Markets run sequentially to respect rate limits. Stages within a market also run sequentially (each depends on the previous).
