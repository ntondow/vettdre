/**
 * CRS Credit API Client for Tenant Screening
 *
 * Handles credit report pulls (single bureau + tri-bureau),
 * criminal background checks, and eviction record searches.
 *
 * When SCREENING_USE_MOCKS=true, returns realistic sandbox data
 * from crs-mock.ts instead of calling the real API.
 */

import { getMockCreditReport, getMockCriminalRecords, getMockEvictionRecords } from "./crs-mock";

const USE_MOCKS = process.env.SCREENING_USE_MOCKS === "true";
const CRS_BASE_URL = process.env.CRS_API_BASE_URL || "";
const CRS_API_KEY = process.env.CRS_API_KEY || "";
const CRS_ACCOUNT_ID = process.env.CRS_ACCOUNT_ID || "";

// ── Types ─────────────────────────────────────────────────────

export interface CreditPullRequest {
  firstName: string;
  lastName: string;
  ssn: string;          // Decrypted SSN, used only for API call
  dateOfBirth: string;  // YYYY-MM-DD
  address: string;
  city: string;
  state: string;
  zip: string;
}

export interface CreditReportResult {
  bureau: "equifax" | "experian" | "transunion";
  pullType: "soft" | "hard";
  creditScore: number | null;
  scoreModel: string | null;
  totalAccounts: number;
  openAccounts: number;
  totalBalance: number;
  totalMonthlyPayments: number;
  delinquentAccounts: number;
  collectionsCount: number;
  collectionsTotal: number;
  publicRecordsCount: number;
  inquiriesCount12m: number;
  oldestAccountMonths: number;
  evictionRecords: EvictionRecord[];
  evictionCount: number;
  criminalRecords: CriminalRecord[];
  criminalCount: number;
  bankruptcyRecords: BankruptcyRecord[];
  hasActiveBankruptcy: boolean;
  rawReport: string; // JSON string to be encrypted before storage
}

export interface EvictionRecord {
  court: string;
  caseNumber: string;
  filedDate: string;
  status: string;
  plaintiff: string;
  amount: number | null;
}

export interface CriminalRecord {
  court: string;
  caseNumber: string;
  offense: string;
  offenseDate: string;
  disposition: string;
  severity: string; // felony, misdemeanor
}

export interface BankruptcyRecord {
  court: string;
  caseNumber: string;
  filedDate: string;
  chapter: string;
  status: string; // active, discharged, dismissed
}

// ── Single Bureau Pull ────────────────────────────────────────

/**
 * Pull a single-bureau credit report (Equifax soft pull) with
 * bundled criminal + eviction check.
 */
export async function pullSingleBureau(
  request: CreditPullRequest
): Promise<CreditReportResult> {
  if (USE_MOCKS) {
    return getMockCreditReport("equifax");
  }

  // Real CRS API call
  const response = await fetch(`${CRS_BASE_URL}/v1/reports/single`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${CRS_API_KEY}`,
      "X-Account-Id": CRS_ACCOUNT_ID,
    },
    body: JSON.stringify({
      bureau: "equifax",
      pull_type: "soft",
      applicant: {
        first_name: request.firstName,
        last_name: request.lastName,
        ssn: request.ssn,
        date_of_birth: request.dateOfBirth,
        address: request.address,
        city: request.city,
        state: request.state,
        zip: request.zip,
      },
      include_criminal: true,
      include_eviction: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`CRS API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return parseCRSResponse(data, "equifax", "soft");
}

// ── Tri-Bureau Pull ───────────────────────────────────────────

/**
 * Pull tri-bureau credit reports (Equifax + Experian + TransUnion).
 * Enhanced tier only.
 */
export async function pullTriBureau(
  request: CreditPullRequest
): Promise<CreditReportResult[]> {
  if (USE_MOCKS) {
    return [
      getMockCreditReport("equifax"),
      getMockCreditReport("experian"),
      getMockCreditReport("transunion"),
    ];
  }

  const response = await fetch(`${CRS_BASE_URL}/v1/reports/tri-bureau`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${CRS_API_KEY}`,
      "X-Account-Id": CRS_ACCOUNT_ID,
    },
    body: JSON.stringify({
      pull_type: "soft",
      applicant: {
        first_name: request.firstName,
        last_name: request.lastName,
        ssn: request.ssn,
        date_of_birth: request.dateOfBirth,
        address: request.address,
        city: request.city,
        state: request.state,
        zip: request.zip,
      },
      include_criminal: true,
      include_eviction: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`CRS tri-bureau API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const bureauNames = ["equifax", "experian", "transunion"] as const;
  return (data.reports || [])
    .slice(0, 3) // Guard against unexpected extra reports
    .map((report: any, i: number) => {
      const bureau = bureauNames[i] || "equifax"; // Fallback to equifax if index out of range
      return parseCRSResponse(report, bureau, "soft");
    });
}

// ── Response Parser ───────────────────────────────────────────

function parseCRSResponse(
  data: any,
  bureau: CreditReportResult["bureau"],
  pullType: CreditReportResult["pullType"]
): CreditReportResult {
  // This parser maps CRS API response format to our model.
  // Actual field names will depend on CRS API documentation.
  return {
    bureau,
    pullType,
    creditScore: data.credit_score ?? null,
    scoreModel: data.score_model ?? null,
    totalAccounts: data.total_accounts ?? 0,
    openAccounts: data.open_accounts ?? 0,
    totalBalance: data.total_balance ?? 0,
    totalMonthlyPayments: data.total_monthly_payments ?? 0,
    delinquentAccounts: data.delinquent_accounts ?? 0,
    collectionsCount: data.collections_count ?? 0,
    collectionsTotal: data.collections_total ?? 0,
    publicRecordsCount: data.public_records_count ?? 0,
    inquiriesCount12m: data.inquiries_12m ?? 0,
    oldestAccountMonths: data.oldest_account_months ?? 0,
    evictionRecords: (data.eviction_records || []).map((r: any) => ({
      court: r.court || "",
      caseNumber: r.case_number || "",
      filedDate: r.filed_date || "",
      status: r.status || "",
      plaintiff: r.plaintiff || "",
      amount: r.amount ?? null,
    })),
    evictionCount: data.eviction_records?.length || 0,
    criminalRecords: (data.criminal_records || []).map((r: any) => ({
      court: r.court || "",
      caseNumber: r.case_number || "",
      offense: r.offense || "",
      offenseDate: r.offense_date || "",
      disposition: r.disposition || "",
      severity: r.severity || "misdemeanor",
    })),
    criminalCount: data.criminal_records?.length || 0,
    bankruptcyRecords: (data.bankruptcy_records || []).map((r: any) => ({
      court: r.court || "",
      caseNumber: r.case_number || "",
      filedDate: r.filed_date || "",
      chapter: r.chapter || "",
      status: r.status || "",
    })),
    hasActiveBankruptcy: (data.bankruptcy_records || []).some((r: any) => r.status === "active"),
    rawReport: JSON.stringify(data),
  };
}
