// ============================================================
// Deal PDF Export — generates a professional 4-page deal summary
// Uses jsPDF for client-side PDF generation
// ============================================================

import jsPDF from "jspdf";
import type { DealInputs, DealOutputs, ExpenseDetailRow } from "./deal-calculator";
import type { DealPrefillData } from "@/app/(dashboard)/deals/actions";

const fmt = (n: number) => n >= 0 ? `$${n.toLocaleString()}` : `-$${Math.abs(n).toLocaleString()}`;
const fmtPct = (n: number) => `${n.toFixed(2)}%`;
const fmtX = (n: number) => `${n.toFixed(2)}x`;

interface DealPdfOptions {
  dealName: string;
  address?: string;
  borough?: string;
  inputs: DealInputs;
  outputs: DealOutputs;
  propertyDetails?: DealPrefillData | null;
  notes?: string;
}

// Colors (as tuples for jsPDF)
type RGB = [number, number, number];
const BLUE: RGB = [30, 64, 175];
const DARK: RGB = [15, 23, 42];
const GRAY: RGB = [100, 116, 139];
const LIGHT_GRAY: RGB = [226, 232, 240];
const GREEN: RGB = [22, 163, 74];
const RED: RGB = [220, 38, 38];
const AMBER: RGB = [217, 119, 6];
const WHITE: RGB = [255, 255, 255];
const BG_LIGHT: RGB = [248, 250, 252];

function colorForMetric(value: number, green: number, amber: number): RGB {
  if (value >= green) return GREEN;
  if (value >= amber) return AMBER;
  return RED;
}

export function generateDealPdf(options: DealPdfOptions) {
  const { dealName, address, borough, inputs, outputs, propertyDetails, notes } = options;
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const ML = 40; // margin left
  const MR = 40; // margin right
  const CW = W - ML - MR; // content width
  let y = 0;

  function addFooter(page: number) {
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text(`VettdRE Deal Analysis — ${dealName || "Untitled"} — Page ${page}`, ML, H - 20);
    doc.text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), W - MR, H - 20, { align: "right" });
  }

  function drawLine(y: number) {
    doc.setDrawColor(...LIGHT_GRAY);
    doc.setLineWidth(0.5);
    doc.line(ML, y, W - MR, y);
  }

  function sectionTitle(text: string, yPos: number): number {
    doc.setFontSize(12);
    doc.setTextColor(...BLUE);
    doc.setFont("helvetica", "bold");
    doc.text(text, ML, yPos);
    drawLine(yPos + 4);
    return yPos + 20;
  }

  // ============================================================
  // PAGE 1 — Executive Summary
  // ============================================================
  // Header bar
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, W, 60, "F");
  doc.setTextColor(...WHITE);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("Deal Analysis", ML, 38);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("VettdRE", W - MR, 38, { align: "right" });

  // Deal name and address
  y = 85;
  doc.setTextColor(...DARK);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(dealName || "Untitled Deal", ML, y);
  y += 18;
  if (address) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.text(`${address}${borough ? `, ${borough}` : ""}`, ML, y);
    y += 14;
  }

  // Date
  doc.setFontSize(9);
  doc.text(`Generated ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, ML, y);
  y += 25;

  // Key Metrics Cards (2x3 grid)
  y = sectionTitle("Key Metrics", y);
  const metrics = [
    { label: "Cap Rate", value: fmtPct(outputs.capRate), color: colorForMetric(outputs.capRate, 5, 3) },
    { label: "Cash-on-Cash", value: fmtPct(outputs.cashOnCash), color: colorForMetric(outputs.cashOnCash, 8, 4) },
    { label: "IRR", value: isFinite(outputs.irr) ? fmtPct(outputs.irr) : "N/A", color: colorForMetric(outputs.irr, 15, 8) },
    { label: "DSCR", value: fmtX(outputs.dscr), color: colorForMetric(outputs.dscr, 1.25, 1.0) },
    { label: "Equity Multiple", value: fmtX(outputs.equityMultiple), color: colorForMetric(outputs.equityMultiple, 2, 1.5) },
    { label: "NOI", value: fmt(outputs.noi), color: outputs.noi > 0 ? GREEN : RED },
  ];

  const cardW = (CW - 20) / 3;
  const cardH = 48;
  metrics.forEach((m, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const cx = ML + col * (cardW + 10);
    const cy = y + row * (cardH + 8);

    doc.setFillColor(...BG_LIGHT);
    doc.roundedRect(cx, cy, cardW, cardH, 4, 4, "F");
    doc.setDrawColor(...LIGHT_GRAY);
    doc.roundedRect(cx, cy, cardW, cardH, 4, 4, "S");

    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.setFont("helvetica", "normal");
    doc.text(m.label.toUpperCase(), cx + 10, cy + 16);

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...m.color);
    doc.text(m.value, cx + 10, cy + 36);
  });

  y += 2 * (cardH + 8) + 15;

  // Pro Forma P&L
  y = sectionTitle("Pro Forma P&L (Year 1)", y);
  const pnlRows: { label: string; value: string; bold: boolean; indent: boolean }[] = [
    { label: "Gross Potential Residential Rent", value: fmt(outputs.grossPotentialResidentialRent), bold: false, indent: false },
    { label: "Less: Vacancy & Concessions", value: `(${fmt(outputs.residentialVacancyLoss + outputs.concessionsLoss)})`, bold: false, indent: true },
  ];
  // Commercial tenants breakdown
  if (inputs.commercialTenants && inputs.commercialTenants.length > 0) {
    inputs.commercialTenants.forEach(t => {
      pnlRows.push({ label: `Commercial: ${t.name}`, value: fmt(t.rentAnnual), bold: false, indent: false });
    });
    if (outputs.commercialVacancyLoss > 0) {
      pnlRows.push({ label: "Less: Commercial Vacancy", value: `(${fmt(outputs.commercialVacancyLoss)})`, bold: false, indent: true });
    }
  } else if (outputs.grossPotentialCommercialRent > 0) {
    pnlRows.push({ label: "Commercial Rent", value: fmt(outputs.grossPotentialCommercialRent), bold: false, indent: false });
    pnlRows.push({ label: "Less: Commercial Vacancy", value: `(${fmt(outputs.commercialVacancyLoss)})`, bold: false, indent: true });
  }
  pnlRows.push({ label: "Net Rentable Income", value: fmt(outputs.netRentableIncome), bold: true, indent: false });
  // Other income breakdown
  if (outputs.totalOtherIncome > 0) {
    if (inputs.customIncomeItems && inputs.customIncomeItems.length > 0) {
      inputs.customIncomeItems.forEach(item => {
        pnlRows.push({ label: item.name, value: fmt(item.amount), bold: false, indent: true });
      });
    }
    if (inputs.camRecoveries && inputs.camRecoveries > 0) {
      pnlRows.push({ label: "CAM Recoveries", value: fmt(inputs.camRecoveries), bold: false, indent: true });
    }
    // Show aggregate other income if no custom breakdown
    if ((!inputs.customIncomeItems || inputs.customIncomeItems.length === 0) && (!inputs.camRecoveries || inputs.camRecoveries === 0)) {
      pnlRows.push({ label: "Plus: Other Income", value: fmt(outputs.totalOtherIncome), bold: false, indent: true });
    }
  }
  pnlRows.push(
    { label: "TOTAL INCOME", value: fmt(outputs.totalIncome), bold: true, indent: false },
    { label: "Total Operating Expenses", value: `(${fmt(outputs.totalExpenses)})`, bold: false, indent: false },
    { label: "NET OPERATING INCOME", value: fmt(outputs.noi), bold: true, indent: false },
    { label: "IO Debt Service", value: `(${fmt(outputs.ioAnnualPayment)})`, bold: false, indent: false },
    { label: "Net Income (IO)", value: fmt(outputs.netIncomeIO), bold: true, indent: false },
    { label: "Amort Debt Service (30yr)", value: `(${fmt(outputs.annualDebtService)})`, bold: false, indent: false },
    { label: "Net Income (Amort)", value: fmt(outputs.netIncomeAmort), bold: true, indent: false },
  );

  pnlRows.forEach((row, i) => {
    if (row.bold) {
      doc.setFillColor(...BG_LIGHT);
      doc.rect(ML, y - 10, CW, 16, "F");
    }
    doc.setFontSize(9);
    doc.setFont("helvetica", row.bold ? "bold" : "normal");
    doc.setTextColor(...(row.bold ? DARK : GRAY));
    doc.text(row.label, ML + (row.indent ? 15 : 5), y);
    doc.text(row.value, W - MR - 5, y, { align: "right" });
    y += 16;
  });

  y += 10;

  // Sources & Uses
  y = sectionTitle("Sources & Uses", y);
  const halfW = (CW - 15) / 2;

  // Sources
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text("Sources", ML + 5, y);
  doc.text("Uses", ML + halfW + 20, y);
  y += 14;

  const maxRows = Math.max(outputs.sources.length, outputs.uses.length);
  for (let i = 0; i < maxRows; i++) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    if (outputs.sources[i]) {
      doc.text(outputs.sources[i].label, ML + 5, y);
      doc.text(fmt(outputs.sources[i].amount), ML + halfW - 5, y, { align: "right" });
    }
    if (outputs.uses[i]) {
      doc.text(outputs.uses[i].label, ML + halfW + 20, y);
      doc.text(fmt(outputs.uses[i].amount), W - MR - 5, y, { align: "right" });
    }
    y += 14;
  }

  // Totals
  drawLine(y - 4);
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text("Total", ML + 5, y);
  doc.text(fmt(outputs.sources.reduce((s, r) => s + r.amount, 0)), ML + halfW - 5, y, { align: "right" });
  doc.text("Total", ML + halfW + 20, y);
  doc.text(fmt(outputs.uses.reduce((s, r) => s + r.amount, 0)), W - MR - 5, y, { align: "right" });

  addFooter(1);

  // ============================================================
  // PAGE 2 — Cash Flow Waterfall
  // ============================================================
  doc.addPage();
  y = 50;
  y = sectionTitle("Cash Flow Waterfall", y);

  // Table header
  const cfCols = ["Year", "GPR", "Vacancy", "EGI", "Expenses", "NOI", "Debt Svc", "Cash Flow", "Cumulative"];
  const cfColW = [35, 60, 55, 60, 60, 60, 55, 60, 65];
  let cx = ML;

  doc.setFillColor(...BLUE);
  doc.rect(ML, y - 10, CW, 16, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...WHITE);
  cfCols.forEach((col, i) => {
    doc.text(col, i === 0 ? cx + 4 : cx + cfColW[i] - 4, y, { align: i === 0 ? "left" : "right" });
    cx += cfColW[i];
  });
  y += 14;

  // Data rows
  outputs.cashFlows.forEach((cf, ri) => {
    if (ri % 2 === 0) {
      doc.setFillColor(...BG_LIGHT);
      doc.rect(ML, y - 10, CW, 14, "F");
    }
    cx = ML;
    const vals = [
      `${cf.year}`, fmt(cf.gpr), `(${fmt(cf.vacancy)})`, fmt(cf.egi),
      `(${fmt(cf.expenses)})`, fmt(cf.noi), `(${fmt(cf.debtService)})`,
      fmt(cf.cashFlow), fmt(cf.cumulativeCashFlow),
    ];
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    vals.forEach((v, i) => {
      const isNeg = v.startsWith("(") || v.startsWith("-");
      doc.setTextColor(...(i === 7 && cf.cashFlow < 0 ? RED : i === 8 && cf.cumulativeCashFlow < 0 ? RED : isNeg ? RED : GRAY));
      if (i === 5 || i === 7 || i === 8) doc.setFont("helvetica", "bold");
      else doc.setFont("helvetica", "normal");
      doc.text(v, i === 0 ? cx + 4 : cx + cfColW[i] - 4, y, { align: i === 0 ? "left" : "right" });
      cx += cfColW[i];
    });
    y += 14;
  });

  // Exit row
  drawLine(y - 4);
  y += 8;
  doc.setFillColor(219, 234, 254); // blue-100
  doc.rect(ML, y - 10, CW, 16, "F");
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...DARK);
  doc.text("Exit", ML + 4, y);
  doc.setTextColor(...GRAY);
  doc.text(`Sale @ ${fmtPct(inputs.exitCapRate)} Cap`, ML + 200, y);
  cx = ML;
  cfCols.forEach((_, i) => { cx += cfColW[i]; });
  cx = ML;
  for (let i = 0; i < 5; i++) cx += cfColW[i];
  doc.setTextColor(...DARK);
  doc.text(fmt(outputs.exitValue), cx + cfColW[5] - 4, y, { align: "right" });
  cx += cfColW[5];
  doc.setTextColor(...RED);
  doc.text(`(${fmt(outputs.loanBalanceAtExit)})`, cx + cfColW[6] - 4, y, { align: "right" });
  cx += cfColW[6];
  doc.setTextColor(...BLUE);
  doc.text(fmt(outputs.exitProceeds), cx + cfColW[7] - 4, y, { align: "right" });

  y += 35;

  // Exit Analysis
  y = sectionTitle("Exit Analysis", y);
  const exitItems = [
    { label: "Exit NOI", value: fmt(outputs.exitNoi) },
    { label: "Exit Value", value: fmt(outputs.exitValue) },
    { label: "Loan Balance at Exit", value: fmt(outputs.loanBalanceAtExit) },
    { label: "Net Proceeds", value: fmt(outputs.exitProceeds) },
  ];
  const exitCardW = (CW - 30) / 4;
  exitItems.forEach((item, i) => {
    const ex = ML + i * (exitCardW + 10);
    doc.setFillColor(...BG_LIGHT);
    doc.roundedRect(ex, y, exitCardW, 40, 3, 3, "F");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.setFont("helvetica", "normal");
    doc.text(item.label.toUpperCase(), ex + 8, y + 14);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...(i === 3 ? GREEN : DARK));
    doc.text(item.value, ex + 8, y + 32);
  });

  y += 65;

  // Financing Summary
  y = sectionTitle("Financing Summary", y);
  const finItems = [
    ["Purchase Price", fmt(inputs.purchasePrice)],
    ["LTV", `${inputs.ltvPercent}%`],
    ["Loan Amount", fmt(outputs.loanAmount)],
    ["Interest Rate", `${inputs.interestRate}%`],
    ["Amortization", `${inputs.amortizationYears} years`],
    ["Loan Term", `${inputs.loanTermYears} years`],
    ["Interest Only", inputs.interestOnly ? "Yes" : "No"],
    ["Monthly Payment", fmt(outputs.monthlyDebtService)],
    ["Annual Debt Service", fmt(outputs.annualDebtService)],
    ["Total Equity Required", fmt(outputs.totalEquity)],
  ];

  finItems.forEach((item, i) => {
    if (i % 2 === 0) {
      doc.setFillColor(...BG_LIGHT);
      doc.rect(ML, y - 9, CW, 14, "F");
    }
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.text(item[0], ML + 5, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK);
    doc.text(item[1], W - MR - 5, y, { align: "right" });
    y += 14;
  });

  addFooter(2);

  // ============================================================
  // PAGE 3 — Sensitivity Analysis + Unit Mix
  // ============================================================
  doc.addPage();
  y = 50;
  y = sectionTitle("Sensitivity Analysis — IRR", y);

  // Sensitivity table
  const sensCols = outputs.sensitivity.colLabels;
  const sensRows = outputs.sensitivity.rows;
  const sensColW = CW / (sensCols.length + 1);

  // Header row
  doc.setFillColor(...BLUE);
  doc.rect(ML, y - 10, CW, 16, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...WHITE);
  doc.text(`${outputs.sensitivity.rowParam} \\ ${outputs.sensitivity.colParam}`, ML + 4, y);
  sensCols.forEach((cl, i) => {
    doc.text(cl, ML + (i + 1) * sensColW + sensColW / 2, y, { align: "center" });
  });
  y += 14;

  sensRows.forEach((row, ri) => {
    if (ri % 2 === 0) {
      doc.setFillColor(...BG_LIGHT);
      doc.rect(ML, y - 10, CW, 14, "F");
    }
    // Row label
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK);
    doc.text(outputs.sensitivity.rowLabels[ri], ML + 4, y);

    // Values
    row.forEach((val, ci) => {
      const isBase = sensCols[ci] === "Base" && outputs.sensitivity.rowLabels[ri] === `${inputs.exitCapRate.toFixed(1)}%`;
      if (isBase) {
        doc.setFillColor(191, 219, 254); // blue-200
        const bx = ML + (ci + 1) * sensColW;
        doc.rect(bx, y - 10, sensColW, 14, "F");
      }
      doc.setFont("helvetica", isBase ? "bold" : "normal");
      doc.setTextColor(...colorForMetric(val, 15, 8));
      doc.text(isFinite(val) ? `${val.toFixed(1)}%` : "N/A", ML + (ci + 1) * sensColW + sensColW / 2, y, { align: "center" });
    });
    y += 14;
  });

  y += 25;

  // Unit Mix
  y = sectionTitle("Unit Mix", y);
  const unitCols = ["Type", "Count", "Rent/Mo", "Annual Revenue"];
  const unitColW = [CW * 0.3, CW * 0.15, CW * 0.25, CW * 0.3];

  doc.setFillColor(...BLUE);
  doc.rect(ML, y - 10, CW, 16, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...WHITE);
  let ux = ML;
  unitCols.forEach((col, i) => {
    doc.text(col, i === 0 ? ux + 4 : ux + unitColW[i] - 4, y, { align: i === 0 ? "left" : "right" });
    ux += unitColW[i];
  });
  y += 14;

  const totalUnits = inputs.unitMix.reduce((s, u) => s + u.count, 0);
  inputs.unitMix.forEach((u, i) => {
    if (i % 2 === 0) {
      doc.setFillColor(...BG_LIGHT);
      doc.rect(ML, y - 10, CW, 14, "F");
    }
    ux = ML;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK);
    const vals = [u.type, `${u.count}`, fmt(u.monthlyRent), fmt(u.count * u.monthlyRent * 12)];
    vals.forEach((v, vi) => {
      doc.text(v, vi === 0 ? ux + 4 : ux + unitColW[vi] - 4, y, { align: vi === 0 ? "left" : "right" });
      ux += unitColW[vi];
    });
    y += 14;
  });

  // Total
  drawLine(y - 4);
  y += 8;
  doc.setFont("helvetica", "bold");
  doc.text("Total", ML + 4, y);
  ux = ML + unitColW[0];
  doc.text(`${totalUnits}`, ux + unitColW[1] - 4, y, { align: "right" });
  ux += unitColW[1] + unitColW[2];
  doc.text(fmt(outputs.grossPotentialRent), ux + unitColW[3] - 4, y, { align: "right" });

  y += 25;

  // Detailed Year 1 Budget P&L
  y = sectionTitle("Year 1 Budget — Operating Expenses", y);

  // Check if we have the enhanced expense details with metadata
  const hasDetailedExpenses = outputs.expenseDetails && outputs.expenseDetails.length > 0 && outputs.expenseDetails[0].perUnit !== undefined;

  if (hasDetailedExpenses) {
    // Enhanced 4-column table: Line Item | Year 1 Budget | Per Unit | Notes
    const expCols = ["Line Item", "Year 1 Budget", "Per Unit", "Notes / Methodology"];
    const expColW = [CW * 0.30, CW * 0.20, CW * 0.15, CW * 0.35];

    // Header
    doc.setFillColor(...BLUE);
    doc.rect(ML, y - 10, CW, 16, "F");
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...WHITE);
    let ex = ML;
    expCols.forEach((col, i) => {
      doc.text(col, i === 0 ? ex + 4 : i === 3 ? ex + 4 : ex + expColW[i] - 4, y, { align: i === 0 || i === 3 ? "left" : "right" });
      ex += expColW[i];
    });
    y += 14;

    // Rows
    const details = outputs.expenseDetails as ExpenseDetailRow[];
    const totalUnits = inputs.unitMix.reduce((s, u) => s + u.count, 0);

    details.forEach((row, i) => {
      if (i % 2 === 0) {
        doc.setFillColor(...BG_LIGHT);
        doc.rect(ML, y - 9, CW, 14, "F");
      }
      // Flag indicator
      const label = row.flagged ? `⚠ ${row.label}` : row.label;

      ex = ML;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...(row.flagged ? AMBER : DARK));
      doc.text(label, ex + 4, y);
      ex += expColW[0];

      doc.setTextColor(...DARK);
      doc.setFont("helvetica", "bold");
      doc.text(fmt(row.amount), ex + expColW[1] - 4, y, { align: "right" });
      ex += expColW[1];

      doc.setFont("helvetica", "normal");
      doc.setTextColor(...GRAY);
      const perUnit = row.perUnit || (totalUnits > 0 ? Math.round(row.amount / totalUnits) : 0);
      doc.text(perUnit > 0 ? fmt(perUnit) : "—", ex + expColW[2] - 4, y, { align: "right" });
      ex += expColW[2];

      // Methodology / Notes
      const methodNote = row.methodology || (row.source === "t12" ? "T-12 Actuals" : row.source === "manual" ? "Manual Entry" : "");
      doc.setFontSize(7);
      doc.setTextColor(...GRAY);
      const truncated = methodNote.length > 40 ? methodNote.substring(0, 37) + "..." : methodNote;
      doc.text(truncated, ex + 4, y);

      y += 14;
    });

    // Total row
    drawLine(y - 4);
    y += 4;
    doc.setFillColor(219, 234, 254); // blue-100
    doc.rect(ML, y - 9, CW, 16, "F");
    ex = ML;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK);
    doc.text("Total Operating Expenses", ex + 4, y);
    ex += expColW[0];
    doc.text(fmt(outputs.totalExpenses), ex + expColW[1] - 4, y, { align: "right" });
    ex += expColW[1];
    const totalPerUnit = totalUnits > 0 ? Math.round(outputs.totalExpenses / totalUnits) : 0;
    doc.text(totalPerUnit > 0 ? fmt(totalPerUnit) : "—", ex + expColW[2] - 4, y, { align: "right" });
    y += 18;
  } else {
    // Fallback: simple 2-column expense list
    const expItems: [string, string][] = [];
    if (outputs.expenseDetails) {
      outputs.expenseDetails.forEach((e) => expItems.push([e.label, fmt(e.amount)]));
    } else {
      expItems.push(
        ["Real Estate Taxes", fmt(inputs.realEstateTaxes)],
        ["Insurance", fmt(inputs.insurance)],
        [`Management Fee (${inputs.managementFeePercent}%)`, fmt(outputs.managementFee || 0)],
      );
    }
    expItems.push(["Total Operating Expenses", fmt(outputs.totalExpenses)]);

    expItems.forEach((item, i) => {
      const isTotal = i === expItems.length - 1;
      if (isTotal) { drawLine(y - 4); y += 4; }
      if (i % 2 === 0 && !isTotal) {
        doc.setFillColor(...BG_LIGHT);
        doc.rect(ML, y - 9, CW, 14, "F");
      }
      doc.setFontSize(9);
      doc.setFont("helvetica", isTotal ? "bold" : "normal");
      doc.setTextColor(...(isTotal ? DARK : GRAY));
      doc.text(item[0], ML + 5, y);
      doc.setTextColor(...DARK);
      doc.text(item[1], W - MR - 5, y, { align: "right" });
      y += 14;
    });
  }

  addFooter(3);

  // ============================================================
  // PAGE 4 — Property Details + Assumptions + Notes
  // ============================================================
  doc.addPage();
  y = 50;

  if (propertyDetails) {
    y = sectionTitle("Property Details", y);
    const propItems = [
      ["Address", propertyDetails.address || "—"],
      ["Borough", propertyDetails.borough || "—"],
      ["Block / Lot", `${propertyDetails.block} / ${propertyDetails.lot}`],
      ["BBL", propertyDetails.bbl || "—"],
      ["Residential Units", `${propertyDetails.unitsRes || "—"}`],
      ["Total Units", `${propertyDetails.unitsTotal || "—"}`],
      ["Year Built", `${propertyDetails.yearBuilt || "—"}`],
      ["Stories", `${propertyDetails.numFloors || "—"}`],
      ["Building Area", propertyDetails.bldgArea > 0 ? `${propertyDetails.bldgArea.toLocaleString()} sqft` : "—"],
      ["Lot Area", propertyDetails.lotArea > 0 ? `${propertyDetails.lotArea.toLocaleString()} sqft` : "—"],
      ["Zoning", propertyDetails.zoneDist || "—"],
      ["Building Class", propertyDetails.bldgClass || "—"],
      ["Built FAR", propertyDetails.far > 0 ? propertyDetails.far.toFixed(2) : "—"],
      ["Max Residential FAR", propertyDetails.residFar > 0 ? propertyDetails.residFar.toFixed(2) : "—"],
      ["Owner (PLUTO)", propertyDetails.ownerName || "—"],
      ["Assessed Value", propertyDetails.assessTotal > 0 ? fmt(propertyDetails.assessTotal) : "—"],
    ];
    if (propertyDetails.lastSalePrice > 0) {
      propItems.push(["Last Sale Price", fmt(propertyDetails.lastSalePrice)]);
      propItems.push(["Last Sale Date", propertyDetails.lastSaleDate ? new Date(propertyDetails.lastSaleDate).toLocaleDateString() : "—"]);
    }
    if (propertyDetails.annualTaxes > 0) {
      propItems.push(["Est. Annual Taxes", fmt(propertyDetails.annualTaxes)]);
    }
    if (propertyDetails.hpdUnits > 0) {
      propItems.push(["HPD Registered Units", `${propertyDetails.hpdUnits}`]);
    }

    // Two-column layout
    const propColW = (CW - 10) / 2;
    propItems.forEach((item, i) => {
      const col = i % 2;
      if (col === 0 && Math.floor(i / 2) % 2 === 0) {
        doc.setFillColor(...BG_LIGHT);
        doc.rect(ML, y - 9, CW, 14, "F");
      }
      const px = ML + col * (propColW + 10);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...GRAY);
      doc.text(item[0], px + 4, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...DARK);
      doc.text(item[1], px + propColW - 4, y, { align: "right" });
      if (col === 1) y += 14;
    });
    if (propItems.length % 2 === 1) y += 14;
    y += 15;
  }

  // Assumptions
  y = sectionTitle("Key Assumptions", y);
  const assumptionsList = [
    ["Residential Vacancy", `${inputs.residentialVacancyRate}%`],
    ["Commercial Vacancy", `${inputs.commercialVacancyRate}%`],
    ["Annual Rent Growth", `${inputs.annualRentGrowth}%`],
    ["Annual Expense Growth", `${inputs.annualExpenseGrowth}%`],
    ["Management Fee", `${inputs.managementFeePercent}%`],
    ["Hold Period", `${inputs.holdPeriodYears} years`],
    ["Exit Cap Rate", `${inputs.exitCapRate}%`],
    ["Selling Costs", `${inputs.sellingCostPercent}%`],
    ["Closing Costs", fmt(inputs.closingCosts)],
    ["Origination Fee", `${inputs.originationFeePercent}%`],
  ];
  if (inputs.renovationBudget > 0) {
    assumptionsList.push(["Renovation Budget", fmt(inputs.renovationBudget)]);
  }

  assumptionsList.forEach((item, i) => {
    if (i % 2 === 0) {
      doc.setFillColor(...BG_LIGHT);
      doc.rect(ML, y - 9, CW, 14, "F");
    }
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRAY);
    doc.text(item[0], ML + 5, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...DARK);
    doc.text(item[1], W - MR - 5, y, { align: "right" });
    y += 14;
  });

  y += 15;

  // Notes
  if (notes) {
    y = sectionTitle("Notes", y);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK);
    const lines = doc.splitTextToSize(notes, CW - 10);
    doc.text(lines, ML + 5, y);
    y += lines.length * 12;
  }

  // Disclaimer
  y += 20;
  drawLine(y);
  y += 12;
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(...GRAY);
  const disclaimer = "This deal analysis is for informational purposes only and does not constitute financial advice. Projections are based on assumptions that may not reflect actual future performance. Consult with qualified professionals before making investment decisions.";
  const discLines = doc.splitTextToSize(disclaimer, CW);
  doc.text(discLines, ML, y);

  addFooter(4);

  // Save
  const filename = `${(dealName || "deal-analysis").replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-")}.pdf`;
  doc.save(filename);
}
