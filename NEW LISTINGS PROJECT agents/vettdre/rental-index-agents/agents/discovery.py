"""
Agent 1: Building Discovery
============================
Pulls multifamily building permits and certificates of occupancy
from city open data APIs. Builds the master building registry.

Runs: Weekly for permits, Daily for COs/TCOs
Input: Market config with API endpoints
Output: New/updated rows in the `buildings` table
"""

import asyncio
import json
from datetime import datetime

from claude_agent_sdk import query, ClaudeAgentOptions

from config.markets import MARKETS
from config.settings import DEFAULT_MODEL


def get_system_prompt(market_name: str, market_config: dict) -> str:
    """Build the system prompt with market-specific API details."""
    endpoints = json.dumps(market_config["open_data"], indent=2)

    return f"""You are a data ingestion agent for the Rental Index platform.
Your job is to pull multifamily building permits and certificates of occupancy
from {market_config['display_name']}'s open data APIs and write them to our database.

## Your Market: {market_config['display_name']}

## Available API Endpoints:
{endpoints}

## What You Do:

1. **Fetch permits** from the city's open data API (Socrata format — append .json to URL,
   use $where, $limit, $order as query params)
2. **Fetch certificates of occupancy** (COs and TCOs) from the CO endpoint
3. **Filter** for multifamily buildings with 5+ units, built/permitted 2019 or later
4. **Deduplicate** by normalized address (lowercase, strip apt/suite/unit suffixes,
   standardize St/Street, Ave/Avenue, etc.)
5. **Write results** as JSON to a file called `discovery_output_{{market}}.json`

## Output Format (one object per building):
```json
{{
    "address": "123 Main St",
    "city": "{market_config['display_name'].split(',')[0]}",
    "state": "{market_config['state']}",
    "zip": "78701",
    "name": "The Building Name",
    "total_units": 250,
    "year_built": 2023,
    "permit_number": "BP-2022-123456",
    "permit_date": "2022-03-15",
    "tco_date": null,
    "co_date": "2024-01-20",
    "status": "co_issued",
    "data_source": "data.austintexas.gov"
}}
```

## Status Rules:
- Has CO → "co_issued"
- Has TCO but no CO → "tco_issued"
- Has permit, no CO/TCO → "permitted"
- Description mentions "under construction" → "under_construction"

## Important:
- The Socrata API uses SoQL. Append `.json` to the dataset URL.
- Use `$where` for filtering, `$limit` for pagination, `$offset` for paging through results.
- If an endpoint returns an error or unexpected format, log it and move on — don't crash.
- Always try to extract unit count from the permit data. Look for fields like
  "number_of_units", "proposed_units", "total_units", or parse from description text.
- Normalize addresses: uppercase, remove trailing unit numbers, standardize abbreviations.
- If the API paginates (>1000 results), page through ALL results using $offset.
"""


async def run_discovery(market: str) -> dict:
    """
    Run the discovery agent for a single market.
    Returns a summary dict with counts.
    """
    if market not in MARKETS:
        raise ValueError(f"Unknown market: {market}. Available: {list(MARKETS.keys())}")

    market_config = MARKETS[market]
    output_file = f"discovery_output_{market}.json"

    results = []
    async for message in query(
        prompt=f"""Pull all multifamily building permits and certificates of occupancy
        for {market_config['display_name']} from the open data APIs.

        Filter for:
        - Multifamily buildings (apartments, condos, multi-family residential)
        - 5 or more units
        - Permitted or built 2019 or later

        Fetch ALL pages of results (don't stop at the first page).
        Cross-reference permits with COs/TCOs to set the correct lifecycle status.

        Write the deduplicated results to '{output_file}' as a JSON array.
        At the end, print a summary: total buildings found, breakdown by status.""",

        options=ClaudeAgentOptions(
            system_prompt=get_system_prompt(market, market_config),
            tools=["WebFetch", "Bash", "Read", "Write"],
            model=DEFAULT_MODEL,
        ),
    ):
        results.append(message)

    # Return the last message as summary
    return {
        "market": market,
        "output_file": output_file,
        "agent_messages": len(results),
    }


async def run_all_markets():
    """Run discovery across all active markets."""
    tasks = [run_discovery(market) for market in MARKETS]
    return await asyncio.gather(*tasks, return_exceptions=True)


if __name__ == "__main__":
    # Run single market for testing
    import sys
    market = sys.argv[1] if len(sys.argv) > 1 else "austin"
    print(f"Running discovery for {market}...")
    result = asyncio.run(run_discovery(market))
    print(f"Done: {result}")
