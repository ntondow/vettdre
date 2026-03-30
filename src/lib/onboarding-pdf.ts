// ============================================================
// Client Onboarding — Tenant Representation Agreement PDF
// Uses pdf-lib (pure JS, no DOM — safe for server-side generation)
// ============================================================

import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";

// ── Types ────────────────────────────────────────────────────

interface TenantRepAgreementParams {
  brokerageName: string;
  agentFullName: string;
  agentLicense: string;
  clientFirstName: string;
  clientLastName: string;
  commissionAmount: number;
  commissionType: "percentage" | "flat";
  termDays: number;
}

// ── Constants ────────────────────────────────────────────────

const PAGE_W = 612; // letter width
const PAGE_H = 792; // letter height
const ML = 60; // left margin
const MR = 60; // right margin
const CW = PAGE_W - ML - MR; // content width
const LINE_HEIGHT = 16;
const PARA_SPACING = 10;

// ── Helpers ──────────────────────────────────────────────────

function drawWrappedText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  startY: number,
  maxWidth: number,
  fontSize: number,
  lineHeight: number,
): number {
  const words = text.split(" ");
  let line = "";
  let y = startY;

  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    const testWidth = font.widthOfTextAtSize(testLine, fontSize);
    if (testWidth > maxWidth && line) {
      page.drawText(line, { x, y, size: fontSize, font, color: rgb(0.13, 0.13, 0.13) });
      y -= lineHeight;
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) {
    page.drawText(line, { x, y, size: fontSize, font, color: rgb(0.13, 0.13, 0.13) });
    y -= lineHeight;
  }

  return y;
}

function drawSectionHeader(
  page: PDFPage,
  fontBold: PDFFont,
  title: string,
  y: number,
): number {
  page.drawText(title, { x: ML, y, size: 11, font: fontBold, color: rgb(0.1, 0.1, 0.1) });
  return y - LINE_HEIGHT - 4;
}

function drawBlankLine(page: PDFPage, font: PDFFont, label: string, y: number): number {
  const labelWidth = font.widthOfTextAtSize(label, 10);
  page.drawText(label, { x: ML, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
  // Draw underline
  const lineStart = ML + labelWidth + 4;
  const lineEnd = ML + CW;
  page.drawLine({
    start: { x: lineStart, y: y - 2 },
    end: { x: lineEnd, y: y - 2 },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });
  return y - LINE_HEIGHT - 6;
}

// ── Main Generator ───────────────────────────────────────────

export async function generateTenantRepAgreementPdf(
  params: TenantRepAgreementParams,
): Promise<Uint8Array> {
  const {
    brokerageName,
    agentFullName,
    agentLicense,
    clientFirstName,
    clientLastName,
    commissionAmount,
    commissionType,
    termDays,
  } = params;

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const clientFullName = `${clientFirstName} ${clientLastName}`;
  const commissionStr =
    commissionType === "percentage"
      ? `${commissionAmount}%`
      : `$${commissionAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

  // ── Page 1 ──────────────────────────────────────────────

  const page1 = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - 60;

  // Title
  const titleText = "TENANT REPRESENTATION AGREEMENT";
  const titleWidth = fontBold.widthOfTextAtSize(titleText, 16);
  page1.drawText(titleText, {
    x: (PAGE_W - titleWidth) / 2,
    y,
    size: 16,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  y -= 30;

  // Intro
  y = drawWrappedText(page1, font, "This agreement is made between:", ML, y, CW, 10, LINE_HEIGHT);
  y -= PARA_SPACING;

  // Parties
  page1.drawText("Brokerage Firm:", { x: ML, y, size: 10, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
  page1.drawText(brokerageName, { x: ML + 100, y, size: 10, font, color: rgb(0.13, 0.13, 0.13) });
  y -= LINE_HEIGHT;

  page1.drawText("Licensed Agent:", { x: ML, y, size: 10, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
  page1.drawText(`${agentFullName}, License #${agentLicense}`, { x: ML + 100, y, size: 10, font, color: rgb(0.13, 0.13, 0.13) });
  y -= LINE_HEIGHT;

  page1.drawText("Tenant (Client):", { x: ML, y, size: 10, font: fontBold, color: rgb(0.2, 0.2, 0.2) });
  page1.drawText(clientFullName, { x: ML + 100, y, size: 10, font, color: rgb(0.13, 0.13, 0.13) });
  y -= LINE_HEIGHT;

  y = drawBlankLine(page1, font, "Date:", y);
  y -= PARA_SPACING;

  // Horizontal rule
  page1.drawLine({
    start: { x: ML, y },
    end: { x: ML + CW, y },
    thickness: 0.75,
    color: rgb(0.7, 0.7, 0.7),
  });
  y -= 20;

  // Section 1
  y = drawSectionHeader(page1, fontBold, "1. PURPOSE OF AGREEMENT", y);
  y = drawWrappedText(
    page1,
    font,
    `The above-named Brokerage Firm and its Licensed Agent agree to represent ${clientFullName} ("Tenant") in locating suitable residential rental property in the New York City metropolitan area. The Agent will act in the Tenant's best interest, provide market knowledge, coordinate property viewings, and negotiate lease terms on the Tenant's behalf.`,
    ML,
    y,
    CW,
    10,
    LINE_HEIGHT,
  );
  y -= PARA_SPACING * 2;

  // Section 2
  y = drawSectionHeader(page1, fontBold, "2. EXCLUSIVE TENANT REPRESENTATION", y);
  y = drawWrappedText(
    page1,
    font,
    `During the term of this agreement, the Tenant agrees to work exclusively with ${brokerageName} and its Licensed Agent for all rental property searches and lease negotiations. The Tenant shall not engage another broker or agent for the same purpose during this period. If the Tenant independently locates a property during the term, the Brokerage Firm shall still be entitled to the agreed commission.`,
    ML,
    y,
    CW,
    10,
    LINE_HEIGHT,
  );
  y -= PARA_SPACING * 2;

  // Section 3
  y = drawSectionHeader(page1, fontBold, "3. BROKER FEE", y);
  y = drawWrappedText(
    page1,
    font,
    `The Tenant agrees that upon signing a lease for any property procured through or during the term of this agreement, a broker fee of ${commissionStr} ${commissionType === "percentage" ? "of the annual rent" : ""} shall be due and payable. This fee may be paid by the Tenant, the Landlord, or split between both parties as negotiated. The Brokerage Firm will disclose the fee arrangement prior to lease execution.`,
    ML,
    y,
    CW,
    10,
    LINE_HEIGHT,
  );

  // Page number
  page1.drawText("Page 1 of 2", {
    x: PAGE_W - MR - font.widthOfTextAtSize("Page 1 of 2", 8),
    y: 30,
    size: 8,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  // ── Page 2 ──────────────────────────────────────────────

  const page2 = doc.addPage([PAGE_W, PAGE_H]);
  y = PAGE_H - 60;

  // Section 4
  y = drawSectionHeader(page2, fontBold, "4. COMPLIANCE WITH FARE ACT", y);
  y = drawWrappedText(
    page2,
    font,
    "In accordance with the NYC FARE Act (Fair Access to Rental and Equitable treatment), the Tenant acknowledges and affirms:",
    ML,
    y,
    CW,
    10,
    LINE_HEIGHT,
  );
  y -= 6;

  const bullets = [
    "The Tenant has been informed of who is responsible for paying the broker fee before any property viewings.",
    "The Tenant understands the fee structure and has agreed to the terms voluntarily.",
    "The Tenant has received all required disclosures regarding agency relationships and fair housing protections.",
  ];

  for (const bullet of bullets) {
    page2.drawText("\u2022", { x: ML + 10, y, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
    y = drawWrappedText(page2, font, bullet, ML + 24, y, CW - 24, 10, LINE_HEIGHT);
    y -= 4;
  }
  y -= PARA_SPACING;

  // Section 5
  y = drawSectionHeader(page2, fontBold, "5. TERM OF AGREEMENT", y);
  y = drawWrappedText(
    page2,
    font,
    `This agreement shall be effective from the date of signing and shall remain in effect for a period of ${termDays} days, unless terminated earlier in accordance with Section 6 below.`,
    ML,
    y,
    CW,
    10,
    LINE_HEIGHT,
  );
  y -= PARA_SPACING * 2;

  // Section 6
  y = drawSectionHeader(page2, fontBold, "6. TERMINATION", y);
  y = drawWrappedText(
    page2,
    font,
    "Either party may terminate this agreement by providing written notice to the other party. Upon termination, the Tenant shall remain obligated to pay the broker fee for any property viewed during the term of the agreement if a lease is executed within 90 days of termination.",
    ML,
    y,
    CW,
    10,
    LINE_HEIGHT,
  );
  y -= PARA_SPACING * 2;

  // Section 7 — Signatures
  y = drawSectionHeader(page2, fontBold, "7. SIGNATURES", y);
  y -= 6;

  // Tenant signature block
  page2.drawText("TENANT", { x: ML, y, size: 9, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
  y -= LINE_HEIGHT + 4;

  y = drawBlankLine(page2, font, "Printed Name:", y);
  y = drawBlankLine(page2, font, "Signature:", y);
  y = drawBlankLine(page2, font, "Date:", y);

  y -= PARA_SPACING * 2;

  // Agent signature block
  page2.drawText("AGENT", { x: ML, y, size: 9, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
  y -= LINE_HEIGHT + 4;

  y = drawBlankLine(page2, font, "Printed Name:", y);
  y = drawBlankLine(page2, font, "Signature:", y);
  y = drawBlankLine(page2, font, "Date:", y);

  // Page number
  page2.drawText("Page 2 of 2", {
    x: PAGE_W - MR - font.widthOfTextAtSize("Page 2 of 2", 8),
    y: 30,
    size: 8,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  return doc.save();
}
