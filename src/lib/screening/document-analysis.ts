/**
 * AI Document Analysis Pipeline — 3-Layer Fraud Detection
 *
 * Layer 1: Metadata Forensics (file metadata analysis)
 * Layer 2: AI Data Extraction (Claude structured extraction)
 * Layer 3: Cross-Verification Against Plaid bank data
 */

import Anthropic from "@anthropic-ai/sdk";
import { redactPII } from "./pii-redaction";

const anthropic = new Anthropic();

// ── Types ─────────────────────────────────────────────────────

export interface DocumentAnalysisInput {
  documentType: string;             // pay_stub, w2, bank_statement, etc.
  fileBuffer: Buffer;               // Raw file content
  mimeType: string;
  fileName: string;
  plaidData?: {                     // Available if Plaid was connected
    deposits: Array<{ date: string; amount: number; name: string }>;
    employerNames: string[];
    accountBalances: Array<{ current: number; available: number }>;
  };
}

export interface MetadataResult {
  flags: Record<string, any>;
  riskLevel: "clean" | "warning" | "suspicious" | "fraudulent";
  notes: string[];
}

export interface ExtractionResult {
  extractedData: Record<string, any>;
  confidence: number;               // 0-100
}

export interface CrossVerificationResult {
  incomeMatchesPlaid: boolean | null;
  employerMatchesPlaid: boolean | null;
  balanceMatchesPlaid: boolean | null;
  discrepancies: string[];
  fraudScore: number;               // 0-100 (0=clean, 100=fraud)
}

export interface FullAnalysisResult {
  metadata: MetadataResult;
  extraction: ExtractionResult;
  crossVerification: CrossVerificationResult;
  fraudAssessment: "clean" | "low_risk" | "medium_risk" | "high_risk" | "fraudulent";
  aiSummary: string;
  modelUsed: string;
}

// ── Layer 1: Metadata Forensics ───────────────────────────────

export async function analyzeMetadata(
  fileBuffer: Buffer,
  mimeType: string,
  fileName: string,
  documentType: string
): Promise<MetadataResult> {
  const flags: Record<string, any> = {};
  const notes: string[] = [];
  let riskLevel: MetadataResult["riskLevel"] = "clean";

  // Check file size anomalies
  const sizeKB = fileBuffer.length / 1024;
  if (sizeKB < 1) {
    flags.suspiciouslySmall = true;
    notes.push("File is suspiciously small (< 1KB)");
    riskLevel = "warning";
  }

  // Check for PDF metadata (creation tool, modification dates)
  if (mimeType === "application/pdf") {
    const pdfHeader = fileBuffer.slice(0, 1024).toString("utf-8", 0, 1024);

    // Check for editing software in PDF metadata
    const editorPatterns = [
      { pattern: /Photoshop/i, risk: "suspicious", note: "Created/modified in Photoshop" },
      { pattern: /GIMP/i, risk: "suspicious", note: "Created/modified in GIMP" },
      { pattern: /Illustrator/i, risk: "warning", note: "Created in Illustrator" },
    ];

    for (const { pattern, risk, note } of editorPatterns) {
      if (pattern.test(pdfHeader)) {
        flags.editingSoftwareDetected = pattern.source;
        notes.push(note);
        if (documentType === "pay_stub" || documentType === "bank_statement") {
          riskLevel = risk as MetadataResult["riskLevel"];
          notes.push(`${documentType} created in image editor — elevated risk`);
        }
      }
    }
  }

  // Check for image metadata (EXIF)
  if (mimeType.startsWith("image/")) {
    // Simple EXIF check — screenshot vs camera
    const hasExif = fileBuffer.includes(Buffer.from("Exif"));
    flags.hasExifData = hasExif;
    if (!hasExif && documentType !== "government_id") {
      notes.push("Image lacks EXIF data — may be a screenshot or digitally created");
      if (riskLevel === "clean") riskLevel = "warning";
    }
  }

  flags.fileSize = sizeKB;
  flags.mimeType = mimeType;

  return { flags, riskLevel, notes };
}

// ── Layer 2: AI Data Extraction ───────────────────────────────

const EXTRACTION_PROMPTS: Record<string, string> = {
  pay_stub: `Extract the following from this pay stub:
- employer_name: string
- employee_name: string
- pay_period_start: YYYY-MM-DD
- pay_period_end: YYYY-MM-DD
- gross_pay: number
- net_pay: number
- ytd_gross: number (if visible)
- deductions: array of {name, amount}
- pay_frequency: weekly/biweekly/semimonthly/monthly

Return as JSON. If a field is not visible, use null.`,

  w2: `Extract the following from this W-2 form:
- employer_name: string
- employer_ein: string
- employee_name: string
- employee_ssn_last4: string (last 4 digits only)
- tax_year: number
- wages_tips: number (Box 1)
- federal_tax_withheld: number (Box 2)
- social_security_wages: number (Box 3)

Return as JSON. If a field is not visible, use null.`,

  bank_statement: `Extract the following from this bank statement:
- bank_name: string
- account_holder_name: string
- account_number_last4: string
- statement_period_start: YYYY-MM-DD
- statement_period_end: YYYY-MM-DD
- beginning_balance: number
- ending_balance: number
- total_deposits: number
- total_withdrawals: number
- key_deposits: array of {date, amount, description} (top 5 largest)

Return as JSON. If a field is not visible, use null.`,

  tax_return: `Extract the following from this tax return:
- filer_name: string
- tax_year: number
- filing_status: string
- total_income: number
- adjusted_gross_income: number
- taxable_income: number
- total_tax: number

Return as JSON. If a field is not visible, use null.`,

  employment_letter: `Extract the following from this employment verification letter:
- employer_name: string
- employee_name: string
- job_title: string
- employment_start_date: YYYY-MM-DD
- salary_or_hourly_rate: number
- pay_frequency: string
- letter_date: YYYY-MM-DD
- author_name: string
- author_title: string

Return as JSON. If a field is not visible, use null.`,
};

export async function extractDocumentData(
  fileBuffer: Buffer,
  mimeType: string,
  documentType: string
): Promise<ExtractionResult> {
  const prompt = EXTRACTION_PROMPTS[documentType] || `Extract all relevant data from this document as structured JSON.`;
  const model = "claude-sonnet-4-6";

  try {
    // Convert to base64 for Claude vision
    const base64 = fileBuffer.toString("base64");

    // Build content blocks based on mime type
    const contentBlocks: any[] = [];
    if (mimeType === "application/pdf") {
      contentBlocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf" as const, data: base64 },
      });
    } else {
      const imageMediaType = mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
      contentBlocks.push({
        type: "image",
        source: { type: "base64", media_type: imageMediaType, data: base64 },
      });
    }
    // Add PII safety instructions to prevent sensitive data in AI output
    const piiSafePrompt = prompt + `\n\nIMPORTANT PRIVACY RULES:
- Do NOT include full SSN, bank account numbers, routing numbers, or credit card numbers in your response.
- If you see an SSN, only reference the last 4 digits (e.g., "SSN ending in 1234").
- Mask any account numbers to show only last 4 digits.
- Focus on extracting financial amounts, dates, employer names, and verification data.`;

    contentBlocks.push({ type: "text", text: piiSafePrompt });

    const response = await anthropic.messages.create({
      model,
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: contentBlocks,
        },
      ],
    });

    const textContent = response.content.find(c => c.type === "text");
    const rawResponseText = textContent?.type === "text" ? textContent.text : "";

    // Redact any PII that slipped through in the AI response
    const { redactedText: responseText, redactionsApplied } = redactPII(rawResponseText);
    if (redactionsApplied.length > 0) {
      console.log(`[Doc Analysis] PII redacted from AI output: ${redactionsApplied.join(", ")}`);
    }

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const extractedData = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    // Confidence based on how many fields were extracted vs null
    const values = Object.values(extractedData);
    const nonNullCount = values.filter(v => v !== null && v !== undefined).length;
    const confidence = values.length > 0 ? (nonNullCount / values.length) * 100 : 0;

    return {
      extractedData,
      confidence: Math.round(confidence),
    };
  } catch (error) {
    console.error("Document extraction error:", error);
    return {
      extractedData: {},
      confidence: 0,
    };
  }
}

// ── Layer 3: Cross-Verification ───────────────────────────────

export function crossVerifyWithPlaid(
  extractedData: Record<string, any>,
  documentType: string,
  plaidData?: DocumentAnalysisInput["plaidData"]
): CrossVerificationResult {
  if (!plaidData) {
    return {
      incomeMatchesPlaid: null,
      employerMatchesPlaid: null,
      balanceMatchesPlaid: null,
      discrepancies: [],
      fraudScore: 0, // Can't verify = no fraud signal
    };
  }

  const discrepancies: string[] = [];
  let fraudPoints = 0;

  // ── Income Match ────────────────────────────────────────────
  let incomeMatchesPlaid: boolean | null = null;
  if (documentType === "pay_stub" && extractedData.gross_pay) {
    const docPay = Number(extractedData.gross_pay);
    // Find matching deposit within 20% tolerance
    const matchingDeposit = plaidData.deposits.find(d => {
      const diff = Math.abs(Math.abs(d.amount) - docPay);
      return diff / docPay < 0.20;
    });
    incomeMatchesPlaid = !!matchingDeposit;
    if (!matchingDeposit) {
      discrepancies.push(
        `Pay stub shows $${docPay.toFixed(2)} but no matching Plaid deposit found`
      );
      fraudPoints += 25;
    }
  }

  // ── Employer Match ──────────────────────────────────────────
  let employerMatchesPlaid: boolean | null = null;
  if (extractedData.employer_name && plaidData.employerNames.length > 0) {
    const docEmployer = extractedData.employer_name.toLowerCase();
    employerMatchesPlaid = plaidData.employerNames.some(e =>
      e.toLowerCase().includes(docEmployer) || docEmployer.includes(e.toLowerCase())
    );
    if (!employerMatchesPlaid) {
      discrepancies.push(
        `Employer "${extractedData.employer_name}" doesn't match Plaid payroll sources`
      );
      fraudPoints += 20;
    }
  }

  // ── Balance Match ───────────────────────────────────────────
  let balanceMatchesPlaid: boolean | null = null;
  if (documentType === "bank_statement" && extractedData.ending_balance != null) {
    const docBalance = Number(extractedData.ending_balance);
    const plaidBalance = plaidData.accountBalances[0]?.current;
    if (plaidBalance != null) {
      const diff = Math.abs(docBalance - plaidBalance);
      balanceMatchesPlaid = diff / Math.max(docBalance, 1) < 0.10; // 10% tolerance
      if (!balanceMatchesPlaid) {
        discrepancies.push(
          `Statement balance $${docBalance.toFixed(2)} vs Plaid balance $${plaidBalance.toFixed(2)}`
        );
        fraudPoints += 30;
      }
    }
  }

  return {
    incomeMatchesPlaid,
    employerMatchesPlaid,
    balanceMatchesPlaid,
    discrepancies,
    fraudScore: Math.min(100, fraudPoints),
  };
}

// ── Full Pipeline ─────────────────────────────────────────────

/**
 * Run the full 3-layer document analysis pipeline.
 */
export async function analyzeDocument(
  input: DocumentAnalysisInput
): Promise<FullAnalysisResult> {
  // Mock mode: return synthetic analysis without calling Anthropic API
  if (process.env.SCREENING_USE_MOCKS === "true") {
    return {
      metadata: { flags: {}, riskLevel: "clean", notes: [] },
      extraction: {
        extractedData: {
          documentType: input.documentType,
          _mock: true,
          employer: "Mock Corp Inc",
          grossPay: 6500,
          payPeriod: "bi-weekly",
          payDate: "2026-03-15",
        },
        confidence: 92,
      },
      crossVerification: {
        incomeMatchesPlaid: true,
        employerMatchesPlaid: true,
        balanceMatchesPlaid: null,
        discrepancies: [],
        fraudScore: 0,
      },
      fraudAssessment: "clean",
      aiSummary: `Document type: ${input.documentType}\nMetadata: clean\nExtraction confidence: 92%\nOverall assessment: clean\n(Mock mode — no AI analysis performed)`,
      modelUsed: "mock",
    };
  }

  const model = "claude-sonnet-4-6";

  // Layer 1: Metadata
  const metadata = await analyzeMetadata(
    input.fileBuffer,
    input.mimeType,
    input.fileName,
    input.documentType
  );

  // Layer 2: AI Extraction
  const extraction = await extractDocumentData(
    input.fileBuffer,
    input.mimeType,
    input.documentType
  );

  // Layer 3: Cross-Verification
  const crossVerification = crossVerifyWithPlaid(
    extraction.extractedData,
    input.documentType,
    input.plaidData
  );

  // ── Compute Overall Fraud Assessment ────────────────────────
  let totalRisk = crossVerification.fraudScore;
  if (metadata.riskLevel === "suspicious") totalRisk += 20;
  if (metadata.riskLevel === "fraudulent") totalRisk += 40;
  if (extraction.confidence < 30) totalRisk += 10; // Low confidence = harder to verify

  let fraudAssessment: FullAnalysisResult["fraudAssessment"];
  if (totalRisk >= 80) fraudAssessment = "fraudulent";
  else if (totalRisk >= 50) fraudAssessment = "high_risk";
  else if (totalRisk >= 25) fraudAssessment = "medium_risk";
  else if (totalRisk > 0) fraudAssessment = "low_risk";
  else fraudAssessment = "clean";

  // ── AI Summary ──────────────────────────────────────────────
  const summaryParts: string[] = [];
  summaryParts.push(`Document type: ${input.documentType}`);
  summaryParts.push(`Metadata: ${metadata.riskLevel}${metadata.notes.length > 0 ? ` (${metadata.notes.join("; ")})` : ""}`);
  summaryParts.push(`Extraction confidence: ${extraction.confidence}%`);
  if (crossVerification.discrepancies.length > 0) {
    summaryParts.push(`Discrepancies: ${crossVerification.discrepancies.join("; ")}`);
  }
  summaryParts.push(`Overall assessment: ${fraudAssessment}`);

  // Final PII redaction pass on the summary text
  const { redactedText: cleanSummary } = redactPII(summaryParts.join("\n"));

  return {
    metadata,
    extraction,
    crossVerification,
    fraudAssessment,
    aiSummary: cleanSummary,
    modelUsed: model,
  };
}
