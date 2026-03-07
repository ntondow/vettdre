import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;

function getEncryptionKey(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.ANTHROPIC_API_KEY;
  if (!secret) throw new Error("No encryption key available");
  // Derive a stable 32-byte key from the secret
  return scryptSync(secret, "vettdre-token-salt", 32);
}

/**
 * Encrypt a plaintext string. Returns a hex-encoded string containing:
 * [IV (16 bytes)] [auth tag (16 bytes)] [ciphertext]
 */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();

  // Combine: iv + tag + ciphertext
  return iv.toString("hex") + tag.toString("hex") + encrypted;
}

/**
 * Decrypt a hex-encoded encrypted string back to plaintext.
 */
export function decryptToken(encryptedHex: string): string {
  const key = getEncryptionKey();

  const iv = Buffer.from(encryptedHex.slice(0, IV_LENGTH * 2), "hex");
  const tag = Buffer.from(encryptedHex.slice(IV_LENGTH * 2, (IV_LENGTH + TAG_LENGTH) * 2), "hex");
  const ciphertext = encryptedHex.slice((IV_LENGTH + TAG_LENGTH) * 2);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Check if a string looks like it's already encrypted (hex-encoded, correct minimum length).
 */
export function isEncrypted(value: string): boolean {
  const minLength = (IV_LENGTH + TAG_LENGTH) * 2 + 2; // min 2 hex chars of ciphertext
  return /^[0-9a-f]+$/.test(value) && value.length >= minLength;
}
