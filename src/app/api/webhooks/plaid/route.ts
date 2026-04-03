import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import prisma from "@/lib/prisma";
import { isWebhookProcessed, markWebhookProcessed } from "@/lib/webhook-idempotency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── Plaid Webhook JWT Verification ───────────────────────────
// Plaid signs webhooks with JWTs using JWK keys from their endpoint.
// We verify the signature and check the request body SHA-256 hash.

const PLAID_JWK_URL = "https://production.plaid.com/webhook_verification_key/get";
const PLAID_SANDBOX_JWK_URL = "https://sandbox.plaid.com/webhook_verification_key/get";

// Cache JWKs in memory (Plaid keys rotate infrequently)
const jwkCache = new Map<string, { key: CryptoKey; expiresAt: number }>();

async function getPlaidJwk(kid: string): Promise<CryptoKey | null> {
  const cached = jwkCache.get(kid);
  if (cached && cached.expiresAt > Date.now()) return cached.key;

  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) {
    console.error("[Plaid Webhook] Missing PLAID_CLIENT_ID or PLAID_SECRET for JWT verification");
    return null;
  }

  // Try production first, then sandbox
  const plaidEnv = process.env.PLAID_ENV || "sandbox";
  const baseUrl = plaidEnv === "production" ? PLAID_JWK_URL : PLAID_SANDBOX_JWK_URL;

  try {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, secret, key_id: kid }),
    });

    if (!res.ok) {
      console.error(`[Plaid Webhook] JWK fetch failed: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const jwk = data.key;

    if (!jwk) {
      console.error("[Plaid Webhook] No key in JWK response");
      return null;
    }

    // Import JWK as CryptoKey for verification
    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );

    // Cache for 24 hours
    jwkCache.set(kid, { key: cryptoKey, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
    return cryptoKey;
  } catch (err) {
    console.error("[Plaid Webhook] JWK fetch error:", err);
    return null;
  }
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function verifyPlaidWebhook(jwt: string, rawBody: string): Promise<boolean> {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return false;

    // Decode header to get kid and algorithm
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    if (!header.kid || header.alg !== "ES256") return false;

    // Decode payload to get request_body_sha256
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));

    // Verify body hash
    const bodyHash = createHash("sha256").update(rawBody).digest("hex");
    if (payload.request_body_sha256 !== bodyHash) {
      console.error("[Plaid Webhook] Body hash mismatch");
      return false;
    }

    // Check token is not expired (iat + 5 minutes)
    const now = Math.floor(Date.now() / 1000);
    if (payload.iat && now - payload.iat > 300) {
      console.error("[Plaid Webhook] Token expired (older than 5 minutes)");
      return false;
    }

    // Fetch JWK and verify signature
    const key = await getPlaidJwk(header.kid);
    if (!key) return false;

    const signedInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const signature = base64UrlDecode(parts[2]);

    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      signature.buffer as ArrayBuffer,
      signedInput.buffer as ArrayBuffer,
    );

    return valid;
  } catch (err) {
    console.error("[Plaid Webhook] JWT verification error:", err);
    return false;
  }
}

/**
 * Plaid Webhook Handler
 *
 * Receives events from Plaid for:
 * - TRANSACTIONS: Initial sync complete, new transactions available
 * - ITEM: Connection errors, pending expiration
 * - IDENTITY: Identity data updated
 */
export async function POST(req: NextRequest) {
  try {
    // Read raw body for signature verification
    const rawBody = await req.text();

    // Verify JWT signature (skip in mock mode)
    const useMocks = process.env.SCREENING_USE_MOCKS === "true";
    if (!useMocks) {
      const plaidJwt = req.headers.get("plaid-verification");
      if (!plaidJwt) {
        console.error("[Plaid Webhook] Missing Plaid-Verification header");
        return NextResponse.json({ error: "Missing verification header" }, { status: 401 });
      }

      const isValid = await verifyPlaidWebhook(plaidJwt, rawBody);
      if (!isValid) {
        console.error("[Plaid Webhook] JWT signature verification failed");
        return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
      }
    }

    const body = JSON.parse(rawBody);
    const { webhook_type, webhook_code, item_id, error } = body as {
      webhook_type?: string;
      webhook_code?: string;
      item_id?: string;
      error?: { error_code?: string; error_message?: string } | null;
    };

    if (!webhook_type || !webhook_code) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Webhook idempotency for one-time events.
    // Only deduplicate INITIAL_UPDATE and ERROR events — these should only fire once per item.
    // DEFAULT_UPDATE, HISTORICAL_UPDATE are recurring and should NOT be blocked.
    const oneTimeEvents = ["INITIAL_UPDATE", "ERROR", "PENDING_EXPIRATION"];
    if (item_id && oneTimeEvents.includes(webhook_code || "")) {
      const dedupKey = `${item_id}_${webhook_type}_${webhook_code}`;
      try {
        if (await isWebhookProcessed("plaid", dedupKey)) {
          console.log(`[Plaid Webhook] Duplicate skipped: ${dedupKey}`);
          return NextResponse.json({ received: true, duplicate: true });
        }
      } catch (err) {
        console.error("[Plaid Webhook] Idempotency check error:", err);
      }
    }

    console.log(`[Plaid Webhook] type=${webhook_type} code=${webhook_code} item=${item_id}`);

    // Look up the PlaidConnection by plaidItemId
    let plaidConnection: any = null;
    if (item_id) {
      plaidConnection = await prisma.plaidConnection.findFirst({
        where: { plaidItemId: item_id },
        include: {
          applicant: {
            select: { id: true, applicationId: true },
          },
        },
      });

      if (!plaidConnection) {
        console.warn(`[Plaid Webhook] No connection found for item=${item_id} (type=${webhook_type}/${webhook_code})`);
      }
    }

    // Helper to safely get applicant fields from plaidConnection
    const getApplicantId = (): string | null => plaidConnection?.applicant?.id || null;
    const getApplicationId = (): string | null => plaidConnection?.applicant?.applicationId || null;

    switch (webhook_type) {
      case "TRANSACTIONS": {
        switch (webhook_code) {
          case "INITIAL_UPDATE":
          case "DEFAULT_UPDATE":
          case "HISTORICAL_UPDATE": {
            // Plaid has new transaction data available
            // In the MVP pipeline, we sync transactions inline during pipeline execution
            // This webhook is informational — log it for debugging
            if (plaidConnection && getApplicationId()) {
              await prisma.plaidConnection.update({
                where: { id: plaidConnection.id },
                data: { transactionsSynced: true },
              });

              await prisma.screeningEvent.create({
                data: {
                  applicationId: getApplicationId()!,
                  applicantId: getApplicantId(),
                  eventType: "plaid_transactions_ready",
                  eventData: {
                    webhookCode: webhook_code,
                    itemId: item_id,
                  },
                },
              });
            }
            break;
          }

          case "TRANSACTIONS_REMOVED": {
            // Transactions were removed (rare) — log for audit
            console.warn(`[Plaid Webhook] Transactions removed for item=${item_id}`);
            break;
          }
        }
        break;
      }

      case "ITEM": {
        switch (webhook_code) {
          case "ERROR": {
            // Item entered error state — login required, etc.
            if (plaidConnection && getApplicationId()) {
              await prisma.plaidConnection.update({
                where: { id: plaidConnection.id },
                data: {
                  status: "error",
                  errorCode: String(error?.error_code || "UNKNOWN").slice(0, 100),
                },
              });

              await prisma.screeningEvent.create({
                data: {
                  applicationId: getApplicationId()!,
                  applicantId: getApplicantId(),
                  eventType: "plaid_item_error",
                  eventData: {
                    errorCode: String(error?.error_code || "").slice(0, 100),
                    errorMessage: String(error?.error_message || "").slice(0, 500),
                    itemId: item_id,
                  },
                },
              });
            }
            console.error(`[Plaid Webhook] Item error: item=${item_id} code=${error?.error_code}`);
            break;
          }

          case "PENDING_EXPIRATION": {
            // Access token will expire soon — log for monitoring
            console.warn(`[Plaid Webhook] Pending expiration for item=${item_id}`);
            if (plaidConnection && getApplicationId()) {
              await prisma.screeningEvent.create({
                data: {
                  applicationId: getApplicationId()!,
                  applicantId: getApplicantId(),
                  eventType: "plaid_pending_expiration",
                  eventData: { itemId: item_id },
                },
              });
            }
            break;
          }

          case "WEBHOOK_UPDATE_ACKNOWLEDGED": {
            // Webhook URL change confirmed — informational
            break;
          }
        }
        break;
      }

      case "IDENTITY": {
        // Identity verification data is available
        if (webhook_code === "DEFAULT_UPDATE" && plaidConnection) {
          await prisma.plaidConnection.update({
            where: { id: plaidConnection.id },
            data: { identityVerified: true },
          });
        }
        break;
      }

      default: {
        console.log(`[Plaid Webhook] Unhandled type: ${webhook_type}/${webhook_code}`);
      }
    }

    // Mark one-time events as processed after successful handling
    const oneTimeEventsPost = ["INITIAL_UPDATE", "ERROR", "PENDING_EXPIRATION"];
    if (item_id && oneTimeEventsPost.includes(webhook_code || "")) {
      const dedupKey = `${item_id}_${webhook_type}_${webhook_code}`;
      try {
        await markWebhookProcessed("plaid", dedupKey, `${webhook_type}.${webhook_code}`);
      } catch (err) {
        console.error("[Plaid Webhook] Failed to mark as processed:", err);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[Plaid Webhook] Handler error:", error);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
