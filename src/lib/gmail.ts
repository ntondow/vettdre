import prisma from "@/lib/prisma";
import { createHmac, randomBytes } from "crypto";
import { encryptToken, decryptToken, isEncrypted } from "@/lib/encryption";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
];

// Simple in-memory mutex to prevent concurrent token refreshes
const refreshLocks = new Map<string, Promise<string>>();

/**
 * Generate a cryptographically signed OAuth state parameter.
 * Format: userId:nonce:signature
 */
export function generateOAuthState(userId: string): string {
  const nonce = randomBytes(16).toString("hex");
  const payload = `${userId}:${nonce}`;
  const secret = process.env.GMAIL_CLIENT_SECRET || "fallback-secret";
  const signature = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}:${signature}`;
}

/**
 * Verify and extract userId from a signed OAuth state parameter.
 * Returns the userId if valid, null if tampered.
 */
export function verifyOAuthState(state: string): string | null {
  const parts = state.split(":");
  if (parts.length !== 3) return null;
  const [userId, nonce, signature] = parts;
  const payload = `${userId}:${nonce}`;
  const secret = process.env.GMAIL_CLIENT_SECRET || "fallback-secret";
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  // Constant-time comparison
  if (signature.length !== expected.length) return null;
  let match = true;
  for (let i = 0; i < signature.length; i++) {
    if (signature[i] !== expected[i]) match = false;
  }
  return match ? userId : null;
}

export function getGmailAuthUrl(state: string) {
  const signedState = generateOAuthState(state);
  const params = new URLSearchParams({
    client_id: process.env.GMAIL_CLIENT_ID!,
    redirect_uri: process.env.GMAIL_REDIRECT_URI!,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state: signedState,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      redirect_uri: process.env.GMAIL_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error("Token exchange failed: " + err);
  }
  return res.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  }>;
}

async function _refreshAccessToken(gmailAccountId: string): Promise<string> {
  const account = await prisma.gmailAccount.findUnique({ where: { id: gmailAccountId } });
  if (!account) throw new Error("Gmail account not found");

  // Decrypt refresh token if encrypted, otherwise use as-is (backward compat with plaintext tokens)
  const refreshToken = isEncrypted(account.refreshToken)
    ? decryptToken(account.refreshToken)
    : account.refreshToken;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error("Token refresh failed: " + err);
  }

  const data = await res.json();
  // Encrypt the new access token before storing
  const encryptedAccessToken = encryptToken(data.access_token);
  await prisma.gmailAccount.update({
    where: { id: gmailAccountId },
    data: {
      accessToken: encryptedAccessToken,
      tokenExpiry: new Date(Date.now() + data.expires_in * 1000),
    },
  });

  return data.access_token as string;
}

/**
 * Refresh the access token with mutex to prevent concurrent refresh races.
 * Multiple callers seeing an expired token will share the same refresh promise.
 */
export async function refreshAccessToken(gmailAccountId: string): Promise<string> {
  const existing = refreshLocks.get(gmailAccountId);
  if (existing) return existing;

  const promise = _refreshAccessToken(gmailAccountId).finally(() => {
    refreshLocks.delete(gmailAccountId);
  });
  refreshLocks.set(gmailAccountId, promise);
  return promise;
}

/** Get a valid access token, refreshing if expired */
export async function getValidToken(gmailAccountId: string): Promise<string> {
  const account = await prisma.gmailAccount.findUnique({ where: { id: gmailAccountId } });
  if (!account) throw new Error("Gmail account not found");

  // Refresh if token expires within 5 minutes
  if (account.tokenExpiry.getTime() < Date.now() + 5 * 60 * 1000) {
    return refreshAccessToken(gmailAccountId);
  }
  // Decrypt token if encrypted, otherwise return as-is (backward compat)
  return isEncrypted(account.accessToken)
    ? decryptToken(account.accessToken)
    : account.accessToken;
}

/** Get the Gmail account for a user, or null */
export async function getUserGmailAccount(userId: string) {
  return prisma.gmailAccount.findFirst({
    where: { userId, isActive: true },
  });
}
