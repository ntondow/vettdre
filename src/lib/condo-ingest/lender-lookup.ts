/**
 * Lender Canonicalization — maps raw ACRIS lender names to canonical entities.
 *
 * Maintains a lookup of major NYC mortgage lenders with FFIEC IDs.
 * Classifies entities as bank vs non-bank for distress signal computation.
 */

import prisma from "@/lib/prisma";
import { normalizeName } from "@/lib/entity-resolver";

// ── Major NYC Lender Registry ────────────────────────────────
// FFIEC IDs from https://www.ffiec.gov/nicpubweb/nicweb/SearchForm.aspx
// NOTE: This list needs periodic updates as banks merge/rename.

interface KnownLender {
  patterns: string[];     // normalized name fragments to match
  canonicalName: string;
  ffiecId?: string;
  defunct?: boolean;       // Signature Bank, etc.
}

const KNOWN_LENDERS: KnownLender[] = [
  { patterns: ["JPMORGAN", "JP MORGAN", "CHASE"], canonicalName: "JPMorgan Chase Bank, N.A.", ffiecId: "852218" },
  { patterns: ["WELLS FARGO"], canonicalName: "Wells Fargo Bank, N.A.", ffiecId: "451965" },
  { patterns: ["CITIBANK", "CITIGROUP", "CITIMORTGAGE"], canonicalName: "Citibank, N.A.", ffiecId: "476810" },
  { patterns: ["BANK OF AMERICA", "BOFA"], canonicalName: "Bank of America, N.A.", ffiecId: "480228" },
  { patterns: ["CAPITAL ONE"], canonicalName: "Capital One, N.A.", ffiecId: "112837" },
  { patterns: ["M&T BANK", "M AND T BANK", "MANUFACTURERS AND TRADERS"], canonicalName: "M&T Bank", ffiecId: "501105" },
  { patterns: ["INVESTORS BANK"], canonicalName: "Investors Bank", ffiecId: "258907" },
  { patterns: ["CUSTOMERS BANK"], canonicalName: "Customers Bank", ffiecId: "34923" },
  { patterns: ["APPLE BANK"], canonicalName: "Apple Bank for Savings", ffiecId: "718233" },
  { patterns: ["NEW YORK COMMUNITY BANK", "NYCB", "FLAGSTAR"], canonicalName: "Flagstar Bank, N.A.", ffiecId: "258907" },
  { patterns: ["SIGNATURE BANK"], canonicalName: "Signature Bank", ffiecId: "57890", defunct: true },
  { patterns: ["STERLING NATIONAL", "STERLING BANCORP"], canonicalName: "Webster Bank, N.A.", ffiecId: "796714" },
  { patterns: ["TD BANK"], canonicalName: "TD Bank, N.A.", ffiecId: "497404" },
  { patterns: ["HSBC"], canonicalName: "HSBC Bank USA, N.A.", ffiecId: "413208" },
  { patterns: ["BANK LEUMI"], canonicalName: "Bank Leumi USA", ffiecId: "938619" },
  { patterns: ["VALLEY NATIONAL"], canonicalName: "Valley National Bank", ffiecId: "910956" },
  { patterns: ["PNC BANK", "PNC FINANCIAL"], canonicalName: "PNC Bank, N.A.", ffiecId: "817824" },
  { patterns: ["US BANK", "U S BANK", "US BANCORP"], canonicalName: "U.S. Bank, N.A.", ffiecId: "504713" },
  { patterns: ["DEUTSCHE BANK"], canonicalName: "Deutsche Bank National Trust Company", ffiecId: "214807" },
  { patterns: ["BANK OF NEW YORK", "BNY MELLON"], canonicalName: "The Bank of New York Mellon", ffiecId: "541101" },
  { patterns: ["GOLDMAN SACHS"], canonicalName: "Goldman Sachs Bank USA", ffiecId: "2182786" },
  { patterns: ["MORGAN STANLEY"], canonicalName: "Morgan Stanley Bank, N.A.", ffiecId: "1456501" },
  { patterns: ["EMIGRANT"], canonicalName: "Emigrant Bank", ffiecId: "543557" },
  // Mortgage-specific lenders (not FDIC-insured banks but major originators)
  { patterns: ["MORTGAGE ELECTRONIC", "MERS"], canonicalName: "MERS (Mortgage Electronic Registration Systems)" },
  { patterns: ["FREEDOM MORTGAGE"], canonicalName: "Freedom Mortgage Corporation" },
  { patterns: ["ROCKET MORTGAGE", "QUICKEN LOANS"], canonicalName: "Rocket Mortgage, LLC" },
  { patterns: ["UNITED WHOLESALE"], canonicalName: "United Wholesale Mortgage, LLC" },
  { patterns: ["PENNYMAC"], canonicalName: "PennyMac Loan Services, LLC" },
  { patterns: ["LOANCARE"], canonicalName: "LoanCare, LLC" },
];

/** Bank name patterns — if a name matches any of these, it's likely a bank */
const BANK_PATTERNS = [
  /\bBANK\b/i,
  /\bSAVINGS\b/i,
  /\bTRUST\s*CO/i,
  /\bNATIONAL\s*ASSOC/i,
  /\bFEDERAL\s*CREDIT/i,
  /\bCREDIT\s*UNION\b/i,
  /\bN\.?A\.?\s*$/i,      // "N.A." suffix = nationally chartered
  /\bFSB\b/i,             // Federal Savings Bank
];

/**
 * Determine if a name looks like a bank/financial institution vs private entity.
 */
export function classifyAsBank(name: string): boolean {
  if (!name) return false;
  const upper = name.toUpperCase();
  // Check known lenders first
  const normalized = normalizeName(name);
  for (const lender of KNOWN_LENDERS) {
    if (lender.patterns.some(p => normalized.includes(p) || upper.includes(p))) {
      return true;
    }
  }
  // Check bank name patterns
  return BANK_PATTERNS.some(p => p.test(name));
}

/**
 * Look up a lender name against the known-lender registry.
 * Returns canonical name + FFIEC ID if found.
 */
export function lookupKnownLender(name: string): { canonicalName: string; ffiecId?: string; defunct?: boolean } | null {
  if (!name) return null;
  const normalized = normalizeName(name);
  const upper = name.toUpperCase();

  for (const lender of KNOWN_LENDERS) {
    if (lender.patterns.some(p => normalized.includes(p) || upper.includes(p))) {
      return { canonicalName: lender.canonicalName, ffiecId: lender.ffiecId, defunct: lender.defunct };
    }
  }
  return null;
}

/**
 * Resolve or create a Co_entity for a lender, with bank classification.
 * Returns the entity ID.
 */
export async function resolveOrCreateLenderEntity(
  orgId: string,
  rawName: string,
): Promise<{ id: string; isBank: boolean; ffiecId?: string }> {
  const normalized = normalizeName(rawName);
  const known = lookupKnownLender(rawName);
  const isBank = classifyAsBank(rawName);

  // Try existing entity
  const existing = await prisma.coEntity.findFirst({
    where: { orgId, nameNormalized: normalized },
    select: { id: true, isBank: true, bankFfiecId: true },
  });

  if (existing) {
    // Update bank fields if newly classified
    if (isBank && !existing.isBank) {
      await prisma.coEntity.update({
        where: { id: existing.id },
        data: {
          isBank: true,
          bankFfiecId: known?.ffiecId || existing.bankFfiecId || null,
        },
      }).catch(() => {});
    }
    return { id: existing.id, isBank, ffiecId: known?.ffiecId };
  }

  // Create new entity
  const created = await prisma.coEntity.create({
    data: {
      orgId,
      canonicalName: known?.canonicalName || rawName,
      nameNormalized: normalized,
      entityType: isBank ? "corp" : "unknown",
      isBank,
      bankFfiecId: known?.ffiecId || null,
      sources: ["acris_mortgage"],
      confidence: known ? 0.95 : 0.70,
    },
    select: { id: true },
  });

  return { id: created.id, isBank, ffiecId: known?.ffiecId };
}
