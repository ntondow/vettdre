// ============================================================
// Investment Summary PDF Generator
// Renders a multi-page professional Investment Summary from
// an InvestmentSummaryPayload assembled by the server actions.
// ============================================================

import jsPDF from "jspdf";
import type { InvestmentSummaryPayload } from "./investment-summary-types";
import {
  createPdfContext,
  checkPageBreak,
  drawFooter,
  drawSectionHeader,
  drawLabelValue,
  drawBodyText,
  drawMutedText,
  drawTable,
  drawKeyValueGrid,
  drawCoverPage,
  formatCurrency,
  formatCompact,
  formatPercent,
  formatNumber,
  formatDate,
  tintColor,
  PDF_COLORS,
  type PdfContext,
  type TableColumn,
  type RGB,
} from "./pdf-utils";

// ── Main Export ──────────────────────────────────────────────

export function generateInvestmentSummaryPdf(
  payload: InvestmentSummaryPayload,
): Blob {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const ctx = createPdfContext(doc, {
    primaryColor: payload.branding.primaryColor || "#1E40AF",
    accentColor: payload.branding.accentColor || "#6B5B95",
    companyName: payload.branding.companyName || "Brokerage",
  });

  // Page 1 — Cover
  renderCoverPage(ctx, payload);

  // Page 2 — Executive Summary
  doc.addPage();
  ctx.page++;
  ctx.y = 50;
  renderExecutiveSummary(ctx, payload);

  // Page 3 — Property & Deal Overview
  doc.addPage();
  ctx.page++;
  ctx.y = 50;
  renderPropertyAndDealOverview(ctx, payload);

  // Page 4 — Financial Projections
  doc.addPage();
  ctx.page++;
  ctx.y = 50;
  renderFinancialProjections(ctx, payload);

  // Page 5 — Returns & Exit Analysis
  doc.addPage();
  ctx.page++;
  ctx.y = 50;
  renderReturnsAndExit(ctx, payload);

  // Page 6 — Sensitivity (conditional)
  if (payload.sensitivity) {
    doc.addPage();
    ctx.page++;
    ctx.y = 50;
    renderSensitivity(ctx, payload);
  }

  // Page 7 — Risk Factors & Disclaimer
  doc.addPage();
  ctx.page++;
  ctx.y = 50;
  renderRiskFactorsAndDisclaimer(ctx, payload);

  drawFooter(ctx);

  return doc.output("blob");
}

// ── Page 1: Cover ───────────────────────────────────────────

function renderCoverPage(ctx: PdfContext, p: InvestmentSummaryPayload): void {
  try {
    drawCoverPage(ctx, {
      title: "INVESTMENT SUMMARY",
      subtitle: p.dealStructure.label,
      address: p.property.address || "Property Address",
      locationLine: [p.property.borough, p.property.zoning].filter(Boolean).join(" · "),
      website: p.branding.website,
    });

    // KPI callout box below cover content
    const { doc, W, ML, CW } = ctx;
    const boxY = ctx.y + 30;
    const boxH = 60;

    doc.setFillColor(...tintColor(ctx.PRIMARY, 0.92));
    doc.roundedRect(ML, boxY, CW, boxH, 6, 6, "F");

    const kpis = [
      { label: "Purchase Price", value: formatCompact(p.dealStructure.purchasePrice) },
      { label: "IRR", value: formatPercent(p.returns.irr) },
      { label: "Equity Multiple", value: `${p.returns.equityMultiple.toFixed(2)}x` },
      { label: "Cash-on-Cash", value: formatPercent(p.returns.cashOnCash) },
    ];

    const colW = CW / 4;
    for (let i = 0; i < kpis.length; i++) {
      const cx = ML + colW * i + colW / 2;

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...ctx.PRIMARY);
      doc.text(kpis[i].value, cx, boxY + 25, { align: "center" });

      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...PDF_COLORS.GRAY);
      doc.text(kpis[i].label, cx, boxY + 40, { align: "center" });
    }

    ctx.y = boxY + boxH + 20;

    // Date line
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...PDF_COLORS.GRAY);
    doc.text(`Prepared ${formatDate(p.generatedAt)}`, W / 2, ctx.y, { align: "center" });
  } catch (e) {
    console.error("Cover page error:", e);
  }

  drawFooter(ctx);
}

// ── Page 2: Executive Summary ───────────────────────────────

function renderExecutiveSummary(ctx: PdfContext, p: InvestmentSummaryPayload): void {
  try {
    drawSectionHeader(ctx, "Executive Summary");

    const { property: prop, dealStructure: ds, returns: r, financing: fin, income } = p;
    const unitDesc = prop.units > 0 ? `${prop.units}-unit` : "";
    const classDesc = prop.buildingClass ? `, ${prop.buildingClass}` : "";

    // Paragraph 1 — Property intro
    const para1 = `This ${ds.label} investment opportunity at ${prop.address || "the subject property"} involves the acquisition of a ${unitDesc}${classDesc} property for ${formatCurrency(ds.purchasePrice)}.${prop.sqft ? ` The building encompasses ${formatNumber(prop.sqft)} gross square feet.` : ""}${prop.yearBuilt ? ` Built in ${prop.yearBuilt}.` : ""}`;
    drawBodyText(ctx, para1);
    ctx.y += 6;

    // Paragraph 2 — Structure-specific
    let para2 = "";
    if (ds.type === "all_cash") {
      para2 = `This transaction is structured on an all-equity basis with no debt financing, eliminating leverage risk and debt service obligations. Total equity required is ${formatCurrency(ds.purchasePrice)}.`;
    } else if (ds.type === "bridge_refi" && p.bridgeDetails) {
      const bd = p.bridgeDetails;
      para2 = `The strategy employs a bridge-to-permanent refinance approach. Initial bridge financing of ${formatCurrency(bd.bridgeLoanAmount)} funds the acquisition and stabilization period, followed by a permanent refinance at ${formatCurrency(bd.refiLoanAmount)}.${bd.cashOutOnRefi > 0 ? ` The refinance is projected to return ${formatCurrency(bd.cashOutOnRefi)} in cash-out proceeds.` : ""}`;
    } else if (ds.type === "assumable" && p.assumableDetails) {
      const ad = p.assumableDetails;
      para2 = `This acquisition assumes the existing mortgage at a blended rate of ${formatPercent(ad.blendedRate)}, generating ${formatCurrency(ad.annualRateSavings)} in annual interest savings versus current market rates.`;
    } else if (ds.type === "syndication" && p.syndicationDetails) {
      const sd = p.syndicationDetails;
      para2 = `The deal is structured as a syndication with GP/LP equity split. LP investors are projected to achieve a ${formatPercent(sd.lpIrr)} IRR with a ${sd.lpEquityMultiple.toFixed(2)}x equity multiple over the hold period.`;
    } else if (fin) {
      para2 = `The acquisition is financed with a ${formatPercent(fin.ltv)} LTV loan at ${formatPercent(fin.interestRate)} interest${fin.isInterestOnly ? " (interest-only)" : ` with ${fin.amortization}-year amortization`}, resulting in annual debt service of ${formatCurrency(fin.annualDebtService)}. Total equity required is ${formatCurrency(fin.totalEquity)}.`;
    }
    if (para2) {
      drawBodyText(ctx, para2);
      ctx.y += 6;
    }

    // Paragraph 3 — Returns
    const para3 = `The projected ${ds.holdPeriod}-year IRR is ${formatPercent(r.irr)} with an equity multiple of ${r.equityMultiple.toFixed(2)}x. Year 1 cash-on-cash return is ${formatPercent(r.cashOnCash)} based on a net operating income of ${formatCurrency(r.noi)} and a going-in cap rate of ${formatPercent(r.capRate)}.`;
    drawBodyText(ctx, para3);
    ctx.y += 12;

    // Metrics panel
    const metricsGrid: { label: string; value: string }[] = [
      { label: "Net Operating Income", value: formatCurrency(r.noi) },
      { label: "Cap Rate", value: formatPercent(r.capRate) },
      { label: "Cash-on-Cash", value: formatPercent(r.cashOnCash) },
    ];
    if (fin) {
      metricsGrid.push({ label: "DSCR", value: r.dscr > 0 ? `${r.dscr.toFixed(2)}x` : "N/A" });
      metricsGrid.push({ label: "Debt Yield", value: r.debtYield > 0 ? formatPercent(r.debtYield) : "N/A" });
    }
    metricsGrid.push({ label: "Break-Even Occupancy", value: r.breakEvenOccupancy > 0 ? formatPercent(r.breakEvenOccupancy) : "N/A" });

    drawKeyValueGrid(ctx, metricsGrid, 3);
  } catch (e) {
    console.error("Executive summary error:", e);
  }

  drawFooter(ctx);
}

// ── Page 3: Property & Deal Overview ────────────────────────

function renderPropertyAndDealOverview(ctx: PdfContext, p: InvestmentSummaryPayload): void {
  try {
    const { property: prop, dealStructure: ds, financing: fin } = p;

    // Property Overview
    drawSectionHeader(ctx, "Property Overview");
    const propGrid: { label: string; value: string }[] = [
      { label: "Address", value: prop.address || "N/A" },
      { label: "BBL", value: prop.bbl || "N/A" },
      { label: "Units", value: prop.units > 0 ? formatNumber(prop.units) : "N/A" },
      { label: "Gross Sq Ft", value: prop.sqft ? formatNumber(prop.sqft) : "N/A" },
      { label: "Year Built", value: prop.yearBuilt ? String(prop.yearBuilt) : "N/A" },
      { label: "Stories", value: prop.stories ? String(prop.stories) : "N/A" },
      { label: "Building Class", value: prop.buildingClass || "N/A" },
      { label: "Zoning", value: prop.zoning || "N/A" },
      { label: "Lot Sq Ft", value: prop.lotSqft ? formatNumber(prop.lotSqft) : "N/A" },
      { label: "Assessed Value", value: prop.assessedValue ? formatCurrency(prop.assessedValue) : "N/A" },
    ];
    drawKeyValueGrid(ctx, propGrid, 2);
    ctx.y += 8;

    // Deal Structure
    drawSectionHeader(ctx, "Deal Structure");
    const dealGrid: { label: string; value: string }[] = [
      { label: "Structure Type", value: ds.label },
      { label: "Purchase Price", value: formatCurrency(ds.purchasePrice) },
      { label: "Hold Period", value: `${ds.holdPeriod} years` },
      { label: "Exit Cap Rate", value: ds.exitCapRate > 0 ? formatPercent(ds.exitCapRate) : "N/A" },
    ];

    if (fin) {
      dealGrid.push(
        { label: "Loan Amount", value: formatCurrency(fin.loanAmount) },
        { label: "LTV", value: formatPercent(fin.ltv) },
        { label: "Interest Rate", value: formatPercent(fin.interestRate) },
        { label: "Amortization", value: `${fin.amortization} years` },
        { label: "Loan Term", value: `${fin.loanTerm} years` },
        { label: "Annual Debt Service", value: formatCurrency(fin.annualDebtService) },
        { label: "Total Equity", value: formatCurrency(fin.totalEquity) },
        { label: "Interest Only", value: fin.isInterestOnly ? "Yes" : "No" },
      );
    }
    drawKeyValueGrid(ctx, dealGrid, 2);
    ctx.y += 8;

    // Bridge details
    if (ds.type === "bridge_refi" && p.bridgeDetails) {
      drawSectionHeader(ctx, "Bridge-to-Refi Details");
      const bd = p.bridgeDetails;
      drawKeyValueGrid(ctx, [
        { label: "Bridge Loan", value: formatCurrency(bd.bridgeLoanAmount) },
        { label: "Bridge Rate", value: bd.bridgeRate > 0 ? formatPercent(bd.bridgeRate) : "N/A" },
        { label: "Bridge Term", value: bd.bridgeTermMonths > 0 ? `${bd.bridgeTermMonths} months` : "N/A" },
        { label: "Total Bridge Cost", value: formatCurrency(bd.totalBridgeCost) },
        { label: "Refi Amount", value: formatCurrency(bd.refiLoanAmount) },
        { label: "Cash Out on Refi", value: formatCurrency(bd.cashOutOnRefi) },
        { label: "Cash Left in Deal", value: formatCurrency(bd.cashLeftInDeal) },
      ], 2);
    }

    // Assumable details
    if (ds.type === "assumable" && p.assumableDetails) {
      drawSectionHeader(ctx, "Assumable Mortgage Details");
      const ad = p.assumableDetails;
      drawKeyValueGrid(ctx, [
        { label: "Existing Balance", value: ad.existingLoanBalance > 0 ? formatCurrency(ad.existingLoanBalance) : "N/A" },
        { label: "Existing Rate", value: ad.existingRate > 0 ? formatPercent(ad.existingRate) : "N/A" },
        { label: "Blended Rate", value: formatPercent(ad.blendedRate) },
        { label: "Annual Rate Savings", value: formatCurrency(ad.annualRateSavings) },
        { label: "Total Savings", value: formatCurrency(ad.totalRateSavings) },
      ], 2);
    }

    // Syndication details
    if (ds.type === "syndication" && p.syndicationDetails) {
      drawSectionHeader(ctx, "Syndication Structure");
      const sd = p.syndicationDetails;
      drawKeyValueGrid(ctx, [
        { label: "GP Equity %", value: sd.gpEquityPct > 0 ? formatPercent(sd.gpEquityPct) : "N/A" },
        { label: "LP Equity %", value: sd.lpEquityPct > 0 ? formatPercent(sd.lpEquityPct) : "N/A" },
        { label: "Preferred Return", value: sd.preferredReturn > 0 ? formatPercent(sd.preferredReturn) : "N/A" },
        { label: "GP IRR", value: formatPercent(sd.gpIrr) },
        { label: "LP IRR", value: formatPercent(sd.lpIrr) },
        { label: "GP Equity Multiple", value: `${sd.gpEquityMultiple.toFixed(2)}x` },
        { label: "LP Equity Multiple", value: `${sd.lpEquityMultiple.toFixed(2)}x` },
        { label: "Total Fees", value: formatCurrency(sd.totalFees) },
      ], 2);
    }

    // Fee schedule (syndication)
    if (p.feeSchedule) {
      checkPageBreak(ctx, 80);
      drawSectionHeader(ctx, "Sponsor Fee Schedule");
      const fs = p.feeSchedule;
      const feeCols: TableColumn[] = [
        { label: "Fee", width: 256 },
        { label: "Timing", width: 128 },
        { label: "Amount", width: 128, align: "right" },
      ];
      const feeRows: string[][] = [
        ["Acquisition Fee", "At Close", formatCurrency(fs.acquisitionFee)],
      ];
      if (fs.constructionMgmtFee > 0) feeRows.push(["Construction Mgmt Fee", "At Close", formatCurrency(fs.constructionMgmtFee)]);
      feeRows.push(["Asset Management Fee", "Annual", formatCurrency(fs.assetMgmtFeeAnnual)]);
      feeRows.push(["Disposition Fee", "At Exit", formatCurrency(fs.dispositionFee)]);
      feeRows.push(["Total Fees (over hold)", "", formatCurrency(fs.totalFees)]);
      drawTable(ctx, feeCols, feeRows);
    }

    // Acquisition cost breakdown
    if (p.acquisitionCostBreakdown && p.acquisitionCostBreakdown.length > 0) {
      checkPageBreak(ctx, 80);
      drawSectionHeader(ctx, "Acquisition Cost Breakdown");
      const acqCols: TableColumn[] = [
        { label: "Item", width: 320 },
        { label: "Amount", width: 192, align: "right" },
      ];
      const acqRows: string[][] = p.acquisitionCostBreakdown.map(item => [item.label, formatCurrency(item.amount)]);
      drawTable(ctx, acqCols, acqRows);
    }

    // Commercial tenants
    if (p.commercialTenants && p.commercialTenants.length > 0) {
      checkPageBreak(ctx, 80);
      drawSectionHeader(ctx, "Commercial Tenant Schedule");
      const commCols: TableColumn[] = [
        { label: "Tenant", width: 140 },
        { label: "Sq Ft", width: 70, align: "right" },
        { label: "Annual Rent", width: 100, align: "right" },
        { label: "Lease Type", width: 80, align: "center" },
        { label: "Vacancy", width: 60, align: "right" },
      ];
      const commRows: string[][] = p.commercialTenants.map(t => [
        t.name,
        t.sqft ? formatNumber(t.sqft) : "—",
        formatCurrency(t.rentAnnual),
        t.leaseType || "—",
        t.vacancyRate != null ? formatPercent(t.vacancyRate) : "—",
      ]);
      drawTable(ctx, commCols, commRows);
    }

    // Pre-stabilization summary (bridge)
    if (p.preStabilizationSummary) {
      checkPageBreak(ctx, 60);
      drawSectionHeader(ctx, "Pre-Stabilization Summary");
      drawKeyValueGrid(ctx, [
        { label: "J-Curve (Neg. CF)", value: formatCurrency(p.preStabilizationSummary.totalNegativeCashFlow) },
        { label: "Months to Breakeven", value: `${p.preStabilizationSummary.monthsToBreakeven} months` },
        { label: "Months to Stabilization", value: `${p.preStabilizationSummary.monthsToStabilization} months` },
      ], 2);
    }
  } catch (e) {
    console.error("Property overview error:", e);
  }

  drawFooter(ctx);
}

// ── Page 4: Financial Projections ───────────────────────────

function renderFinancialProjections(ctx: PdfContext, p: InvestmentSummaryPayload): void {
  try {
    const { income, expenses, financing: fin, returns: r } = p;
    const hasDebt = fin !== null;

    // Year 1 Operating Proforma
    drawSectionHeader(ctx, "Year 1 Operating Proforma");

    // Income table
    const incomeCols: TableColumn[] = [
      { label: "Income Item", width: 320 },
      { label: "Amount", width: 192, align: "right" },
    ];
    const incomeRows: string[][] = [
      ["Gross Potential Rent", formatCurrency(income.grossPotentialRent)],
      ["Other Income", formatCurrency(income.otherIncome)],
      [`Vacancy Loss (${income.vacancyRate.toFixed(1)}%)`, `(${formatCurrency(income.vacancyLoss)})`],
      ["Effective Gross Income", formatCurrency(income.effectiveGrossIncome)],
    ];
    drawTable(ctx, incomeCols, incomeRows);
    ctx.y += 4;

    // Expenses table
    const expCols: TableColumn[] = [
      { label: "Expense Item", width: 200 },
      { label: "Annual", width: 156, align: "right" },
      { label: "Per Unit", width: 156, align: "right" },
    ];
    const expRows: string[][] = expenses.lineItems.map(li => [
      li.label,
      formatCurrency(li.amount),
      li.perUnit ? formatCurrency(li.perUnit) : "—",
    ]);
    expRows.push(["Total Expenses", formatCurrency(expenses.totalExpenses), formatCurrency(expenses.expensePerUnit)]);
    expRows.push(["Expense Ratio", formatPercent(expenses.expenseRatio * 100), ""]);
    drawTable(ctx, expCols, expRows);
    ctx.y += 4;

    // NOI summary
    checkPageBreak(ctx, 40);
    drawLabelValue(ctx, "Net Operating Income (NOI)", formatCurrency(r.noi));
    if (hasDebt) {
      drawLabelValue(ctx, "Annual Debt Service", `(${formatCurrency(fin.annualDebtService)})`);
      const ncf = r.noi - fin.annualDebtService;
      drawLabelValue(ctx, "Net Cash Flow", formatCurrency(ncf));
    }
    ctx.y += 10;

    // Multi-Year Cash Flow Projection
    if (p.cashFlows.length > 0) {
      drawSectionHeader(ctx, "Multi-Year Cash Flow Projection");

      const cfCols: TableColumn[] = hasDebt
        ? [
            { label: "Year", width: 40, align: "center" },
            { label: "Gross Income", width: 75, align: "right" },
            { label: "Vacancy", width: 65, align: "right" },
            { label: "EGI", width: 75, align: "right" },
            { label: "Expenses", width: 70, align: "right" },
            { label: "NOI", width: 70, align: "right" },
            { label: "Debt Svc", width: 62, align: "right" },
            { label: "Cash Flow", width: 55, align: "right" },
          ]
        : [
            { label: "Year", width: 50, align: "center" },
            { label: "Gross Income", width: 95, align: "right" },
            { label: "Vacancy", width: 80, align: "right" },
            { label: "EGI", width: 95, align: "right" },
            { label: "Expenses", width: 90, align: "right" },
            { label: "NOI", width: 52, align: "right" },
            { label: "Cumulative CF", width: 50, align: "right" },
          ];

      const cfRows: string[][] = p.cashFlows.map(cf => {
        if (hasDebt) {
          return [
            String(cf.year),
            formatCompact(cf.grossIncome),
            formatCompact(cf.vacancy),
            formatCompact(cf.effectiveIncome),
            formatCompact(cf.expenses),
            formatCompact(cf.noi),
            formatCompact(cf.debtService),
            formatCompact(cf.cashFlow),
          ];
        }
        return [
          String(cf.year),
          formatCompact(cf.grossIncome),
          formatCompact(cf.vacancy),
          formatCompact(cf.effectiveIncome),
          formatCompact(cf.expenses),
          formatCompact(cf.noi),
          formatCompact(cf.cumulativeCashFlow),
        ];
      });
      drawTable(ctx, cfCols, cfRows);
      ctx.y += 8;
    }

    // Sources & Uses
    if (p.sourcesAndUses.sources.length > 0 || p.sourcesAndUses.uses.length > 0) {
      drawSectionHeader(ctx, "Sources & Uses");
      const suCols: TableColumn[] = [
        { label: "Sources", width: 160 },
        { label: "Amount", width: 96, align: "right" },
        { label: "Uses", width: 160 },
        { label: "Amount", width: 96, align: "right" },
      ];
      const maxLen = Math.max(p.sourcesAndUses.sources.length, p.sourcesAndUses.uses.length);
      const suRows: string[][] = [];
      for (let i = 0; i < maxLen; i++) {
        const s = p.sourcesAndUses.sources[i];
        const u = p.sourcesAndUses.uses[i];
        suRows.push([
          s?.label || "",
          s ? formatCurrency(s.amount) : "",
          u?.label || "",
          u ? formatCurrency(u.amount) : "",
        ]);
      }
      suRows.push([
        "Total Sources",
        formatCurrency(p.sourcesAndUses.totalSources),
        "Total Uses",
        formatCurrency(p.sourcesAndUses.totalUses),
      ]);
      drawTable(ctx, suCols, suRows);
    }
  } catch (e) {
    console.error("Financial projections error:", e);
  }

  drawFooter(ctx);
}

// ── Page 5: Returns & Exit Analysis ─────────────────────────

function renderReturnsAndExit(ctx: PdfContext, p: InvestmentSummaryPayload): void {
  try {
    const { returns: r, exitAnalysis: ex, financing: fin } = p;
    const hasDebt = fin !== null;

    // Investment Returns
    drawSectionHeader(ctx, "Investment Returns");

    // Large metric boxes
    const primaryMetrics = [
      { label: "IRR", value: formatPercent(r.irr), color: r.irr >= 12 ? PDF_COLORS.GREEN : r.irr >= 6 ? PDF_COLORS.AMBER : PDF_COLORS.RED },
      { label: "Equity Multiple", value: `${r.equityMultiple.toFixed(2)}x`, color: r.equityMultiple >= 2 ? PDF_COLORS.GREEN : r.equityMultiple >= 1.5 ? PDF_COLORS.AMBER : PDF_COLORS.RED },
      { label: "Cash-on-Cash", value: formatPercent(r.cashOnCash), color: r.cashOnCash >= 8 ? PDF_COLORS.GREEN : r.cashOnCash >= 4 ? PDF_COLORS.AMBER : PDF_COLORS.RED },
      { label: "Annualized Return", value: r.annualizedReturn > 0 ? formatPercent(r.annualizedReturn) : formatPercent(r.irr), color: PDF_COLORS.GRAY },
    ];

    checkPageBreak(ctx, 70);
    const boxW = (ctx.CW - 18) / 4;
    const boxH = 55;
    for (let i = 0; i < primaryMetrics.length; i++) {
      const m = primaryMetrics[i];
      const bx = ctx.ML + i * (boxW + 6);

      ctx.doc.setFillColor(...tintColor(m.color as RGB, 0.9));
      ctx.doc.roundedRect(bx, ctx.y, boxW, boxH, 4, 4, "F");

      ctx.doc.setFontSize(16);
      ctx.doc.setFont("helvetica", "bold");
      ctx.doc.setTextColor(...(m.color as RGB));
      ctx.doc.text(m.value, bx + boxW / 2, ctx.y + 24, { align: "center" });

      ctx.doc.setFontSize(7);
      ctx.doc.setFont("helvetica", "normal");
      ctx.doc.setTextColor(...PDF_COLORS.GRAY);
      ctx.doc.text(m.label, bx + boxW / 2, ctx.y + 40, { align: "center" });
    }
    ctx.y += boxH + 16;

    // Secondary metrics (debt-related)
    if (hasDebt) {
      checkPageBreak(ctx, 30);
      drawKeyValueGrid(ctx, [
        { label: "DSCR", value: r.dscr > 0 ? `${r.dscr.toFixed(2)}x` : "N/A" },
        { label: "Debt Yield", value: r.debtYield > 0 ? formatPercent(r.debtYield) : "N/A" },
        { label: "Break-Even Occupancy", value: r.breakEvenOccupancy > 0 ? formatPercent(r.breakEvenOccupancy) : "N/A" },
      ], 3);
      ctx.y += 8;
    }

    // Exit Analysis
    drawSectionHeader(ctx, "Exit Analysis");
    const exitGrid: { label: string; value: string }[] = [
      { label: "Exit NOI", value: ex.exitNoi > 0 ? formatCurrency(ex.exitNoi) : "N/A" },
      { label: "Exit Cap Rate", value: ex.exitCapRate > 0 ? formatPercent(ex.exitCapRate) : "N/A" },
      { label: "Projected Sale Price", value: formatCurrency(ex.projectedSalePrice) },
      { label: "Selling Costs", value: formatCurrency(ex.sellingCosts) },
    ];
    if (hasDebt) {
      exitGrid.push({ label: "Loan Balance at Exit", value: formatCurrency(ex.loanBalanceAtExit) });
    }
    exitGrid.push(
      { label: "Net Sale Proceeds", value: formatCurrency(ex.netSaleProceeds) },
      { label: "Total Profit", value: formatCurrency(ex.totalProfit) },
    );
    drawKeyValueGrid(ctx, exitGrid, 2);
  } catch (e) {
    console.error("Returns/exit error:", e);
  }

  drawFooter(ctx);
}

// ── Page 6: Sensitivity Analysis (Conditional) ──────────────

function renderSensitivity(ctx: PdfContext, p: InvestmentSummaryPayload): void {
  try {
    if (!p.sensitivity) return;

    drawSectionHeader(ctx, "Sensitivity Analysis");

    // Exit Cap Rate scenarios
    if (p.sensitivity.exitCapRateScenarios.length > 0) {
      drawMutedText(ctx, "Exit Cap Rate Scenarios");
      ctx.y += 4;
      const capCols: TableColumn[] = [
        { label: "Cap Rate", width: 170, align: "center" },
        { label: "Sale Price", width: 171, align: "right" },
        { label: "IRR", width: 171, align: "right" },
      ];
      const capRows = p.sensitivity.exitCapRateScenarios.map(s => [
        formatPercent(s.capRate),
        s.salePrice > 0 ? formatCurrency(s.salePrice) : "—",
        formatPercent(s.irr),
      ]);
      drawTable(ctx, capCols, capRows);
      ctx.y += 8;
    }

    // Vacancy scenarios
    if (p.sensitivity.vacancyScenarios && p.sensitivity.vacancyScenarios.length > 0) {
      drawMutedText(ctx, "Vacancy Scenarios");
      ctx.y += 4;
      const vacCols: TableColumn[] = [
        { label: "Vacancy Rate", width: 170, align: "center" },
        { label: "NOI", width: 171, align: "right" },
        { label: "Cash-on-Cash", width: 171, align: "right" },
      ];
      const vacRows = p.sensitivity.vacancyScenarios.map(s => [
        formatPercent(s.vacancyRate),
        formatCurrency(s.noi),
        formatPercent(s.cashOnCash),
      ]);
      drawTable(ctx, vacCols, vacRows);
      ctx.y += 8;
    }

    // Benchmarks
    if (p.benchmarks) {
      const bm = p.benchmarks;

      if (bm.exitSensitivity) {
        drawMutedText(ctx, "Exit Scenario Analysis");
        ctx.y += 4;
        const scenCols: TableColumn[] = [
          { label: "Scenario", width: 128 },
          { label: "Cap Rate", width: 128, align: "center" },
          { label: "Sale Price", width: 128, align: "right" },
          { label: "IRR", width: 128, align: "right" },
        ];
        const scenRows = [
          ["Optimistic", formatPercent(bm.exitSensitivity.optimistic.capRate), formatCurrency(bm.exitSensitivity.optimistic.salePrice), formatPercent(bm.exitSensitivity.optimistic.irr)],
          ["Base Case", formatPercent(bm.exitSensitivity.base.capRate), formatCurrency(bm.exitSensitivity.base.salePrice), formatPercent(bm.exitSensitivity.base.irr)],
          ["Conservative", formatPercent(bm.exitSensitivity.conservative.capRate), formatCurrency(bm.exitSensitivity.conservative.salePrice), formatPercent(bm.exitSensitivity.conservative.irr)],
        ];
        drawTable(ctx, scenCols, scenRows);
        ctx.y += 8;
      }

      if (bm.marketCapRateMeta) {
        drawMutedText(ctx, "Market Cap Rate Context");
        ctx.y += 4;
        drawKeyValueGrid(ctx, [
          { label: "Market Cap Rate", value: formatPercent(bm.marketCapRateMeta.marketCapRate) },
          { label: "Confidence", value: bm.marketCapRateMeta.confidence },
          { label: "Trend", value: bm.marketCapRateMeta.trend },
        ], 3);
        ctx.y += 8;
      }

      if (bm.ll97Exposure) {
        drawMutedText(ctx, "LL97 Carbon Penalty Exposure");
        ctx.y += 4;
        drawKeyValueGrid(ctx, [
          { label: "Total Penalty Over Hold", value: formatCurrency(bm.ll97Exposure.totalPenaltyOverHold) },
          { label: "Avg Annual Penalty", value: formatCurrency(bm.ll97Exposure.avgAnnualPenalty) },
          { label: "Compliance Status", value: bm.ll97Exposure.complianceStatus },
        ], 3);
      }
    }
  } catch (e) {
    console.error("Sensitivity error:", e);
  }

  drawFooter(ctx);
}

// ── Page 7: Risk Factors & Disclaimer ───────────────────────

function renderRiskFactorsAndDisclaimer(ctx: PdfContext, p: InvestmentSummaryPayload): void {
  try {
    drawSectionHeader(ctx, "Risk Factors");

    const severityColors: Record<string, RGB> = {
      low: PDF_COLORS.GREEN,
      medium: PDF_COLORS.AMBER,
      high: PDF_COLORS.RED,
    };

    // Group by category
    const grouped: Record<string, typeof p.riskFactors> = {};
    for (const rf of p.riskFactors) {
      if (!grouped[rf.category]) grouped[rf.category] = [];
      grouped[rf.category].push(rf);
    }

    const categoryLabels: Record<string, string> = {
      market: "Market Risks",
      financial: "Financial Risks",
      operational: "Operational Risks",
      regulatory: "Regulatory Risks",
      structural: "Structural Risks",
    };

    for (const [cat, items] of Object.entries(grouped)) {
      checkPageBreak(ctx, 30);
      ctx.doc.setFontSize(9);
      ctx.doc.setFont("helvetica", "bold");
      ctx.doc.setTextColor(...PDF_COLORS.DARK);
      ctx.doc.text(categoryLabels[cat] || cat, ctx.ML, ctx.y);
      ctx.y += 14;

      for (const rf of items) {
        checkPageBreak(ctx, 30);
        const badgeColor = severityColors[rf.severity] || PDF_COLORS.GRAY;

        // Severity badge
        ctx.doc.setFillColor(...tintColor(badgeColor, 0.85));
        ctx.doc.roundedRect(ctx.ML, ctx.y - 8, 38, 12, 2, 2, "F");
        ctx.doc.setFontSize(6.5);
        ctx.doc.setFont("helvetica", "bold");
        ctx.doc.setTextColor(...badgeColor);
        ctx.doc.text(rf.severity.toUpperCase(), ctx.ML + 19, ctx.y, { align: "center" });

        // Label
        ctx.doc.setFontSize(8.5);
        ctx.doc.setFont("helvetica", "bold");
        ctx.doc.setTextColor(...PDF_COLORS.DARK);
        ctx.doc.text(rf.label, ctx.ML + 44, ctx.y);
        ctx.y += 12;

        // Description
        ctx.doc.setFontSize(8);
        ctx.doc.setFont("helvetica", "normal");
        ctx.doc.setTextColor(...PDF_COLORS.GRAY);
        const descLines = ctx.doc.splitTextToSize(rf.description, ctx.CW - 44);
        for (const line of descLines) {
          checkPageBreak(ctx, 11);
          ctx.doc.text(line, ctx.ML + 44, ctx.y);
          ctx.y += 11;
        }
        ctx.y += 4;
      }
      ctx.y += 6;
    }
  } catch (e) {
    console.error("Risk factors error:", e);
  }

  // Disclaimer
  try {
    ctx.y += 8;
    drawSectionHeader(ctx, "Disclaimer");
    const disclaimer = `This Investment Summary has been prepared for informational purposes only and does not constitute an offer to sell or a solicitation of an offer to buy any securities or real property. The financial projections, estimates, and analyses contained herein are based on assumptions that may not be realized and are subject to significant uncertainty and change. Past performance is not indicative of future results. Actual results may differ materially from those projected. The information contained herein has been obtained from sources believed to be reliable, but no representation or warranty, express or implied, is made as to its accuracy, completeness, or fitness for a particular purpose. Prospective investors should conduct their own due diligence and consult with legal, tax, and financial advisors before making any investment decision.`;
    drawBodyText(ctx, disclaimer);
    ctx.y += 14;

    // Broker contact block
    const broker = p.generatedBy;
    checkPageBreak(ctx, 60);
    ctx.doc.setFontSize(9);
    ctx.doc.setFont("helvetica", "bold");
    ctx.doc.setTextColor(...ctx.PRIMARY);
    ctx.doc.text("Prepared By", ctx.ML, ctx.y);
    ctx.y += 14;

    const contactLines = [
      broker.name,
      broker.title,
      broker.email,
      broker.phone,
      broker.licenseNumber ? `License #${broker.licenseNumber}` : null,
    ].filter(Boolean) as string[];

    for (const line of contactLines) {
      ctx.doc.setFontSize(8.5);
      ctx.doc.setFont("helvetica", "normal");
      ctx.doc.setTextColor(...PDF_COLORS.DARK);
      ctx.doc.text(line, ctx.ML, ctx.y);
      ctx.y += 12;
    }
  } catch (e) {
    console.error("Disclaimer error:", e);
  }
}
