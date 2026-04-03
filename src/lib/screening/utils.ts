import { randomBytes, createHash } from "crypto";

/**
 * Generate a cryptographically random access token for screening applications.
 * 32 characters, URL-safe (hex encoding).
 */
export function generateAccessToken(): string {
  return randomBytes(16).toString("hex"); // 32 hex chars
}

/**
 * Generate a 6-digit OTP code for session resume.
 */
export function generateOTP(): { code: string; expiresAt: Date } {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  return { code, expiresAt };
}

/**
 * Verify an OTP code hasn't expired and matches.
 */
export function verifyOTP(
  storedCode: string | null,
  storedExpiresAt: Date | null,
  inputCode: string
): { valid: boolean; error?: string } {
  if (!storedCode || !storedExpiresAt) {
    return { valid: false, error: "No OTP issued" };
  }
  if (new Date() > storedExpiresAt) {
    return { valid: false, error: "OTP expired" };
  }
  if (storedCode !== inputCode) {
    return { valid: false, error: "Invalid code" };
  }
  return { valid: true };
}

/**
 * Generate SHA-256 hash for e-signature tamper detection.
 * Hash = SHA-256(signatureBytes + documentText + ISO timestamp)
 */
export function generateSignatureHash(
  signatureBase64: string,
  documentText: string,
  timestamp: string
): string {
  const data = `${signatureBase64}|${documentText}|${timestamp}`;
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Format cents to dollar string (e.g., 2000 → "$20.00")
 */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Get risk score color class based on score value.
 */
export function getRiskScoreColor(score: number): "green" | "yellow" | "red" {
  if (score >= 75) return "green";
  if (score >= 50) return "yellow";
  return "red";
}

/**
 * Get recommendation label from score.
 */
export function getRecommendation(score: number): "approve" | "conditional" | "decline" {
  if (score >= 75) return "approve";
  if (score >= 50) return "conditional";
  return "decline";
}

/**
 * Serialize Prisma objects for client components (handles Date, Decimal, BigInt).
 */
export function serialize<T>(obj: T): T {
  return JSON.parse(
    JSON.stringify(obj, (_key, value) => {
      if (value instanceof Date) return value.toISOString();
      if (typeof value === "bigint") return Number(value);
      return value;
    })
  );
}

/**
 * Mask SSN for display (e.g., "***-**-1234")
 */
export function maskSSN(ssn: string): string {
  const digits = ssn.replace(/\D/g, "");
  if (digits.length < 4) return "***-**-****";
  return `***-**-${digits.slice(-4)}`;
}

/**
 * Validate email format.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate US phone number (10 digits).
 */
export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 || (digits.length === 11 && digits.startsWith("1"));
}

/**
 * Format phone for Twilio (E.164).
 */
export function formatPhoneE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}
