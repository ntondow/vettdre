// ============================================================
// Commission Invoice PDF Generator — Professional real estate
// brokerage commission invoice (Gulino Group–style template)
// ============================================================

import jsPDF from "jspdf";
import type { SimpleInvoiceData } from "./bms-types";

// Re-export the type so existing consumers can still import from here
export type { SimpleInvoiceData } from "./bms-types";

// ── Colors ───────────────────────────────────────────────────

type RGB = [number, number, number];
const BLACK: RGB = [33, 33, 33];
const DARK: RGB = [51, 51, 51];
const LABEL: RGB = [120, 120, 120];
const LIGHT_LABEL: RGB = [160, 160, 160];
const ACCENT: RGB = [107, 91, 149]; // Muted purple #6B5B95
const TABLE_BG: RGB = [232, 224, 240]; // Lavender #E8E0F0
const UNDERLINE: RGB = [204, 204, 204]; // #CCCCCC
const FOOTER_GRAY: RGB = [180, 180, 180];

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

/** Draw a thin form-style underline */
function drawUnderline(doc: jsPDF, x: number, y: number, width: number) {
  doc.setDrawColor(...UNDERLINE);
  doc.setLineWidth(0.5);
  doc.line(x, y + 2, x + width, y + 2);
}

// ── Core Generator ───────────────────────────────────────────

export function generateSimpleInvoice(data: SimpleInvoiceData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth(); // 612
  const H = doc.internal.pageSize.getHeight(); // 792
  const ML = 50;
  const MR = 50;
  const CW = W - ML - MR; // 512
  let y = 45;

  // ── TOP SECTION: Letterhead ───────────────────────────────

  // Left side: brokerage contact info
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...DARK);

  let leftY = y;
  if (data.brokerageAddress) {
    doc.text(data.brokerageAddress, ML, leftY);
    leftY += 13;
  }
  if (data.brokerageCityStateZip) {
    doc.text(data.brokerageCityStateZip, ML, leftY);
    leftY += 13;
  }
  if (data.brokerageEmail) {
    doc.text(data.brokerageEmail, ML, leftY);
    leftY += 13;
  }
  if (data.brokeragePhone) {
    doc.text(data.brokeragePhone, ML, leftY);
    leftY += 13;
  }

  // Right side: logo or brokerage name
  const rightX = W - MR;
  if (data.brokerageLogo) {
    try {
      doc.addImage(data.brokerageLogo, "PNG", rightX - 120, y - 5, 120, 50);
    } catch {
      // Fallback to text if image fails
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(...BLACK);
      doc.text(data.brokerageName, rightX, y + 12, { align: "right" });
    }
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...BLACK);
    doc.text(data.brokerageName, rightX, y + 12, { align: "right" });
  }

  y = Math.max(leftY, y + 50) + 16;

  // ── TITLE: "Commission Invoice" ───────────────────────────

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...ACCENT);
  doc.text("Commission Invoice", ML, y);

  // Subtle underline beneath the title
  const titleWidth = doc.getTextWidth("Commission Invoice");
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(1.5);
  doc.line(ML, y + 4, ML + titleWidth, y + 4);

  y += 30;

  // ── HEADER ROW: Bill To + Invoice Details ─────────────────

  const headerLeftW = CW * 0.55;
  const headerRightW = CW * 0.45;
  const headerRightX = ML + headerLeftW;

  // -- Bill To (left) --
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...LABEL);
  doc.text("BILL TO", ML, y);

  let billY = y + 15;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BLACK);
  doc.text(data.billToName, ML, billY);
  drawUnderline(doc, ML, billY, headerLeftW - 30);
  billY += 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...DARK);

  if (data.billToAddress) {
    const lines = doc.splitTextToSize(data.billToAddress, headerLeftW - 30);
    for (const line of lines) {
      doc.text(line, ML, billY);
      billY += 12;
    }
  }
  if (data.billToPhone) {
    doc.text(data.billToPhone, ML, billY);
    billY += 12;
  }
  if (data.billToEmail) {
    doc.text(data.billToEmail, ML, billY);
    billY += 12;
  }

  // -- Invoice Details (right, right-aligned labels + values) --
  const labelX = headerRightX + 10;
  const valueX = W - MR;
  const valueUnderlineW = 130;

  let metaY = y;

  // Invoice #
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...LABEL);
  doc.text("INVOICE #", labelX, metaY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BLACK);
  doc.text(data.invoiceNr, valueX, metaY, { align: "right" });
  drawUnderline(doc, valueX - valueUnderlineW, metaY, valueUnderlineW);

  metaY += 20;

  // Date
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...LABEL);
  doc.text("DATE", labelX, metaY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text(data.invoiceDate, valueX, metaY, { align: "right" });
  drawUnderline(doc, valueX - valueUnderlineW, metaY, valueUnderlineW);

  metaY += 20;

  // Due Date
  if (data.dueDate) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...LABEL);
    doc.text("DUE DATE", labelX, metaY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...DARK);
    doc.text(data.dueDate, valueX, metaY, { align: "right" });
    drawUnderline(doc, valueX - valueUnderlineW, metaY, valueUnderlineW);
    metaY += 20;
  }

  y = Math.max(billY, metaY) + 20;

  // ── LINE ITEMS TABLE ──────────────────────────────────────

  const tableX = ML;
  const col1W = Math.round(CW * 0.18); // Move-In Date
  const col3W = Math.round(CW * 0.20); // Amount
  const col2W = CW - col1W - col3W;    // Deal Details
  const col2X = tableX + col1W;
  const col3X = tableX + col1W + col2W;
  const cellPad = 6;
  const headerH = 26;
  const BORDER: RGB = [208, 200, 224]; // #D0C8E0

  // Outer table border — top
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(1);
  doc.line(tableX, y, tableX + CW, y);

  // Table header row — lavender background
  doc.setFillColor(...TABLE_BG);
  doc.rect(tableX, y, CW, headerH, "F");

  // Column borders in header
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.5);
  doc.line(col2X, y, col2X, y + headerH);
  doc.line(col3X, y, col3X, y + headerH);

  // Header text
  const headerTextY = y + headerH / 2 + 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...ACCENT);
  doc.text("MOVE-IN DATE", tableX + cellPad, headerTextY);
  doc.text("DEAL DETAILS", col2X + cellPad, headerTextY);
  doc.text("AMOUNT", col3X + col3W - cellPad, headerTextY, { align: "right" });

  y += headerH;

  // Line below header
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(1);
  doc.line(tableX, y, tableX + CW, y);

  // -- Data row: measure height first, then render --
  const detailLabelColor: RGB = [136, 136, 136]; // #888
  const detailValueColor: RGB = [34, 34, 34];    // #222
  const detailMaxW = col2W - cellPad * 2 - 4; // label indent + padding
  const lineH = 13; // line height for detail rows

  // Build the detail lines for col2 (stacked label: value pairs)
  interface DetailLine { label: string; value: string; bold?: boolean; wrap?: boolean }
  const details: DetailLine[] = [];

  details.push({ label: "Commission Due:", value: fmt(data.commissionAmount), bold: true });

  if (data.rentalPrice !== undefined) {
    details.push({ label: "Rental Price:", value: fmt(data.rentalPrice) });
  }

  // Property — combine name + address
  const propName = data.propertyName?.trim();
  const propAddr = data.propertyAddress.trim();
  const nameMatchesAddr = propName && propName.toLowerCase() === propAddr.toLowerCase();
  const propertyVal = (propName && !nameMatchesAddr) ? `${propName} — ${propAddr}` : propAddr;
  details.push({ label: "Property:", value: propertyVal, wrap: true });

  details.push({ label: "Tenant:", value: data.tenantName, wrap: true });

  if (data.agentName) {
    details.push({ label: "Agent:", value: data.agentName });
  }
  if (data.agentLicenseNumber) {
    details.push({ label: "DOS #:", value: data.agentLicenseNumber });
  }

  // Calculate total height of details column
  let detailH = cellPad; // top padding
  for (const d of details) {
    if (d.wrap) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      const labelW = doc.getTextWidth(d.label + "  ");
      const wrapped = doc.splitTextToSize(d.value, detailMaxW - labelW);
      detailH += lineH * wrapped.length;
    } else {
      detailH += lineH;
    }
  }
  detailH += cellPad; // bottom padding

  const rowH = Math.max(detailH, 40); // minimum row height
  const rowTop = y;

  // Col 1 — Move-In Date (vertically centered)
  const dateStr = data.moveInDate || "—";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...detailValueColor);
  doc.text(dateStr, tableX + cellPad, rowTop + rowH / 2 + 3);

  // Col 2 — Deal Details (stacked)
  let detailY = rowTop + cellPad + lineH - 2;
  for (const d of details) {
    // Label
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...detailLabelColor);
    const labelText = d.label;
    doc.text(labelText, col2X + cellPad, detailY);
    const labelW = doc.getTextWidth(labelText + " ");

    // Value
    doc.setFont("helvetica", d.bold ? "bold" : "normal");
    doc.setFontSize(9);
    doc.setTextColor(...detailValueColor);

    if (d.wrap) {
      const wrapped = doc.splitTextToSize(d.value, detailMaxW - labelW);
      for (let i = 0; i < wrapped.length; i++) {
        doc.text(wrapped[i], col2X + cellPad + labelW, detailY + i * lineH);
      }
      detailY += lineH * wrapped.length;
    } else {
      doc.text(d.value, col2X + cellPad + labelW, detailY);
      detailY += lineH;
    }
  }

  // Col 3 — Amount (vertically centered, right-aligned, bold)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...detailValueColor);
  doc.text(fmt(data.commissionAmount), col3X + col3W - cellPad, rowTop + rowH / 2 + 3, { align: "right" });

  // Column borders in data row
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.5);
  doc.line(col2X, rowTop, col2X, rowTop + rowH);
  doc.line(col3X, rowTop, col3X, rowTop + rowH);

  // Bottom border of data row
  y = rowTop + rowH;
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(1);
  doc.line(tableX, y, tableX + CW, y);

  // Left and right outer borders for the entire table
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(1);
  const tableTop = rowTop - headerH;
  doc.line(tableX, tableTop, tableX, y);           // left
  doc.line(tableX + CW, tableTop, tableX + CW, y); // right

  // -- Subtotal row --
  const subtotalH = 24;
  const SUBTOTAL_BG: RGB = [245, 245, 245]; // #F5F5F5
  doc.setFillColor(...SUBTOTAL_BG);
  doc.rect(tableX, y, CW, subtotalH, "F");
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.5);
  doc.line(tableX, y + subtotalH, tableX + CW, y + subtotalH);
  doc.line(tableX, y, tableX, y + subtotalH);
  doc.line(tableX + CW, y, tableX + CW, y + subtotalH);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...LABEL);
  doc.text("Subtotal", col3X - cellPad, y + subtotalH / 2 + 3, { align: "right" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...detailValueColor);
  doc.text(fmt(data.commissionAmount), col3X + col3W - cellPad, y + subtotalH / 2 + 3, { align: "right" });

  y += subtotalH + 12;

  // ── BALANCE DUE FOOTER ────────────────────────────────────

  // Dashed separator line
  doc.setDrawColor(...LABEL);
  doc.setLineWidth(0.5);
  doc.setLineDashPattern([3, 3], 0);
  doc.line(tableX, y, tableX + CW, y);
  doc.setLineDashPattern([], 0); // reset

  y += 22;

  // Balance Due row
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...BLACK);
  doc.text("BALANCE DUE:", col3X - cellPad, y, { align: "right" });
  doc.setFontSize(14);
  doc.text(fmt(data.commissionAmount), col3X + col3W - cellPad, y, { align: "right" });

  y += 12;

  // Thin line under balance
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(1);
  doc.line(col3X - cellPad - doc.getTextWidth("BALANCE DUE:  "), y, tableX + CW, y);

  y += 30;

  // ── NOTES ─────────────────────────────────────────────────

  if (data.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...LABEL);
    doc.text("NOTES", ML, y);
    y += 13;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...DARK);
    const noteLines = doc.splitTextToSize(data.notes, CW);
    for (const line of noteLines) {
      doc.text(line, ML, y);
      y += 12;
    }
    y += 12;
  }

  // ── PAYMENT INSTRUCTIONS ──────────────────────────────────

  const pi = data.paymentInstructions;
  const hasPayment = pi && pi.enabled !== false && (
    pi.achBankName || pi.achAccountNumber ||
    pi.wireBankName || pi.wireAccountNumber ||
    pi.checkPayableTo || pi.otherInstructions
  );

  if (hasPayment) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...ACCENT);
    doc.text("Payment Instructions", ML, y);
    y += 5;
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(0.5);
    doc.line(ML, y, ML + 110, y);
    y += 14;

    const piLabelStyle = () => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...LABEL);
    };
    const piValueStyle = () => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...DARK);
    };

    // ACH section
    if (pi.achBankName || pi.achAccountNumber) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...BLACK);
      doc.text("ACH", ML, y);
      y += 12;

      if (pi.achBankName) {
        piLabelStyle();
        doc.text("Bank Name: ", ML + 10, y);
        piValueStyle();
        doc.text(pi.achBankName, ML + 10 + doc.getTextWidth("Bank Name:  "), y);
        y += 11;
      }
      if (pi.achAccountName) {
        piLabelStyle();
        doc.text("Account Name: ", ML + 10, y);
        piValueStyle();
        doc.text(pi.achAccountName, ML + 10 + doc.getTextWidth("Account Name:  "), y);
        y += 11;
      }
      if (pi.achAccountNumber) {
        piLabelStyle();
        doc.text("Account #: ", ML + 10, y);
        piValueStyle();
        doc.text(pi.achAccountNumber, ML + 10 + doc.getTextWidth("Account #:  "), y);
        y += 11;
      }
      if (pi.achRoutingNumber) {
        piLabelStyle();
        doc.text("Routing #: ", ML + 10, y);
        piValueStyle();
        doc.text(pi.achRoutingNumber, ML + 10 + doc.getTextWidth("Routing #:  "), y);
        y += 11;
      }
      y += 6;
    }

    // Wire section
    if (pi.wireBankName || pi.wireAccountNumber) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...BLACK);
      doc.text("Wire", ML, y);
      y += 12;

      if (pi.wireBankName) {
        piLabelStyle();
        doc.text("Bank Name: ", ML + 10, y);
        piValueStyle();
        doc.text(pi.wireBankName, ML + 10 + doc.getTextWidth("Bank Name:  "), y);
        y += 11;
      }
      if (pi.wireAccountName) {
        piLabelStyle();
        doc.text("Account Name: ", ML + 10, y);
        piValueStyle();
        doc.text(pi.wireAccountName, ML + 10 + doc.getTextWidth("Account Name:  "), y);
        y += 11;
      }
      if (pi.wireAccountNumber) {
        piLabelStyle();
        doc.text("Account #: ", ML + 10, y);
        piValueStyle();
        doc.text(pi.wireAccountNumber, ML + 10 + doc.getTextWidth("Account #:  "), y);
        y += 11;
      }
      if (pi.wireRoutingNumber) {
        piLabelStyle();
        doc.text("Routing #: ", ML + 10, y);
        piValueStyle();
        doc.text(pi.wireRoutingNumber, ML + 10 + doc.getTextWidth("Routing #:  "), y);
        y += 11;
      }
      y += 6;
    }

    // Check section
    if (pi.checkPayableTo) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...BLACK);
      doc.text("Check", ML, y);
      y += 12;
      piLabelStyle();
      doc.text("Make payable to: ", ML + 10, y);
      piValueStyle();
      doc.text(pi.checkPayableTo, ML + 10 + doc.getTextWidth("Make payable to:  "), y);
      y += 14;
    }

    // Other instructions
    if (pi.otherInstructions) {
      piValueStyle();
      const otherLines = doc.splitTextToSize(pi.otherInstructions, CW - 20);
      for (const line of otherLines) {
        doc.text(line, ML + 10, y);
        y += 11;
      }
    }
  }

  // ── PAGE FOOTER ───────────────────────────────────────────

  const footerY = H - 35;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...FOOTER_GRAY);

  const yearStr = data.year || String(new Date().getFullYear());
  doc.text(yearStr, ML, footerY);
  doc.text("Generated by VettdRE", W - MR, footerY, { align: "right" });

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

    // Filename: INV-2026-0005_2064-Cropsey-Ave-Apt-4G.pdf
    const addrPart = sanitizeFilename(inv.propertyAddress);
    const filename = `${inv.invoiceNr}_${addrPart}.pdf`;

    zip.file(filename, pdfBytes);
  }

  return zip.generateAsync({ type: "blob" });
}
