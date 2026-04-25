"""
Agent 2: Status Classifier
============================
Matches permits to certificates of occupancy, deduplicates buildings,
and assigns lifecycle status. Uses fuzzy address matching + reasoning
for ambiguous cases.

Runs: After discovery agent completes
Input: discovery_output_{market}.json files
Output: Updated building records in database with correct lifecycle status
"""

import asyncio
import json

from claude_agent_sdk import query, ClaudeAgentOptions

from config.settings import DEFAULT_MODEL, REASONING_MODEL


SYSTEM_PROMPT = """You are a data classification agent for the Rental Index platform.
Your job is to take raw building permit and CO data and produce a clean, deduplicated
building registry with accurate lifecycle statuses.

## What You Do:

1. **Read** the discovery output JSON file for the given market
2. **Deduplicate** buildings that appear in both permit and CO datasets
3. **Fuzzy match** addresses that refer to the same building but are formatted differently
4. **Assign lifecycle status** based on the rules below
5. **Write** the classified output as JSON

## Address Matching Rules:
Buildings may appear multiple times with different address formats:
- "2200 E 6th St" vs "2200 East 6th Street" vs "2200 E. Sixth St" → SAME building
- "500 W Riverside Dr Bldg A" vs "500 W Riverside Dr" → SAME building (ignore building/phase suffixes)
- If two entries are within ~50 meters AND have similar unit counts → likely SAME building

When in doubt, keep them separate — false merges are worse than duplicates.

## Lifecycle Status Assignment:
| Condition | Status |
|-----------|--------|
| Has full CO with issued date | `co_issued` |
| Has TCO but no full CO | `tco_issued` |
| Permit active, description mentions "under construction" or "in progress" | `under_construction` |
| Permit issued, no CO/TCO, no construction signals | `permitted` |

## Output Format:
Write a JSON array where each building has:
```json
{
    "address": "normalized address",
    "city": "Austin",
    "state": "TX",
    "zip": "78702",
    "name": "Building Name or null",
    "total_units": 250,
    "year_built": 2023,
    "permit_number": "BP-2022-123456",
    "permit_date": "2022-03-15",
    "tco_date": "2023-11-01",
    "co_date": "2024-01-20",
    "status": "co_issued",
    "data_source": "data.austintexas.gov",
    "merge_notes": "Merged 2 records: permit BP-2022-123456 + CO-2024-001234"
}
```

## Important:
- Preserve ALL data — if two records merge, keep the most complete version of each field
- Log your reasoning for each merge decision in "merge_notes"
- If a building has no name, that's fine — leave it null (PMS discovery will find it later)
- Count your totals at the end: total unique buildings, by status, merges performed
"""


async def run_classifier(market: str) -> dict:
    """
    Run the classifier agent for a single market.
    Reads discovery output, deduplicates, assigns statuses.
    """
    input_file = f"discovery_output_{market}.json"
    output_file = f"classified_output_{market}.json"

    results = []
    async for message in query(
        prompt=f"""Read the file '{input_file}' which contains raw building permit
        and CO data for {market}.

        Your tasks:
        1. Deduplicate buildings with fuzzy address matching
        2. Merge permit records with their corresponding CO/TCO records
        3. Assign correct lifecycle status to each building
        4. Normalize all addresses (title case, standardize abbreviations)
        5. Write the clean, classified output to '{output_file}'

        Print a summary at the end:
        - Total raw records in
        - Total unique buildings out
        - Records merged (with examples of the trickiest merges)
        - Breakdown by status (permitted, under_construction, tco_issued, co_issued)""",

        options=ClaudeAgentOptions(
            system_prompt=SYSTEM_PROMPT,
            allowed_tools=["Read", "Write", "Bash"],
            model=DEFAULT_MODEL,  # Use sonnet for most; opus for ambiguous cases
        ),
    ):
        results.append(message)

    return {
        "market": market,
        "input_file": input_file,
        "output_file": output_file,
        "agent_messages": len(results),
    }


if __name__ == "__main__":
    import sys
    market = sys.argv[1] if len(sys.argv) > 1 else "austin"
    print(f"Running classifier for {market}...")
    result = asyncio.run(run_classifier(market))
    print(f"Done: {result}")
