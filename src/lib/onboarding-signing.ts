// ============================================================
// Client Onboarding — Signature Embedding & Audit Footer
// Uses pdf-lib to modify existing PDFs with signatures
// ============================================================

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { TemplateFieldDefinition } from "@/lib/onboarding-types";

// ── Constants ────────────────────────────────────────────────

const ML = 60;
const PAGE_W = 612;
const MR = 60;
const CW = PAGE_W - ML - MR;

// Signature placement coordinates (page 2 of the Tenant Rep Agreement)
// These correspond to the blank lines drawn in onboarding-pdf.ts Section 7
const SIGNATURE_POSITIONS = {
  tenant: {
    nameY: 370, // "Printed Name:" line area
    signatureY: 344, // "Signature:" line area
    dateY: 318, // "Date:" line area
  },
  agent: {
    nameY: 258, // "Printed Name:" line area
    signatureY: 232, // "Signature:" line area
    dateY: 206, // "Date:" line area
  },
} as const;

const SIGNATURE_IMG_WIDTH = 180;
const SIGNATURE_IMG_HEIGHT = 50;
const LABEL_OFFSET_X = 90; // offset past the label ("Printed Name:", "Signature:", "Date:")

// ── Embed Signature in PDF ───────────────────────────────────

export async function embedSignatureInPdf(params: {
  pdfBytes: Uint8Array;
  signatureImageBase64: string;
  signerName: string;
  signDate: string;
  signatureType: "tenant" | "agent";
}): Promise<Uint8Array> {
  const { pdfBytes, signatureImageBase64, signerName, signDate, signatureType } = params;

  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  // Get page 2 (index 1) — signatures are on the second page
  const pages = doc.getPages();
  if (pages.length < 2) {
    throw new Error("PDF must have at least 2 pages for signature embedding");
  }
  const page = pages[1];

  const pos = SIGNATURE_POSITIONS[signatureType];

  // 1. Draw the printed name
  page.drawText(signerName, {
    x: ML + LABEL_OFFSET_X,
    y: pos.nameY,
    size: 11,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });

  // 2. Embed the signature image
  if (signatureImageBase64) {
    try {
      // Strip data URL prefix if present
      const base64Data = signatureImageBase64.replace(/^data:image\/\w+;base64,/, "");
      const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

      // Try PNG first, fall back to JPEG
      let image;
      try {
        image = await doc.embedPng(imageBytes);
      } catch {
        try {
          image = await doc.embedJpg(imageBytes);
        } catch {
          // If neither works, skip the image and just draw the name as signature
          page.drawText(signerName, {
            x: ML + LABEL_OFFSET_X,
            y: pos.signatureY,
            size: 14,
            font,
            color: rgb(0.15, 0.15, 0.4),
          });
          image = null;
        }
      }

      if (image) {
        // Scale to fit within bounds
        const aspectRatio = image.width / image.height;
        let drawWidth = SIGNATURE_IMG_WIDTH;
        let drawHeight = drawWidth / aspectRatio;
        if (drawHeight > SIGNATURE_IMG_HEIGHT) {
          drawHeight = SIGNATURE_IMG_HEIGHT;
          drawWidth = drawHeight * aspectRatio;
        }

        page.drawImage(image, {
          x: ML + LABEL_OFFSET_X,
          y: pos.signatureY - drawHeight + 14, // align bottom of image to line
          width: drawWidth,
          height: drawHeight,
        });
      }
    } catch (err) {
      console.error("Failed to embed signature image:", err);
      // Fall back to typed name
      page.drawText(signerName, {
        x: ML + LABEL_OFFSET_X,
        y: pos.signatureY,
        size: 14,
        font,
        color: rgb(0.15, 0.15, 0.4),
      });
    }
  } else {
    // No image — use typed signature
    page.drawText(signerName, {
      x: ML + LABEL_OFFSET_X,
      y: pos.signatureY,
      size: 14,
      font,
      color: rgb(0.15, 0.15, 0.4),
    });
  }

  // 3. Draw the date
  page.drawText(signDate, {
    x: ML + LABEL_OFFSET_X,
    y: pos.dateY,
    size: 10,
    font,
    color: rgb(0.2, 0.2, 0.2),
  });

  return doc.save();
}

// ── Add Audit Footer ─────────────────────────────────────────

export async function addAuditFooter(params: {
  pdfBytes: Uint8Array;
  auditText: string;
}): Promise<Uint8Array> {
  const { pdfBytes, auditText } = params;

  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const pages = doc.getPages();
  if (pages.length === 0) {
    throw new Error("PDF has no pages");
  }

  // Add footer to the last page
  const lastPage = pages[pages.length - 1];

  // Draw a light separator line
  lastPage.drawLine({
    start: { x: ML, y: 52 },
    end: { x: PAGE_W - MR, y: 52 },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });

  // Draw audit text (small, gray)
  const fontSize = 6.5;
  const textWidth = font.widthOfTextAtSize(auditText, fontSize);

  // If text is too long, truncate or wrap
  if (textWidth <= CW) {
    lastPage.drawText(auditText, {
      x: ML,
      y: 42,
      size: fontSize,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  } else {
    // Split into two lines
    const midPoint = Math.ceil(auditText.length / 2);
    const spaceAfterMid = auditText.indexOf(" ", midPoint);
    const splitAt = spaceAfterMid > 0 ? spaceAfterMid : midPoint;
    const line1 = auditText.slice(0, splitAt).trim();
    const line2 = auditText.slice(splitAt).trim();

    lastPage.drawText(line1, {
      x: ML,
      y: 46,
      size: fontSize,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
    lastPage.drawText(line2, {
      x: ML,
      y: 38,
      size: fontSize,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  return doc.save();
}

// ── Embed Field Values (template-based signing) ──────────────

export async function embedFieldValues(
  pdfBytes: Uint8Array,
  fields: TemplateFieldDefinition[],
  values: Record<string, string>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();

  for (const field of fields) {
    const value = values[field.id];
    if (!value) continue;

    const pageIndex = Math.min(field.page, pages.length - 1);
    if (pageIndex < 0) continue;
    const page = pages[pageIndex];
    const { width: pageW, height: pageH } = page.getSize();

    const x = (field.x / 100) * pageW;
    const y = pageH - ((field.y / 100) * pageH);
    const fieldW = (field.width / 100) * pageW;
    const fieldH = (field.height / 100) * pageH;

    if (field.type === "signature" || field.type === "initials") {
      try {
        const base64Data = value.replace(/^data:image\/\w+;base64,/, "");
        const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
        let image;
        try { image = await doc.embedPng(imageBytes); } catch { try { image = await doc.embedJpg(imageBytes); } catch { image = null; } }
        if (image) {
          const ar = image.width / image.height;
          let drawW = fieldW;
          let drawH = drawW / ar;
          if (drawH > fieldH) { drawH = fieldH; drawW = drawH * ar; }
          page.drawImage(image, { x, y: y - drawH, width: drawW, height: drawH });
        }
      } catch { /* skip */ }
    } else if (field.type === "checkbox") {
      if (value && value !== "false" && value !== "0") {
        const sz = Math.min(fieldW, fieldH, 14);
        page.drawText("✓", { x: x + 1, y: y - sz + 2, size: sz, font, color: rgb(0.1, 0.1, 0.1) });
      }
    } else {
      page.drawText(value, { x, y: y - 12, size: 11, font, color: rgb(0.1, 0.1, 0.1), maxWidth: fieldW });
    }
  }

  return doc.save();
}
