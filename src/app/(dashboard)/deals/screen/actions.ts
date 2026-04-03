"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { calculateAll, DEFAULT_INPUTS } from "@/lib/deal-calculator";
import type { DealInputs, DealOutputs } from "@/lib/deal-calculator";
import { getExpenseBenchmark } from "@/lib/expense-benchmarks";
import { getCurrentMortgageRate } from "@/lib/fred";

// ── Auth ────────────────────────────────────────────────────

async function getCurrentOrg(): Promise<{ userId: string; orgId: string } | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const dbUser = await prisma.user.findFirst({
    where: { OR: [{ authProviderId: user.id }, ...(user.email ? [{ email: user.email }] : [])] },
    select: { id: true, orgId: true },
  });
  if (!dbUser) return null;
  return { userId: dbUser.id, orgId: dbUser.orgId };
}

// ── Types ───────────────────────────────────────────────────

const NYC_BASE = "https://data.cityofnewyork.us/resource";
const PLUTO_ID = "64uk-42ks";
const SALES_ID = "usep-8jbt";
const HPD_REG_ID = "tesw-yqqr";

const AVG_RENTS: Record<string, Record<string, number>> = {
  Manhattan: { studio: 2800, oneBr: 3500, twoBr: 4500, threeBr: 5500 },
  Brooklyn: { studio: 2200, oneBr: 2700, twoBr: 3400, threeBr: 4200 },
  Queens: { studio: 1800, oneBr: 2200, twoBr: 2800, threeBr: 3400 },
  Bronx: { studio: 1400, oneBr: 1700, twoBr: 2200, threeBr: 2600 },
  "Staten Island": { studio: 1300, oneBr: 1600, twoBr: 2000, threeBr: 2400 },
};

export interface QuickScreenLookupResult {
  address: string;
  borough: string;
  block: string;
  lot: string;
  bbl: string;
  unitsRes: number;
  yearBuilt: number;
  numFloors: number;
  assessTotal: number;
  bldgArea: number;
  bldgClass: string;
  zoneDist: string;
  ownerName: string;
  hasElevator: boolean;
  annualTaxes: number;
  lastSalePrice: number;
  lastSaleDate: string;
  rentStabilizedUnits: number;
  // Computed estimates
  estimatedPurchasePrice: number;
  estimatedGrossIncome: number;
  estimatedExpenseRatio: number;
  estimatedExpenses: number;
  currentMortgageRate: number;
  suggestedUnitMix: { type: string; count: number; monthlyRent: number }[];
}

export interface QuickScreenInputs {
  purchasePrice: number;
  grossAnnualIncome: number;
  expenseRatioPct: number;       // 0-100
  isFinanced: boolean;
  downPaymentPct: number;        // 0-100
  interestRate: number;          // e.g. 7.0
  loanTermYears: number;
  exitCapRate: number;           // e.g. 5.5
  holdPeriodYears: number;
  // Solve-for-price mode
  solveForPrice: boolean;
  targetCocPct?: number;         // e.g. 8.0
}

export interface QuickScreenResult {
  // Verdict
  verdict: "go" | "maybe" | "no_go";
  verdictText: string;
  // Primary metrics
  capRate: number;
  cashOnCash: number;
  irr: number;
  dscr: number;
  // Secondary metrics
  monthlyCashFlow: number;
  equityMultiple: number;
  exitValue: number;
  grossYield: number;
  totalEquityRequired: number;
  noi: number;
  // Solved price (if solve-for-price mode)
  solvedPrice?: number;
}

// ── Verdict Logic ───────────────────────────────────────────

// TODO: Move thresholds to Settings page for user customization
const GO_THRESHOLDS = { capRate: 6, coc: 8, dscr: 1.25 };
const NOGO_THRESHOLDS = { capRate: 4, coc: 4, dscr: 1.0 };

function computeVerdict(capRate: number, coc: number, dscr: number, isFinanced: boolean): { verdict: "go" | "maybe" | "no_go"; text: string } {
  // For all-cash deals, skip DSCR check
  const dscrOk = !isFinanced || dscr >= GO_THRESHOLDS.dscr;
  const dscrBad = isFinanced && dscr < NOGO_THRESHOLDS.dscr;

  const allGo = capRate >= GO_THRESHOLDS.capRate && coc >= GO_THRESHOLDS.coc && dscrOk;
  const anyNoGo = capRate < NOGO_THRESHOLDS.capRate || coc < NOGO_THRESHOLDS.coc || dscrBad;

  if (allGo) return { verdict: "go", text: "Strong buy at asking — metrics clear all thresholds" };
  if (anyNoGo) return { verdict: "no_go", text: "Doesn\u2019t pencil at this price — one or more metrics in danger zone" };
  return { verdict: "maybe", text: "Tight margins — dig deeper before proceeding" };
}

// ── Lookup ──────────────────────────────────────────────────

export async function quickScreenLookup(bbl: string): Promise<QuickScreenLookupResult | null> {
  const match = bbl.match(/^(\d)(\d{5})(\d{4})$/);
  if (!match) return null;

  const [, boro, rawBlock, rawLot] = match;
  const block = rawBlock.replace(/^0+/, "");
  const lot = rawLot.replace(/^0+/, "");
  const boroNames = ["", "Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"];
  const borough = boroNames[parseInt(boro)] || "";

  // Parallel fetches: PLUTO, Sales, HPD, Mortgage Rate
  // NOTE: Old rent stab dataset 35ss-ekc5 removed from NYC Open Data — using heuristic instead
  const [plutoRes, salesRes, hpdRes, rateRes] = await Promise.allSettled([
    fetch(`${NYC_BASE}/${PLUTO_ID}.json?$where=borocode='${boro}' AND block='${block}' AND lot='${lot}'&$select=address,ownername,unitsres,unitstotal,yearbuilt,numfloors,assesstot,bldgarea,lotarea,zonedist1,bldgclass,builtfar,residfar&$limit=1`)
      .then(r => r.ok ? r.json() : []),
    fetch(`${NYC_BASE}/${SALES_ID}.json?$where=borough='${boro}' AND block='${block}' AND lot='${lot}'&$order=sale_date DESC&$limit=5`)
      .then(r => r.ok ? r.json() : []),
    fetch(`${NYC_BASE}/${HPD_REG_ID}.json?$where=boroid='${boro}' AND block='${block}' AND lot='${lot}'&$limit=1`)
      .then(r => r.ok ? r.json() : []),
    getCurrentMortgageRate(),
  ]);

  const plutoData = plutoRes.status === "fulfilled" ? plutoRes.value : [];
  const salesData = salesRes.status === "fulfilled" ? salesRes.value : [];
  const hpdData = hpdRes.status === "fulfilled" ? hpdRes.value : [];
  const currentRate = rateRes.status === "fulfilled" && rateRes.value ? rateRes.value : 7.0;

  if (!Array.isArray(plutoData) || plutoData.length === 0) return null;
  const p = plutoData[0];

  const unitsRes = parseInt(p.unitsres || "0");
  const unitsTotal = parseInt(p.unitstotal || "0");
  const assessTotal = parseInt(p.assesstot || "0");
  const bldgArea = parseInt(p.bldgarea || "0");
  const numFloors = parseInt(p.numfloors || "0");
  const yearBuilt = parseInt(p.yearbuilt || "0");
  const bldgClass = p.bldgclass || "";
  const hasElevator = numFloors > 5 || bldgClass.startsWith("D");
  const annualTaxes = Math.round(assessTotal * 0.123);
  const totalUnits = unitsRes || (Array.isArray(hpdData) && hpdData.length > 0 ? parseInt(hpdData[0].unitsres || "0") : 0) || unitsTotal;

  // Last sale
  let lastSalePrice = 0;
  let lastSaleDate = "";
  if (Array.isArray(salesData)) {
    for (const s of salesData) {
      const price = parseInt((s.sale_price || "0").replace(/,/g, ""));
      if (price > 10000) { lastSalePrice = price; lastSaleDate = s.sale_date || ""; break; }
    }
  }

  // Rent stabilized units — heuristic (old dataset 35ss-ekc5 is dead)
  // Pre-1974 buildings with 6+ units are generally rent stabilized
  const rentStabilizedUnits = (yearBuilt > 0 && yearBuilt < 1974 && totalUnits >= 6) ? totalUnits : 0;

  // Estimate purchase price from assessed value or last sale
  let estimatedPurchasePrice = 0;
  if (lastSalePrice > 100000) {
    // Appreciate last sale by ~3%/year
    const saleYear = lastSaleDate ? new Date(lastSaleDate).getFullYear() : 0;
    const yearsElapsed = saleYear > 0 ? Math.max(0, new Date().getFullYear() - saleYear) : 0;
    estimatedPurchasePrice = Math.round(lastSalePrice * Math.pow(1.03, yearsElapsed));
  } else if (assessTotal > 0) {
    // NYC assessed value is ~45% of market value for Class 2
    estimatedPurchasePrice = Math.round(assessTotal / 0.45);
  }

  // Estimate gross income from unit mix
  const rents = AVG_RENTS[borough] || AVG_RENTS["Brooklyn"];
  const suggestedUnitMix = estimateUnitMix(totalUnits, rents);
  const estimatedGrossIncome = suggestedUnitMix.reduce((s, u) => s + u.count * u.monthlyRent * 12, 0);

  // Expense benchmark
  let estimatedExpenseRatio = 45; // default
  let estimatedExpenses = 0;
  if (totalUnits > 0 && yearBuilt > 0) {
    try {
      const benchmark = getExpenseBenchmark({
        yearBuilt,
        hasElevator,
        numFloors,
        bldgClass,
        bldgArea,
        unitsRes: totalUnits,
        borough,
        rentStabilizedUnits,
      });
      estimatedExpenses = benchmark.totalAnnual + annualTaxes;
      if (estimatedGrossIncome > 0) {
        estimatedExpenseRatio = Math.round((estimatedExpenses / estimatedGrossIncome) * 100);
      }
    } catch {
      estimatedExpenses = Math.round(estimatedGrossIncome * 0.45);
    }
  } else {
    estimatedExpenses = Math.round(estimatedGrossIncome * 0.45);
  }

  return {
    address: p.address || "",
    borough,
    block,
    lot,
    bbl,
    unitsRes: totalUnits,
    yearBuilt,
    numFloors,
    assessTotal,
    bldgArea,
    bldgClass,
    zoneDist: p.zonedist1 || "",
    ownerName: p.ownername || "",
    hasElevator,
    annualTaxes,
    lastSalePrice,
    lastSaleDate,
    rentStabilizedUnits,
    estimatedPurchasePrice,
    estimatedGrossIncome,
    estimatedExpenseRatio: Math.min(estimatedExpenseRatio, 70),
    estimatedExpenses,
    currentMortgageRate: currentRate,
    suggestedUnitMix,
  };
}

// ── Calculate ───────────────────────────────────────────────

export async function quickScreenCalculate(inputs: QuickScreenInputs): Promise<QuickScreenResult> {
  const {
    purchasePrice, grossAnnualIncome, expenseRatioPct, isFinanced,
    downPaymentPct, interestRate, loanTermYears, exitCapRate, holdPeriodYears,
  } = inputs;

  // Build simplified DealInputs from Quick Screen inputs
  const totalExpenses = Math.round(grossAnnualIncome * (expenseRatioPct / 100));
  const noi = grossAnnualIncome - totalExpenses;
  const ltvPercent = isFinanced ? (100 - downPaymentPct) : 0;

  // Create minimal DealInputs for the full calculator
  const dealInputs: DealInputs = {
    ...DEFAULT_INPUTS,
    purchasePrice,
    closingCosts: Math.round(purchasePrice * 0.03),
    renovationBudget: 0,
    ltvPercent,
    interestRate: isFinanced ? interestRate : 0,
    amortizationYears: isFinanced ? 30 : 0,
    loanTermYears: isFinanced ? loanTermYears : 0,
    interestOnly: false,
    originationFeePercent: isFinanced ? 1 : 0,
    // Map gross income to a single 1BR unit to simplify
    unitMix: [{ type: "All Units", count: 1, monthlyRent: Math.round(grossAnnualIncome / 12) }],
    residentialVacancyRate: 0, // Already factored into gross income for quick screen
    concessions: 0,
    commercialRentAnnual: 0,
    commercialVacancyRate: 0,
    commercialConcessions: 0,
    // Spread totalExpenses across fields proportionally based on defaults
    realEstateTaxes: Math.round(totalExpenses * 0.30),
    insurance: Math.round(totalExpenses * 0.10),
    electricityGas: Math.round(totalExpenses * 0.06),
    waterSewer: Math.round(totalExpenses * 0.05),
    payroll: Math.round(totalExpenses * 0.08),
    rmGeneral: Math.round(totalExpenses * 0.10),
    rmCapexReserve: Math.round(totalExpenses * 0.03),
    cleaning: Math.round(totalExpenses * 0.04),
    trashRemoval: Math.round(totalExpenses * 0.04),
    managementFeePercent: 0, // Already in total expenses
    accounting: Math.round(totalExpenses * 0.02),
    legal: Math.round(totalExpenses * 0.01),
    marketing: Math.round(totalExpenses * 0.02),
    exterminating: Math.round(totalExpenses * 0.01),
    landscaping: Math.round(totalExpenses * 0.02),
    snowRemoval: Math.round(totalExpenses * 0.015),
    elevator: Math.round(totalExpenses * 0.02),
    alarmMonitoring: Math.round(totalExpenses * 0.01),
    telephoneInternet: Math.round(totalExpenses * 0.015),
    licenseFees: Math.round(totalExpenses * 0.03),
    fireMeter: Math.round(totalExpenses * 0.01),
    generalAdmin: Math.round(totalExpenses * 0.01),
    otherContractServices: 0,
    // Growth
    annualRentGrowth: 3,
    annualExpenseGrowth: 2,
    // Exit
    holdPeriodYears,
    exitCapRate,
    sellingCostPercent: 5,
    // Other
    lateFees: 0, parkingIncome: 0, storageIncome: 0, petDeposits: 0, petRent: 0,
    evCharging: 0, trashRubs: 0, waterRubs: 0, otherMiscIncome: 0,
  };

  const outputs = calculateAll(dealInputs);

  const capRate = purchasePrice > 0 ? (noi / purchasePrice) * 100 : 0;
  const totalEquity = purchasePrice + dealInputs.closingCosts - (isFinanced ? outputs.loanAmount : 0);
  const annualCashFlow = noi - (isFinanced ? outputs.annualDebtService : 0);
  const cashOnCash = totalEquity > 0 ? (annualCashFlow / totalEquity) * 100 : 0;

  const { verdict, text } = computeVerdict(capRate, cashOnCash, outputs.dscr, isFinanced);

  return {
    verdict,
    verdictText: text,
    capRate,
    cashOnCash,
    irr: outputs.irr,
    dscr: isFinanced ? outputs.dscr : 0,
    monthlyCashFlow: Math.round(annualCashFlow / 12),
    equityMultiple: outputs.equityMultiple,
    exitValue: outputs.exitValue,
    grossYield: purchasePrice > 0 ? (grossAnnualIncome / purchasePrice) * 100 : 0,
    totalEquityRequired: totalEquity,
    noi,
  };
}

// ── Solve for Price ─────────────────────────────────────────

export async function solveForPrice(inputs: Omit<QuickScreenInputs, "purchasePrice" | "solveForPrice">): Promise<number> {
  const { grossAnnualIncome, expenseRatioPct, isFinanced, downPaymentPct, interestRate, loanTermYears, targetCocPct } = inputs;
  const targetCoC = (targetCocPct || 8) / 100;
  const noi = grossAnnualIncome * (1 - expenseRatioPct / 100);

  if (!isFinanced) {
    // All cash: CoC = NOI / (Price + Closing). Closing ≈ 3%
    // targetCoC = NOI / (P * 1.03)
    // P = NOI / (targetCoC * 1.03)
    return targetCoC > 0 ? Math.round(noi / (targetCoC * 1.03)) : 0;
  }

  // Financed: binary search for price
  // CoC = (NOI - DS) / Equity
  // Equity = Price * (downPct/100) + Price * 0.03
  // LoanAmount = Price * (1 - downPct/100)
  // DS = LoanAmount * rate constant
  let lo = 100000;
  let hi = 100000000;

  for (let i = 0; i < 50; i++) {
    const mid = Math.round((lo + hi) / 2);
    const equity = mid * (downPaymentPct / 100) + mid * 0.03;
    const loanAmount = mid * (1 - downPaymentPct / 100);
    const monthlyRate = interestRate / 100 / 12;
    const n = loanTermYears * 12;
    const monthlyPayment = monthlyRate > 0 ? loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1) : 0;
    const annualDS = monthlyPayment * 12;
    const annualCashFlow = noi - annualDS;
    const coc = equity > 0 ? annualCashFlow / equity : 0;

    if (Math.abs(coc - targetCoC) < 0.001) break;
    if (coc > targetCoC) lo = mid; else hi = mid;
  }

  return Math.round((lo + hi) / 2);
}

// ── Save ────────────────────────────────────────────────────

export async function saveQuickScreen(data: {
  dealId?: string;
  address?: string;
  borough?: string;
  block?: string;
  lot?: string;
  bbl?: string;
  quickScreenInputs: QuickScreenInputs;
  quickScreenResult: QuickScreenResult;
  lookupData?: QuickScreenLookupResult | null;
}): Promise<string> {
  const org = await getCurrentOrg();
  if (!org) throw new Error("Unauthorized");

  const { dealId, address, borough, block, lot, bbl, quickScreenInputs, quickScreenResult, lookupData } = data;

  // Build minimal DealInputs/DealOutputs for persistence
  const inputsObj = {
    purchasePrice: quickScreenInputs.purchasePrice,
    ltvPercent: quickScreenInputs.isFinanced ? (100 - quickScreenInputs.downPaymentPct) : 0,
    interestRate: quickScreenInputs.interestRate,
    holdPeriodYears: quickScreenInputs.holdPeriodYears,
    exitCapRate: quickScreenInputs.exitCapRate,
    unitMix: lookupData?.suggestedUnitMix || [],
  };

  const outputsObj = {
    capRate: quickScreenResult.capRate,
    cashOnCash: quickScreenResult.cashOnCash,
    irr: quickScreenResult.irr,
    dscr: quickScreenResult.dscr,
    noi: quickScreenResult.noi,
    equityMultiple: quickScreenResult.equityMultiple,
    exitValue: quickScreenResult.exitValue,
  };

  const qsData = {
    inputs: JSON.parse(JSON.stringify(quickScreenInputs)),
    result: JSON.parse(JSON.stringify(quickScreenResult)),
    lookupData: lookupData ? JSON.parse(JSON.stringify(lookupData)) : null,
    savedAt: new Date().toISOString(),
  };

  // Use JSON serialization for Prisma Json fields
  const inputs = JSON.parse(JSON.stringify(inputsObj));
  const outputs = JSON.parse(JSON.stringify(outputsObj));
  const quickScreenDataJson = JSON.parse(JSON.stringify(qsData));

  if (dealId) {
    await prisma.dealAnalysis.update({
      where: { id: dealId, orgId: org.orgId },
      data: { inputs, outputs, quickScreenData: quickScreenDataJson, lastViewedAt: new Date() },
    });
    return dealId;
  }

  const deal = await prisma.dealAnalysis.create({
    data: {
      orgId: org.orgId,
      userId: org.userId,
      name: address || "Quick Screen",
      address: address || null,
      borough: borough || null,
      block: block || null,
      lot: lot || null,
      bbl: bbl || null,
      status: "analyzing",
      dealType: "acquisition",
      dealSource: "other",
      inputs,
      outputs,
      quickScreenData: quickScreenDataJson,
      lastViewedAt: new Date(),
    },
  });

  return deal.id;
}

// ── Helpers ─────────────────────────────────────────────────

function estimateUnitMix(totalUnits: number, rents: Record<string, number>): { type: string; count: number; monthlyRent: number }[] {
  if (totalUnits <= 0) return [{ type: "1BR", count: 1, monthlyRent: rents.oneBr }];
  const mix: { type: string; count: number; monthlyRent: number }[] = [];

  if (totalUnits <= 6) {
    const oneBr = Math.ceil(totalUnits * 0.5);
    const twoBr = totalUnits - oneBr;
    if (oneBr > 0) mix.push({ type: "1BR", count: oneBr, monthlyRent: rents.oneBr });
    if (twoBr > 0) mix.push({ type: "2BR", count: twoBr, monthlyRent: rents.twoBr });
  } else if (totalUnits <= 20) {
    const studios = Math.round(totalUnits * 0.15);
    const oneBr = Math.round(totalUnits * 0.45);
    const twoBr = Math.round(totalUnits * 0.3);
    const threeBr = Math.max(0, totalUnits - studios - oneBr - twoBr);
    if (studios > 0) mix.push({ type: "Studio", count: studios, monthlyRent: rents.studio });
    if (oneBr > 0) mix.push({ type: "1BR", count: oneBr, monthlyRent: rents.oneBr });
    if (twoBr > 0) mix.push({ type: "2BR", count: twoBr, monthlyRent: rents.twoBr });
    if (threeBr > 0) mix.push({ type: "3BR", count: threeBr, monthlyRent: rents.threeBr });
  } else {
    const studios = Math.round(totalUnits * 0.2);
    const oneBr = Math.round(totalUnits * 0.4);
    const twoBr = Math.round(totalUnits * 0.25);
    const threeBr = Math.max(0, totalUnits - studios - oneBr - twoBr);
    if (studios > 0) mix.push({ type: "Studio", count: studios, monthlyRent: rents.studio });
    if (oneBr > 0) mix.push({ type: "1BR", count: oneBr, monthlyRent: rents.oneBr });
    if (twoBr > 0) mix.push({ type: "2BR", count: twoBr, monthlyRent: rents.twoBr });
    if (threeBr > 0) mix.push({ type: "3BR", count: threeBr, monthlyRent: rents.threeBr });
  }

  return mix;
}
