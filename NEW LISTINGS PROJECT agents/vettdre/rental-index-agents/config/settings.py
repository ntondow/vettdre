"""
Global settings — DB connection, rate limits, models, scraping config.
"""
import os

# ── Database ──────────────────────────────────
SUPABASE_URL = os.getenv("SUPABASE_URL", "http://localhost:54321")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "your-local-anon-key")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:54322/postgres")

# ── Claude Agent SDK ──────────────────────────
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
DEFAULT_MODEL = "sonnet"            # Fast + capable for most agents
REASONING_MODEL = "opus"            # Complex classification / ambiguous parsing

# ── Scraping ──────────────────────────────────
SCRAPE_DELAY_MIN = 3                # Seconds between requests (respect rate limits)
SCRAPE_DELAY_MAX = 6
USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
]
PROXY_URL = os.getenv("PROXY_URL")  # Optional: Bright Data / Oxylabs residential proxy

# ── Cadence ───────────────────────────────────
ACTIVE_SCRAPE_INTERVAL_HOURS = 24   # Buildings in 'leasing' status
STABILIZED_SCRAPE_INTERVAL_HOURS = 168  # Buildings >93% occupied (weekly)
PERMIT_CHECK_INTERVAL_HOURS = 168   # Weekly permit pulls
CO_CHECK_INTERVAL_HOURS = 24        # Daily CO/TCO checks

# ── Quality ───────────────────────────────────
MIN_UNITS_FOR_MULTIFAMILY = 5       # Skip buildings with fewer units
MIN_YEAR_BUILT = 2019               # Focus on recent construction
STABILIZED_OCCUPANCY_THRESHOLD = 0.93

# ── Geocoding ─────────────────────────────────
GEOCODING_PROVIDER = "census"       # Free: Census Geocoder. Alt: "google" (paid)
GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")
