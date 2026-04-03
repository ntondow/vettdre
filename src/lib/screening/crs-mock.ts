/**
 * CRS Credit API Mock Responses
 *
 * Realistic test data for development when SCREENING_USE_MOCKS=true.
 * Returns varied results to test different scoring paths.
 */

import type { CreditReportResult } from "./crs";

const MOCK_SCORES: Record<string, number> = {
  equifax: 712,
  experian: 698,
  transunion: 720,
};

export function getMockCreditReport(
  bureau: "equifax" | "experian" | "transunion"
): CreditReportResult {
  return {
    bureau,
    pullType: "soft",
    creditScore: MOCK_SCORES[bureau],
    scoreModel: "VantageScore 3.0",
    totalAccounts: 12,
    openAccounts: 8,
    totalBalance: 24500,
    totalMonthlyPayments: 850,
    delinquentAccounts: 0,
    collectionsCount: 0,
    collectionsTotal: 0,
    publicRecordsCount: 0,
    inquiriesCount12m: 2,
    oldestAccountMonths: 84,
    evictionRecords: [],
    evictionCount: 0,
    criminalRecords: [],
    criminalCount: 0,
    bankruptcyRecords: [],
    hasActiveBankruptcy: false,
    rawReport: JSON.stringify({
      _mock: true,
      bureau,
      generated_at: new Date().toISOString(),
    }),
  };
}

// Variant: applicant with some derogatory marks
export function getMockCreditReportWithIssues(
  bureau: "equifax" | "experian" | "transunion"
): CreditReportResult {
  return {
    bureau,
    pullType: "soft",
    creditScore: 580,
    scoreModel: "VantageScore 3.0",
    totalAccounts: 8,
    openAccounts: 4,
    totalBalance: 42000,
    totalMonthlyPayments: 1200,
    delinquentAccounts: 2,
    collectionsCount: 1,
    collectionsTotal: 3200,
    publicRecordsCount: 0,
    inquiriesCount12m: 5,
    oldestAccountMonths: 48,
    evictionRecords: [
      {
        court: "NYC Housing Court - Brooklyn",
        caseNumber: "LT-2024-12345",
        filedDate: "2024-03-15",
        status: "Judgment for Plaintiff",
        plaintiff: "ABC Realty LLC",
        amount: 8500,
      },
    ],
    evictionCount: 1,
    criminalRecords: [],
    criminalCount: 0,
    bankruptcyRecords: [],
    hasActiveBankruptcy: false,
    rawReport: JSON.stringify({
      _mock: true,
      _variant: "issues",
      bureau,
      generated_at: new Date().toISOString(),
    }),
  };
}

export function getMockCriminalRecords(): any[] {
  return [];
}

export function getMockEvictionRecords(): any[] {
  return [];
}
