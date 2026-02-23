// ============================================================
// Deal Calculator — Full Underwriting Model
// Pure TypeScript, no external dependencies
// Based on real multifamily underwriting template (255 Nassau model)
// ============================================================

export interface UnitMixRow {
  type: string;       // e.g., "Studio", "1BR", "2BR"
  count: number;
  monthlyRent: number;
}

// ============================================================
// Detailed Income/Expense Inputs
// ============================================================
export interface DealInputs {
  // Acquisition
  purchasePrice: number;
  closingCosts: number;           // flat dollar amount (default $150,000)
  renovationBudget: number;

  // Financing
  ltvPercent: number;             // e.g., 65 for 65%
  interestRate: number;           // e.g., 7.0 for 7.0%
  amortizationYears: number;
  loanTermYears: number;
  interestOnly: boolean;
  originationFeePercent: number;  // e.g., 1 for 1%

  // Income — Residential
  unitMix: UnitMixRow[];
  residentialVacancyRate: number;   // default 5%
  concessions: number;              // annual $

  // Income — Commercial
  commercialRentAnnual: number;
  commercialVacancyRate: number;    // default 10%
  commercialConcessions: number;

  // Income — Other
  lateFees: number;
  parkingIncome: number;
  storageIncome: number;
  petDeposits: number;
  petRent: number;
  evCharging: number;
  trashRubs: number;
  waterRubs: number;
  otherMiscIncome: number;

  // Growth
  annualRentGrowth: number;         // e.g., 3 for 3%
  annualExpenseGrowth: number;      // e.g., 2 for 2%

  // Expenses — Fixed
  realEstateTaxes: number;
  insurance: number;
  licenseFees: number;
  fireMeter: number;

  // Expenses — Utilities
  electricityGas: number;
  waterSewer: number;

  // Expenses — Management & Personnel
  managementFeePercent: number;     // e.g., 3 for 3%
  payroll: number;

  // Expenses — Professional
  accounting: number;
  legal: number;
  marketing: number;

  // Expenses — R&M
  rmGeneral: number;
  rmCapexReserve: number;
  generalAdmin: number;

  // Expenses — Contract Services
  exterminating: number;
  landscaping: number;
  snowRemoval: number;
  elevator: number;
  alarmMonitoring: number;
  telephoneInternet: number;
  cleaning: number;
  trashRemoval: number;
  otherContractServices: number;

  // Exit
  holdPeriodYears: number;
  exitCapRate: number;              // e.g., 5.5 for 5.5%
  sellingCostPercent: number;       // e.g., 5 for 5%

  // Metadata — tracks which fields were AI-generated
  _assumptions?: Record<string, boolean>;
}

export interface CashFlowYear {
  year: number;
  gpr: number;
  vacancy: number;
  otherIncome: number;
  egi: number;
  expenses: number;
  noi: number;
  debtService: number;
  cashFlow: number;
  cumulativeCashFlow: number;
}

export interface DealOutputs {
  // Income Breakdown
  grossPotentialResidentialRent: number;
  residentialVacancyLoss: number;
  concessionsLoss: number;
  netResidentialIncome: number;
  grossPotentialCommercialRent: number;
  commercialVacancyLoss: number;
  commercialConcessionsLoss: number;
  netCommercialIncome: number;
  netRentableIncome: number;
  totalOtherIncome: number;
  totalIncome: number;

  // Legacy aliases (for backward compat with PDF + pipeline)
  grossPotentialRent: number;
  vacancyLoss: number;
  effectiveGrossIncome: number;

  // Expense Breakdown
  expenseDetails: { label: string; amount: number; category: string }[];
  totalExpenses: number;
  managementFee: number;

  // NOI
  noi: number;

  // Financing
  loanAmount: number;
  annualDebtService: number;       // amortizing payment
  monthlyDebtService: number;
  ioAnnualPayment: number;         // interest-only payment
  totalEquity: number;
  originationFee: number;

  // Key Metrics
  capRate: number;
  cashOnCashIO: number;
  cashOnCashAmort: number;
  cashOnCash: number;              // legacy alias = amort
  irr: number;
  dscr: number;
  debtYield: number;
  equityMultiple: number;
  netIncomeIO: number;
  netIncomeAmort: number;

  // Cash Flow Waterfall
  cashFlows: CashFlowYear[];

  // Exit
  exitNoi: number;
  exitValue: number;
  loanBalanceAtExit: number;
  exitProceeds: number;

  // Sensitivity
  sensitivity: {
    rows: number[][];
    rowLabels: string[];
    colLabels: string[];
    rowParam: string;
    colParam: string;
  };

  // Sources & Uses
  sources: { label: string; amount: number }[];
  uses: { label: string; amount: number }[];
}

// ============================================================
// Default inputs for new deals
// ============================================================
export const DEFAULT_INPUTS: DealInputs = {
  purchasePrice: 5000000,
  closingCosts: 150000,
  renovationBudget: 0,

  ltvPercent: 65,
  interestRate: 7.0,
  amortizationYears: 30,
  loanTermYears: 30,
  interestOnly: false,
  originationFeePercent: 1,

  unitMix: [
    { type: "Studio", count: 4, monthlyRent: 2000 },
    { type: "1BR", count: 8, monthlyRent: 2500 },
    { type: "2BR", count: 4, monthlyRent: 3200 },
  ],
  residentialVacancyRate: 5,
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

  realEstateTaxes: 80000,
  insurance: 25600,
  licenseFees: 8800,
  fireMeter: 3200,
  electricityGas: 8800,
  waterSewer: 12000,
  managementFeePercent: 3,
  payroll: 19200,
  accounting: 4000,
  legal: 2000,
  marketing: 15000,
  rmGeneral: 28800,
  rmCapexReserve: 5600,
  generalAdmin: 3500,
  exterminating: 2080,
  landscaping: 16000,
  snowRemoval: 10000,
  elevator: 0,
  alarmMonitoring: 5000,
  telephoneInternet: 9000,
  cleaning: 9600,
  trashRemoval: 13600,
  otherContractServices: 0,

  holdPeriodYears: 5,
  exitCapRate: 5.5,
  sellingCostPercent: 5,
};

// ============================================================
// Income Calculation
// ============================================================
export function calculateIncome(inputs: DealInputs) {
  const grossPotentialResidentialRent = inputs.unitMix.reduce(
    (sum, u) => sum + u.count * u.monthlyRent * 12, 0
  );
  const residentialVacancyLoss = grossPotentialResidentialRent * (inputs.residentialVacancyRate / 100);
  const concessionsLoss = inputs.concessions;
  const netResidentialIncome = grossPotentialResidentialRent - residentialVacancyLoss - concessionsLoss;

  const grossPotentialCommercialRent = inputs.commercialRentAnnual;
  const commercialVacancyLoss = grossPotentialCommercialRent * (inputs.commercialVacancyRate / 100);
  const commercialConcessionsLoss = inputs.commercialConcessions;
  const netCommercialIncome = grossPotentialCommercialRent - commercialVacancyLoss - commercialConcessionsLoss;

  const netRentableIncome = netResidentialIncome + netCommercialIncome;

  const totalOtherIncome =
    inputs.lateFees +
    inputs.parkingIncome +
    inputs.storageIncome +
    inputs.petDeposits +
    inputs.petRent +
    inputs.evCharging +
    inputs.trashRubs +
    inputs.waterRubs +
    inputs.otherMiscIncome;

  const totalIncome = netRentableIncome + totalOtherIncome;

  return {
    grossPotentialResidentialRent,
    residentialVacancyLoss,
    concessionsLoss,
    netResidentialIncome,
    grossPotentialCommercialRent,
    commercialVacancyLoss,
    commercialConcessionsLoss,
    netCommercialIncome,
    netRentableIncome,
    totalOtherIncome,
    totalIncome,
    // Legacy aliases
    grossPotentialRent: grossPotentialResidentialRent + grossPotentialCommercialRent,
    vacancyLoss: residentialVacancyLoss + commercialVacancyLoss,
    effectiveGrossIncome: totalIncome,
  };
}

// ============================================================
// Expense Calculation
// ============================================================
export function calculateExpenses(inputs: DealInputs, totalIncome: number) {
  const managementFee = totalIncome * (inputs.managementFeePercent / 100);

  const details: { label: string; amount: number; category: string }[] = [
    { label: "Real Estate Taxes", amount: inputs.realEstateTaxes, category: "fixed" },
    { label: "Property Insurance", amount: inputs.insurance, category: "fixed" },
    { label: "License/Permit/Inspection", amount: inputs.licenseFees, category: "fixed" },
    { label: "Fire Meter Service", amount: inputs.fireMeter, category: "fixed" },
    { label: "Electricity + Gas", amount: inputs.electricityGas, category: "utilities" },
    { label: "Water / Sewer", amount: inputs.waterSewer, category: "utilities" },
    { label: "Management Fee", amount: managementFee, category: "management" },
    { label: "Payroll", amount: inputs.payroll, category: "management" },
    { label: "Accounting", amount: inputs.accounting, category: "professional" },
    { label: "Legal", amount: inputs.legal, category: "professional" },
    { label: "Marketing / Leasing", amount: inputs.marketing, category: "professional" },
    { label: "R&M General", amount: inputs.rmGeneral, category: "maintenance" },
    { label: "R&M CapEx/Reserve", amount: inputs.rmCapexReserve, category: "maintenance" },
    { label: "General Admin", amount: inputs.generalAdmin, category: "admin" },
    { label: "Exterminating", amount: inputs.exterminating, category: "contract" },
    { label: "Landscaping", amount: inputs.landscaping, category: "contract" },
    { label: "Snow Removal", amount: inputs.snowRemoval, category: "contract" },
    { label: "Elevator", amount: inputs.elevator, category: "contract" },
    { label: "Alarm Monitoring", amount: inputs.alarmMonitoring, category: "contract" },
    { label: "Telephone/Internet", amount: inputs.telephoneInternet, category: "contract" },
    { label: "Cleaning", amount: inputs.cleaning, category: "contract" },
    { label: "Trash Removal", amount: inputs.trashRemoval, category: "contract" },
    { label: "Other Contract Services", amount: inputs.otherContractServices, category: "contract" },
  ];

  const totalExpenses = details.reduce((sum, d) => sum + d.amount, 0);

  return { managementFee, expenseDetails: details, totalExpenses };
}

// ============================================================
// NOI Calculation (updated)
// ============================================================
export function calculateNOI(inputs: DealInputs) {
  const incomeResult = calculateIncome(inputs);
  const expenseResult = calculateExpenses(inputs, incomeResult.totalIncome);
  const noi = incomeResult.totalIncome - expenseResult.totalExpenses;

  return {
    ...incomeResult,
    ...expenseResult,
    noi,
  };
}

// ============================================================
// Debt Service Calculation
// ============================================================
export function calculateDebtService(inputs: DealInputs) {
  const loanAmount = inputs.purchasePrice * (inputs.ltvPercent / 100);
  const originationFee = loanAmount * (inputs.originationFeePercent / 100);
  const totalEquity = inputs.purchasePrice - loanAmount + inputs.closingCosts + inputs.renovationBudget + originationFee;

  // Interest-only payment
  const ioMonthlyPayment = loanAmount * (inputs.interestRate / 100 / 12);
  const ioAnnualPayment = ioMonthlyPayment * 12;

  // Amortizing payment
  let amortMonthlyPayment: number;
  const r = inputs.interestRate / 100 / 12;
  const n = inputs.amortizationYears * 12;
  if (r === 0) {
    amortMonthlyPayment = loanAmount / n;
  } else {
    amortMonthlyPayment = loanAmount * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }
  const amortAnnualPayment = amortMonthlyPayment * 12;

  // Actual payment depends on IO flag
  const monthlyPayment = inputs.interestOnly ? ioMonthlyPayment : amortMonthlyPayment;
  const annualDebtService = monthlyPayment * 12;

  return {
    loanAmount,
    originationFee,
    totalEquity,
    monthlyPayment,
    monthlyDebtService: monthlyPayment,
    annualDebtService,
    ioAnnualPayment,
    amortAnnualPayment,
  };
}

// ============================================================
// Loan balance after N months of amortization
// ============================================================
function loanBalanceAfterMonths(loanAmount: number, monthlyRate: number, totalMonths: number, paidMonths: number, interestOnly: boolean): number {
  if (interestOnly) return loanAmount;
  if (monthlyRate === 0) return loanAmount - (loanAmount / totalMonths) * paidMonths;
  const b = loanAmount * (Math.pow(1 + monthlyRate, totalMonths) - Math.pow(1 + monthlyRate, paidMonths)) / (Math.pow(1 + monthlyRate, totalMonths) - 1);
  return Math.max(0, b);
}

// ============================================================
// Returns Calculation
// ============================================================
export function calculateReturns(inputs: DealInputs) {
  const noiResult = calculateNOI(inputs);
  const debtResult = calculateDebtService(inputs);

  const capRate = inputs.purchasePrice > 0 ? (noiResult.noi / inputs.purchasePrice) * 100 : 0;

  // Cash-on-Cash (both IO and Amort)
  const netIncomeIO = noiResult.noi - debtResult.ioAnnualPayment;
  const netIncomeAmort = noiResult.noi - debtResult.amortAnnualPayment;
  const cashOnCashIO = debtResult.totalEquity > 0 ? (netIncomeIO / debtResult.totalEquity) * 100 : 0;
  const cashOnCashAmort = debtResult.totalEquity > 0 ? (netIncomeAmort / debtResult.totalEquity) * 100 : 0;

  const dscr = debtResult.amortAnnualPayment > 0 ? noiResult.noi / debtResult.amortAnnualPayment : 0;
  const debtYield = debtResult.loanAmount > 0 ? (noiResult.noi / debtResult.loanAmount) * 100 : 0;

  // Build cash flows for IRR + equity multiple
  const cashFlows = buildCashFlowSeries(inputs);
  const holdYears = inputs.holdPeriodYears;

  // Exit value
  const exitYearNoi = cashFlows[holdYears - 1]?.noi || noiResult.noi;
  const exitValue = inputs.exitCapRate > 0 ? exitYearNoi / (inputs.exitCapRate / 100) : 0;
  const sellingCosts = exitValue * (inputs.sellingCostPercent / 100);
  const r = inputs.interestRate / 100 / 12;
  const n = inputs.amortizationYears * 12;
  const loanBalance = loanBalanceAfterMonths(debtResult.loanAmount, r, n, holdYears * 12, inputs.interestOnly);
  const exitProceeds = exitValue - sellingCosts - loanBalance;

  // IRR cash flow array
  const irrFlows: number[] = [-debtResult.totalEquity];
  for (let y = 0; y < holdYears; y++) {
    let cf = cashFlows[y]?.cashFlow || 0;
    if (y === holdYears - 1) cf += exitProceeds;
    irrFlows.push(cf);
  }

  const irr = calculateIRR(irrFlows) * 100;
  const totalCashIn = irrFlows.slice(1).reduce((s, v) => s + v, 0);
  const equityMultiple = debtResult.totalEquity > 0 ? totalCashIn / debtResult.totalEquity : 0;

  return {
    capRate,
    cashOnCashIO,
    cashOnCashAmort,
    cashOnCash: cashOnCashAmort,
    irr,
    dscr,
    debtYield,
    equityMultiple,
    netIncomeIO,
    netIncomeAmort,
    exitNoi: exitYearNoi,
    exitValue,
    loanBalanceAtExit: loanBalance,
    exitProceeds,
  };
}

// ============================================================
// Cash Flow Waterfall — year-by-year projection
// ============================================================
function buildCashFlowSeries(inputs: DealInputs): CashFlowYear[] {
  const debtResult = calculateDebtService(inputs);
  const baseIncome = calculateIncome(inputs);
  const baseExpResult = calculateExpenses(inputs, baseIncome.totalIncome);

  const baseGPR = baseIncome.grossPotentialResidentialRent + baseIncome.grossPotentialCommercialRent;
  const baseVacancy = baseIncome.residentialVacancyLoss + baseIncome.commercialVacancyLoss;
  const baseOther = baseIncome.totalOtherIncome;
  // Non-mgmt-fee expenses (mgmt fee recalculated each year)
  const baseMgmtFee = baseExpResult.managementFee;
  const baseNonMgmtExpenses = baseExpResult.totalExpenses - baseMgmtFee;

  const rentGrowth = inputs.annualRentGrowth / 100;
  const expGrowth = inputs.annualExpenseGrowth / 100;

  const cashFlows: CashFlowYear[] = [];
  let cumulative = 0;

  for (let y = 0; y < inputs.holdPeriodYears; y++) {
    const gpr = baseGPR * Math.pow(1 + rentGrowth, y);
    const vacancy = baseVacancy * Math.pow(1 + rentGrowth, y);
    const otherIncome = baseOther * Math.pow(1 + rentGrowth, y);
    const egi = gpr - vacancy + otherIncome;
    const mgmtFee = egi * (inputs.managementFeePercent / 100);
    const expenses = (baseNonMgmtExpenses * Math.pow(1 + expGrowth, y)) + mgmtFee;
    const noi = egi - expenses;
    const cashFlow = noi - debtResult.annualDebtService;
    cumulative += cashFlow;

    cashFlows.push({
      year: y + 1,
      gpr: Math.round(gpr),
      vacancy: Math.round(vacancy),
      otherIncome: Math.round(otherIncome),
      egi: Math.round(egi),
      expenses: Math.round(expenses),
      noi: Math.round(noi),
      debtService: Math.round(debtResult.annualDebtService),
      cashFlow: Math.round(cashFlow),
      cumulativeCashFlow: Math.round(cumulative),
    });
  }

  return cashFlows;
}

export function calculateCashFlowWaterfall(inputs: DealInputs): CashFlowYear[] {
  return buildCashFlowSeries(inputs);
}

// ============================================================
// Sensitivity Matrix — IRR varying exit cap rate vs purchase price
// ============================================================
export function calculateSensitivity(inputs: DealInputs) {
  const exitCapRates = [-1.0, -0.5, 0, 0.5, 1.0].map(d => inputs.exitCapRate + d);
  const priceDeltas = [-10, -5, 0, 5, 10];

  const rows: number[][] = [];
  const rowLabels: string[] = [];
  const colLabels: string[] = [];

  priceDeltas.forEach(pct => {
    colLabels.push(pct === 0 ? "Base" : `${pct > 0 ? "+" : ""}${pct}%`);
  });

  exitCapRates.forEach(ecr => {
    rowLabels.push(`${ecr.toFixed(1)}%`);
    const row: number[] = [];
    priceDeltas.forEach(pct => {
      const tweaked: DealInputs = {
        ...inputs,
        exitCapRate: ecr,
        purchasePrice: inputs.purchasePrice * (1 + pct / 100),
      };
      const { irr } = calculateReturns(tweaked);
      row.push(Math.round(irr * 10) / 10);
    });
    rows.push(row);
  });

  return { rows, rowLabels, colLabels, rowParam: "Exit Cap Rate", colParam: "Purchase Price" };
}

// ============================================================
// IRR — Newton's method with bisection fallback
// ============================================================
function calculateIRR(cashFlows: number[], guess = 0.1, maxIter = 100, tolerance = 1e-7): number {
  let rate = guess;
  for (let i = 0; i < maxIter; i++) {
    let npv = 0;
    let dnpv = 0;
    for (let t = 0; t < cashFlows.length; t++) {
      const denom = Math.pow(1 + rate, t);
      npv += cashFlows[t] / denom;
      if (t > 0) dnpv -= t * cashFlows[t] / Math.pow(1 + rate, t + 1);
    }
    if (Math.abs(npv) < tolerance) return rate;
    if (Math.abs(dnpv) < 1e-12) break;
    rate -= npv / dnpv;
    if (rate < -0.99) rate = -0.5;
    if (rate > 10) rate = 5;
  }
  return bisectionIRR(cashFlows);
}

function bisectionIRR(cashFlows: number[], lo = -0.5, hi = 5, maxIter = 200, tol = 1e-6): number {
  for (let i = 0; i < maxIter; i++) {
    const mid = (lo + hi) / 2;
    const npv = cashFlows.reduce((s, cf, t) => s + cf / Math.pow(1 + mid, t), 0);
    if (Math.abs(npv) < tol) return mid;
    if (npv > 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ============================================================
// Calculate All — main entry point
// ============================================================
export function calculateAll(inputs: DealInputs): DealOutputs {
  const noiResult = calculateNOI(inputs);
  const debtResult = calculateDebtService(inputs);
  const returnsResult = calculateReturns(inputs);
  const cashFlows = calculateCashFlowWaterfall(inputs);
  const sensitivity = calculateSensitivity(inputs);

  const sources: { label: string; amount: number }[] = [
    { label: "Senior Debt", amount: Math.round(debtResult.loanAmount) },
    { label: "Equity", amount: Math.round(debtResult.totalEquity) },
  ];

  const uses: { label: string; amount: number }[] = [
    { label: "Purchase Price", amount: inputs.purchasePrice },
    { label: "Closing Costs", amount: Math.round(inputs.closingCosts) },
    { label: "Origination Fee", amount: Math.round(debtResult.originationFee) },
  ];
  if (inputs.renovationBudget > 0) {
    uses.push({ label: "Renovation", amount: inputs.renovationBudget });
  }

  return {
    grossPotentialResidentialRent: Math.round(noiResult.grossPotentialResidentialRent),
    residentialVacancyLoss: Math.round(noiResult.residentialVacancyLoss),
    concessionsLoss: Math.round(noiResult.concessionsLoss),
    netResidentialIncome: Math.round(noiResult.netResidentialIncome),
    grossPotentialCommercialRent: Math.round(noiResult.grossPotentialCommercialRent),
    commercialVacancyLoss: Math.round(noiResult.commercialVacancyLoss),
    commercialConcessionsLoss: Math.round(noiResult.commercialConcessionsLoss),
    netCommercialIncome: Math.round(noiResult.netCommercialIncome),
    netRentableIncome: Math.round(noiResult.netRentableIncome),
    totalOtherIncome: Math.round(noiResult.totalOtherIncome),
    totalIncome: Math.round(noiResult.totalIncome),

    grossPotentialRent: Math.round(noiResult.grossPotentialRent),
    vacancyLoss: Math.round(noiResult.vacancyLoss),
    effectiveGrossIncome: Math.round(noiResult.effectiveGrossIncome),

    expenseDetails: noiResult.expenseDetails.map(d => ({ ...d, amount: Math.round(d.amount) })),
    totalExpenses: Math.round(noiResult.totalExpenses),
    managementFee: Math.round(noiResult.managementFee),

    noi: Math.round(noiResult.noi),

    loanAmount: Math.round(debtResult.loanAmount),
    annualDebtService: Math.round(debtResult.annualDebtService),
    monthlyDebtService: Math.round(debtResult.monthlyDebtService),
    ioAnnualPayment: Math.round(debtResult.ioAnnualPayment),
    totalEquity: Math.round(debtResult.totalEquity),
    originationFee: Math.round(debtResult.originationFee),

    capRate: Math.round(returnsResult.capRate * 100) / 100,
    cashOnCashIO: Math.round(returnsResult.cashOnCashIO * 100) / 100,
    cashOnCashAmort: Math.round(returnsResult.cashOnCashAmort * 100) / 100,
    cashOnCash: Math.round(returnsResult.cashOnCash * 100) / 100,
    irr: Math.round(returnsResult.irr * 100) / 100,
    dscr: Math.round(returnsResult.dscr * 100) / 100,
    debtYield: Math.round(returnsResult.debtYield * 100) / 100,
    equityMultiple: Math.round(returnsResult.equityMultiple * 100) / 100,
    netIncomeIO: Math.round(returnsResult.netIncomeIO),
    netIncomeAmort: Math.round(returnsResult.netIncomeAmort),

    cashFlows,

    exitNoi: Math.round(returnsResult.exitNoi),
    exitValue: Math.round(returnsResult.exitValue),
    loanBalanceAtExit: Math.round(returnsResult.loanBalanceAtExit),
    exitProceeds: Math.round(returnsResult.exitProceeds),

    sensitivity,
    sources,
    uses,
  };
}
