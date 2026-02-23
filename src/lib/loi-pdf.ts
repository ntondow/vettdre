// ============================================================
// LOI PDF Generator — professional Letter of Intent PDF
// Uses jsPDF with same color/layout patterns as deal-pdf.ts
// ============================================================

import jsPDF from "jspdf";
import type { LoiData } from "./loi-template";
import { generateLoiContent } from "./loi-template";

type RGB = [number, number, number];
const BLUE: RGB = [30, 64, 175];
const DARK: RGB = [15, 23, 42];
const GRAY: RGB = [100, 116, 139];
const LIGHT_GRAY: RGB = [226, 232, 240];
const WHITE: RGB = [255, 255, 255];
const AMBER: RGB = [217, 119, 6];

const fmt = (n: number) => `$${n.toLocaleString()}`;

export function generateLoiPdf(data: LoiData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const ML = 50;
  const MR = 50;
  const CW = W - ML - MR;
  let y = 0;
  let page = 1;

  const dateStr = data.date || new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const sections = generateLoiContent(data);

  function addFooter() {
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text(`Letter of Intent — ${data.propertyAddress} — Page ${page}`, ML, H - 25);
    doc.text("NON-BINDING", W - MR, H - 25, { align: "right" });
  }

  function checkPageBreak(needed: number) {
    if (y + needed > H - 60) {
      addFooter();
      doc.addPage();
      page++;
      y = 50;
    }
  }

  // ============================================================
  // Header bar
  // ============================================================
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, W, 55, "F");
  doc.setTextColor(...WHITE);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Letter of Intent", ML, 35);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("VettdRE", W - MR, 35, { align: "right" });

  // NON-BINDING badge
  y = 75;
  doc.setFillColor(...AMBER);
  const badgeText = "NON-BINDING";
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  const badgeWidth = doc.getTextWidth(badgeText) + 16;
  doc.roundedRect(ML, y - 12, badgeWidth, 18, 3, 3, "F");
  doc.setTextColor(...WHITE);
  doc.text(badgeText, ML + 8, y + 1);

  // Date
  y += 25;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text(dateStr, ML, y);

  // ============================================================
  // Parties
  // ============================================================
  y += 25;
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.text("To:", ML, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.ownerName, ML + 25, y);
  if (data.ownerAddress) {
    y += 14;
    doc.setTextColor(...GRAY);
    const addrLines = doc.splitTextToSize(data.ownerAddress, CW - 25);
    doc.text(addrLines, ML + 25, y);
    y += addrLines.length * 14;
  } else {
    y += 14;
  }

  y += 6;
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.text("From:", ML, y);
  doc.setFont("helvetica", "normal");
  doc.text(data.buyerEntity, ML + 38, y);
  if (data.buyerAddress) {
    y += 14;
    doc.setTextColor(...GRAY);
    const buyerLines = doc.splitTextToSize(data.buyerAddress, CW - 38);
    doc.text(buyerLines, ML + 38, y);
    y += buyerLines.length * 14;
  } else {
    y += 14;
  }

  y += 6;
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.text("Re:", ML, y);
  doc.setFont("helvetica", "normal");
  doc.text(`Letter of Intent to Purchase — ${data.propertyAddress}`, ML + 25, y);

  // ============================================================
  // Introduction paragraph
  // ============================================================
  y += 25;
  doc.setDrawColor(...LIGHT_GRAY);
  doc.setLineWidth(0.5);
  doc.line(ML, y, W - MR, y);
  y += 18;

  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "normal");
  const intro = `${data.buyerEntity} ("Buyer") hereby submits this non-binding Letter of Intent to purchase the property described below from ${data.ownerName} ("Seller") on the following terms and conditions:`;
  const introLines = doc.splitTextToSize(intro, CW);
  doc.text(introLines, ML, y);
  y += introLines.length * 14 + 10;

  // ============================================================
  // LOI Sections
  // ============================================================
  sections.forEach((section, i) => {
    checkPageBreak(80);

    // Section number + title
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...BLUE);
    doc.text(`${i + 1}. ${section.title}`, ML, y);
    y += 16;

    // Section body
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK);
    const bodyLines = doc.splitTextToSize(section.body, CW);

    // Check if the body fits on this page
    const bodyHeight = bodyLines.length * 13;
    checkPageBreak(bodyHeight);

    doc.text(bodyLines, ML, y);
    y += bodyHeight + 12;
  });

  // ============================================================
  // Closing paragraph
  // ============================================================
  checkPageBreak(100);
  y += 5;
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "normal");
  const closing = "We look forward to your favorable response and to working together toward a mutually beneficial transaction.";
  const closingLines = doc.splitTextToSize(closing, CW);
  doc.text(closingLines, ML, y);
  y += closingLines.length * 14 + 20;

  // ============================================================
  // Signature blocks
  // ============================================================
  checkPageBreak(180);

  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text("Sincerely,", ML, y);
  y += 40;

  doc.setDrawColor(...DARK);
  doc.setLineWidth(0.75);
  doc.line(ML, y, ML + 200, y);
  y += 14;

  doc.setFont("helvetica", "bold");
  doc.text(data.buyerEntity, ML, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  if (data.brokerName) { doc.text(data.brokerName, ML, y); y += 14; }
  if (data.brokerage) { doc.setTextColor(...GRAY); doc.text(data.brokerage, ML, y); y += 14; }
  if (data.brokerLicense) { doc.setTextColor(...GRAY); doc.text(`License #${data.brokerLicense}`, ML, y); y += 14; }
  if (data.brokerEmail) { doc.setTextColor(...GRAY); doc.text(data.brokerEmail, ML, y); y += 14; }
  if (data.brokerPhone) { doc.setTextColor(...GRAY); doc.text(data.brokerPhone, ML, y); y += 14; }

  y += 30;
  checkPageBreak(100);

  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.text("ACKNOWLEDGED AND AGREED:", ML, y);
  y += 40;

  doc.setDrawColor(...DARK);
  doc.line(ML, y, ML + 200, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.text(`${data.ownerName} (Seller)`, ML, y);
  y += 25;
  doc.text("Date: ____________________", ML, y);

  addFooter();

  // ============================================================
  // Return download + base64 functions
  // ============================================================
  const filename = `LOI-${(data.propertyAddress || "property").replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-")}.pdf`;

  return {
    download() {
      doc.save(filename);
    },
    base64(): string {
      return doc.output("datauristring").split(",")[1];
    },
  };
}
