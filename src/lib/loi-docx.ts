// ============================================================
// LOI DOCX Generator — editable Word document for LOI
// Uses docx package (Packer.toBlob for client-side download)
// ============================================================

import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Packer,
  SectionType,
  TabStopPosition,
  TabStopType,
} from "docx";
import type { LoiData } from "./loi-template";
import { generateLoiContent } from "./loi-template";

const fmt = (n: number) => `$${n.toLocaleString()}`;
const BLUE = "1E40AF";
const DARK = "0F172A";
const GRAY = "64748B";

export async function generateLoiDocx(data: LoiData) {
  const dateStr = data.date || new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const sections = generateLoiContent(data);

  const children: Paragraph[] = [];

  // Title
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [
        new TextRun({ text: "LETTER OF INTENT", bold: true, size: 32, color: BLUE, font: "Arial" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({ text: "NON-BINDING", bold: true, size: 20, color: "D97706", font: "Arial" }),
      ],
    }),
  );

  // Date
  children.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({ text: `Date: ${dateStr}`, size: 22, color: GRAY, font: "Arial" }),
      ],
    }),
  );

  // To
  children.push(
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({ text: "To: ", bold: true, size: 22, color: DARK, font: "Arial" }),
        new TextRun({ text: data.ownerName, size: 22, color: DARK, font: "Arial" }),
      ],
    }),
  );
  if (data.ownerAddress) {
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        indent: { left: 360 },
        children: [
          new TextRun({ text: data.ownerAddress, size: 22, color: GRAY, font: "Arial" }),
        ],
      }),
    );
  }

  // From
  children.push(
    new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({ text: "From: ", bold: true, size: 22, color: DARK, font: "Arial" }),
        new TextRun({ text: data.buyerEntity, size: 22, color: DARK, font: "Arial" }),
      ],
    }),
  );
  if (data.buyerAddress) {
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        indent: { left: 360 },
        children: [
          new TextRun({ text: data.buyerAddress, size: 22, color: GRAY, font: "Arial" }),
        ],
      }),
    );
  }

  // Re line
  children.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({ text: "Re: ", bold: true, size: 22, color: DARK, font: "Arial" }),
        new TextRun({ text: `Letter of Intent to Purchase — ${data.propertyAddress}`, size: 22, color: DARK, font: "Arial" }),
      ],
    }),
  );

  // Divider
  children.push(
    new Paragraph({
      spacing: { after: 200 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "CBD5E1" } },
      children: [],
    }),
  );

  // Introduction
  children.push(
    new Paragraph({
      spacing: { after: 200 },
      children: [
        new TextRun({
          text: `${data.buyerEntity} ("Buyer") hereby submits this non-binding Letter of Intent to purchase the property described below from ${data.ownerName} ("Seller") on the following terms and conditions:`,
          size: 22,
          color: DARK,
          font: "Arial",
        }),
      ],
    }),
  );

  // Sections
  sections.forEach((section, i) => {
    children.push(
      new Paragraph({
        spacing: { before: 160, after: 80 },
        children: [
          new TextRun({ text: `${i + 1}. ${section.title}`, bold: true, size: 24, color: BLUE, font: "Arial" }),
        ],
      }),
      new Paragraph({
        spacing: { after: 160 },
        children: [
          new TextRun({ text: section.body, size: 21, color: DARK, font: "Arial" }),
        ],
      }),
    );
  });

  // Closing
  children.push(
    new Paragraph({
      spacing: { before: 200, after: 300 },
      children: [
        new TextRun({
          text: "We look forward to your favorable response and to working together toward a mutually beneficial transaction.",
          size: 22,
          color: DARK,
          font: "Arial",
        }),
      ],
    }),
  );

  // Buyer signature block
  children.push(
    new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: "Sincerely,", size: 22, color: DARK, font: "Arial" })],
    }),
    new Paragraph({ spacing: { after: 20 }, children: [] }),
    new Paragraph({ spacing: { after: 20 }, children: [] }),
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: "____________________________", size: 22, color: DARK, font: "Arial" })],
    }),
    new Paragraph({
      spacing: { after: 20 },
      children: [new TextRun({ text: data.buyerEntity, bold: true, size: 22, color: DARK, font: "Arial" })],
    }),
  );

  if (data.brokerName) {
    children.push(new Paragraph({
      spacing: { after: 20 },
      children: [new TextRun({ text: data.brokerName, size: 22, color: DARK, font: "Arial" })],
    }));
  }
  if (data.brokerage) {
    children.push(new Paragraph({
      spacing: { after: 20 },
      children: [new TextRun({ text: data.brokerage, size: 22, color: GRAY, font: "Arial" })],
    }));
  }
  if (data.brokerLicense) {
    children.push(new Paragraph({
      spacing: { after: 20 },
      children: [new TextRun({ text: `License #${data.brokerLicense}`, size: 20, color: GRAY, font: "Arial" })],
    }));
  }
  if (data.brokerEmail) {
    children.push(new Paragraph({
      spacing: { after: 20 },
      children: [new TextRun({ text: data.brokerEmail, size: 22, color: GRAY, font: "Arial" })],
    }));
  }
  if (data.brokerPhone) {
    children.push(new Paragraph({
      spacing: { after: 20 },
      children: [new TextRun({ text: data.brokerPhone, size: 22, color: GRAY, font: "Arial" })],
    }));
  }

  // Seller signature block
  children.push(
    new Paragraph({ spacing: { before: 300, after: 20 }, children: [] }),
    new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun({ text: "ACKNOWLEDGED AND AGREED:", bold: true, size: 22, color: DARK, font: "Arial" })],
    }),
    new Paragraph({ spacing: { after: 20 }, children: [] }),
    new Paragraph({ spacing: { after: 20 }, children: [] }),
    new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: "____________________________", size: 22, color: DARK, font: "Arial" })],
    }),
    new Paragraph({
      spacing: { after: 20 },
      children: [new TextRun({ text: `${data.ownerName} (Seller)`, size: 22, color: DARK, font: "Arial" })],
    }),
    new Paragraph({ spacing: { after: 20 }, children: [] }),
    new Paragraph({
      children: [new TextRun({ text: "Date: ____________________", size: 22, color: DARK, font: "Arial" })],
    }),
  );

  const docObj = new Document({
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(docObj);
  const filename = `LOI-${(data.propertyAddress || "property").replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-")}.docx`;

  // Trigger download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
