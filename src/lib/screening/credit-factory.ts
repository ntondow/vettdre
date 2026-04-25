/**
 * Credit Provider Factory
 *
 * Selects the credit provider based on CREDIT_PROVIDER env var.
 * When SCREENING_USE_MOCKS=true, returns a mock provider that
 * wraps the existing crs-mock.ts data.
 */

import type { CreditProvider } from "./credit-provider";
import type { CreditPullRequest, CreditReportResult } from "./crs";
import { crsProvider } from "./credit-crs";
import { getMockCreditReport } from "./crs-mock";

// ── Mock Provider ────────────────────────────────────────────

const mockProvider: CreditProvider = {
  name: "mock",

  async pullSingleBureau(_request: CreditPullRequest): Promise<CreditReportResult> {
    return getMockCreditReport("equifax");
  },

  async pullTriBureau(_request: CreditPullRequest): Promise<CreditReportResult[]> {
    return [
      getMockCreditReport("equifax"),
      getMockCreditReport("experian"),
      getMockCreditReport("transunion"),
    ];
  },
};

// ── Factory ──────────────────────────────────────────────────

function getProviderByName(name: string): CreditProvider {
  switch (name.toLowerCase()) {
    case "crs":
    default:
      return crsProvider;
  }
}

/**
 * Get the configured credit provider.
 * Returns mock provider when SCREENING_USE_MOCKS=true.
 */
export function getCreditProvider(): CreditProvider {
  if (process.env.SCREENING_USE_MOCKS === "true") {
    return mockProvider;
  }
  return getProviderByName(process.env.CREDIT_PROVIDER || "crs");
}
