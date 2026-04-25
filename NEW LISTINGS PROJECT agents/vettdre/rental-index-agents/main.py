"""
Rental Index — Pipeline Orchestrator
======================================
Chains all 5 agents in sequence to run the full data pipeline.
Can run the full pipeline, a single stage, or target a single market.

Usage:
    python main.py --full                          # All stages, all markets
    python main.py --stage discovery --market austin  # Single stage, single market
    python main.py --stage scrape --market austin     # Just scraping
    python main.py --market austin                    # All stages, one market
"""

import argparse
import asyncio
import json
import time
from datetime import datetime

from agents.discovery import run_discovery
from agents.classifier import run_classifier
from agents.pms_discovery import run_pms_discovery_from_file
from agents.scraper import run_scraper_from_file
from agents.normalizer import run_normalizer
from config.markets import MARKETS


# ── Pipeline stages in order ─────────────────

STAGES = {
    "discovery": {
        "name": "Building Discovery",
        "agent": "discovery",
        "description": "Pull permits + COs from open data APIs",
        "run": lambda market: run_discovery(market),
    },
    "classify": {
        "name": "Status Classification",
        "agent": "classifier",
        "description": "Deduplicate buildings, assign lifecycle status",
        "run": lambda market: run_classifier(market),
    },
    "pms_discovery": {
        "name": "PMS Portal Discovery",
        "agent": "pms_discovery",
        "description": "Find RentCafe/Entrata URLs via web search",
        "run": lambda market: run_pms_discovery_from_file(market),
    },
    "scrape": {
        "name": "Availability Scraping",
        "agent": "scraper",
        "description": "Extract unit-level data from PMS portals",
        "run": lambda market: run_scraper_from_file(market),
    },
    "normalize": {
        "name": "Normalization & Enrichment",
        "agent": "normalizer",
        "description": "Geocode, parse concessions, calculate net rent, score quality",
        "run": lambda market: run_normalizer(market),
    },
}

STAGE_ORDER = ["discovery", "classify", "pms_discovery", "scrape", "normalize"]


async def run_pipeline(market: str, stages: list[str] = None):
    """Run pipeline stages in sequence for a single market."""
    stages = stages or STAGE_ORDER
    run_id = datetime.now().strftime("%Y%m%d_%H%M%S")

    print(f"\n{'='*60}")
    print(f"  RENTAL INDEX PIPELINE — {MARKETS[market]['display_name']}")
    print(f"  Run ID: {run_id}")
    print(f"  Stages: {' → '.join(stages)}")
    print(f"{'='*60}\n")

    results = {}
    pipeline_start = time.time()

    for stage_key in stages:
        if stage_key not in STAGES:
            print(f"⚠️  Unknown stage: {stage_key}. Skipping.")
            continue

        stage = STAGES[stage_key]
        print(f"\n{'─'*50}")
        print(f"▶ Stage: {stage['name']}")
        print(f"  {stage['description']}")
        print(f"{'─'*50}")

        stage_start = time.time()
        try:
            result = await stage["run"](market)
            duration = time.time() - stage_start

            results[stage_key] = {
                "status": "success",
                "duration_seconds": round(duration, 1),
                "result": result,
            }
            print(f"✅ {stage['name']} completed in {duration:.1f}s")
            print(f"   Result: {json.dumps(result, indent=2)}")

        except Exception as e:
            duration = time.time() - stage_start
            results[stage_key] = {
                "status": "failed",
                "duration_seconds": round(duration, 1),
                "error": str(e),
            }
            print(f"❌ {stage['name']} FAILED after {duration:.1f}s: {e}")

            # Don't continue pipeline if a critical stage fails
            if stage_key in ("discovery", "classify"):
                print("   ⛔ Critical stage failed — stopping pipeline.")
                break
            else:
                print("   ⚠️  Non-critical failure — continuing pipeline.")

    pipeline_duration = time.time() - pipeline_start

    # ── Summary ──────────────────────────────
    print(f"\n{'='*60}")
    print(f"  PIPELINE COMPLETE — {MARKETS[market]['display_name']}")
    print(f"  Total duration: {pipeline_duration:.1f}s")
    print(f"{'='*60}")

    for stage_key, result in results.items():
        status_icon = "✅" if result["status"] == "success" else "❌"
        print(f"  {status_icon} {STAGES[stage_key]['name']}: {result['status']} ({result['duration_seconds']}s)")

    # Save run log
    log_file = f"pipeline_run_{market}_{run_id}.json"
    with open(log_file, "w") as f:
        json.dump({
            "run_id": run_id,
            "market": market,
            "stages": stages,
            "results": results,
            "total_duration_seconds": round(pipeline_duration, 1),
        }, f, indent=2)
    print(f"\n  Run log saved: {log_file}")

    return results


async def run_full_pipeline(markets: list[str] = None, stages: list[str] = None):
    """Run pipeline for multiple markets (sequentially to manage rate limits)."""
    markets = markets or list(MARKETS.keys())
    all_results = {}

    for market in markets:
        print(f"\n\n{'#'*60}")
        print(f"  STARTING MARKET: {MARKETS[market]['display_name']}")
        print(f"{'#'*60}")

        all_results[market] = await run_pipeline(market, stages)

    return all_results


def main():
    parser = argparse.ArgumentParser(description="Rental Index Pipeline Orchestrator")
    parser.add_argument("--full", action="store_true", help="Run all stages for all markets")
    parser.add_argument("--market", type=str, help="Target market (austin, dfw, phoenix, denver, nashville)")
    parser.add_argument("--stage", type=str, help=f"Single stage to run: {', '.join(STAGE_ORDER)}")
    parser.add_argument("--stages", type=str, help="Comma-separated stages (e.g., 'discovery,classify')")

    args = parser.parse_args()

    # Determine which stages to run
    if args.stage:
        stages = [args.stage]
    elif args.stages:
        stages = [s.strip() for s in args.stages.split(",")]
    else:
        stages = STAGE_ORDER

    # Determine which markets to run
    if args.full:
        asyncio.run(run_full_pipeline(stages=stages))
    elif args.market:
        if args.market not in MARKETS:
            print(f"Unknown market: {args.market}")
            print(f"Available: {', '.join(MARKETS.keys())}")
            return
        asyncio.run(run_pipeline(args.market, stages))
    else:
        # Default: Austin only
        print("No market specified — defaulting to Austin.")
        print("Use --full for all markets, or --market <name> for a specific one.")
        asyncio.run(run_pipeline("austin", stages))


if __name__ == "__main__":
    main()
