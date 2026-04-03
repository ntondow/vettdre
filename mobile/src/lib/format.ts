// ── Formatting Helpers ────────────────────────────────────────
// Shared formatters for currency, numbers, dates, and relative time.
// Import these instead of defining inline in each screen.

/**
 * Format a number as USD currency string.
 * fmtCurrency(1500)    → "$1,500"
 * fmtCurrency(1500000) → "$1,500,000"
 * fmtCurrency(null)    → "$0"
 */
export function fmtCurrency(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "$0";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/**
 * Compact currency for tight spaces (buttons, badges).
 * fmtCurrencyCompact(1500)    → "$1.5K"
 * fmtCurrencyCompact(85000)   → "$85K"
 * fmtCurrencyCompact(1200000) → "$1.2M"
 * fmtCurrencyCompact(500)     → "$500"
 */
export function fmtCurrencyCompact(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `$${m >= 10 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return `$${k >= 10 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return `$${n.toFixed(0)}`;
}

/**
 * Format a plain number with commas.
 * fmtNumber(12500) → "12,500"
 */
export function fmtNumber(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "0";
  return n.toLocaleString();
}

/**
 * Relative time from an ISO date string.
 * timeAgo("2026-03-31T10:00:00Z") → "3m ago" / "2h ago" / "Yesterday" / "Mar 28"
 */
export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  if (diffMs < 0) return "just now";

  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;

  // Older than a week — show short date
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Format a date string to a readable format.
 * fmtDate("2026-03-31T10:00:00Z") → "Mar 31, 2026"
 */
export function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format a time string.
 * fmtTime("2026-03-31T14:30:00Z") → "2:30 PM"
 */
export function fmtTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Format a percentage.
 * fmtPct(0.873)  → "87%"
 * fmtPct(87.3)   → "87%" (auto-detects > 1 means already a percentage)
 */
export function fmtPct(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "0%";
  const val = n > 1 ? n : n * 100;
  return `${Math.round(val)}%`;
}
