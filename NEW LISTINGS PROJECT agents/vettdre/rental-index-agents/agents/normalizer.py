"""
Agent 5: Normalizer
====================
Post-scrape processing: geocoding, concession parsing, net effective rent
calculation, data quality scoring, and price history append.

This agent is the data quality gatekeeper. Every scraped record passes
through here before it's considered "clean" for the API.

Runs: After every scrape batch
Input: Raw scrape JSON files from Agent 4
Output: Enriched records written to database, price history appended
"""

import asyncio
import json

from claude_agent_sdk import query, ClaudeAgentOptions, AgentDefinition

from config.settings import DEFAULT_MODEL, REASONING_MODEL


SYSTEM_PROMPT = """You are the data normalization and enrichment agent for the Rental Index platform.
You take raw scraped apartment data and transform it into clean, standardized, enriched records.

## Your 6 Jobs:

### 1. Address Standardization & Geocoding
- Normalize addresses: "2200 E 6th St" → "2200 East 6th Street"
- Use the Census Geocoder API (free, no key needed):
  `https://geocoding.geo.census.gov/geocoder/addresses/onelineaddress?address={encoded_address}&benchmark=2020&format=json`
- Extract latitude, longitude from the response
- If Census fails, try a structured address lookup

### 2. Submarket Assignment
Assign each building to a submarket based on its neighborhood/zip code.
For Austin, common submarkets include:
- Downtown/CBD (78701, 78703)
- East Austin (78702)
- South Congress/South Lamar (78704)
- Domain/North Austin (78758, 78759)
- Mueller (78723)
- Zilker/Barton Hills (78746)
- South Austin (78745, 78748)
- Round Rock/Cedar Park (78664, 78613)

(Use zip code + neighborhood knowledge to assign. If unsure, use "Other".)

### 3. Concession Parsing
Parse raw concession text into structured fields. This is critical.

**Pattern matching (handle these common formats):**
- "X months free" → concession_type: "months_free", concession_months_free: X
- "X weeks free" → convert to months (weeks / 4.33)
- "$X off first month" → concession_type: "flat_discount", concession_value: X
- "Waived admin/application fee" → concession_type: "waived_fees"
- "$X gift card" → concession_type: "gift_card", concession_value: X
- "Reduced deposit" → concession_type: "reduced_deposit"

**For ambiguous concession text:**
Use your reasoning to parse it. Example:
"Enjoy up to 8 weeks free on select 14-month leases! Plus waived admin fee ($350)!"
→ Primary: months_free = 1.85 (8 weeks ÷ 4.33)
→ Secondary: waived_fees, value = 350
→ Use the primary (largest value) for net rent calculation

### 4. Net Effective Rent Calculation
THE most important calculation in the platform.

**Formula for months_free:**
```
net_effective_rent = (paying_months × gross_rent) / total_lease_months
where paying_months = total_lease_months - concession_months_free
```

**Formula for flat_discount:**
```
net_effective_rent = ((total_lease_months × gross_rent) - concession_value) / total_lease_months
```

**Default lease term:** 12 months (if not specified)
**If lease term pricing matrix exists:** Calculate net rent for EACH term

**Always calculate:**
- net_effective_rent
- net_concession_monthly = gross_rent - net_effective_rent
- net_rent_per_sqft = net_effective_rent / sqft (if sqft available)
- gross_rent_per_sqft = gross_rent / sqft

### 5. Data Quality Scoring (0.0 to 1.0)
Score each unit record on completeness and consistency:
- Has unit_number: +0.15
- Has gross_rent: +0.20
- Has sqft: +0.10
- Has bedrooms/bathrooms: +0.10
- Has available_date: +0.10
- Has concession parsed (if raw text existed): +0.10
- Net rent calculated: +0.15
- Geocoded successfully: +0.10

Score < 0.5 = flag for manual review

### 6. Price History Append
For EVERY unit, create a price_history record with today's snapshot.
This is append-only. NEVER skip this step. The time-series data is the
most valuable asset in the entire platform.

## Output:
For each building's scrape data, write an enriched JSON file:
`normalized_{building_id}.json` with all calculated fields added.

Also write a summary: `normalization_summary.json` with:
- Total units processed
- Average data quality score
- Concessions parsed vs. failed
- Geocoding success rate
- Net rent range (min/max) per market
"""


# Subagent for handling ambiguous concession text
CONCESSION_PARSER_SUBAGENT = AgentDefinition(
    description="Parses ambiguous apartment concession text into structured data",
    prompt="""You are an expert at parsing apartment concession/special offer text.
    Given raw concession text, extract:
    - concession_type (months_free, flat_discount, waived_fees, gift_card, reduced_deposit, other)
    - concession_months_free (if applicable)
    - concession_value (dollar amount)
    - lease_term_months (if specified)
    - notes (any caveats like "select homes only", "must sign by date")

    Return ONLY valid JSON. No explanation needed.""",
    tools=["Read", "Write"],
    model=REASONING_MODEL,  # Use opus for ambiguous parsing
)


async def run_normalizer(market: str) -> dict:
    """
    Normalize and enrich all scraped data for a market.
    Reads scrape output files, writes enriched files + summary.
    """
    scrape_dir = f"scrape_output_{market}"
    output_dir = f"normalized_output_{market}"

    results = []
    async for message in query(
        prompt=f"""Process all scraped building data in '{scrape_dir}/'.

        For each scrape file:
        1. Geocode the building address using the Census Geocoder API
        2. Assign a submarket based on zip code / neighborhood
        3. Parse all concession text into structured fields
        4. Calculate net effective rent for every unit
        5. Score data quality (0-1) for every unit
        6. Write enriched output to '{output_dir}/normalized_{{filename}}'

        Then write '{output_dir}/normalization_summary.json' with aggregate stats:
        - Total buildings processed
        - Total units processed
        - Average data quality score
        - Concession parsing success rate
        - Geocoding success rate
        - Rent ranges by bedroom count

        Create the output directory first.
        Process files one at a time — geocoding can be slow.

        For ambiguous concession text that regex can't handle, use the
        concession_parser subagent to reason through it.""",

        options=ClaudeAgentOptions(
            system_prompt=SYSTEM_PROMPT,
            allowed_tools=["Bash", "WebFetch", "Read", "Write"],
            agents={"concession_parser": CONCESSION_PARSER_SUBAGENT},
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
    print(f"Running normalizer for {market}...")
    result = asyncio.run(run_normalizer(market))
    print(f"Done: {result}")
