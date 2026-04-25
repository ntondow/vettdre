"""
Agent 4: Scraper
=================
Playwright-based scraper that extracts unit-level availability data
from RentCafe, Entrata, and RealPage portals.

This is the heaviest agent — it launches headless Chrome, navigates
PMS portals, and extracts structured data from dynamic pages.

Runs: Daily for active buildings, weekly for stabilized
Input: Buildings with scrape_url set
Output: Unit records + raw scrape data written to files and DB
"""

import asyncio
import json

from claude_agent_sdk import query, ClaudeAgentOptions

from config.settings import DEFAULT_MODEL, SCRAPE_DELAY_MIN, SCRAPE_DELAY_MAX


SYSTEM_PROMPT = """You are a web scraping agent for the Rental Index platform.
Your job is to extract unit-level apartment availability data from property
management system (PMS) portals using Playwright (headless Chrome).

## What You Extract Per Unit:
- unit_number (e.g., "2105", "A-301")
- floor (parse from unit number if not explicit)
- bedrooms / bathrooms
- sqft
- gross_rent (listed price before concessions)
- available_date
- floor_plan_name (e.g., "A1", "The Austin", "2BR/2BA Corner")
- concession_text (raw text of any special offer)
- lease_term_options (if multiple terms with different pricing)

## RentCafe Scraping Strategy:
RentCafe pages are React/Angular SPAs. The approach:

1. Navigate to the building's RentCafe URL
2. Wait for the floor plan / availability section to load
3. Look for "View All Availabilities" or "See All Units" buttons — click them
4. The unit list usually renders in a table or card grid
5. Extract data from each unit row/card

**Common RentCafe DOM patterns:**
- Floor plans: `.floor-plan-card`, `.fp-card`, `[data-floor-plan]`
- Unit rows: `.unit-row`, `.availability-row`, `.unit-card`
- Rent: `.rent-amount`, `.price`, `[data-rent]`
- Sqft: `.sqft`, `.square-feet`, `[data-sqft]`
- Availability: `.available-date`, `.move-in-date`
- Concession: `.special-text`, `.concession`, `.promo-banner`, `.specials-banner`

**Important:** Some RentCafe pages lazy-load units. You may need to:
- Click "Load More" buttons
- Scroll to trigger infinite scroll
- Click individual floor plans to expand unit lists
- Switch between "Floor Plans" and "Apartments" tabs

## Entrata Scraping Strategy:
Similar SPA structure. Look for:
- `.unit-list`, `.apartment-list`
- Similar lazy-loading patterns
- May require clicking "View Available Apartments" first

## Concession Text:
Capture the EXACT text of any concession/special offer. Examples:
- "Enjoy 2 Months Free on Select Homes! Restrictions Apply."
- "Up to 8 Weeks Free on 14-Month Leases"
- "$500 Off Your First Month's Rent"
- "Look & Lease Special: Sign within 48 hours for waived admin fee"

Capture it verbatim — the normalizer agent will parse it.

## Output Format:
Write a JSON file per building: `scrape_{building_id}.json`
```json
{
    "building_id": 123,
    "scrape_url": "https://alexaneast.rentcafe.com",
    "scraped_at": "2026-04-09T14:30:00Z",
    "pms_platform": "yardi",
    "building_concession_banner": "Enjoy 2 Months Free!",
    "unit_types": [
        {
            "name": "A1 - The Austin",
            "bedrooms": 1,
            "bathrooms": 1,
            "sqft_min": 650,
            "sqft_max": 720
        }
    ],
    "units": [
        {
            "unit_number": "2105",
            "floor": 21,
            "floor_plan_name": "A1 - The Austin",
            "bedrooms": 1,
            "bathrooms": 1,
            "sqft": 680,
            "gross_rent": 1850,
            "available_date": "2026-05-01",
            "status": "available",
            "concession_text": "2 Months Free on 14-Month Lease",
            "lease_term_pricing": {
                "12": 1950,
                "14": 1850,
                "15": 1825
            }
        }
    ],
    "total_units_found": 45,
    "scrape_notes": "Clicked 'View All' to expand. Found concession banner at top."
}
```

## Rate Limiting & Stealth:
- Wait {SCRAPE_DELAY_MIN}-{SCRAPE_DELAY_MAX} seconds between page loads
- Use a realistic user agent string
- Don't scrape more than 20 buildings per run without pausing
- If you get a 403 or CAPTCHA, stop and log it — don't retry aggressively

## Playwright Commands:
You have access to Bash. Use Playwright via Python:
```python
from playwright.async_api import async_playwright
```

Write a Python script that:
1. Launches headless Chromium
2. Navigates to the RentCafe URL
3. Waits for content to load
4. Extracts unit data
5. Saves to JSON
"""


async def run_scraper(buildings: list[dict]) -> dict:
    """
    Scrape unit-level data from a list of buildings.
    Each building dict needs: id, scrape_url, pms_platform, name, address.
    """
    buildings_json = json.dumps(buildings, indent=2)
    output_dir = "scrape_output"

    results = []
    async for message in query(
        prompt=f"""Scrape unit-level availability data from these buildings' PMS portals.

        Buildings to scrape:
        {buildings_json}

        For each building:
        1. Write a Playwright Python script to scrape the RentCafe/Entrata/RealPage page
        2. Extract all available units with: unit number, beds/baths, sqft, rent, available date, concession text
        3. Save results as JSON to '{output_dir}/scrape_{{building_id}}.json'

        Install Playwright first if needed:
        ```
        pip install playwright
        playwright install chromium
        ```

        Process one building at a time. Wait {SCRAPE_DELAY_MIN}-{SCRAPE_DELAY_MAX} seconds between buildings.
        If a scrape fails, log the error and move to the next building.

        Print a summary: buildings scraped, total units found, any failures.""",

        options=ClaudeAgentOptions(
            system_prompt=SYSTEM_PROMPT,
            allowed_tools=["Bash", "Read", "Write"],
            model=DEFAULT_MODEL,
        ),
    ):
        results.append(message)

    return {
        "buildings_attempted": len(buildings),
        "output_dir": output_dir,
        "agent_messages": len(results),
    }


async def run_scraper_from_file(market: str) -> dict:
    """
    Read PMS discovery output and scrape all buildings with URLs found.
    """
    input_file = f"pms_discovery_output_{market}.json"
    output_dir = f"scrape_output_{market}"

    results = []
    async for message in query(
        prompt=f"""Read '{input_file}' and scrape unit-level data from all buildings
        where a PMS URL was found with high or medium confidence.

        For each building:
        1. Write a Playwright Python script to navigate to the scrape_url
        2. Extract all available units: unit number, beds/baths, sqft, gross rent,
           available date, floor plan name, concession text
        3. Save per-building JSON to '{output_dir}/scrape_{{index}}.json'

        Create the output directory first.
        Install Playwright if needed.
        Process buildings one at a time with {SCRAPE_DELAY_MIN}-{SCRAPE_DELAY_MAX}s delays.

        Print a summary at the end.""",

        options=ClaudeAgentOptions(
            system_prompt=SYSTEM_PROMPT,
            allowed_tools=["Bash", "Read", "Write"],
            model=DEFAULT_MODEL,
        ),
    ):
        results.append(message)

    return {
        "market": market,
        "output_dir": output_dir,
        "agent_messages": len(results),
    }


if __name__ == "__main__":
    import sys
    market = sys.argv[1] if len(sys.argv) > 1 else "austin"
    print(f"Running scraper for {market}...")
    result = asyncio.run(run_scraper_from_file(market))
    print(f"Done: {result}")
