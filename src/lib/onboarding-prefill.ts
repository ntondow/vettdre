// ============================================================
// Client Onboarding — PDF Field Prefill
// Uses pdf-lib to draw pre-filled values onto template PDFs
// ============================================================

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { TemplateFieldDefinition } from "@/lib/onboarding-types";

export async function prefillPdfFields(
  pdfBytes: Uint8Array,
  fields: TemplateFieldDefinition[],
  values: Record<string, string>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();

  for (const field of fields) {
    // Skip signature/initials — client fills these
    if (field.type === "signature" || field.type === "initials") continue;

    // Skip fields without a prefillKey or without a value
    if (!field.prefillKey || !values[field.prefillKey]) continue;

    const value = values[field.prefillKey];
    const pageIndex = Math.min(field.page, pages.length - 1);
    if (pageIndex < 0) continue;

    const page = pages[pageIndex];
    const { width: pageW, height: pageH } = page.getSize();

    // Convert percentage coordinates to absolute
    const x = (field.x / 100) * pageW;
    const y = pageH - ((field.y / 100) * pageH); // PDF y is bottom-up

    if (field.type === "checkbox") {
      // Draw a checkmark if value is truthy
      if (value && value !== "false" && value !== "0") {
        const size = Math.min((field.width / 100) * pageW, (field.height / 100) * pageH, 14);
        page.drawText("✓", {
          x: x + 1,
          y: y - size + 2,
          size: size,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
      }
    } else {
      // Text or date field
      const fontSize = 11;
      page.drawText(value, {
        x,
        y: y - fontSize,
        size: fontSize,
        font,
        color: rgb(0.1, 0.1, 0.1),
        maxWidth: (field.width / 100) * pageW,
      });
    }
  }

  return doc.save();
}

/**
 * Stamp a logo image onto every page of a PDF, replacing the placeholder area.
 * The logo is centered at the top of each page.
 * Supports PNG and JPEG.
 */
export async function stampLogoOnPdf(
  pdfBytes: Uint8Array,
  logoBytes: Uint8Array,
  logoMimeType: "image/png" | "image/jpeg",
  options?: { pages?: number[]; maxWidth?: number; maxHeight?: number; yFromTop?: number },
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const pages = doc.getPages();

  // Embed image based on type
  const image = logoMimeType === "image/png"
    ? await doc.embedPng(logoBytes)
    : await doc.embedJpg(logoBytes);

  const maxW = options?.maxWidth ?? 120;
  const maxH = options?.maxHeight ?? 60;
  const yFromTop = options?.yFromTop ?? 30;

  // Scale image to fit within max bounds while preserving aspect ratio
  const imgDims = image.scale(1);
  const scale = Math.min(maxW / imgDims.width, maxH / imgDims.height, 1);
  const drawW = imgDims.width * scale;
  const drawH = imgDims.height * scale;

  // Determine which pages to stamp (default: all)
  const targetPages = options?.pages ?? pages.map((_, i) => i);

  for (const pageIdx of targetPages) {
    if (pageIdx < 0 || pageIdx >= pages.length) continue;
    const page = pages[pageIdx];
    const { width: pageW, height: pageH } = page.getSize();

    // Center horizontally, position from top
    const x = (pageW - drawW) / 2;
    const y = pageH - yFromTop - drawH;

    // Draw white rectangle to cover placeholder text first
    page.drawRectangle({
      x: x - 10,
      y: y - 5,
      width: drawW + 20,
      height: drawH + 25,
      color: rgb(1, 1, 1),
    });

    // Draw the logo
    page.drawImage(image, { x, y, width: drawW, height: drawH });
  }

  return doc.save();
}

// Build the values map from onboarding data
export function buildPrefillValues(data: {
  clientFirstName: string;
  clientLastName: string;
  clientEmail?: string;
  propertyAddress?: string;
  unitNumber?: string;
  monthlyRent?: number;
  commissionPct?: number;
  moveInDate?: string;
  agentName: string;
  agentLicense?: string;
  brokerageName: string;
  termDays?: number;
}): Record<string, string> {
  const values: Record<string, string> = {};

  values.clientName = `${data.clientFirstName} ${data.clientLastName}`;
  if (data.clientEmail) values.clientEmail = data.clientEmail;
  if (data.propertyAddress) values.propertyAddress = data.propertyAddress;
  if (data.unitNumber) values.unitNumber = data.unitNumber;
  if (data.monthlyRent) {
    values.rent = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(data.monthlyRent);
  }
  if (data.commissionPct != null) values.commissionPct = `${data.commissionPct}%`;
  if (data.moveInDate) {
    values.moveInDate = new Date(data.moveInDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }
  values.agentName = data.agentName;
  if (data.agentLicense) values.agentLicense = data.agentLicense;
  values.brokerageName = data.brokerageName;
  if (data.termDays) values.agreementTerm = `${data.termDays} days`;
  values.date = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  // Auto-check tenant representation checkboxes on government forms
  values.tenantCheck = "true";
  values.tenantsAgentCheck = "true";
  values.tenantSignatureCheck = "true";

  return values;
}
