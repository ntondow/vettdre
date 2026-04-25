/**
 * Credit Provider Abstraction
 *
 * Common interface for credit/background check providers.
 * Allows swapping the underlying provider (CRS, TransUnion SmartMove, etc.)
 * without changing pipeline logic.
 */

// Re-export types from crs.ts — these are provider-agnostic
export type {
  CreditPullRequest,
  CreditReportResult,
  EvictionRecord,
  CriminalRecord,
  BankruptcyRecord,
} from "./crs";

import type { CreditPullRequest, CreditReportResult } from "./crs";

// ── Provider Interface ───────────────────────────────────────

export interface CreditProvider {
  readonly name: string;

  /**
   * Pull a single-bureau credit report (soft pull) with
   * bundled criminal + eviction check.
   */
  pullSingleBureau(request: CreditPullRequest): Promise<CreditReportResult>;

  /**
   * Pull tri-bureau credit reports (Equifax + Experian + TransUnion).
   * Enhanced tier only.
   */
  pullTriBureau(request: CreditPullRequest): Promise<CreditReportResult[]>;
}
