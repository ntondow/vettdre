/**
 * PII Redaction — Pre-process document text before sending to AI
 *
 * Redacts SSNs, bank account numbers, routing numbers, and credit card numbers
 * from OCR'd text before sending to Claude for analysis. The AI still receives
 * enough data to extract income, employer, and detect fraud — without the most
 * sensitive identifiers.
 */

export interface RedactionResult {
  redactedText: string;
  redactionsApplied: string[];
  redactionCount: number;
}

/**
 * Redact common PII patterns from text before AI analysis.
 * Returns the redacted text and a list of what was redacted.
 */
export function redactPII(text: string): RedactionResult {
  const redactions: string[] = [];
  let redactionCount = 0;
  let redacted = text;

  // ── SSN patterns: 123-45-6789, 123 45 6789, 123456789 ──
  redacted = redacted.replace(
    /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g,
    (match) => {
      const digits = match.replace(/\D/g, "");
      // Verify likely SSN (not phone or other 9-digit sequence)
      if (digits.length === 9 && !digits.startsWith("000") && !digits.startsWith("9")) {
        redactions.push("SSN");
        redactionCount++;
        return "***-**-" + digits.slice(-4);
      }
      return match;
    },
  );

  // ── Full bank account numbers (8-17 digits, preceded by "Account" or "Acct") ──
  redacted = redacted.replace(
    /(?:account|acct)[\s#:]*(\d{8,17})/gi,
    (match, accountNum: string) => {
      redactions.push("Bank Account Number");
      redactionCount++;
      return match.replace(accountNum, "****" + accountNum.slice(-4));
    },
  );

  // ── Routing numbers (9 digits, preceded by "Routing" or "ABA") ──
  redacted = redacted.replace(
    /(?:routing|aba)[\s#:]*(\d{9})/gi,
    (match, routingNum: string) => {
      redactions.push("Routing Number");
      redactionCount++;
      return match.replace(routingNum, "****" + routingNum.slice(-4));
    },
  );

  // ── Credit card numbers (13-19 digits with optional dashes/spaces) ──
  redacted = redacted.replace(
    /\b(?:\d{4}[-\s]?){3,4}\d{1,4}\b/g,
    (match) => {
      const digits = match.replace(/\D/g, "");
      if (digits.length >= 13 && digits.length <= 19) {
        redactions.push("Credit Card Number");
        redactionCount++;
        return "****-****-****-" + digits.slice(-4);
      }
      return match;
    },
  );

  // ── Driver's license numbers (state-specific, common patterns) ──
  // Conservative: only redact if preceded by "license" or "DL" keyword
  redacted = redacted.replace(
    /(?:license|dl|driver'?s?\s*lic)[\s#:.]*([A-Z]?\d{5,12})/gi,
    (match, dlNum: string) => {
      redactions.push("Driver License Number");
      redactionCount++;
      return match.replace(dlNum, "****" + dlNum.slice(-4));
    },
  );

  return {
    redactedText: redacted,
    redactionsApplied: [...new Set(redactions)],
    redactionCount,
  };
}
