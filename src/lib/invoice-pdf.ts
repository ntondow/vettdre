// ============================================================
// Invoice PDF Generator — client-side jsPDF commission invoices
// ============================================================

import jsPDF from "jspdf";
import type { InvoiceRecord, BrokerageConfig } from "./bms-types";

// Colors (as tuples for jsPDF)
type RGB = [number, number, number];
const PRIMARY: RGB = [15, 23, 42];      // slate-900
const SECONDARY: RGB = [71, 85, 105];   // slate-500
const ACCENT: RGB = [59, 130, 246];     // blue-500
const LIGHT: RGB = [241, 245, 249];     // slate-100
const BORDER: RGB = [203, 213, 225];    // slate-300
const WHITE: RGB = [255, 255, 255];

// ── Helpers ───────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(value);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "\u2014";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return "\u2014";
  }
}

function formatPct(value: number): string {
  return Number(value).toFixed(2) + "%";
}

function drawSectionHeader(doc: jsPDF, title: string, x: number, y: number, width: number): number {
  doc.setFillColor(...LIGHT);
  doc.roundedRect(x, y, width, 22, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...PRIMARY);
  doc.text(title.toUpperCase(), x + 10, y + 14);
  return y + 30;
}

function drawCommissionRow(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  label: string,
  pctText: string,
  amount: string,
  isBold: boolean,
): number {
  doc.setFont("helvetica", isBold ? "bold" : "normal");
  doc.setFontSize(10);
  doc.setTextColor(...PRIMARY);
  doc.text(label, x, y);
  doc.setTextColor(...SECONDARY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(pctText, x + width * 0.55, y, { align: "right" });
  doc.setFont("helvetica", isBold ? "bold" : "normal");
  doc.setFontSize(10);
  doc.setTextColor(...PRIMARY);
  doc.text(amount, x + width, y, { align: "right" });
  return y + 18;
}

// ── Render Invoice on Current Page ────────────────────────────

function generateInvoiceOnPage(doc: jsPDF, invoice: InvoiceRecord, config?: BrokerageConfig): void {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const ML = 50;
  const MR = 50;
  const CW = W - ML - MR;
  let y = 45;

  // Convert Decimal-serialized fields
  const transactionValue = Number(invoice.transactionValue);
  const totalCommission = Number(invoice.totalCommission);
  const agentSplitPct = Number(invoice.agentSplitPct);
  const houseSplitPct = Number(invoice.houseSplitPct);
  const agentPayout = Number(invoice.agentPayout);
  const housePayout = Number(invoice.housePayout);

  const brokerageName = config?.name || invoice.brokerageName || "";
  const brokerageAddress = config?.address || invoice.brokerageAddress || "";
  const brokeragePhone = config?.phone || invoice.brokeragePhone || "";
  const brokerageEmail = config?.email || invoice.brokerageEmail || "";
  const logoUrl = config?.logoUrl || "";

  // ── HEADER ──────────────────────────────────────────────────
  let logoRendered = false;
  if (logoUrl && logoUrl.startsWith("data:image")) {
    try {
      doc.addImage(logoUrl, "PNG", ML, y - 10, 60, 60);
      logoRendered = true;
    } catch {
      // Fall back to text-only
    }
  }

  const textX = logoRendered ? ML + 75 : ML;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...PRIMARY);
  doc.text(brokerageName, textX, y + 5);

  let headerY = y + 20;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SECONDARY);

  if (brokerageAddress) {
    doc.text(brokerageAddress, textX, headerY);
    headerY += 12;
  }

  const contactLine = [brokeragePhone, brokerageEmail].filter(Boolean).join("  |  ");
  if (contactLine) {
    doc.text(contactLine, textX, headerY);
    headerY += 12;
  }

  if (config?.licenseInfo) {
    doc.text(config.licenseInfo, textX, headerY);
    headerY += 12;
  }

  y = Math.max(headerY, logoRendered ? y + 60 : headerY) + 5;

  // ── Accent divider ──────────────────────────────────────────
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(2);
  doc.line(ML, y, W - MR, y);
  y += 20;

  // ── TITLE + INVOICE META ────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...PRIMARY);
  doc.text("COMMISSION INVOICE", ML, y);

  // Right side — invoice details
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SECONDARY);
  let metaY = y - 14;

  doc.setFont("helvetica", "bold");
  doc.text(invoice.invoiceNumber, W - MR, metaY, { align: "right" });
  metaY += 13;
  doc.setFont("helvetica", "normal");
  doc.text(`Issue Date: ${formatDate(invoice.issueDate)}`, W - MR, metaY, { align: "right" });
  metaY += 12;
  doc.text(`Due Date: ${formatDate(invoice.dueDate)}`, W - MR, metaY, { align: "right" });
  metaY += 12;
  doc.text(`Terms: ${invoice.paymentTerms || "Net 30"}`, W - MR, metaY, { align: "right" });

  y += 20;

  // ── AGENT SECTION ───────────────────────────────────────────
  y = drawSectionHeader(doc, "Agent Information", ML, y, CW);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...PRIMARY);
  doc.text(invoice.agentName, ML + 10, y);
  y += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SECONDARY);

  if (invoice.agentLicense) {
    doc.text(`License: ${invoice.agentLicense}`, ML + 10, y);
    y += 12;
  }
  if (invoice.agentEmail) {
    doc.text(invoice.agentEmail, ML + 10, y);
    y += 12;
  }

  y += 8;

  // ── TRANSACTION DETAILS ─────────────────────────────────────
  y = drawSectionHeader(doc, "Transaction Details", ML, y, CW);

  const detailRows: [string, string][] = [
    ["Property", invoice.propertyAddress],
    ["Deal Type", (invoice.dealType || "sale").charAt(0).toUpperCase() + (invoice.dealType || "sale").slice(1)],
    ["Transaction Value", formatCurrency(transactionValue)],
    ["Closing Date", formatDate(invoice.closingDate || null)],
  ];

  if (invoice.clientName) {
    const side = invoice.representedSide
      ? ` (${invoice.representedSide.charAt(0).toUpperCase() + invoice.representedSide.slice(1)})`
      : "";
    detailRows.push(["Client", invoice.clientName + side]);
  }

  for (const [label, value] of detailRows) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...SECONDARY);
    doc.text(label, ML + 10, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...PRIMARY);
    doc.text(value, ML + 130, y);
    y += 16;
  }

  y += 8;

  // ── COMMISSION BREAKDOWN ────────────────────────────────────
  y = drawSectionHeader(doc, "Commission Breakdown", ML, y, CW);

  const derivedPct = transactionValue > 0 ? (totalCommission / transactionValue) * 100 : 0;
  y = drawCommissionRow(doc, ML + 10, y, CW - 20, "Total Commission", derivedPct > 0 ? formatPct(derivedPct) : "", formatCurrency(totalCommission), true);

  // Thin separator
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.5);
  doc.line(ML + 10, y - 6, W - MR - 10, y - 6);

  y = drawCommissionRow(doc, ML + 10, y, CW - 20, "Agent Split", formatPct(agentSplitPct), formatCurrency(agentPayout), false);
  y = drawCommissionRow(doc, ML + 10, y, CW - 20, "House Split", formatPct(houseSplitPct), formatCurrency(housePayout), false);

  y += 10;

  // ── AMOUNT DUE BOX ──────────────────────────────────────────
  const boxH = 50;
  doc.setFillColor(...ACCENT);
  doc.roundedRect(ML, y, CW, boxH, 4, 4, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...WHITE);
  doc.text("AMOUNT DUE TO AGENT", ML + 15, y + 22);

  doc.setFontSize(18);
  doc.text(formatCurrency(agentPayout), W - MR - 15, y + 22, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${invoice.paymentTerms || "Net 30"}  \u2022  Due ${formatDate(invoice.dueDate)}`, ML + 15, y + 38);

  y += boxH + 30;

  // ── SIGNATURE LINES ─────────────────────────────────────────
  const sigWidth = (CW - 40) / 2;

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.5);

  // Left — Authorized Signature
  doc.line(ML, y, ML + sigWidth, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...SECONDARY);
  doc.text("Authorized Signature", ML, y + 12);

  // Right — Date
  doc.line(ML + sigWidth + 40, y, W - MR, y);
  doc.text("Date", ML + sigWidth + 40, y + 12);

  // ── FOOTER ──────────────────────────────────────────────────
  const footerY = H - 45;

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.5);
  doc.line(ML, footerY, W - MR, footerY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...SECONDARY);

  const footerLine1Parts = [brokerageName, config?.licenseInfo].filter(Boolean).join("  \u2022  ");
  if (footerLine1Parts) {
    doc.text(footerLine1Parts, W / 2, footerY + 12, { align: "center" });
  }

  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  doc.text(`Generated by VettdRE | ${today}`, W / 2, footerY + 24, { align: "center" });
}

// ── Public API ────────────────────────────────────────────────

export function generateInvoicePDF(invoice: InvoiceRecord, config?: BrokerageConfig): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  generateInvoiceOnPage(doc, invoice, config);
  return doc;
}

export function generateBatchInvoicePDFs(invoices: InvoiceRecord[], config?: BrokerageConfig): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });

  for (let i = 0; i < invoices.length; i++) {
    if (i > 0) doc.addPage();
    generateInvoiceOnPage(doc, invoices[i], config);
  }

  return doc;
}
