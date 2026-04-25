/**
 * Registered-Agent / Mail-Drop Blacklist
 *
 * Known registered-agent services and virtual mailbox providers whose addresses
 * should NOT generate shared_address edges (they're not meaningful — thousands
 * of unrelated LLCs share these addresses via a paid service).
 *
 * NOTE: This list needs ongoing curation. New registered-agent services appear
 * regularly. Flagged for quarterly review.
 *
 * Source: publicly known registered-agent service providers in New York.
 */

import { normalizeAddress } from "@/lib/entity-resolver";

// ── Known Registered-Agent Service Names ─────────────────────

const AGENT_SERVICE_NAMES = new Set([
  "COGENCY GLOBAL",
  "COGENCY GLOBAL INC",
  "CT CORPORATION",
  "CT CORPORATION SYSTEM",
  "C T CORPORATION SYSTEM",
  "CORPORATION SERVICE COMPANY",
  "CSC",
  "NATIONAL REGISTERED AGENTS",
  "NATIONAL REGISTERED AGENTS INC",
  "NRAI",
  "INCORP SERVICES",
  "INCORP SERVICES INC",
  "LEGALZOOM",
  "LEGALZOOM COM",
  "REGISTERED AGENTS INC",
  "UNITED STATES CORPORATION AGENTS",
  "USC AGENTS",
  "VCORP SERVICES",
  "HARBOR COMPLIANCE",
  "NORTHWEST REGISTERED AGENT",
  "SPIEGEL & UTRERA",
  "SPIEGEL UTRERA",
  "BLUMBERG EXCELSIOR",
  "THE COMPANY CORPORATION",
  "AGENTS AND CORPORATIONS",
  "PARACORP",
  "WOLFE & WYMAN",
]);

// ── Known Registered-Agent Addresses (normalized street fragments) ────

const AGENT_ADDRESS_PATTERNS = [
  // Cogency Global offices
  "10 EAST 40",
  "10 E 40",
  // CT Corporation
  "28 LIBERTY",
  "111 8 AVENUE", // CT Corp NYC
  "111 EIGHTH AVENUE",
  // Corporation Service Company
  "80 STATE",
  // NRAI
  "875 AVENUE OF THE AMERICAS",
  // Common UPS Store / Regus / WeWork addresses used as registered agents
  "1 ROCKEFELLER",
  "1345 AVENUE OF THE AMERICAS",
];

// ── Blacklist Functions ──────────────────────────────────────

/**
 * Check if a name is a known registered-agent service.
 */
export function isRegisteredAgentName(name: string): boolean {
  if (!name) return false;
  const upper = name.toUpperCase().trim()
    .replace(/[,.\-_]+/g, " ")
    .replace(/\s+/g, " ");
  return AGENT_SERVICE_NAMES.has(upper);
}

/**
 * Check if an address matches a known registered-agent / mail-drop pattern.
 */
export function isAgentServiceAddress(address: string): boolean {
  if (!address) return false;
  const norm = normalizeAddress(address);
  const combined = `${norm.number} ${norm.street}`.toUpperCase().trim();

  for (const pattern of AGENT_ADDRESS_PATTERNS) {
    if (combined.includes(pattern)) return true;
  }

  // PO Box pattern — often a mail-drop
  if (/\bP\.?O\.?\s*BOX\b/i.test(address)) return true;

  // UPS Store pattern
  if (/\bUPS\s*STORE\b/i.test(address)) return true;

  return false;
}

/**
 * Check if an address should be suppressed for shared_address edges.
 * Combines both name and address checks.
 */
export function isBlacklistedAddress(address: string, agentName?: string): boolean {
  if (agentName && isRegisteredAgentName(agentName)) return true;
  return isAgentServiceAddress(address);
}
