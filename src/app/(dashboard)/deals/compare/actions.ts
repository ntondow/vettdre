"use server";

import { getDealAnalysis, compareDealStructuresAction } from "../actions";
import type { DealStructureType, DealInputsBase } from "@/lib/deal-structure-engine";

// ── Structure Comparison ─────────────────────────────────────
// Loads a saved deal analysis, then runs compareDealStructures
// for the selected structure types.

export async function runStructureComparison(
  dealId: string,
  structureKeys: DealStructureType[],
) {
  const deal = await getDealAnalysis(dealId);
  const inputs = deal.inputs as Record<string, unknown>;
  const outputs = deal.outputs as Record<string, unknown>;

  // Build base inputs from the saved deal data
  const base: DealInputsBase = {
    purchasePrice: (inputs.purchasePrice as number) || (inputs.purchase_price as number) || 0,
    units: (inputs.units as number) || (inputs.totalUnits as number) || 0,
    grossRentalIncome: (inputs.grossRentalIncome as number) ||
      (outputs as any)?.income?.grossPotentialRent || 0,
    otherIncome: (inputs.otherIncome as number) || 0,
    vacancyRate: (inputs.vacancyRate as number) ?? 5,
    operatingExpenses: (inputs.operatingExpenses as number) ||
      (outputs as any)?.expenses?.total || 0,
    capexReserve: (inputs.capexReserve as number) ?? 0,
    propertyTaxes: (inputs.propertyTaxes as number) || (inputs.realEstateTaxes as number) || 0,
    insurance: (inputs.insurance as number) ?? 0,
    holdPeriod: (inputs.holdPeriod as number) ?? 5,
    exitCapRate: (inputs.exitCapRate as number) ?? 6,
    annualRentGrowth: (inputs.annualRentGrowth as number) ?? (inputs.rentGrowth as number) ?? 3,
    annualExpenseGrowth: (inputs.annualExpenseGrowth as number) ?? (inputs.expenseGrowth as number) ?? 2,
    renovationBudget: (inputs.renovationBudget as number) ?? 0,
    closingCostsPct: (inputs.closingCostsPct as number) ?? 2.5,
  };

  const results = await compareDealStructuresAction(base, structureKeys);

  // Serialize for client
  return JSON.parse(JSON.stringify(results));
}

// ── Deal Comparison ──────────────────────────────────────────
// Loads multiple saved deals for side-by-side metric comparison.

export async function loadDealsForComparison(dealIds: string[]) {
  const deals = await Promise.all(dealIds.map((id) => getDealAnalysis(id)));
  return deals.map((deal) => ({
    id: deal.id,
    name: deal.name,
    address: deal.address,
    borough: deal.borough,
    structure: deal.structure,
    inputs: deal.inputs,
    outputs: deal.outputs,
    createdAt: deal.createdAt,
    updatedAt: deal.updatedAt,
  }));
}
