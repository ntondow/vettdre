"use server";

import prisma from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import {
  detectDocumentType,
  extractPdfText,
  extractSpreadsheetData,
  parseWithClaude,
  parseSpreadsheetWithClaude,
  mergeMultiFileParse,
  createEmptyParsedData,
} from "@/lib/document-parser";
import type { FileParseResult, ParsedDealData, DocumentType } from "@/lib/document-parser";
import { mapToQuickScreen, mapToDealModeler } from "@/lib/document-parser-mappings";
import { calculateAll, DEFAULT_INPUTS } from "@/lib/deal-calculator";
import type { DealInputs } from "@/lib/deal-calculator";

// ── Auth ────────────────────────────────────────────────────

async function getUser() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) throw new Error("Not authenticated");
  const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
  if (!user) throw new Error("User not found");
  return user;
}

// ── Parse Documents ─────────────────────────────────────────

export interface ParseProgress {
  fileName: string;
  status: "pending" | "extracting" | "parsing" | "done" | "error";
  documentType: DocumentType;
  error?: string;
}

export interface ParseResult {
  results: FileParseResult[];
  merged: ParsedDealData;
  progress: ParseProgress[];
}

/**
 * Parse a single uploaded file — called from the client per-file
 * so we can show incremental progress.
 */
export async function parseSingleFile(formData: FormData): Promise<FileParseResult> {
  await getUser(); // auth check

  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");

  const buffer = Buffer.from(await file.arrayBuffer());
  const fileName = file.name;
  const isPdf = fileName.toLowerCase().endsWith(".pdf");

  try {
    if (isPdf) {
      // PDF path
      const text = await extractPdfText(buffer);
      if (!text || text.trim().length < 50) {
        return { fileName, documentType: "om", data: {}, error: "Could not extract text from PDF — it may be a scanned image." };
      }
      const docType = detectDocumentType(fileName);
      const data = await parseWithClaude(text, docType, fileName);
      return { fileName, documentType: docType, data };
    } else {
      // Excel / CSV path
      const { headers, rows, sheetNames } = await extractSpreadsheetData(buffer, fileName);
      if (rows.length === 0) {
        return { fileName, documentType: "unknown", data: {}, error: "Spreadsheet appears empty." };
      }
      const docType = detectDocumentType(fileName, headers, sheetNames);
      const data = await parseSpreadsheetWithClaude(rows, headers, docType, fileName);
      return { fileName, documentType: docType, data };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown parsing error";
    return { fileName, documentType: "unknown", data: {}, error: msg };
  }
}

/**
 * Merge multiple file parse results into a single ParsedDealData.
 */
export async function mergeParseResults(results: FileParseResult[]): Promise<ParsedDealData> {
  await getUser(); // auth check
  if (results.length === 0) return createEmptyParsedData();
  return mergeMultiFileParse(results);
}

// ── Save Draft as DealAnalysis ──────────────────────────────

export async function saveParseDraft(data: ParsedDealData, name: string): Promise<{ id: string }> {
  const user = await getUser();

  const address = data.property?.address?.value || "Untitled Import";
  const mapped = mapToDealModeler(data);
  const fullInputs: DealInputs = { ...DEFAULT_INPUTS, ...mapped };
  const outputs = calculateAll(fullInputs);

  const deal = await prisma.dealAnalysis.create({
    data: {
      orgId: user.orgId,
      userId: user.id,
      name: name || address,
      address: address,
      borough: data.property?.borough?.value || null,
      status: "analyzing",
      dealType: "acquisition",
      dealSource: "off_market",
      inputs: JSON.parse(JSON.stringify(fullInputs)),
      outputs: JSON.parse(JSON.stringify(outputs)),
      notes: `Draft saved from document import on ${new Date().toLocaleDateString()}`,
    },
  });

  return { id: deal.id };
}

// ── Send To Quick Screen ────────────────────────────────────

export async function prepareQuickScreenData(data: ParsedDealData) {
  await getUser();
  const mapped = mapToQuickScreen(data);
  // Return as query params for navigation
  const params = new URLSearchParams();
  if (mapped.purchasePrice) params.set("price", String(mapped.purchasePrice));
  if (mapped.grossAnnualIncome) params.set("income", String(mapped.grossAnnualIncome));
  if (mapped.expenseRatioPct) params.set("expense", String(mapped.expenseRatioPct));
  if (mapped.interestRate) params.set("rate", String(mapped.interestRate));
  if (mapped.exitCapRate) params.set("exitCap", String(mapped.exitCapRate));
  if (mapped.downPaymentPct !== 100) params.set("dp", String(mapped.downPaymentPct));
  params.set("loanTerm", String(mapped.loanTermYears));
  params.set("hold", String(mapped.holdPeriodYears));
  if (mapped.isFinanced) params.set("financed", "1");
  return { queryString: params.toString() };
}

// ── Send To Deal Modeler ────────────────────────────────────

export async function sendToDealModeler(data: ParsedDealData): Promise<{ dealId: string }> {
  const user = await getUser();

  const mapped = mapToDealModeler(data);
  const fullInputs: DealInputs = { ...DEFAULT_INPUTS, ...mapped };
  const outputs = calculateAll(fullInputs);

  const address = data.property?.address?.value || "Imported Deal";
  const borough = data.property?.borough?.value || undefined;

  const deal = await prisma.dealAnalysis.create({
    data: {
      orgId: user.orgId,
      userId: user.id,
      name: address,
      address: address,
      borough: borough || null,
      status: "analyzing",
      dealType: "acquisition",
      dealSource: "off_market",
      inputs: JSON.parse(JSON.stringify(fullInputs)),
      outputs: JSON.parse(JSON.stringify(outputs)),
      notes: `Imported from documents on ${new Date().toLocaleDateString()}`,
    },
  });

  return { dealId: deal.id };
}

// ── Send To Pipeline ────────────────────────────────────────

export async function sendToPipeline(data: ParsedDealData): Promise<{ dealId: string }> {
  const user = await getUser();

  const mapped = mapToDealModeler(data);
  const fullInputs: DealInputs = { ...DEFAULT_INPUTS, ...mapped };
  const outputs = calculateAll(fullInputs);

  const address = data.property?.address?.value || "Imported Deal";
  const borough = data.property?.borough?.value || undefined;
  const summary = data.notes?.dealSummary?.value || undefined;

  const deal = await prisma.dealAnalysis.create({
    data: {
      orgId: user.orgId,
      userId: user.id,
      name: address,
      address: address,
      borough: borough || null,
      status: "prospecting",
      dealType: "acquisition",
      dealSource: "off_market",
      inputs: JSON.parse(JSON.stringify(fullInputs)),
      outputs: JSON.parse(JSON.stringify(outputs)),
      notes: summary || `Imported from documents on ${new Date().toLocaleDateString()}`,
    },
  });

  return { dealId: deal.id };
}
