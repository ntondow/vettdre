// ============================================================
// AI Deal Assumptions — One-Click Underwrite
// Generates full DealInputs from building data (PLUTO, DOF, ACRIS, HPD, DOB)
// Based on real multifamily underwriting model (255 Nassau template)
// ============================================================

import type { DealInputs, UnitMixRow } from "./deal-calculator";

// ============================================================
// Building data from various NYC Open Data sources
// ============================================================
export interface BuildingData {
  // PLUTO
  address: string;
  borough: string;
  boroCode: string;
  block: string;
  lot: string;
  bbl: string;
  unitsRes: number;
  unitsTotal: number;
  yearBuilt: number;
  numFloors: number;
  assessTotal: number;
  bldgArea: number;
  lotArea: number;
  zoneDist: string;
  bldgClass: string;
  builtFar: number;
  residFar: number;
  ownerName: string;
  // ACRIS / Sales
  lastSalePrice: number;
  lastSaleDate: string;      // ISO date
  // HPD
  hpdUnits: number;
  hpdViolationCount: number;
  rentStabilizedUnits: number;
  // DOF
  marketValue: number;        // DOF market value
  annualTaxes: number;
  // DOB
  hasElevator: boolean;
}

// ============================================================
// Rent estimates by borough + unit type (monthly) — NYC
// ============================================================
const MARKET_RENTS: Record<string, Record<string, number>> = {
  Manhattan: { Studio: 2800, "1BR": 3500, "2BR": 4800, "3BR": 6500 },
  Brooklyn: { Studio: 2200, "1BR": 2800, "2BR": 3600, "3BR": 4500 },
  Queens: { Studio: 1800, "1BR": 2200, "2BR": 2800, "3BR": 3400 },
  Bronx: { Studio: 1400, "1BR": 1700, "2BR": 2100, "3BR": 2500 },
  "Staten Island": { Studio: 1300, "1BR": 1600, "2BR": 2000, "3BR": 2400 },
};

// ============================================================
// Rent estimates by county — NYS (outside NYC)
// ============================================================
const NYS_MARKET_RENTS: Record<string, Record<string, number>> = {
  Westchester: { Studio: 1800, "1BR": 2200, "2BR": 2800, "3BR": 3500 },
  Nassau: { Studio: 1700, "1BR": 2100, "2BR": 2700, "3BR": 3300 },
  Suffolk: { Studio: 1500, "1BR": 1900, "2BR": 2400, "3BR": 3000 },
  Rockland: { Studio: 1400, "1BR": 1800, "2BR": 2300, "3BR": 2800 },
  Orange: { Studio: 1200, "1BR": 1500, "2BR": 1900, "3BR": 2300 },
  Dutchess: { Studio: 1100, "1BR": 1400, "2BR": 1800, "3BR": 2200 },
  Albany: { Studio: 900, "1BR": 1100, "2BR": 1400, "3BR": 1700 },
  Erie: { Studio: 700, "1BR": 900, "2BR": 1200, "3BR": 1500 },
  Monroe: { Studio: 800, "1BR": 1000, "2BR": 1300, "3BR": 1600 },
  Onondaga: { Studio: 700, "1BR": 900, "2BR": 1200, "3BR": 1500 },
  _default: { Studio: 800, "1BR": 1000, "2BR": 1300, "3BR": 1600 },
};

export function getNYSMarketRents(county: string): Record<string, number> {
  return NYS_MARKET_RENTS[county] || NYS_MARKET_RENTS._default;
}

// ============================================================
// Generate full deal assumptions from building data
// ============================================================
export function generateDealAssumptions(building: BuildingData): DealInputs {
  const units = building.unitsRes || building.hpdUnits || building.unitsTotal || 1;
  const borough = building.borough || "Brooklyn";
  const rents = MARKET_RENTS[borough] || MARKET_RENTS["Brooklyn"];
  const assumptions: Record<string, boolean> = {};

  // -- OFFER PRICE --
  let purchasePrice = 0;
  if (building.lastSalePrice > 100000 && building.lastSaleDate) {
    const saleDate = new Date(building.lastSaleDate);
    const yearsAgo = Math.max(0, (Date.now() - saleDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    if (yearsAgo < 3) {
      purchasePrice = Math.round(building.lastSalePrice * 1.15);
    } else {
      purchasePrice = Math.round(building.lastSalePrice * (1 + yearsAgo * 0.04));
    }
    assumptions.purchasePrice = true;
  } else if (building.assessTotal > 0) {
    purchasePrice = Math.round(building.assessTotal * 1.4);
    assumptions.purchasePrice = true;
  }
  // Floor at market value
  if (building.marketValue > 0 && purchasePrice < building.marketValue) {
    purchasePrice = building.marketValue;
  }
  if (purchasePrice === 0) purchasePrice = 5000000; // fallback

  // -- RENT ADJUSTMENTS --
  let rentMultiplier = 1.0;
  if (building.yearBuilt > 0 && building.yearBuilt < 1950) rentMultiplier *= 0.90; // pre-1950: -10%
  if (building.yearBuilt >= 2000) rentMultiplier *= 1.10; // post-2000: +10%

  const rsRatio = building.rentStabilizedUnits > 0 ? building.rentStabilizedUnits / units : 0;
  // Rent-stabilized units at 60% market
  const rsMultiplier = 0.60;
  // Blended multiplier
  const blendedMultiplier = rentMultiplier * (1 - rsRatio + rsRatio * rsMultiplier);

  // -- UNIT MIX --
  const unitMix = estimateUnitMix(units, rents, blendedMultiplier);
  assumptions.unitMix = true;

  // -- VACANCY --
  const residentialVacancyRate = rsRatio > 0.5 ? 3 : 5;
  assumptions.residentialVacancyRate = true;

  // -- EXPENSES --
  const violationSurcharge = building.hpdViolationCount > 20 ? 1.15 : 1.0;

  const realEstateTaxes = building.annualTaxes > 0 ? building.annualTaxes : Math.round(building.assessTotal * 0.123);
  if (building.annualTaxes <= 0) assumptions.realEstateTaxes = true;

  const insurance = Math.round(1600 * units * violationSurcharge);
  assumptions.insurance = true;
  const licenseFees = Math.round(550 * units * violationSurcharge);
  assumptions.licenseFees = true;
  const fireMeter = Math.round(200 * units * violationSurcharge);
  assumptions.fireMeter = true;
  const electricityGas = Math.round(550 * units * violationSurcharge);
  assumptions.electricityGas = true;
  const waterSewer = Math.round(750 * units * violationSurcharge);
  assumptions.waterSewer = true;
  const payroll = Math.round(1200 * units * violationSurcharge);
  assumptions.payroll = true;
  const rmGeneral = Math.round(1800 * units * violationSurcharge);
  assumptions.rmGeneral = true;
  const rmCapexReserve = Math.round(350 * units);
  assumptions.rmCapexReserve = true;
  const exterminating = Math.round(130 * units * violationSurcharge);
  assumptions.exterminating = true;
  const landscaping = Math.min(Math.round(1000 * units), 25000);
  assumptions.landscaping = true;
  const elevator = (building.hasElevator || building.numFloors > 5) ? 10000 : 0;
  assumptions.elevator = true;
  const cleaning = Math.round(600 * units * violationSurcharge);
  assumptions.cleaning = true;
  const trashRemoval = Math.round(850 * units * violationSurcharge);
  assumptions.trashRemoval = true;

  // Fixed amounts
  const accounting = 4000;
  assumptions.accounting = true;
  const legal = 2000;
  assumptions.legal = true;
  const marketing = 15000;
  assumptions.marketing = true;
  const generalAdmin = 3500;
  assumptions.generalAdmin = true;
  const snowRemoval = 10000;
  assumptions.snowRemoval = true;
  const alarmMonitoring = 5000;
  assumptions.alarmMonitoring = true;
  const telephoneInternet = 9000;
  assumptions.telephoneInternet = true;

  // -- FINANCING --
  const closingCosts = 150000;
  assumptions.closingCosts = true;

  // -- EXIT --
  // Exit cap = going-in cap - 0.25%
  // We'll calculate going-in cap first, then set exit
  // Temporarily set a placeholder — calculateAll will use it
  assumptions.exitCapRate = true;
  assumptions.sellingCostPercent = true;
  assumptions.holdPeriodYears = true;
  assumptions.annualRentGrowth = true;
  assumptions.annualExpenseGrowth = true;
  assumptions.ltvPercent = true;
  assumptions.interestRate = true;
  assumptions.managementFeePercent = true;
  assumptions.originationFeePercent = true;
  assumptions.commercialVacancyRate = true;
  assumptions.concessions = true;
  assumptions.commercialRentAnnual = true;

  const inputs: DealInputs = {
    purchasePrice,
    closingCosts,
    renovationBudget: 0,

    ltvPercent: 65,
    interestRate: 7.0,
    amortizationYears: 30,
    loanTermYears: 30,
    interestOnly: false,
    originationFeePercent: 1,

    unitMix,
    residentialVacancyRate,
    concessions: 0,

    commercialRentAnnual: 0,
    commercialVacancyRate: 10,
    commercialConcessions: 0,

    lateFees: 0,
    parkingIncome: 0,
    storageIncome: 0,
    petDeposits: 0,
    petRent: 0,
    evCharging: 0,
    trashRubs: 0,
    waterRubs: 0,
    otherMiscIncome: 0,

    annualRentGrowth: 3,
    annualExpenseGrowth: 2,

    realEstateTaxes,
    insurance,
    licenseFees,
    fireMeter,
    electricityGas,
    waterSewer,
    managementFeePercent: 3,
    payroll,
    accounting,
    legal,
    marketing,
    rmGeneral,
    rmCapexReserve,
    generalAdmin,
    exterminating,
    landscaping,
    snowRemoval,
    elevator,
    alarmMonitoring,
    telephoneInternet,
    cleaning,
    trashRemoval,
    otherContractServices: 0,

    holdPeriodYears: 5,
    exitCapRate: 0, // placeholder — set below
    sellingCostPercent: 5,

    _assumptions: assumptions,
  };

  // Calculate going-in cap rate, then set exit cap = going-in - 0.25%
  const gpr = unitMix.reduce((s, u) => s + u.count * u.monthlyRent * 12, 0);
  const vacLoss = gpr * (residentialVacancyRate / 100);
  const totalIncome = gpr - vacLoss;
  const mgmtFee = totalIncome * 0.03;
  const totalExp = realEstateTaxes + insurance + licenseFees + fireMeter +
    electricityGas + waterSewer + mgmtFee + payroll + accounting + legal +
    marketing + rmGeneral + rmCapexReserve + generalAdmin + exterminating +
    landscaping + snowRemoval + elevator + alarmMonitoring + telephoneInternet +
    cleaning + trashRemoval;
  const estNoi = totalIncome - totalExp;
  const goingInCap = purchasePrice > 0 ? (estNoi / purchasePrice) * 100 : 5.5;
  inputs.exitCapRate = Math.max(3, Math.round((goingInCap - 0.25) * 100) / 100);

  return inputs;
}

// ============================================================
// Unit Mix Estimation
// ============================================================
function estimateUnitMix(totalUnits: number, rents: Record<string, number>, multiplier: number): UnitMixRow[] {
  const mix: UnitMixRow[] = [];

  if (totalUnits < 10) {
    // Small: 30% 1BR, 50% 2BR, 20% 3BR
    const oneBr = Math.max(1, Math.round(totalUnits * 0.3));
    const threeBr = Math.round(totalUnits * 0.2);
    const twoBr = totalUnits - oneBr - threeBr;
    if (oneBr > 0) mix.push({ type: "1BR", count: oneBr, monthlyRent: Math.round(rents["1BR"] * multiplier) });
    if (twoBr > 0) mix.push({ type: "2BR", count: twoBr, monthlyRent: Math.round(rents["2BR"] * multiplier) });
    if (threeBr > 0) mix.push({ type: "3BR", count: threeBr, monthlyRent: Math.round(rents["3BR"] * multiplier) });
  } else if (totalUnits <= 30) {
    // Medium: 20% Studio, 40% 1BR, 30% 2BR, 10% 3BR
    const studios = Math.round(totalUnits * 0.2);
    const oneBr = Math.round(totalUnits * 0.4);
    const threeBr = Math.round(totalUnits * 0.1);
    const twoBr = totalUnits - studios - oneBr - threeBr;
    if (studios > 0) mix.push({ type: "Studio", count: studios, monthlyRent: Math.round(rents["Studio"] * multiplier) });
    if (oneBr > 0) mix.push({ type: "1BR", count: oneBr, monthlyRent: Math.round(rents["1BR"] * multiplier) });
    if (twoBr > 0) mix.push({ type: "2BR", count: twoBr, monthlyRent: Math.round(rents["2BR"] * multiplier) });
    if (threeBr > 0) mix.push({ type: "3BR", count: threeBr, monthlyRent: Math.round(rents["3BR"] * multiplier) });
  } else {
    // Large: 25% Studio, 35% 1BR, 30% 2BR, 10% 3BR
    const studios = Math.round(totalUnits * 0.25);
    const oneBr = Math.round(totalUnits * 0.35);
    const threeBr = Math.round(totalUnits * 0.1);
    const twoBr = totalUnits - studios - oneBr - threeBr;
    if (studios > 0) mix.push({ type: "Studio", count: studios, monthlyRent: Math.round(rents["Studio"] * multiplier) });
    if (oneBr > 0) mix.push({ type: "1BR", count: oneBr, monthlyRent: Math.round(rents["1BR"] * multiplier) });
    if (twoBr > 0) mix.push({ type: "2BR", count: twoBr, monthlyRent: Math.round(rents["2BR"] * multiplier) });
    if (threeBr > 0) mix.push({ type: "3BR", count: threeBr, monthlyRent: Math.round(rents["3BR"] * multiplier) });
  }

  return mix;
}

// ============================================================
// NYS Building Data (assessment rolls, no PLUTO/HPD/DOB)
// ============================================================
export interface NYSBuildingData {
  address: string;
  municipality: string;
  county: string;
  swisCode: string;
  printKey: string;
  ownerName: string;
  unitsRes: number;
  yearBuilt: number;
  numFloors: number;
  bldgArea: number;
  fullMarketValue: number;
  totalAssessedValue: number;
  landValue: number;
  lastSalePrice: number;
  lastSaleDate: string;
  annualTaxes: number;
  propertyClass: string;
}

// ============================================================
// Generate Deal Assumptions for NYS Properties
// No rent stabilization, no HPD violations — simpler model
// ============================================================
export function generateNYSDealAssumptions(building: NYSBuildingData): DealInputs {
  const units = building.unitsRes || 1;
  const county = building.county || "Westchester";
  const rents = NYS_MARKET_RENTS[county] || NYS_MARKET_RENTS._default;
  const assumptions: Record<string, boolean> = {};

  // -- OFFER PRICE --
  let purchasePrice = 0;
  if (building.lastSalePrice > 100000 && building.lastSaleDate) {
    const saleDate = new Date(building.lastSaleDate);
    const yearsAgo = Math.max(0, (Date.now() - saleDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    if (yearsAgo < 3) {
      purchasePrice = Math.round(building.lastSalePrice * 1.15);
    } else {
      purchasePrice = Math.round(building.lastSalePrice * (1 + yearsAgo * 0.04));
    }
    assumptions.purchasePrice = true;
  } else if (building.fullMarketValue > 0) {
    purchasePrice = building.fullMarketValue;
    assumptions.purchasePrice = true;
  } else if (building.totalAssessedValue > 0) {
    purchasePrice = Math.round(building.totalAssessedValue * 1.4);
    assumptions.purchasePrice = true;
  }
  if (purchasePrice === 0) purchasePrice = 2000000;

  // -- RENT ADJUSTMENTS --
  let rentMultiplier = 1.0;
  if (building.yearBuilt > 0 && building.yearBuilt < 1950) rentMultiplier *= 0.90;
  if (building.yearBuilt >= 2000) rentMultiplier *= 1.10;
  // No rent stabilization outside NYC

  // -- UNIT MIX --
  const unitMix = estimateUnitMix(units, rents, rentMultiplier);
  assumptions.unitMix = true;

  // -- VACANCY --
  const residentialVacancyRate = 5;
  assumptions.residentialVacancyRate = true;

  // -- EXPENSES (NYS generally lower per-unit than NYC) --
  const realEstateTaxes = building.annualTaxes > 0 ? building.annualTaxes : Math.round(building.fullMarketValue * 0.025);
  if (building.annualTaxes <= 0) assumptions.realEstateTaxes = true;

  const insurance = Math.round(1200 * units);
  assumptions.insurance = true;
  const licenseFees = Math.round(300 * units);
  assumptions.licenseFees = true;
  const fireMeter = Math.round(150 * units);
  assumptions.fireMeter = true;
  const electricityGas = Math.round(500 * units);
  assumptions.electricityGas = true;
  const waterSewer = Math.round(600 * units);
  assumptions.waterSewer = true;
  const payroll = Math.round(900 * units);
  assumptions.payroll = true;
  const rmGeneral = Math.round(1500 * units);
  assumptions.rmGeneral = true;
  const rmCapexReserve = Math.round(300 * units);
  assumptions.rmCapexReserve = true;
  const exterminating = Math.round(100 * units);
  assumptions.exterminating = true;
  const landscaping = Math.min(Math.round(800 * units), 20000);
  assumptions.landscaping = true;
  const elevator = building.numFloors > 3 ? 8000 : 0;
  assumptions.elevator = true;
  const cleaning = Math.round(400 * units);
  assumptions.cleaning = true;
  const trashRemoval = Math.round(700 * units);
  assumptions.trashRemoval = true;

  const accounting = 3500;
  assumptions.accounting = true;
  const legal = 1500;
  assumptions.legal = true;
  const marketing = 10000;
  assumptions.marketing = true;
  const generalAdmin = 2500;
  assumptions.generalAdmin = true;
  const snowRemoval = 8000;
  assumptions.snowRemoval = true;
  const alarmMonitoring = 3500;
  assumptions.alarmMonitoring = true;
  const telephoneInternet = 6000;
  assumptions.telephoneInternet = true;

  const closingCosts = 100000;
  assumptions.closingCosts = true;

  assumptions.exitCapRate = true;
  assumptions.sellingCostPercent = true;
  assumptions.holdPeriodYears = true;
  assumptions.annualRentGrowth = true;
  assumptions.annualExpenseGrowth = true;
  assumptions.ltvPercent = true;
  assumptions.interestRate = true;
  assumptions.managementFeePercent = true;
  assumptions.originationFeePercent = true;
  assumptions.commercialVacancyRate = true;
  assumptions.concessions = true;
  assumptions.commercialRentAnnual = true;

  const inputs: DealInputs = {
    purchasePrice,
    closingCosts,
    renovationBudget: 0,

    ltvPercent: 65,
    interestRate: 7.0,
    amortizationYears: 30,
    loanTermYears: 30,
    interestOnly: false,
    originationFeePercent: 1,

    unitMix,
    residentialVacancyRate,
    concessions: 0,

    commercialRentAnnual: 0,
    commercialVacancyRate: 10,
    commercialConcessions: 0,

    lateFees: 0,
    parkingIncome: 0,
    storageIncome: 0,
    petDeposits: 0,
    petRent: 0,
    evCharging: 0,
    trashRubs: 0,
    waterRubs: 0,
    otherMiscIncome: 0,

    annualRentGrowth: 3,
    annualExpenseGrowth: 2,

    realEstateTaxes,
    insurance,
    licenseFees,
    fireMeter,
    electricityGas,
    waterSewer,
    managementFeePercent: 4,
    payroll,
    accounting,
    legal,
    marketing,
    rmGeneral,
    rmCapexReserve,
    generalAdmin,
    exterminating,
    landscaping,
    snowRemoval,
    elevator,
    alarmMonitoring,
    telephoneInternet,
    cleaning,
    trashRemoval,
    otherContractServices: 0,

    holdPeriodYears: 5,
    exitCapRate: 0,
    sellingCostPercent: 5,

    _assumptions: assumptions,
  };

  // Calculate exit cap
  const gpr = unitMix.reduce((s, u) => s + u.count * u.monthlyRent * 12, 0);
  const vacLoss = gpr * (residentialVacancyRate / 100);
  const totalIncome = gpr - vacLoss;
  const mgmtFee = totalIncome * 0.04;
  const totalExp = realEstateTaxes + insurance + licenseFees + fireMeter +
    electricityGas + waterSewer + mgmtFee + payroll + accounting + legal +
    marketing + rmGeneral + rmCapexReserve + generalAdmin + exterminating +
    landscaping + snowRemoval + elevator + alarmMonitoring + telephoneInternet +
    cleaning + trashRemoval;
  const estNoi = totalIncome - totalExp;
  const goingInCap = purchasePrice > 0 ? (estNoi / purchasePrice) * 100 : 6.0;
  inputs.exitCapRate = Math.max(3, Math.round((goingInCap - 0.25) * 100) / 100);

  return inputs;
}
