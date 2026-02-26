// ============================================================
// Simple Invoice PDF Generator — clean From/Bill To/Line Item
// ============================================================

import jsPDF from "jspdf";

// ── Types ────────────────────────────────────────────────────

export interface SimpleInvoiceData {
  // From (brokerage)
  fromName: string;
  fromAddress?: string;
  fromPhone?: string;
  fromEmail?: string;

  // Bill To (landlord/management company)
  billToName: string;
  billToAddress?: string;
  billToPhone?: string;
  billToEmail?: string;

  // Invoice metadata
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;

  // Line item (single)
  description: string;
  amount: number;

  // Optional
  notes?: string;
  agentName?: string;
  propertyName?: string;
}

// ── Colors ───────────────────────────────────────────────────

type RGB = [number, number, number];
const BLACK: RGB = [33, 33, 33];
const LABEL: RGB = [102, 102, 102];
const LIGHT_GRAY: RGB = [245, 245, 245];
const BORDER: RGB = [200, 200, 200];
const DARK: RGB = [51, 51, 51];

// ── Helpers ──────────────────────────────────────────────────

function fmt(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

function sanitizeFilename(str: string): string {
  return str
    .replace(/[^a-zA-Z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .substring(0, 60);
}

// ── Core Generator ───────────────────────────────────────────

export function generateSimpleInvoice(data: SimpleInvoiceData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const ML = 50;
  const MR = 50;
  const CW = W - ML - MR;
  let y = 50;

  // ── HEADER: "INVOICE" + meta ────────────────────────────────

  // "INVOICE" — top left
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(...BLACK);
  doc.text("INVOICE", ML, y + 18);

  // Invoice meta — top right
  const metaX = W - MR;
  let metaY = y;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...LABEL);
  doc.text("Invoice #", metaX - 80, metaY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...BLACK);
  doc.text(data.invoiceNumber, metaX, metaY, { align: "right" });

  metaY += 14;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...LABEL);
  doc.text("Date", metaX - 80, metaY);
  doc.setTextColor(...DARK);
  doc.text(data.invoiceDate, metaX, metaY, { align: "right" });

  if (data.dueDate) {
    metaY += 14;
    doc.setTextColor(...LABEL);
    doc.text("Due Date", metaX - 80, metaY);
    doc.setTextColor(...DARK);
    doc.text(data.dueDate, metaX, metaY, { align: "right" });
  }

  y += 45;

  // ── Thin divider ────────────────────────────────────────────
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.5);
  doc.line(ML, y, W - MR, y);
  y += 25;

  // ── FROM / BILL TO ──────────────────────────────────────────

  const colWidth = CW / 2;

  // From column
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...LABEL);
  doc.text("FROM", ML, y);

  let fromY = y + 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BLACK);
  doc.text(data.fromName, ML, fromY);
  fromY += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...DARK);

  if (data.fromAddress) {
    // Handle multi-line addresses
    const addressLines = doc.splitTextToSize(data.fromAddress, colWidth - 20);
    for (const line of addressLines) {
      doc.text(line, ML, fromY);
      fromY += 12;
    }
  }
  if (data.fromPhone) {
    doc.text(data.fromPhone, ML, fromY);
    fromY += 12;
  }
  if (data.fromEmail) {
    doc.text(data.fromEmail, ML, fromY);
    fromY += 12;
  }

  // Bill To column
  const billX = ML + colWidth + 20;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...LABEL);
  doc.text("BILL TO", billX, y);

  let billY = y + 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BLACK);
  doc.text(data.billToName, billX, billY);
  billY += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...DARK);

  if (data.billToAddress) {
    const addressLines = doc.splitTextToSize(data.billToAddress, colWidth - 20);
    for (const line of addressLines) {
      doc.text(line, billX, billY);
      billY += 12;
    }
  }
  if (data.billToPhone) {
    doc.text(data.billToPhone, billX, billY);
    billY += 12;
  }
  if (data.billToEmail) {
    doc.text(data.billToEmail, billX, billY);
    billY += 12;
  }

  y = Math.max(fromY, billY) + 20;

  // ── LINE ITEMS TABLE ────────────────────────────────────────

  const tableX = ML;
  const descColW = CW - 100;
  const amtColW = 100;
  const rowH = 32;

  // Table header
  doc.setFillColor(...LIGHT_GRAY);
  doc.rect(tableX, y, CW, rowH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...LABEL);
  doc.text("DESCRIPTION", tableX + 10, y + 20);
  doc.text("AMOUNT", tableX + descColW + amtColW - 10, y + 20, { align: "right" });

  y += rowH;

  // Line item row
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.5);
  doc.line(tableX, y, tableX + CW, y);

  // Wrap description text if long
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...BLACK);
  const descLines = doc.splitTextToSize(data.description, descColW - 20);
  const descRowH = Math.max(rowH, descLines.length * 14 + 18);

  let descTextY = y + 20;
  for (const line of descLines) {
    doc.text(line, tableX + 10, descTextY);
    descTextY += 14;
  }

  // Amount — vertically centered in row
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(fmt(data.amount), tableX + CW - 10, y + 20, { align: "right" });

  y += descRowH;

  // Bottom border of line item
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.5);
  doc.line(tableX, y, tableX + CW, y);

  y += 4;

  // Total separator — thicker line
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(1);
  doc.line(tableX + descColW - 40, y, tableX + CW, y);

  y += 20;

  // Total row
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...LABEL);
  doc.text("Total", tableX + descColW - 30, y, { align: "right" });

  doc.setFontSize(12);
  doc.setTextColor(...BLACK);
  doc.text(fmt(data.amount), tableX + CW - 10, y, { align: "right" });

  y += 40;

  // ── NOTES ───────────────────────────────────────────────────

  if (data.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...LABEL);
    doc.text("NOTES & PAYMENT INSTRUCTIONS", ML, y);

    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    const noteLines = doc.splitTextToSize(data.notes, CW);
    for (const line of noteLines) {
      doc.text(line, ML, y);
      y += 12;
    }
  }

  // ── FOOTER ──────────────────────────────────────────────────

  const H = doc.internal.pageSize.getHeight();
  let footerY = H - 50;

  if (data.agentName) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...LABEL);
    doc.text(`Agent: ${data.agentName}`, ML, footerY);
    footerY += 14;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(170, 170, 170);
  doc.text("Generated by VettdRE", W / 2, footerY, { align: "center" });

  return doc;
}

// ── PDF Bytes ────────────────────────────────────────────────

export function generateSimpleInvoicePDF(data: SimpleInvoiceData): Uint8Array {
  const doc = generateSimpleInvoice(data);
  return doc.output("arraybuffer") as unknown as Uint8Array;
}

// ── Batch ZIP ────────────────────────────────────────────────

export async function generateBatchInvoiceZip(invoices: SimpleInvoiceData[]): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  for (const inv of invoices) {
    const doc = generateSimpleInvoice(inv);
    const pdfBytes = doc.output("arraybuffer");

    // Filename: INV-2026-0001_1489-Shore-Pkwy-Apt-5C.pdf
    const addrPart = inv.description
      ? sanitizeFilename(inv.description.split(" at ").pop() || inv.description)
      : "invoice";
    const filename = `${inv.invoiceNumber}_${addrPart}.pdf`;

    zip.file(filename, pdfBytes);
  }

  return zip.generateAsync({ type: "blob" });
}
