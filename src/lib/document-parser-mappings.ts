// ============================================================
// Document Parser Mappings
// Converts ParsedDealData → QuickScreenInputs / DealInputs
// ============================================================

import type { ParsedDealData, ParsedField } from "./document-parser";
import type { DealInputs, UnitMixRow } from "./deal-calculator";

// ── Helper: extract value from ParsedField ────────────────────

function v<T>(field: ParsedField<T> | undefined | null): T | null {
  if (!field) return null;
  return field.value ?? null;
}

function vn(field: ParsedField<number> | undefined | null, fallback: number): number {
  const val = v(field);
  return val !== null && !isNaN(val) ? val : fallback;
}

// ── Quick Screen Mapping ─────────────────────────────────────

export interface QuickScreenInputs {
  purchasePrice: number;
  grossAnnualIncome: number;
  expenseRatioPct: number;
  isFinanced: boolean;
  downPaymentPct: number;
  interestRate: number;
  loanTermYears: number;
  exitCapRate: number;
  holdPeriodYears: number;
  solveForPrice: boolean;
  targetCocPct?: number;
}

export function mapToQuickScreen(data: ParsedDealData): QuickScreenInputs {
  // Purchase price: prefer financing.askingPrice, fallback to property.askingPrice
  const price = vn(data.financing?.askingPrice, 0) || vn(data.property?.askingPrice, 0);

  // Gross income: prefer totalGrossIncome, fallback to effectiveGrossIncome or grossPotentialRent
  const grossIncome =
    vn(data.income?.totalGrossIncome, 0) ||
    vn(data.income?.effectiveGrossIncome, 0) ||
    vn(data.income?.grossPotentialRent, 0);

  // Expense ratio: prefer parsed ratio, fallback calc from total expenses / gross income
  let expenseRatio = vn(data.expenses?.expenseRatio, 0);
  if (!expenseRatio && grossIncome > 0) {
    const totalExp = vn(data.expenses?.totalExpenses, 0);
    if (totalExp > 0) {
      expenseRatio = Math.round((totalExp / grossIncome) * 100);
    }
  }
  if (!expenseRatio) expenseRatio = 45; // default NYC multifamily

  // Financing terms
  const ltv = vn(data.financing?.suggestedLTV, 65);
  const rate = vn(data.financing?.suggestedRate, 7.0);
  const term = vn(data.financing?.suggestedTerm, 30);

  // Exit
  const exitCap = vn(data.financing?.statedCapRate, 0) || vn(data.financing?.calculatedCapRate, 5.5);

  return {
    purchasePrice: price,
    grossAnnualIncome: grossIncome,
    expenseRatioPct: expenseRatio,
    isFinanced: ltv > 0,
    downPaymentPct: 100 - ltv,
    interestRate: rate,
    loanTermYears: term,
    exitCapRate: exitCap,
    holdPeriodYears: 5,
    solveForPrice: false,
  };
}

// ── Deal Modeler (Full DealInputs) Mapping ────────────────────

export function mapToDealModeler(data: ParsedDealData): Partial<DealInputs> {
  const inputs: Partial<DealInputs> = {};

  // ── Acquisition ──
  const price = vn(data.financing?.askingPrice, 0) || vn(data.property?.askingPrice, 0);
  if (price) inputs.purchasePrice = price;

  // ── Financing ──
  const ltv = vn(data.financing?.suggestedLTV, 0);
  if (ltv) inputs.ltvPercent = ltv;
  const rate = vn(data.financing?.suggestedRate, 0);
  if (rate) inputs.interestRate = rate;
  const term = vn(data.financing?.suggestedTerm, 0);
  if (term) inputs.loanTermYears = term;

  // ── Unit Mix ──
  const unitMix = buildUnitMix(data);
  if (unitMix.length > 0) inputs.unitMix = unitMix;

  // ── Income ──
  const vacancyRate = vn(data.income?.vacancyRate, 0);
  if (vacancyRate) inputs.residentialVacancyRate = vacancyRate;

  // Other income items
  const otherItems = v(data.income?.otherIncome);
  if (Array.isArray(otherItems) && otherItems.length > 0) {
    // Try to match known fields
    for (const item of otherItems) {
      const label = (item.label || "").toLowerCase();
      const amt = item.amount || 0;
      if (!amt) continue;

      if (label.includes("parking")) inputs.parkingIncome = amt;
      else if (label.includes("storage")) inputs.storageIncome = amt;
      else if (label.includes("laundry") || label.includes("vending")) {
        inputs.otherMiscIncome = (inputs.otherMiscIncome || 0) + amt;
      } else if (label.includes("late")) inputs.lateFees = amt;
      else if (label.includes("pet")) inputs.petRent = amt;
      else inputs.otherMiscIncome = (inputs.otherMiscIncome || 0) + amt;
    }
  }

  // ── Expenses ──
  const taxes = vn(data.expenses?.realEstateTaxes, 0);
  if (taxes) inputs.realEstateTaxes = taxes;

  const insurance = vn(data.expenses?.insurance, 0);
  if (insurance) inputs.insurance = insurance;

  const electric = vn(data.expenses?.electric, 0);
  const gas = vn(data.expenses?.gas, 0);
  if (electric || gas) inputs.electricityGas = (electric || 0) + (gas || 0);

  const waterSewer = vn(data.expenses?.waterSewer, 0);
  if (waterSewer) inputs.waterSewer = waterSewer;

  const fuel = vn(data.expenses?.fuel, 0);
  if (fuel) {
    // Fuel is often heating oil — add to utilities
    inputs.electricityGas = (inputs.electricityGas || 0) + fuel;
  }

  const repairs = vn(data.expenses?.repairsMaintenance, 0);
  if (repairs) inputs.rmGeneral = repairs;

  const payroll = vn(data.expenses?.payroll, 0);
  if (payroll) inputs.payroll = payroll;

  const legalAccounting = vn(data.expenses?.legalAccounting, 0);
  if (legalAccounting) {
    inputs.legal = Math.round(legalAccounting * 0.5);
    inputs.accounting = Math.round(legalAccounting * 0.5);
  }

  const admin = vn(data.expenses?.administrative, 0);
  if (admin) inputs.generalAdmin = admin;

  const reserves = vn(data.expenses?.reserves, 0);
  if (reserves) inputs.rmCapexReserve = reserves;

  // Management fee — try to back-calculate percentage
  const mgmtFee = vn(data.expenses?.managementFee, 0);
  if (mgmtFee && price) {
    const grossIncome =
      vn(data.income?.totalGrossIncome, 0) ||
      vn(data.income?.effectiveGrossIncome, 0) ||
      vn(data.income?.grossPotentialRent, 0);
    if (grossIncome > 0) {
      inputs.managementFeePercent = Math.round((mgmtFee / grossIncome) * 100 * 10) / 10;
    }
  }

  // Other expense items
  const otherExpenses = v(data.expenses?.other);
  if (Array.isArray(otherExpenses) && otherExpenses.length > 0) {
    inputs.customExpenseItems = otherExpenses.map((item, i) => ({
      id: `imported_${i}`,
      name: item.label || `Other ${i + 1}`,
      amount: item.amount || 0,
      source: "t12" as const,
      methodology: "Imported from document",
    }));
  }

  // ── Exit ──
  const capRate = vn(data.financing?.statedCapRate, 0) || vn(data.financing?.calculatedCapRate, 0);
  if (capRate) inputs.exitCapRate = capRate;

  // ── Track imported fields ──
  inputs._assumptions = buildAssumptionsMap(data);

  return inputs;
}

// ── Build Unit Mix from parsed data ───────────────────────────

function buildUnitMix(data: ParsedDealData): UnitMixRow[] {
  const units = data.unitMix?.units || [];

  if (units.length === 0) {
    // No individual unit data — try to build from summary
    const totalUnits = vn(data.unitMix?.summary?.totalUnits, 0) || vn(data.property?.totalUnits, 0);
    const avgRent = vn(data.unitMix?.summary?.avgRent, 0);

    if (totalUnits > 0 && avgRent > 0) {
      return [{ type: "Unit", count: totalUnits, monthlyRent: avgRent }];
    }
    return [];
  }

  // Group units by bedroom count → UnitMixRow aggregation
  const groups = new Map<string, { count: number; totalRent: number; sqft: number }>();

  for (const unit of units) {
    const bedrooms = vn(unit.bedrooms, -1);
    const rent = vn(unit.marketRent, 0) || vn(unit.legalRent, 0);
    const sqft = vn(unit.sqft, 0);

    let typeLabel: string;
    if (bedrooms === 0) typeLabel = "Studio";
    else if (bedrooms === 1) typeLabel = "1BR";
    else if (bedrooms === 2) typeLabel = "2BR";
    else if (bedrooms === 3) typeLabel = "3BR";
    else if (bedrooms !== null && bedrooms > 3) typeLabel = `${bedrooms}BR`;
    else typeLabel = "Unit";

    const existing = groups.get(typeLabel) || { count: 0, totalRent: 0, sqft: 0 };
    existing.count += 1;
    existing.totalRent += rent || 0;
    if (sqft) existing.sqft = sqft; // take last sqft as representative
    groups.set(typeLabel, existing);
  }

  return Array.from(groups.entries()).map(([type, g]) => ({
    type,
    count: g.count,
    monthlyRent: g.count > 0 ? Math.round(g.totalRent / g.count) : 0,
    sqft: g.sqft || undefined,
  }));
}

// ── Track which fields came from AI parsing ───────────────────

function buildAssumptionsMap(data: ParsedDealData): Record<string, boolean> {
  const map: Record<string, boolean> = {};

  // Mark all expense fields as imported
  const expenseFields = [
    "realEstateTaxes", "insurance", "electricityGas", "waterSewer",
    "payroll", "legal", "accounting", "rmGeneral", "generalAdmin", "rmCapexReserve",
  ];
  for (const field of expenseFields) {
    const section = data.expenses as Record<string, unknown>;
    const parsed = section?.[field === "electricityGas" ? "electric" : field];
    if (parsed && typeof parsed === "object" && "value" in parsed && (parsed as ParsedField<number>).value) {
      map[field] = true;
    }
  }

  return map;
}

// ── Summary of mapped fields for review UI ────────────────────

export interface MappingSummary {
  destination: "quick_screen" | "deal_modeler";
  fieldCount: number;
  fields: { key: string; label: string; value: string | number; confidence: number }[];
}

export function summarizeQuickScreenMapping(data: ParsedDealData): MappingSummary {
  const mapped = mapToQuickScreen(data);
  const fields: MappingSummary["fields"] = [];

  if (mapped.purchasePrice) {
    const conf = Math.max(
      data.financing?.askingPrice?.confidence ?? 0,
      data.property?.askingPrice?.confidence ?? 0,
    );
    fields.push({ key: "purchasePrice", label: "Purchase Price", value: mapped.purchasePrice, confidence: conf });
  }
  if (mapped.grossAnnualIncome) {
    const conf = Math.max(
      data.income?.totalGrossIncome?.confidence ?? 0,
      data.income?.effectiveGrossIncome?.confidence ?? 0,
    );
    fields.push({ key: "grossAnnualIncome", label: "Gross Annual Income", value: mapped.grossAnnualIncome, confidence: conf });
  }
  if (mapped.expenseRatioPct) {
    fields.push({ key: "expenseRatioPct", label: "Expense Ratio", value: `${mapped.expenseRatioPct}%`, confidence: data.expenses?.expenseRatio?.confidence ?? 0.5 });
  }
  if (mapped.interestRate) {
    fields.push({ key: "interestRate", label: "Interest Rate", value: `${mapped.interestRate}%`, confidence: data.financing?.suggestedRate?.confidence ?? 0.5 });
  }
  if (mapped.exitCapRate) {
    fields.push({ key: "exitCapRate", label: "Exit Cap Rate", value: `${mapped.exitCapRate}%`, confidence: data.financing?.statedCapRate?.confidence ?? 0.5 });
  }

  return { destination: "quick_screen", fieldCount: fields.length, fields };
}
