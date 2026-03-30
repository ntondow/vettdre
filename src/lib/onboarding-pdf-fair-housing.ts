// ============================================================
// Fair Housing Notice — PDF Generator
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

export async function generateFairHousingPdf(params: {
  brokerageName: string;
  agentFullName: string;
}): Promise<Uint8Array> {
  const { brokerageName, agentFullName } = params;
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const p1 = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - 55;

  // Title
  const title = "FAIR HOUSING NOTICE";
  p1.drawText(title, { x: (PAGE_W - fontBold.widthOfTextAtSize(title, 16)) / 2, y, size: 16, font: fontBold, color: rgb(0.08, 0.15, 0.45) });
  y -= 30;

  const subtitle = "Equal Opportunity in Housing";
  p1.drawText(subtitle, { x: (PAGE_W - font.widthOfTextAtSize(subtitle, 10)) / 2, y, size: 10, font, color: rgb(0.4, 0.4, 0.4) });
  y -= 24;

  p1.drawLine({ start: { x: ML, y }, end: { x: ML + CW, y }, thickness: 0.75, color: rgb(0.7, 0.7, 0.7) });
  y -= 20;

  y = wrap(p1, font, `${brokerageName} and its licensed agent ${agentFullName} are committed to providing equal professional service without regard to any protected class under applicable federal, state, and local fair housing laws.`, ML, y, CW, 10, LH);
  y -= 12;

  y = header(p1, fontBold, "FEDERAL FAIR HOUSING ACT", y);
  y = wrap(p1, font, "It is illegal to discriminate in the sale, rental, or financing of housing based on race, color, national origin, religion, sex (including gender identity and sexual orientation), familial status, or disability.", ML, y, CW, 10, LH);
  y -= 10;

  y = header(p1, fontBold, "NEW YORK STATE HUMAN RIGHTS LAW", y);
  y = wrap(p1, font, "In addition to the federal protections, New York State prohibits discrimination based on creed, age, marital status, military status, domestic violence victim status, arrest or conviction record, predisposing genetic characteristics, and lawful source of income.", ML, y, CW, 10, LH);
  y -= 10;

  y = header(p1, fontBold, "NEW YORK CITY HUMAN RIGHTS LAW", y);
  y = wrap(p1, font, "New York City provides the broadest protections, additionally prohibiting discrimination based on citizenship status, partnership status, lawful occupation, and any lawful source of income including housing vouchers (Section 8) and other rental assistance programs.", ML, y, CW, 10, LH);
  y -= 14;

  y = header(p1, fontBold, "OUR COMMITMENT", y);
  const commitments = [
    "We will show and make available all listed properties to all prospective tenants and buyers without discrimination.",
    "We will provide equal professional service and information to all clients regardless of protected class.",
    "We will not steer or direct clients toward or away from any neighborhood or building based on protected characteristics.",
    "We will not make any representations about the racial, ethnic, or religious composition of any neighborhood.",
    "We will report any suspected discrimination to the appropriate fair housing enforcement agency.",
  ];
  for (const item of commitments) {
    p1.drawText("•", { x: ML + 10, y, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
    y = wrap(p1, font, item, ML + 24, y, CW - 24, 10, LH);
    y -= 4;
  }
  y -= 12;

  y = header(p1, fontBold, "ACKNOWLEDGMENT", y);
  y = wrap(p1, font, "I acknowledge that I have received and read this Fair Housing Notice. I understand that discrimination in housing is illegal and that I have the right to file a complaint with HUD (1-800-669-9777) or the NYC Commission on Human Rights (311) if I believe I have been discriminated against.", ML, y, CW, 10, LH);
  y -= 20;

  // Signature block
  y = sigLine(p1, font, "Client Signature:", y);
  y = sigLine(p1, font, "Date:", y);

  // Footer
  p1.drawText(`${brokerageName} — Equal Housing Opportunity`, {
    x: (PAGE_W - font.widthOfTextAtSize(`${brokerageName} — Equal Housing Opportunity`, 8)) / 2,
    y: 30, size: 8, font, color: rgb(0.5, 0.5, 0.5),
  });

  return doc.save();
}
