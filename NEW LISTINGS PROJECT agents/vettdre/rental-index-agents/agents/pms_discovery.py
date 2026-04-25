"""
Agent 3: PMS Discovery
=======================
For each building with TCO/CO issued, searches the web to find its
property management portal URL (RentCafe, Entrata, RealPage, etc.).

This is where the Agent SDK shines — the agent reasons about search
results, handles ambiguous matches, and verifies URLs actually belong
to the correct building.

Runs: After classifier, for buildings with status >= tco_issued and no scrape_url
Input: Classified buildings from database
Output: scrape_url and pms_platform set on building records
"""

import asyncio
import json

from claude_agent_sdk import query, ClaudeAgentOptions

from config.markets import PMS_PLATFORMS
from config.settings import DEFAULT_MODEL


SYSTEM_PROMPT = """You are a PMS (property management system) discovery agent for the Rental Index platform.
Your job is to find the online leasing portal URL for apartment buildings so we can scrape
their unit-level availability data.

## Background:
Most institutional apartment buildings use one of three platforms for their online leasing portals:
- **RentCafe** (by Yardi) — URLs like `buildingname.rentcafe.com` — ~40% of market
- **Entrata** — URLs like `buildingname.entrata.com` or embedded widgets — ~20% of market
- **RealPage/OnSite** — URLs like `buildingname.onsite.realpage.com` — ~25% of market

## Your Process for Each Building:

1. **Search RentCafe first** (highest probability):
   - Google: `"Building Name" site:rentcafe.com`
   - Google: `"Building Name" rentcafe [city]`

2. **Search Entrata**:
   - Google: `"Building Name" site:entrata.com`
   - Google: `"Building Name" entrata [city]`

3. **Search RealPage**:
   - Google: `"Building Name" site:onsite.realpage.com`

4. **Search building's own website**:
   - Google: `"Building Name" apartments [city] "schedule a tour"`
   - Look for embedded PMS widgets (RentPress, Rent Fetch, Engrain/SightMap)

5. **Verify the match**:
   - Visit the found URL
   - Confirm the address on the page matches our building's address
   - Confirm units are listed (not just a marketing page)
   - Note the PMS platform

## Output Format:
Write a JSON array with one object per building:
```json
{
    "building_address": "2200 E 6th St, Austin, TX",
    "building_name": "The Alexan East",
    "scrape_url": "https://alexaneast.rentcafe.com/apartments/for-rent",
    "pms_platform": "yardi",
    "confidence": "high",
    "discovery_method": "Google search: site:rentcafe.com",
    "notes": "Address confirmed on page. 180 units listed."
}
```

## Confidence Levels:
- **high**: Address on page matches our building, units are visible
- **medium**: Name matches but address is slightly different (could be a phase/building within a complex)
- **low**: Only name partially matches, can't confirm address
- **none**: Couldn't find any PMS portal for this building

## Important:
- Many buildings use their marketing name on RentCafe, not their permit name
  (permit says "2200 E 6th St MF" but RentCafe says "Alexan East Austin")
- Some buildings have multiple RentCafe pages for different phases — get the main one
- If a building is too new (just got TCO), it might not have a portal yet — mark as "none"
- Rate limit yourself: wait 3-5 seconds between web requests
- NEVER create fake URLs. If you can't find it, say so.
"""


async def run_pms_discovery(buildings: list[dict]) -> dict:
    """
    Find PMS portal URLs for a list of buildings.
    Each building dict should have at minimum: address, city, state, name (optional).
    """
    buildings_json = json.dumps(buildings, indent=2)
    output_file = "pms_discovery_output.json"

    results = []
    async for message in query(
        prompt=f"""Find the property management portal URL for each of these buildings.
        Search the web for their RentCafe, Entrata, or RealPage pages.

        Buildings to search:
        {buildings_json}

        For each building:
        1. Search Google for their RentCafe/Entrata/RealPage page
        2. Verify the URL is correct by checking the address matches
        3. Note the PMS platform and your confidence level

        Write results to '{output_file}'.
        Print a summary: total searched, found (high/medium/low confidence), not found.""",

        options=ClaudeAgentOptions(
            system_prompt=SYSTEM_PROMPT,
            allowed_tools=["WebSearch", "WebFetch", "Read", "Write", "Bash"],
            model=DEFAULT_MODEL,
        ),
    ):
        results.append(message)

    return {
        "buildings_searched": len(buildings),
        "output_file": output_file,
        "agent_messages": len(results),
    }


async def run_pms_discovery_from_file(market: str) -> dict:
    """
    Read classified buildings from file and discover PMS URLs.
    Filters for buildings with tco_issued or co_issued status.
    """
    input_file = f"classified_output_{market}.json"
    output_file = f"pms_discovery_output_{market}.json"

    results = []
    async for message in query(
        prompt=f"""Read '{input_file}' and find PMS portal URLs for buildings
        with status 'tco_issued' or 'co_issued'.

        For each qualifying building:
        1. Search Google for their RentCafe, Entrata, or RealPage portal
        2. Verify the URL by checking the address matches
        3. Record the scrape_url, pms_platform, and confidence level

        Write results to '{output_file}'.

        Process buildings in batches of 5 to avoid rate limits.
        Wait 3-5 seconds between web searches.

        Print a summary at the end.""",

        options=ClaudeAgentOptions(
            system_prompt=SYSTEM_PROMPT,
            allowed_tools=["WebSearch", "WebFetch", "Read", "Write", "Bash"],
            model=DEFAULT_MODEL,
        ),
    ):
        results.append(message)

    return {
        "market": market,
        "output_file": output_file,
        "agent_messages": len(results),
    }


if __name__ == "__main__":
    import sys
    market = sys.argv[1] if len(sys.argv) > 1 else "austin"
    print(f"Running PMS discovery for {market}...")
    result = asyncio.run(run_pms_discovery_from_file(market))
    print(f"Done: {result}")
