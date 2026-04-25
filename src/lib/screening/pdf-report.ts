/**
 * Screening Report PDF Generator
 *
 * Generates a professional multi-page PDF report summarizing screening results.
 * Uses jsPDF following existing patterns from deal-pdf.ts and pdf-utils.ts.
 *
 * Pages:
 *   1. Executive Summary (score, recommendation, property, applicant)
 *   2. Credit & Background Report
 *   3. Financial Wellness Profile
 *   4. Document Verification & Risk Factors
 */

import jsPDF from "jspdf";
import type { RiskScoreResult } from "./scoring";
import type { WellnessResult } from "./wellness";
import type { CreditReportResult } from "./crs";
import { RISK_COLORS, STATUS_CONFIG, DOCUMENT_TYPE_LABELS } from "./constants";
import { maskSSN, formatCents, getRiskScoreColor } from "./utils";

// ── Types ─────────────────────────────────────────────────────

type RGB = [number, number, number];

interface ScreeningPdfInput {
  // Application info
  applicationId: string;
  propertyAddress: string;
  unitNumber?: string;
  monthlyRent: number;
  tier: "base" | "enhanced";
  completedAt: Date;

  // Applicant info
  applicantName: string;
  applicantEmail: string;
  applicantPhone?: string;
  dateOfBirth?: string;
  ssnLast4?: string;
  currentAddress?: string;
  employer?: string;
  monthlyIncome?: number;

  // Agent info
  agentName: string;
  orgName: string;

  // Results
  riskScore: RiskScoreResult;
  creditReports: CreditReportResult[];
  wellness: WellnessResult | null;
  documentAnalyses: Array<{
    fileName: string;
    documentType: string;
    fraudAssessment: string;
    confidence: number;
    discrepancies: string[];
    aiSummary: string;
  }>;
  idv?: {
    provider: string;
    status: string;
    documentType?: string;
    livenessScore?: number | null;
    faceMatchScore?: number | null;
    documentQuality?: number | null;
    idvBonus: number;
  } | null;
}

// ── Colors ────────────────────────────────────────────────────

const BLUE: RGB = [37, 99, 235];
const DARK: RGB = [15, 23, 42];
const GRAY: RGB = [100, 116, 139];
const LIGHT_GRAY: RGB = [226, 232, 240];
const GREEN: RGB = [5, 150, 105];
const RED: RGB = [220, 38, 38];
const AMBER: RGB = [217, 119, 6];
const WHITE: RGB = [255, 255, 255];
const BG_LIGHT: RGB = [248, 250, 252];

function scoreColor(score: number): RGB {
  if (score >= 75) return GREEN;
  if (score >= 50) return AMBER;
  return RED;
}

// ── Main Generator ────────────────────────────────────────────

export function generateScreeningPdf(input: ScreeningPdfInput): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const ML = 40;
  const MR = 40;
  const CW = W - ML - MR;
  let y = 0;
  let page = 1;

  const property = input.unitNumber
    ? `${input.propertyAddress}, Unit ${input.unitNumber}`
    : input.propertyAddress;

  // ── Shared Helpers ──────────────────────────────────────────

  function addFooter() {
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text(`VettdRE Screening Report — ${input.applicantName} — Page ${page}`, ML, H - 20);
    doc.text(new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }), W - MR, H - 20, { align: "right" });
    doc.setFontSize(6);
    doc.text("CONFIDENTIAL — For authorized use only. Not a consumer report under FCRA.", ML, H - 10);
  }

  function newPage() {
    addFooter();
    doc.addPage();
    page++;
    y = 40;
  }

  function checkPageBreak(needed: number) {
    if (y + needed > H - 50) newPage();
  }

  function drawLine(atY: number) {
    doc.setDrawColor(...LIGHT_GRAY);
    doc.setLineWidth(0.5);
    doc.line(ML, atY, W - MR, atY);
  }

  function sectionTitle(text: string): number {
    checkPageBreak(30);
    doc.setFontSize(12);
    doc.setTextColor(...BLUE);
    doc.setFont("helvetica", "bold");
    doc.text(text, ML, y);
    drawLine(y + 4);
    y += 20;
    return y;
  }

  function label(text: string, x: number, atY: number) {
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.setFont("helvetica", "normal");
    doc.text(text, x, atY);
  }

  function value(text: string, x: number, atY: number, options?: { color?: RGB; bold?: boolean; align?: "left" | "right" }) {
    doc.setFontSize(9);
    doc.setTextColor(...(options?.color || DARK));
    doc.setFont("helvetica", options?.bold ? "bold" : "normal");
    doc.text(text, x, atY, { align: options?.align || "left" });
  }

  function kvRow(labelText: string, valueText: string, atY: number, opts?: { color?: RGB }): number {
    label(labelText, ML, atY);
    value(valueText, ML + 140, atY, opts);
    return atY + 14;
  }

  function twoCol(l1: string, v1: string, l2: string, v2: string, atY: number): number {
    label(l1, ML, atY);
    value(v1, ML + 120, atY);
    label(l2, ML + CW / 2, atY);
    value(v2, ML + CW / 2 + 120, atY);
    return atY + 14;
  }

  // ════════════════════════════════════════════════════════════
  // PAGE 1 — Executive Summary
  // ════════════════════════════════════════════════════════════

  // Header bar
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, W, 70, "F");
  doc.setFontSize(20);
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.text("VettdRE", ML, 35);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("Tenant Screening Report", ML, 52);
  doc.setFontSize(8);
  doc.text(`${input.tier === "enhanced" ? "Enhanced" : "Base"} Screening`, W - MR, 35, { align: "right" });
  doc.text(`ID: ${input.applicationId.slice(0, 8).toUpperCase()}`, W - MR, 48, { align: "right" });

  y = 90;

  // Score card
  const recColor = scoreColor(input.riskScore.score);
  const recLabel = input.riskScore.recommendation === "approve" ? "APPROVE"
    : input.riskScore.recommendation === "conditional" ? "CONDITIONAL" : "DECLINE";

  // Score circle background
  doc.setFillColor(...BG_LIGHT);
  doc.roundedRect(ML, y, CW, 80, 6, 6, "F");

  // Score number
  doc.setFontSize(36);
  doc.setTextColor(...recColor);
  doc.setFont("helvetica", "bold");
  doc.text(String(Math.round(input.riskScore.score)), ML + 50, y + 45, { align: "center" });
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text("RISK SCORE", ML + 50, y + 60, { align: "center" });

  // Recommendation badge
  doc.setFillColor(...recColor);
  doc.roundedRect(ML + 100, y + 20, 90, 24, 4, 4, "F");
  doc.setFontSize(11);
  doc.setTextColor(...WHITE);
  doc.setFont("helvetica", "bold");
  doc.text(recLabel, ML + 145, y + 36, { align: "center" });

  // Component scores bar
  const components = input.riskScore.componentScores;
  const barStartX = ML + 210;
  const barW = CW - 210;
  const barLabels = ["Credit", "Financial", "Income", "Docs", "Rent Hx"];
  const barValues = [components.credit, components.financialHealth, components.incomeRatio, components.documentIntegrity, components.rentHistory];
  for (let i = 0; i < barLabels.length; i++) {
    const bx = barStartX;
    const by = y + 10 + i * 13;
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text(barLabels[i], bx, by + 7);
    // Background bar
    doc.setFillColor(...LIGHT_GRAY);
    doc.rect(bx + 50, by, barW - 80, 8, "F");
    // Fill bar
    const pct = barValues[i] / 100;
    doc.setFillColor(...scoreColor(barValues[i]));
    doc.rect(bx + 50, by, (barW - 80) * pct, 8, "F");
    // Value
    doc.setFontSize(7);
    doc.setTextColor(...DARK);
    doc.text(`${Math.round(barValues[i])}`, bx + barW - 20, by + 7, { align: "right" });
  }

  y += 95;

  // Property & Applicant Info
  sectionTitle("Application Details");

  y = twoCol("Property", property, "Monthly Rent", `$${input.monthlyRent.toLocaleString()}`, y);
  y = twoCol("Applicant", input.applicantName, "Email", input.applicantEmail, y);
  y = twoCol(
    "SSN", input.ssnLast4 ? `***-**-${input.ssnLast4}` : "N/A",
    "DOB", input.dateOfBirth || "N/A", y
  );
  y = twoCol(
    "Employer", input.employer || "N/A",
    "Monthly Income", input.monthlyIncome ? `$${input.monthlyIncome.toLocaleString()}` : "N/A", y
  );
  y = twoCol("Agent", input.agentName, "Organization", input.orgName, y);
  y = twoCol(
    "Screening Tier", input.tier === "enhanced" ? "Enhanced" : "Base",
    "Completed", input.completedAt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }), y
  );

  y += 10;

  // Identity Verification
  if (input.idv) {
    sectionTitle("Identity Verification");
    const idvLabel = input.idv.status === "approved" ? "Verified" : input.idv.status === "declined" ? "Failed" : "Not Completed";
    y = twoCol("Status", idvLabel, "Provider", input.idv.provider === "didit" ? "Didit" : "Stripe Identity", y);
    if (input.idv.documentType) {
      y = twoCol("Document Type", input.idv.documentType.replace(/_/g, " "), "Bonus/Penalty", `${input.idv.idvBonus >= 0 ? "+" : ""}${input.idv.idvBonus} points`, y);
    }
    if (input.idv.status === "approved") {
      y = twoCol(
        "Liveness Score", input.idv.livenessScore != null ? `${Math.round(input.idv.livenessScore)}%` : "N/A",
        "Face Match", input.idv.faceMatchScore != null ? `${Math.round(input.idv.faceMatchScore)}%` : "N/A", y
      );
    }
    y += 5;
  }

  // Risk Factors
  if (input.riskScore.factors.length > 0) {
    sectionTitle("Risk Factors");
    for (const factor of input.riskScore.factors) {
      checkPageBreak(16);
      doc.setFillColor(254, 226, 226); // red-100
      doc.roundedRect(ML, y - 8, CW, 14, 2, 2, "F");
      doc.setFontSize(8);
      doc.setTextColor(...RED);
      doc.text(`⚠  ${factor}`, ML + 8, y);
      y += 16;
    }
    y += 5;
  }

  addFooter();

  // ════════════════════════════════════════════════════════════
  // PAGE 2 — Credit & Background Report
  // ════════════════════════════════════════════════════════════

  doc.addPage();
  page++;
  y = 40;

  sectionTitle("Credit Report");

  if (input.creditReports.length === 0) {
    value("No credit data available", ML, y);
    y += 20;
  } else {
    // Credit score summary table
    for (const report of input.creditReports) {
      checkPageBreak(120);
      const bureauLabel = report.bureau.charAt(0).toUpperCase() + report.bureau.slice(1);

      doc.setFillColor(...BG_LIGHT);
      doc.roundedRect(ML, y - 8, CW, 16, 2, 2, "F");
      doc.setFontSize(10);
      doc.setTextColor(...DARK);
      doc.setFont("helvetica", "bold");
      doc.text(bureauLabel, ML + 8, y + 2);
      if (report.creditScore) {
        const sc = scoreColor(report.creditScore >= 700 ? 80 : report.creditScore >= 600 ? 60 : 30);
        doc.setTextColor(...sc);
        doc.text(String(report.creditScore), W - MR - 8, y + 2, { align: "right" });
      }
      y += 20;

      y = twoCol("Score Model", report.scoreModel || "N/A", "Pull Type", report.pullType, y);
      y = twoCol("Total Accounts", String(report.totalAccounts), "Open Accounts", String(report.openAccounts), y);
      y = twoCol("Total Balance", `$${report.totalBalance.toLocaleString()}`, "Monthly Payments", `$${report.totalMonthlyPayments.toLocaleString()}`, y);
      y = twoCol("Delinquent", String(report.delinquentAccounts), "Collections", `${report.collectionsCount} ($${report.collectionsTotal.toLocaleString()})`, y);
      y = twoCol("Public Records", String(report.publicRecordsCount), "Inquiries (12mo)", String(report.inquiriesCount12m), y);
      y = twoCol(
        "Oldest Account",
        report.oldestAccountMonths > 0 ? `${Math.floor(report.oldestAccountMonths / 12)}yr ${report.oldestAccountMonths % 12}mo` : "N/A",
        "Active Bankruptcy",
        report.hasActiveBankruptcy ? "YES" : "No", y
      );
      y += 8;
    }
  }

  // Eviction Records
  const allEvictions = input.creditReports.flatMap(r => r.evictionRecords || []);
  if (allEvictions.length > 0) {
    sectionTitle("Eviction Records");
    for (const ev of allEvictions) {
      checkPageBreak(50);
      doc.setFillColor(254, 243, 199); // amber-100
      doc.roundedRect(ML, y - 8, CW, 40, 2, 2, "F");
      y = kvRow("Court", ev.court, y);
      y = twoCol("Case #", ev.caseNumber, "Filed", ev.filedDate, y);
      y = twoCol("Status", ev.status, "Amount", ev.amount ? `$${ev.amount.toLocaleString()}` : "N/A", y);
      y += 6;
    }
  }

  // Criminal Records
  const allCriminal = input.creditReports.flatMap(r => r.criminalRecords || []);
  if (allCriminal.length > 0) {
    sectionTitle("Criminal Records");
    for (const cr of allCriminal) {
      checkPageBreak(50);
      y = kvRow("Offense", cr.offense, y, { color: RED });
      y = twoCol("Court", cr.court, "Date", cr.offenseDate, y);
      y = twoCol("Severity", cr.severity, "Disposition", cr.disposition, y);
      y += 6;
    }
  }

  // Bankruptcy Records
  const allBankruptcy = input.creditReports.flatMap(r => r.bankruptcyRecords || []);
  if (allBankruptcy.length > 0) {
    sectionTitle("Bankruptcy Records");
    for (const bk of allBankruptcy) {
      checkPageBreak(40);
      y = twoCol("Chapter", bk.chapter, "Status", bk.status, y);
      y = twoCol("Court", bk.court, "Filed", bk.filedDate, y);
      y += 6;
    }
  }

  if (allEvictions.length === 0 && allCriminal.length === 0 && allBankruptcy.length === 0) {
    sectionTitle("Background Check");
    doc.setFontSize(9);
    doc.setTextColor(...GREEN);
    doc.text("✓  No eviction, criminal, or bankruptcy records found", ML, y);
    y += 20;
  }

  addFooter();

  // ════════════════════════════════════════════════════════════
  // PAGE 3 — Financial Wellness Profile
  // ════════════════════════════════════════════════════════════

  doc.addPage();
  page++;
  y = 40;

  sectionTitle("Financial Wellness Profile");

  const w = input.wellness;
  if (!w) {
    value("Bank verification was not completed — financial analysis unavailable.", ML, y);
    y += 20;
  } else {
    // Health score badge — guard all numeric fields for null safety (Prisma Decimal? can be null if read from DB)
    const fhs = Number(w.financialHealthScore ?? 0);
    const healthColor = scoreColor(fhs);
    doc.setFillColor(...BG_LIGHT);
    doc.roundedRect(ML, y - 8, CW, 30, 4, 4, "F");
    doc.setFontSize(20);
    doc.setTextColor(...healthColor);
    doc.setFont("helvetica", "bold");
    doc.text(String(Math.round(fhs)), ML + 20, y + 12, { align: "center" });
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    doc.text(`Financial Health: ${(w.healthTier || "N/A").toUpperCase()}`, ML + 50, y + 12);
    y += 38;

    // Income section
    sectionTitle("Income Analysis");
    y = twoCol("Avg Monthly Income", `$${Number(w.avgMonthlyIncome ?? 0).toLocaleString()}`, "Income Stability", `${Number(w.incomeStabilityScore ?? 0)}/100`, y);
    y = twoCol("Income Trend", w.incomeTrend ? w.incomeTrend.charAt(0).toUpperCase() + w.incomeTrend.slice(1) : "N/A", "Income Sources", String((w.incomeSources || []).length), y);

    const incomeSources = w.incomeSources || [];
    if (incomeSources.length > 0) {
      y += 4;
      for (const src of incomeSources.slice(0, 5)) {
        checkPageBreak(14);
        label(`  ${src.source}`, ML + 10, y);
        value(`$${src.avgMonthly.toLocaleString()}/mo (${src.count} txns)`, ML + 200, y);
        y += 12;
      }
      y += 4;
    }

    // Expense & ratios section — null-safe Number() wrapping for Prisma Decimal fields
    sectionTitle("Expenses & Ratios");
    const avgExpenses = Number(w.avgMonthlyExpenses ?? 0);
    const estDebt = Number(w.estimatedMonthlyDebt ?? 0);
    y = twoCol("Avg Monthly Expenses", `$${avgExpenses.toLocaleString()}`, "Est. Monthly Debt", `$${estDebt.toLocaleString()}`, y);

    const incRentRatio = Number(w.incomeToRentRatio ?? 0);
    const dtiRatio = Number(w.debtToIncomeRatio ?? 0);
    const disposable = Number(w.disposableIncome ?? 0);

    y = twoCol("Income-to-Rent", `${incRentRatio.toFixed(1)}x`, "Debt-to-Income", `${(dtiRatio * 100).toFixed(0)}%`, y);
    y = kvRow("Disposable Income", `$${disposable.toLocaleString()}/mo`, y, {
      color: disposable >= 0 ? GREEN : RED,
    });
    y += 4;

    // Balances
    sectionTitle("Account Balances");
    y = twoCol("Avg Balance (30d)", `$${Number(w.avgBalance30d ?? 0).toLocaleString()}`, "Avg Balance (60d)", `$${Number(w.avgBalance60d ?? 0).toLocaleString()}`, y);
    y = twoCol("Avg Balance (90d)", `$${Number(w.avgBalance90d ?? 0).toLocaleString()}`, "Lowest Balance (90d)", `$${Number(w.lowestBalance90d ?? 0).toLocaleString()}`, y);
    y += 4;

    // Rent payment history
    sectionTitle("Rent Payment History");
    const consistencyColor = w.rentPaymentConsistency === "excellent" ? GREEN
      : w.rentPaymentConsistency === "good" ? GREEN
      : w.rentPaymentConsistency === "fair" ? AMBER : RED;
    y = twoCol(
      "Payments Found", String(w.rentPaymentsFound),
      "On-Time", w.rentPaymentsFound > 0 ? `${w.rentPaymentsOnTime}/${w.rentPaymentsFound}` : "N/A", y
    );
    y = kvRow("Consistency", (w.rentPaymentConsistency || "N/A").toUpperCase(), y, { color: consistencyColor });
    y += 4;

    // Red flags
    const flags = w.suspiciousActivityFlags || [];
    if (w.nsfCount90d > 0 || w.overdraftCount90d > 0 || w.lateFeeCount90d > 0 || w.gamblingTransactionCount > 0 || flags.length > 0) {
      sectionTitle("Financial Red Flags");
      if (w.nsfCount90d > 0) { y = kvRow("NSF Fees (90d)", String(w.nsfCount90d), y, { color: RED }); }
      if (w.overdraftCount90d > 0) { y = kvRow("Overdrafts (90d)", String(w.overdraftCount90d), y, { color: RED }); }
      if (w.lateFeeCount90d > 0) { y = kvRow("Late Fees (90d)", String(w.lateFeeCount90d), y, { color: AMBER }); }
      if (w.gamblingTransactionCount > 0) { y = kvRow("Gambling Transactions", String(w.gamblingTransactionCount), y, { color: AMBER }); }
      for (const flag of flags) {
        checkPageBreak(16);
        doc.setFontSize(8);
        doc.setTextColor(...RED);
        doc.text(`⚠  ${flag}`, ML + 8, y);
        y += 14;
      }
    } else {
      sectionTitle("Financial Red Flags");
      doc.setFontSize(9);
      doc.setTextColor(...GREEN);
      doc.text("✓  No financial red flags detected", ML, y);
      y += 16;
    }
  }

  addFooter();

  // ════════════════════════════════════════════════════════════
  // PAGE 4 — Document Verification
  // ════════════════════════════════════════════════════════════

  doc.addPage();
  page++;
  y = 40;

  sectionTitle("Document Verification");

  if (input.documentAnalyses.length === 0) {
    value("No documents were uploaded for verification.", ML, y);
    y += 20;
  } else {
    for (const da of input.documentAnalyses) {
      checkPageBreak(80);

      const assessColor = da.fraudAssessment === "clean" ? GREEN
        : da.fraudAssessment === "low_risk" ? GREEN
        : da.fraudAssessment === "medium_risk" ? AMBER
        : RED;

      // Document card
      doc.setFillColor(...BG_LIGHT);
      doc.roundedRect(ML, y - 8, CW, 16, 2, 2, "F");
      doc.setFontSize(9);
      doc.setTextColor(...DARK);
      doc.setFont("helvetica", "bold");
      doc.text(da.fileName, ML + 8, y + 2);
      doc.setFontSize(7);
      doc.setTextColor(...assessColor);
      doc.text(da.fraudAssessment.replace(/_/g, " ").toUpperCase(), W - MR - 8, y + 2, { align: "right" });
      y += 20;

      y = twoCol(
        "Document Type", DOCUMENT_TYPE_LABELS[da.documentType] || da.documentType,
        "Extraction Confidence", `${da.confidence}%`, y
      );

      if (da.discrepancies.length > 0) {
        for (const disc of da.discrepancies) {
          checkPageBreak(14);
          doc.setFontSize(8);
          doc.setTextColor(...RED);
          doc.text(`⚠  ${disc}`, ML + 10, y);
          y += 12;
        }
      }

      // AI Summary (truncated)
      if (da.aiSummary) {
        const summaryLines = doc.splitTextToSize(da.aiSummary, CW - 20);
        for (const line of summaryLines.slice(0, 4)) {
          checkPageBreak(12);
          doc.setFontSize(7);
          doc.setTextColor(...GRAY);
          doc.text(line, ML + 10, y);
          y += 10;
        }
      }

      y += 10;
    }
  }

  // Disclaimer
  y += 10;
  checkPageBreak(60);
  drawLine(y);
  y += 12;
  doc.setFontSize(7);
  doc.setTextColor(...GRAY);
  doc.setFont("helvetica", "italic");
  const disclaimer = [
    "IMPORTANT NOTICE: This report is provided for informational purposes only and does not constitute a consumer report",
    "as defined by the Fair Credit Reporting Act (FCRA). This report should be used as one of several factors in evaluating",
    "a tenant application. The information contained herein is based on data available at the time of screening and may not",
    "reflect the most current information. VettdRE makes no warranties regarding the accuracy or completeness of this report.",
    "All housing decisions must comply with applicable federal, state, and local fair housing laws.",
  ];
  for (const line of disclaimer) {
    doc.text(line, ML, y);
    y += 9;
  }

  addFooter();

  return doc;
}

/**
 * Generate PDF and return as Buffer for storage/download.
 */
export function generateScreeningPdfBuffer(input: ScreeningPdfInput): Buffer {
  const doc = generateScreeningPdf(input);
  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
