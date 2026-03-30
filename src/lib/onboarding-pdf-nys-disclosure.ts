// ============================================================
// NYS Agency Disclosure Form (DOS 1736) — PDF Generator
// ============================================================

import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";

const PAGE_W = 612;
const PAGE_H = 792;
const ML = 60;
const MR = 60;
const CW = PAGE_W - ML - MR;
const LH = 15;

function wrap(page: PDFPage, font: PDFFont, text: string, x: number, y: number, maxW: number, size: number, lh: number): number {
  const words = text.split(" ");
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxW && line) {
      page.drawText(line, { x, y, size, font, color: rgb(0.13, 0.13, 0.13) });
      y -= lh;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) { page.drawText(line, { x, y, size, font, color: rgb(0.13, 0.13, 0.13) }); y -= lh; }
  return y;
}

function header(page: PDFPage, fontBold: PDFFont, title: string, y: number): number {
  page.drawText(title, { x: ML, y, size: 11, font: fontBold, color: rgb(0.08, 0.15, 0.45) });
  return y - LH - 2;
}

function sigLine(page: PDFPage, font: PDFFont, label: string, y: number): number {
  const lw = font.widthOfTextAtSize(label, 10);
  page.drawText(label, { x: ML, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
  page.drawLine({ start: { x: ML + lw + 4, y: y - 2 }, end: { x: ML + CW, y: y - 2 }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
  return y - LH - 6;
}

export async function generateNysDisclosurePdf(params: {
  brokerageName: string;
  agentFullName: string;
  agentLicense: string;
  clientFirstName: string;
  clientLastName: string;
}): Promise<Uint8Array> {
  const { brokerageName, agentFullName, agentLicense, clientFirstName, clientLastName } = params;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const clientName = `${clientFirstName} ${clientLastName}`;

  // ── Page 1 ──────────────────────────────────────────────
  const p1 = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - 55;

  const t1 = "NEW YORK STATE DISCLOSURE FORM FOR BUYER AND SELLER";
  p1.drawText(t1, { x: (PAGE_W - fontBold.widthOfTextAtSize(t1, 14)) / 2, y, size: 14, font: fontBold, color: rgb(0.08, 0.15, 0.45) });
  y -= 18;
  const t2 = "(Required by New York Real Property Law § 443)";
  p1.drawText(t2, { x: (PAGE_W - font.widthOfTextAtSize(t2, 9)) / 2, y, size: 9, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 28;

  y = wrap(p1, font, "This form is provided to inform prospective buyers and sellers of residential real property of the role of real estate licensees in a real estate transaction.", ML, y, CW, 10, LH);
  y -= 8;

  y = header(p1, fontBold, "SELLER'S AGENT", y);
  y = wrap(p1, font, "A seller's agent acts solely on behalf of the seller. The seller's agent negotiates the sale price and other terms on behalf of the seller. A seller can authorize a seller's agent to act as a dual agent (see below). A seller's agent has fiduciary duties to the seller, including reasonable care, undivided loyalty, confidentiality, full disclosure, obedience, and duty to account.", ML, y, CW, 10, LH);
  y -= 10;

  y = header(p1, fontBold, "BUYER'S AGENT", y);
  y = wrap(p1, font, "A buyer's agent acts solely on behalf of the buyer. The buyer's agent negotiates the purchase price and other terms on behalf of the buyer. A buyer can authorize a buyer's agent to act as a dual agent (see below). A buyer's agent has fiduciary duties to the buyer, including reasonable care, undivided loyalty, confidentiality, full disclosure, obedience, and duty to account.", ML, y, CW, 10, LH);
  y -= 10;

  y = header(p1, fontBold, "BROKER'S AGENT", y);
  y = wrap(p1, font, "A broker's agent is an agent retained by another agent (the listing or buyer's agent) to assist in the transaction. A broker's agent does not have a direct relationship with the buyer or seller and instead works for the agent who retained them. The broker's agent has fiduciary duties to the agent who retained them.", ML, y, CW, 10, LH);
  y -= 10;

  y = header(p1, fontBold, "DUAL AGENT", y);
  y = wrap(p1, font, "A dual agent represents both the buyer and seller in the same transaction. The dual agent must obtain the informed consent of both parties in writing. A dual agent has fiduciary duties to both the buyer and seller, but cannot advocate exclusively for one party against the other. The dual agent must explain to both parties the consequences and risks of dual agency before obtaining consent.", ML, y, CW, 10, LH);
  y -= 10;

  y = header(p1, fontBold, "DUAL AGENT WITH DESIGNATED SALES AGENTS", y);
  y = wrap(p1, font, "If the buyer and seller provide written informed consent, the principals of the brokerage firm may designate separate sales agents to represent the buyer and seller exclusively in the same transaction. The designated agents each have fiduciary duties to their respective clients.", ML, y, CW, 10, LH);

  p1.drawText("Page 1 of 2", { x: PAGE_W - MR - font.widthOfTextAtSize("Page 1 of 2", 8), y: 30, size: 8, font, color: rgb(0.5, 0.5, 0.5) });

  // ── Page 2 ──────────────────────────────────────────────
  const p2 = doc.addPage([PAGE_W, PAGE_H]);
  y = PAGE_H - 55;

  y = header(p2, fontBold, "DISCLOSURE AND ACKNOWLEDGMENT", y);
  y -= 4;

  y = wrap(p2, font, `This disclosure is made by ${brokerageName}, licensed real estate broker, and its agent ${agentFullName} (License #${agentLicense}).`, ML, y, CW, 10, LH);
  y -= 6;

  y = wrap(p2, font, `The above-named licensee(s) will be acting as agent for the following party in this transaction:`, ML, y, CW, 10, LH);
  y -= 4;

  const roles = [
    "☐  Seller's Agent",
    "☐  Buyer's Agent",
    "☒  Tenant's Agent (Tenant Representation)",
    "☐  Dual Agent",
    "☐  Dual Agent with Designated Sales Agents",
  ];
  for (const role of roles) {
    p2.drawText(role, { x: ML + 20, y, size: 10, font, color: rgb(0.13, 0.13, 0.13) });
    y -= LH;
  }
  y -= 10;

  y = wrap(p2, font, "I acknowledge receipt of a copy of this disclosure form. I understand the role of the licensee(s) named above in connection with any transaction I may enter into.", ML, y, CW, 10, LH);
  y -= 20;

  // Client signature block
  p2.drawText("CLIENT", { x: ML, y, size: 9, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
  y -= LH + 4;
  y = sigLine(p2, font, "Printed Name:", y);
  y = sigLine(p2, font, "Signature:", y);
  y = sigLine(p2, font, "Date:", y);
  y -= 16;

  // Agent signature block
  p2.drawText("AGENT", { x: ML, y, size: 9, font: fontBold, color: rgb(0.3, 0.3, 0.3) });
  y -= LH + 4;
  p2.drawText(`${agentFullName}, License #${agentLicense}`, { x: ML + 90, y: y + LH + 4, size: 10, font, color: rgb(0.3, 0.3, 0.3) });
  y = sigLine(p2, font, "Signature:", y);
  y = sigLine(p2, font, "Date:", y);

  p2.drawText("Page 2 of 2", { x: PAGE_W - MR - font.widthOfTextAtSize("Page 2 of 2", 8), y: 30, size: 8, font, color: rgb(0.5, 0.5, 0.5) });

  return doc.save();
}
