"use server";

// ============================================================
// Investment Summary — Data Assembly Server Actions
// Assembles an InvestmentSummaryPayload from either:
//   1. A saved DealAnalysis record (by ID)
//   2. Raw inputs/outputs passed directly
// ============================================================

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import type {
  InvestmentSummaryPayload,
  InvestmentPropertyData,
  InvestmentDealStructure,
  InvestmentIncomeData,
  InvestmentExpenseData,
  InvestmentExpenseLineItem,
  InvestmentFinancingData,
  InvestmentReturnMetrics,
  InvestmentCashFlowYear,
  InvestmentExitAnalysis,
  InvestmentSourcesUses,
  InvestmentRiskFactor,
  InvestmentSensitivity,
  InvestmentBridgeDetails,
  InvestmentAssumableDetails,
  InvestmentSyndicationDetails,
  InvestmentBenchmarks,
} from "@/lib/investment-summary-types";
import type { BovBranding, BovBrokerInfo } from "@/lib/bov-types";
import { checkFeatureAccess } from "@/lib/feature-gate-server";

// ── Auth Helper ──────────────────────────────────────────────

async function getAuthContext() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");

  const user = await prisma.user.findUnique({
    where: { authProviderId: authUser.id },
    include: {
      organization: { include: { brandSettings: true } },
    },
  });
  if (!user) throw new Error("User not found");
  return user;
}

// ── Public Actions ───────────────────────────────────────────

/** Assemble payload from a saved DealAnalysis record */
export async function assembleInvestmentSummary(
  dealAnalysisId: string,
): Promise<InvestmentSummaryPayload> {
  const user = await getAuthContext();

  const { allowed } = await checkFeatureAccess(user.id, "investment_summary");
  if (!allowed) throw new Error("Upgrade required: Investment Summary requires a Pro plan or higher");

  const deal = await prisma.dealAnalysis.findFirst({
    where: { id: dealAnalysisId, orgId: user.orgId },
  });
  if (!deal) throw new Error("Deal not found");

  const inputs = (deal.inputs || {}) as Record<string, any>;
  const outputs = (deal.outputs || {}) as Record<string, any>;

  return buildPayload(user, inputs, outputs, {
    address: deal.address || undefined,
    borough: deal.borough || undefined,
    bbl: deal.bbl || undefined,
  });
}

/** Assemble payload from raw deal-calculator or deal-structure-engine data */
export async function assembleInvestmentSummaryFromInputs(
  inputs: Record<string, any>,
  outputs: Record<string, any>,
  bbl?: string,
): Promise<InvestmentSummaryPayload> {
  const user = await getAuthContext();

  const { allowed } = await checkFeatureAccess(user.id, "investment_summary");
  if (!allowed) throw new Error("Upgrade required: Investment Summary requires a Pro plan or higher");

  return buildPayload(user, inputs, outputs, { bbl });
}

// ── Core Builder ─────────────────────────────────────────────

interface DealMeta {
  address?: string;
  borough?: string;
  bbl?: string;
}

function buildPayload(
  user: Awaited<ReturnType<typeof getAuthContext>>,
  inputs: Record<string, any>,
  outputs: Record<string, any>,
  meta?: DealMeta,
): InvestmentSummaryPayload {
  // Detect: deal-structure-engine stores `structure` on the output
  const isStructured = !!outputs.structure;

  const { branding, brokerInfo } = extractBrandingAndBroker(user);
  const property = buildPropertyData(inputs, meta);
  const dealStructure = buildDealStructure(inputs, outputs, isStructured);
  const income = buildIncomeData(inputs, outputs, isStructured);
  const expenses = buildExpenseData(inputs, outputs, isStructured);
  const financing = buildFinancingData(inputs, outputs, isStructured);
  const returns = buildReturnMetrics(outputs, isStructured);
  const cashFlows = buildCashFlows(outputs, isStructured);
  const exitAnalysis = buildExitAnalysis(inputs, outputs, isStructured);
  const sourcesAndUses = buildSourcesAndUses(outputs, isStructured);
  const riskFactors = generateRiskFactors(inputs, outputs, returns, financing, isStructured);
  const sensitivity = buildSensitivity(outputs, isStructured);
  const bridgeDetails = buildBridgeDetails(outputs, isStructured);
  const assumableDetails = buildAssumableDetails(outputs, isStructured);
  const syndicationDetails = buildSyndicationDetails(outputs, isStructured);
  const benchmarks = buildBenchmarks(outputs, isStructured);

  // Build acquisition cost breakdown from inputs if available
  const acquisitionCostBreakdown = buildAcquisitionCostBreakdown(inputs);

  const payload: InvestmentSummaryPayload = {
    generatedAt: new Date().toISOString(),
    generatedBy: brokerInfo,
    branding,
    property,
    dealStructure,
    income,
    expenses,
    financing,
    returns,
    cashFlows,
    exitAnalysis,
    sourcesAndUses,
    riskFactors,
    sensitivity,
    bridgeDetails,
    assumableDetails,
    syndicationDetails,
    benchmarks,
    acquisitionCostBreakdown,
  };

  // Clean serialization (no Dates/Decimals)
  return JSON.parse(JSON.stringify(payload));
}

// ── Branding & Broker ────────────────────────────────────────

function extractBrandingAndBroker(
  user: Awaited<ReturnType<typeof getAuthContext>>,
): { branding: BovBranding; brokerInfo: BovBrokerInfo } {
  const org = user.organization;
  const brand = org.brandSettings;
  return {
    branding: {
      companyName: brand?.companyName || org.name || "Brokerage",
      logoUrl: brand?.logoUrl || org.logoUrl || null,
      primaryColor: brand?.primaryColor || "#1E40AF",
      accentColor: brand?.accentColor || "#6B5B95",
      address: org.address || "",
      phone: org.phone || "",
      email: user.email,
      website: org.website || null,
    },
    brokerInfo: {
      name: user.fullName || "Agent",
      title: user.title || null,
      phone: user.phone || "",
      email: user.email,
      licenseNumber: user.licenseNumber || null,
    },
  };
}

// ── Property Data ────────────────────────────────────────────

function buildPropertyData(
  inputs: Record<string, any>,
  meta?: DealMeta,
): InvestmentPropertyData {
  // Units: deal-calculator stores unitMix[], structure engine stores units
  let units = 0;
  if (inputs.units) {
    units = inputs.units;
  } else if (Array.isArray(inputs.unitMix)) {
    units = inputs.unitMix.reduce((s: number, u: any) => s + (u.count || 0), 0);
  }

  return {
    address: meta?.address || inputs.address || "",
    bbl: meta?.bbl || inputs.bbl || null,
    borough: meta?.borough || inputs.borough || null,
    units,
    sqft: inputs.bldgArea || inputs.sqft || null,
    yearBuilt: inputs.yearBuilt || null,
    stories: inputs.numFloors || inputs.stories || null,
    buildingClass: inputs.bldgClass || inputs.buildingClass || null,
    zoning: inputs.zoneDist || inputs.zoning || null,
    lotSqft: inputs.lotArea || inputs.lotSqft || null,
    assessedValue: inputs.assessTotal || inputs.assessedValue || null,
  };
}

// ── Deal Structure ───────────────────────────────────────────

function buildDealStructure(
  inputs: Record<string, any>,
  outputs: Record<string, any>,
  isStructured: boolean,
): InvestmentDealStructure {
  if (isStructured) {
    return {
      type: outputs.structure || "conventional",
      label: outputs.label || "Deal",
      purchasePrice: inputs.purchasePrice || 0,
      holdPeriod: inputs.holdPeriod || 5,
      exitCapRate: inputs.exitCapRate || 0,
    };
  }
  return {
    type: "conventional",
    label: "Conventional",
    purchasePrice: inputs.purchasePrice || 0,
    holdPeriod: inputs.holdPeriodYears || 5,
    exitCapRate: inputs.exitCapRate || 0,
  };
}

// ── Income ───────────────────────────────────────────────────

function buildIncomeData(
  inputs: Record<string, any>,
  outputs: Record<string, any>,
  isStructured: boolean,
): InvestmentIncomeData {
  if (isStructured) {
    const gross = inputs.grossRentalIncome || 0;
    const other = inputs.otherIncome || 0;
    const vacRate = inputs.vacancyRate || 5;
    const gpi = gross + other;
    const vacLoss = Math.round(gpi * (vacRate / 100));
    return {
      grossPotentialRent: gross,
      otherIncome: other,
      vacancyRate: vacRate,
      vacancyLoss: vacLoss,
      effectiveGrossIncome: gpi - vacLoss,
    };
  }
  return {
    grossPotentialRent: outputs.grossPotentialRent || outputs.grossPotentialResidentialRent || 0,
    otherIncome: outputs.totalOtherIncome || 0,
    vacancyRate: inputs.residentialVacancyRate || 5,
    vacancyLoss: outputs.vacancyLoss || outputs.residentialVacancyLoss || 0,
    effectiveGrossIncome: outputs.effectiveGrossIncome || 0,
  };
}

// ── Expenses ─────────────────────────────────────────────────

function buildExpenseData(
  inputs: Record<string, any>,
  outputs: Record<string, any>,
  isStructured: boolean,
): InvestmentExpenseData {
  const units = inputs.units || (Array.isArray(inputs.unitMix) ? inputs.unitMix.reduce((s: number, u: any) => s + (u.count || 0), 0) : 1) || 1;

  if (isStructured) {
    // Structure engine lumps expenses together
    const opex = inputs.operatingExpenses || 0;
    const capex = inputs.capexReserve || 0;
    const taxes = inputs.propertyTaxes || 0;
    const insurance = inputs.insurance || 0;
    const total = opex + capex + taxes + insurance;
    const egi = outputs.noi ? outputs.noi + total : total;
    const lineItems: InvestmentExpenseLineItem[] = [];
    if (opex) lineItems.push({ label: "Operating Expenses", amount: opex, perUnit: Math.round(opex / units), category: "operating" });
    if (taxes) lineItems.push({ label: "Real Estate Taxes", amount: taxes, perUnit: Math.round(taxes / units), category: "fixed" });
    if (insurance) lineItems.push({ label: "Insurance", amount: insurance, perUnit: Math.round(insurance / units), category: "fixed" });
    if (capex) lineItems.push({ label: "CapEx Reserve", amount: capex, perUnit: Math.round(capex / units), category: "reserve" });
    return {
      lineItems,
      totalExpenses: total,
      expenseRatio: egi > 0 ? total / egi : 0,
      expensePerUnit: Math.round(total / units),
    };
  }

  // Deal calculator has detailed expense breakdown
  const lineItems: InvestmentExpenseLineItem[] = [];
  if (Array.isArray(outputs.expenseDetails)) {
    for (const ed of outputs.expenseDetails) {
      lineItems.push({
        label: ed.label || "",
        amount: ed.amount || 0,
        perUnit: ed.perUnit || 0,
        category: ed.category || undefined,
      });
    }
  }
  const total = outputs.totalExpenses || 0;
  const mgmt = outputs.managementFee || 0;
  const egi = outputs.effectiveGrossIncome || 1;
  return {
    lineItems,
    totalExpenses: total + mgmt,
    expenseRatio: egi > 0 ? (total + mgmt) / egi : 0,
    expensePerUnit: Math.round((total + mgmt) / units),
  };
}

// ── Financing ────────────────────────────────────────────────

function buildFinancingData(
  inputs: Record<string, any>,
  outputs: Record<string, any>,
  isStructured: boolean,
): InvestmentFinancingData | null {
  // All-cash deals have no financing
  if (isStructured && outputs.structure === "all_cash") return null;

  if (isStructured) {
    const ltvPct = inputs.ltvPct || inputs.bridgeLtvPct || inputs.refiLtvPct || 0;
    const rate = inputs.interestRate || inputs.refiRate || 0;
    const amort = inputs.amortizationYears || inputs.refiAmortization || 30;
    const term = inputs.loanTermYears || inputs.refiTermYears || 10;
    return {
      loanAmount: outputs.totalDebt || 0,
      ltv: ltvPct,
      interestRate: rate,
      amortization: amort,
      loanTerm: term,
      annualDebtService: outputs.debtService || 0,
      totalEquity: outputs.totalEquity || 0,
      isInterestOnly: inputs.isInterestOnly || inputs.bridgeInterestOnly || false,
    };
  }

  // Deal calculator
  const ltv = inputs.ltvPercent || 0;
  if (ltv === 0 && !outputs.loanAmount) return null;
  return {
    loanAmount: outputs.loanAmount || 0,
    ltv,
    interestRate: inputs.interestRate || 0,
    amortization: inputs.amortizationYears || 30,
    loanTerm: inputs.loanTermYears || 10,
    annualDebtService: outputs.annualDebtService || 0,
    totalEquity: outputs.totalEquity || 0,
    isInterestOnly: inputs.interestOnly || false,
  };
}

// ── Return Metrics ───────────────────────────────────────────

function buildReturnMetrics(
  outputs: Record<string, any>,
  isStructured: boolean,
): InvestmentReturnMetrics {
  if (isStructured) {
    return {
      noi: outputs.noi || 0,
      capRate: outputs.capRate || 0,
      cashOnCash: outputs.cashOnCash || 0,
      irr: outputs.irr || 0,
      dscr: outputs.dscr || 0,
      debtYield: outputs.totalDebt > 0 ? ((outputs.noi || 0) / outputs.totalDebt) * 100 : 0,
      equityMultiple: outputs.equityMultiple || 0,
      annualizedReturn: outputs.annualizedReturn || 0,
      breakEvenOccupancy: outputs.breakEvenOccupancy || 0,
    };
  }
  return {
    noi: outputs.noi || 0,
    capRate: outputs.capRate || 0,
    cashOnCash: outputs.cashOnCash || outputs.cashOnCashAmort || 0,
    irr: outputs.irr || 0,
    dscr: outputs.dscr || 0,
    debtYield: outputs.debtYield || 0,
    equityMultiple: outputs.equityMultiple || 0,
    annualizedReturn: 0,
    breakEvenOccupancy: 0,
  };
}

// ── Cash Flows ───────────────────────────────────────────────

function buildCashFlows(
  outputs: Record<string, any>,
  isStructured: boolean,
): InvestmentCashFlowYear[] {
  if (isStructured && Array.isArray(outputs.yearlyProjections)) {
    return outputs.yearlyProjections.map((p: any) => ({
      year: p.year || 0,
      grossIncome: p.grossIncome || 0,
      vacancy: p.vacancy || 0,
      effectiveIncome: p.effectiveIncome || 0,
      expenses: p.opex || 0,
      noi: p.noi || 0,
      debtService: p.debtService || 0,
      cashFlow: p.cashFlow || 0,
      cumulativeCashFlow: p.cumulativeCashFlow || 0,
    }));
  }
  if (Array.isArray(outputs.cashFlows)) {
    return outputs.cashFlows.map((cf: any) => ({
      year: cf.year || 0,
      grossIncome: cf.gpr || 0,
      vacancy: cf.vacancy || 0,
      effectiveIncome: cf.egi || 0,
      expenses: cf.expenses || 0,
      noi: cf.noi || 0,
      debtService: cf.debtService || 0,
      cashFlow: cf.cashFlow || 0,
      cumulativeCashFlow: cf.cumulativeCashFlow || 0,
    }));
  }
  return [];
}

// ── Exit Analysis ────────────────────────────────────────────

function buildExitAnalysis(
  inputs: Record<string, any>,
  outputs: Record<string, any>,
  isStructured: boolean,
): InvestmentExitAnalysis {
  if (isStructured) {
    const salePrice = outputs.projectedSalePrice || 0;
    const sellingCosts = Math.round(salePrice * 0.05);
    const loanBal = salePrice - sellingCosts - (outputs.totalProfit || 0) - (outputs.totalCashFlow || 0) + (outputs.totalEquity || 0);
    return {
      exitNoi: 0, // structure engine doesn't expose exit NOI directly
      exitCapRate: inputs.exitCapRate || 0,
      projectedSalePrice: salePrice,
      sellingCosts,
      loanBalanceAtExit: Math.max(0, outputs.totalDebt > 0 ? loanBal : 0),
      netSaleProceeds: outputs.totalProfit || 0,
      totalProfit: outputs.totalProfit || 0,
    };
  }
  const sellingCostPct = inputs.sellingCostPercent || 5;
  const sellingCosts = Math.round((outputs.exitValue || 0) * (sellingCostPct / 100));
  return {
    exitNoi: outputs.exitNoi || 0,
    exitCapRate: inputs.exitCapRate || 0,
    projectedSalePrice: outputs.exitValue || 0,
    sellingCosts,
    loanBalanceAtExit: outputs.loanBalanceAtExit || 0,
    netSaleProceeds: outputs.exitProceeds || 0,
    totalProfit: (outputs.exitProceeds || 0) + (Array.isArray(outputs.cashFlows) ? outputs.cashFlows.reduce((s: number, cf: any) => s + (cf.cashFlow || 0), 0) : 0) - (outputs.totalEquity || 0),
  };
}

// ── Sources & Uses ───────────────────────────────────────────

function buildSourcesAndUses(
  outputs: Record<string, any>,
  isStructured: boolean,
): InvestmentSourcesUses {
  // Deal calculator provides sources/uses directly
  if (!isStructured && Array.isArray(outputs.sources) && Array.isArray(outputs.uses)) {
    const totalSources = outputs.sources.reduce((s: number, r: any) => s + (r.amount || 0), 0);
    const totalUses = outputs.uses.reduce((s: number, r: any) => s + (r.amount || 0), 0);
    return {
      sources: outputs.sources,
      uses: outputs.uses,
      totalSources,
      totalUses,
    };
  }

  // Build from structure engine
  const sources: { label: string; amount: number }[] = [];
  const uses: { label: string; amount: number }[] = [];

  if (outputs.totalDebt > 0) sources.push({ label: "Loan Proceeds", amount: outputs.totalDebt });
  if (outputs.totalEquity > 0) sources.push({ label: "Equity", amount: outputs.totalEquity });

  if (outputs.totalProjectCost > 0) uses.push({ label: "Total Project Cost", amount: outputs.totalProjectCost });

  const totalSources = sources.reduce((s, r) => s + r.amount, 0);
  const totalUses = uses.reduce((s, r) => s + r.amount, 0);

  return { sources, uses, totalSources, totalUses };
}

// ── Acquisition Cost Breakdown ────────────────────────────────

function buildAcquisitionCostBreakdown(
  inputs: Record<string, any>,
): { label: string; amount: number }[] | undefined {
  const ac = inputs.acquisitionCosts;
  if (!ac) return undefined;

  const items: { label: string; amount: number }[] = [];
  if (ac.transferTax > 0) items.push({ label: "Transfer Taxes (City + State)", amount: Math.round(ac.transferTax) });
  if (ac.mansionTax > 0) items.push({ label: "Mansion Tax", amount: Math.round(ac.mansionTax) });
  if (ac.mortgageRecordingTax > 0) items.push({ label: "Mortgage Recording Tax", amount: Math.round(ac.mortgageRecordingTax) });
  if (ac.titleInsurance > 0) items.push({ label: "Title Insurance", amount: Math.round(ac.titleInsurance) });
  if (ac.legalFees > 0) items.push({ label: "Legal Fees", amount: Math.round(ac.legalFees) });
  if (ac.inspections > 0) items.push({ label: "Inspections & Environmental", amount: Math.round(ac.inspections) });
  if (ac.appraisal > 0) items.push({ label: "Appraisal", amount: Math.round(ac.appraisal) });
  if (ac.miscClosing > 0) items.push({ label: "Miscellaneous", amount: Math.round(ac.miscClosing) });

  if (items.length === 0) return undefined;

  const total = items.reduce((s, i) => s + i.amount, 0);
  items.push({ label: "Total Closing Costs", amount: total });

  return items;
}

// ── Risk Factor Generation ───────────────────────────────────

function generateRiskFactors(
  inputs: Record<string, any>,
  outputs: Record<string, any>,
  returns: InvestmentReturnMetrics,
  financing: InvestmentFinancingData | null,
  isStructured: boolean,
): InvestmentRiskFactor[] {
  const risks: InvestmentRiskFactor[] = [];

  // Financial risks
  if (financing && financing.ltv > 80) {
    risks.push({
      category: "financial",
      severity: financing.ltv > 90 ? "high" : "medium",
      label: "High Leverage",
      description: `LTV of ${financing.ltv.toFixed(0)}% increases exposure to value declines and refinancing risk.`,
    });
  }
  if (returns.dscr > 0 && returns.dscr < 1.25) {
    risks.push({
      category: "financial",
      severity: returns.dscr < 1.0 ? "high" : "medium",
      label: "Thin Debt Service Coverage",
      description: `DSCR of ${returns.dscr.toFixed(2)}x leaves limited margin for income disruption.`,
    });
  }
  if (returns.irr < 8 && returns.irr > 0) {
    risks.push({
      category: "market",
      severity: returns.irr < 5 ? "high" : "medium",
      label: "Below-Target IRR",
      description: `Projected IRR of ${returns.irr.toFixed(1)}% is below typical institutional hurdle rates.`,
    });
  }
  if (returns.cashOnCash < 0) {
    risks.push({
      category: "financial",
      severity: "high",
      label: "Negative Cash Flow",
      description: "Property is projected to produce negative cash flow from operations.",
    });
  }

  // Market risks
  if (returns.capRate < 4 && returns.capRate > 0) {
    risks.push({
      category: "market",
      severity: "medium",
      label: "Low Cap Rate",
      description: `Going-in cap rate of ${returns.capRate.toFixed(1)}% implies premium pricing with limited margin of safety.`,
    });
  }
  const exitCap = isStructured ? inputs.exitCapRate : inputs.exitCapRate;
  if (exitCap && returns.capRate > 0 && exitCap < returns.capRate) {
    risks.push({
      category: "market",
      severity: "medium",
      label: "Cap Rate Compression Assumption",
      description: `Exit cap rate (${exitCap.toFixed(1)}%) is below going-in cap rate — assumes continued cap rate compression.`,
    });
  }

  // Operational risks
  const vacRate = isStructured ? inputs.vacancyRate : inputs.residentialVacancyRate;
  if (vacRate && vacRate < 3) {
    risks.push({
      category: "operational",
      severity: "low",
      label: "Aggressive Vacancy Assumption",
      description: `Modeled vacancy of ${vacRate}% may be optimistic for sustained hold periods.`,
    });
  }
  const yearBuilt = inputs.yearBuilt || 0;
  if (yearBuilt > 0 && yearBuilt < 1960) {
    risks.push({
      category: "operational",
      severity: "medium",
      label: "Aged Building Systems",
      description: `Built in ${yearBuilt} — plumbing, electrical, and structural systems may require significant capital investment.`,
    });
  }

  // Regulatory risks
  const rentStab = inputs.stabilizedUnitCount || inputs.rentStabilizedUnits || 0;
  if (rentStab > 0) {
    risks.push({
      category: "regulatory",
      severity: "medium",
      label: "Rent Stabilization",
      description: `${rentStab} rent-stabilized units subject to HSTPA rent increase limits and restricted deregulation.`,
    });
  }

  // Structural risks
  const structure = outputs.structure || "";
  if (structure === "bridge_refi") {
    risks.push({
      category: "structural",
      severity: "medium",
      label: "Bridge Loan Refinance Risk",
      description: "Strategy depends on successful stabilization and refinance — rate environment at refi may differ from projections.",
    });
  }
  if (structure === "syndication") {
    risks.push({
      category: "structural",
      severity: "low",
      label: "Syndication Complexity",
      description: "Multi-investor structure adds reporting, compliance, and waterfall distribution requirements.",
    });
  }

  return risks;
}

// ── Sensitivity ──────────────────────────────────────────────

function buildSensitivity(
  outputs: Record<string, any>,
  isStructured: boolean,
): InvestmentSensitivity | null {
  // Deal structure engine exit sensitivity
  if (isStructured && outputs.exitSensitivity) {
    const es = outputs.exitSensitivity;
    return {
      exitCapRateScenarios: [
        { capRate: es.optimistic?.capRate || 0, salePrice: es.optimistic?.salePrice || 0, irr: es.optimistic?.irr || 0 },
        { capRate: es.base?.capRate || 0, salePrice: es.base?.salePrice || 0, irr: es.base?.irr || 0 },
        { capRate: es.conservative?.capRate || 0, salePrice: es.conservative?.salePrice || 0, irr: es.conservative?.irr || 0 },
      ],
      vacancyScenarios: null,
    };
  }

  // Deal calculator sensitivity matrix
  if (!isStructured && outputs.sensitivity) {
    const sens = outputs.sensitivity;
    // The sensitivity matrix rows are exit cap rates, cols are other params
    // Extract exit cap rate scenarios from the first column
    const scenarios: { capRate: number; salePrice: number; irr: number }[] = [];
    if (Array.isArray(sens.rowLabels) && Array.isArray(sens.rows)) {
      for (let i = 0; i < Math.min(sens.rowLabels.length, sens.rows.length); i++) {
        const label = sens.rowLabels[i];
        const capVal = parseFloat(label.replace("%", ""));
        if (!isNaN(capVal) && Array.isArray(sens.rows[i]) && sens.rows[i].length > 0) {
          scenarios.push({
            capRate: capVal,
            salePrice: 0, // matrix stores IRR values, not sale prices
            irr: sens.rows[i][Math.floor(sens.rows[i].length / 2)] || 0,
          });
        }
      }
    }
    if (scenarios.length > 0) {
      return { exitCapRateScenarios: scenarios, vacancyScenarios: null };
    }
  }

  return null;
}

// ── Bridge Details ───────────────────────────────────────────

function buildBridgeDetails(
  outputs: Record<string, any>,
  isStructured: boolean,
): InvestmentBridgeDetails | null {
  if (!isStructured || outputs.structure !== "bridge_refi") return null;
  return {
    bridgeLoanAmount: outputs.totalDebt || 0,
    bridgeRate: 0, // not stored on output, only on input
    bridgeTermMonths: 0,
    totalBridgeCost: outputs.totalBridgeCost || 0,
    refiLoanAmount: outputs.refiLoanAmount || 0,
    cashOutOnRefi: outputs.cashOutOnRefi || 0,
    cashLeftInDeal: outputs.cashLeftInDeal || 0,
  };
}

// ── Assumable Details ────────────────────────────────────────

function buildAssumableDetails(
  outputs: Record<string, any>,
  isStructured: boolean,
): InvestmentAssumableDetails | null {
  if (!isStructured || outputs.structure !== "assumable") return null;
  return {
    existingLoanBalance: 0, // only on input
    existingRate: 0,
    blendedRate: outputs.blendedRate || 0,
    annualRateSavings: outputs.annualRateSavings || 0,
    totalRateSavings: outputs.totalRateSavings || 0,
  };
}

// ── Syndication Details ──────────────────────────────────────

function buildSyndicationDetails(
  outputs: Record<string, any>,
  isStructured: boolean,
): InvestmentSyndicationDetails | null {
  if (!isStructured || outputs.structure !== "syndication") return null;
  return {
    gpEquityPct: 0, // only on input
    lpEquityPct: 0,
    preferredReturn: 0,
    gpIrr: outputs.gpIrr || 0,
    lpIrr: outputs.lpIrr || 0,
    gpEquityMultiple: outputs.gpEquityMultiple || 0,
    lpEquityMultiple: outputs.lpEquityMultiple || 0,
    gpTotalReturn: outputs.gpTotalReturn || 0,
    lpTotalReturn: outputs.lpTotalReturn || 0,
    totalFees: outputs.totalFees || 0,
  };
}

// ── Benchmarks ───────────────────────────────────────────────

function buildBenchmarks(
  outputs: Record<string, any>,
  isStructured: boolean,
): InvestmentBenchmarks | null {
  if (!isStructured) return null;
  const has = outputs.stabilizedUnitImpact || outputs.ll97Exposure || outputs.exitSensitivity || outputs.marketCapRateMeta;
  if (!has) return null;

  return {
    stabilizedUnitImpact: outputs.stabilizedUnitImpact
      ? { stabilizedPct: outputs.stabilizedUnitImpact.stabilizedPct, blendedGrowthRate: outputs.stabilizedUnitImpact.blendedGrowthRate }
      : null,
    ll97Exposure: outputs.ll97Exposure
      ? { totalPenaltyOverHold: outputs.ll97Exposure.totalPenaltyOverHold, avgAnnualPenalty: outputs.ll97Exposure.avgAnnualPenalty, complianceStatus: outputs.ll97Exposure.complianceStatus }
      : null,
    exitSensitivity: outputs.exitSensitivity
      ? { optimistic: outputs.exitSensitivity.optimistic, base: outputs.exitSensitivity.base, conservative: outputs.exitSensitivity.conservative }
      : null,
    marketCapRateMeta: outputs.marketCapRateMeta
      ? { marketCapRate: outputs.marketCapRateMeta.marketCapRate, confidence: outputs.marketCapRateMeta.confidence, trend: outputs.marketCapRateMeta.trend }
      : null,
  };
}
