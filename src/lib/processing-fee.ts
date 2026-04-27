import type { Decimal } from "@prisma/client/runtime/library";

export interface ProcessingFeeInput {
  totalCommission: Decimal | number | string;
  agentSplitPct: Decimal | number | string;
  organizationDefaultPct: Decimal | number | string | null | undefined;
  override: boolean;
  overridePct?: Decimal | number | string | null | undefined;
}

export interface ProcessingFeeResult {
  feePct: number;
  feeAmt: number;
  agentPayout: number;
  housePayout: number;
}

// Rounds gross share and fee separately, then subtracts. This matches the 18
// historical Kristin imports — using ROUND(gross - fee, 2) instead drifts by a
// cent on values like 3310 Nostrand.
export function computeProcessingFee(input: ProcessingFeeInput): ProcessingFeeResult {
  const total = toNum(input.totalCommission);
  const agentSplit = toNum(input.agentSplitPct);

  const feePct = input.override
    ? toNum(input.overridePct, 0)
    : toNum(input.organizationDefaultPct, 0);

  const feeAmt = round2((total * feePct) / 100);
  const grossAgentShare = round2((total * agentSplit) / 100);
  const agentPayout = round2(grossAgentShare - feeAmt);
  const housePayout = round2(total - grossAgentShare);

  return { feePct, feeAmt, agentPayout, housePayout };
}

function toNum(v: Decimal | number | string | null | undefined, fallback = 0): number {
  if (v == null) return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
