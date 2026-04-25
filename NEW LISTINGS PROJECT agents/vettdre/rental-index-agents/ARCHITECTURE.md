# Rental Index — Multi-Agent Architecture

## The Pipeline (6 Stages → 5 Agents + 1 Orchestrator)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        ORCHESTRATOR (main.py)                           │
│  Chains agents in sequence. Manages state. Handles failures.            │
│  Can run full pipeline or individual stages.                            │
└───┬──────────┬──────────┬──────────┬──────────┬─────────────────────────┘
    │          │          │          │          │
    ▼          ▼          ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────┐
│DISCOVER│→│CLASSIFY│→│FIND PMS│→│ SCRAPE │→│ NORMALIZE  │
│        │ │        │ │        │ │        │ │            │
│Open    │ │Match   │ │Google  │ │Play-   │ │Geocode     │
│data    │ │permits │ │search  │ │wright  │ │Concession  │
│APIs    │ │to COs  │ │for     │ │unit-   │ │parse       │
│Permits │ │Assign  │ │RentCafe│ │level   │ │Net rent    │
│COs     │ │life-   │ │Entrata │ │data    │ │calc        │
│TCOs    │ │cycle   │ │URLs    │ │extract │ │Quality     │
│        │ │status  │ │        │ │        │ │score       │
└────────┘ └────────┘ └────────┘ └────────┘ └────────────┘
 Agent 1    Agent 2    Agent 3    Agent 4     Agent 5
```

## Agent Inventory

| # | Agent | SDK Tools | Model | Runs When |
|---|-------|-----------|-------|-----------|
| 1 | **discovery_agent** | Bash, WebFetch, Read, Write | sonnet | Weekly (permits), Daily (COs) |
| 2 | **classifier_agent** | Bash, Read, Write | sonnet | After discovery |
| 3 | **pms_discovery_agent** | WebSearch, WebFetch, Bash, Read, Write | sonnet | After classification (new `tco_issued`/`co_issued` buildings) |
| 4 | **scraper_agent** | Bash, Read, Write | sonnet | Daily for active buildings, weekly for stabilized |
| 5 | **normalizer_agent** | Bash, WebFetch, Read, Write | sonnet | After scraping |
| — | **orchestrator** | All agents as subagents | sonnet | On demand or scheduled |

## Why Agents (Not Just Scripts)?

Traditional scripts break when data formats change, APIs return unexpected responses, or edge cases appear. Agents handle ambiguity:

- **Discovery agent** can reason about which API fields map to "multifamily 5+ units" across different city data schemas
- **PMS discovery agent** uses web search + reasoning to find the right RentCafe URL for "The Alexan East Austin" vs. "Alexan Austin" vs. "alexan-east-austin.rentcafe.com"
- **Normalizer agent** uses Claude for concession parsing when regex fails on text like "Ask about our spring special — up to 8 weeks on select homes!"
- **Classifier agent** fuzzy-matches addresses across permit and CO datasets that use different formatting

Scripts handle the 80% case. Agents handle the 100% case.

## Data Flow

```
City Open Data APIs
        │
        ▼
  ┌─────────────┐
  │  buildings   │ ← Agent 1 writes raw permit/CO data
  │  (Supabase)  │ ← Agent 2 updates lifecycle status
  │              │ ← Agent 3 adds scrape_url + pms_platform
  └──────┬───────┘
         │
         ▼
  ┌─────────────┐
  │  unit_types  │ ← Agent 4 writes floor plan data
  │    units     │ ← Agent 4 writes unit-level availability
  └──────┬───────┘
         │
         ▼
  ┌──────────────┐
  │price_history  │ ← Agent 5 appends normalized daily snapshot
  │(append-only)  │ ← NEVER deleted, NEVER overwritten
  └───────────────┘
```

## Running the System

```bash
# Full pipeline (all markets)
python main.py --full

# Single stage
python main.py --stage discovery --market austin

# Single building
python main.py --stage scrape --building-id 123
```
