/**
 * Didit Identity Verification Provider
 *
 * Integrates with Didit v3 API for KYC (ID Verify + Liveness + Face Match).
 * Docs: https://docs.didit.me
 */

import crypto from "crypto";
import type {
  IdvProviderClient,
  CreateSessionParams,
  CreateSessionResult,
  IdvResult,
  IdvStatus,
  WebhookParseResult,
} from "./idv-provider";

const DIDIT_API_BASE = "https://verification.didit.me/v3";
const REQUEST_TIMEOUT_MS = 15_000;

function getConfig() {
  const apiKey = process.env.DIDIT_API_KEY;
  const webhookSecret = process.env.DIDIT_WEBHOOK_SECRET;
  const workflowId = process.env.DIDIT_WORKFLOW_ID;
  if (!apiKey || !workflowId) {
    throw new Error("DIDIT_API_KEY and DIDIT_WORKFLOW_ID must be configured");
  }
  return { apiKey, webhookSecret, workflowId };
}

async function diditFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const { apiKey } = getConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${DIDIT_API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey,
        ...options.headers,
      },
    });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

function mapDiditStatus(status: string): IdvStatus {
  switch (status?.toLowerCase()) {
    case "approved":
    case "verified":
      return "approved";
    case "declined":
    case "rejected":
    case "denied":
      return "declined";
    case "in_review":
    case "review":
    case "pending_review":
      return "in_review";
    case "expired":
      return "expired";
    case "abandoned":
      return "abandoned";
    case "in_progress":
    case "started":
      return "in_progress";
    case "created":
    case "initialized":
      return "created";
    default:
      return "created";
  }
}

// ── Provider Implementation ──────────────────────────────────

export const diditProvider: IdvProviderClient = {
  name: "didit",

  async createSession(params: CreateSessionParams): Promise<CreateSessionResult> {
    const { workflowId } = getConfig();

    const body = {
      workflow_id: workflowId,
      vendor_data: `${params.applicationId}:${params.applicantId}`,
      callback: params.returnUrl,
      features: ["ocr", "face_match", "liveness"],
      ...(params.firstName || params.lastName || params.email
        ? {
            expected_details: {
              ...(params.firstName && { first_name: params.firstName }),
              ...(params.lastName && { last_name: params.lastName }),
            },
            contact_details: {
              ...(params.email && { email: params.email }),
            },
          }
        : {}),
    };

    const res = await diditFetch("/session/", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Didit createSession failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return {
      provider: "didit",
      sessionId: data.session_id || data.id,
      verificationUrl: data.url || data.verification_url,
    };
  },

  async getResult(sessionId: string): Promise<IdvResult> {
    const res = await diditFetch(`/session/${sessionId}/decision/`);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Didit getResult failed (${res.status}): ${errText}`);
    }

    const data = await res.json();
    const doc = data.document || data.documents?.[0] || {};
    const biometrics = data.biometrics || {};

    return {
      provider: "didit",
      sessionId,
      status: mapDiditStatus(data.status || data.decision),
      documentType: doc.type || doc.document_type,
      firstName: doc.first_name,
      lastName: doc.last_name,
      dateOfBirth: doc.date_of_birth,
      nationality: doc.nationality,
      issuingCountry: doc.issuing_country,
      livenessScore: biometrics.liveness_score ?? biometrics.liveness,
      faceMatchScore: biometrics.face_match_score ?? biometrics.face_match,
      documentQuality: doc.quality_score ?? doc.quality,
      warnings: Array.isArray(data.warnings) ? data.warnings : [],
      rawResponse: JSON.stringify(data),
    };
  },

  async parseWebhook(
    body: string,
    headers: Record<string, string>,
  ): Promise<WebhookParseResult | null> {
    const { webhookSecret } = getConfig();

    // Verify HMAC-SHA256 signature (required outside mock mode)
    if (!webhookSecret) {
      if (process.env.SCREENING_USE_MOCKS === "true") {
        // Allow unsigned webhooks in mock mode only
      } else {
        console.error("[IDV Didit] DIDIT_WEBHOOK_SECRET not configured — rejecting webhook");
        return null;
      }
    } else {
      const signature = headers["x-signature-v2"] || headers["x-signature"];
      const timestamp = headers["x-timestamp"] || "";

      if (!signature) {
        console.warn("[IDV Didit] Missing webhook signature header");
        return null;
      }

      // Validate timestamp freshness (5-minute window)
      if (timestamp) {
        const ts = parseInt(timestamp, 10);
        const now = Math.floor(Date.now() / 1000);
        if (Math.abs(now - ts) > 300) {
          console.warn("[IDV Didit] Webhook timestamp too old");
          return null;
        }
      }

      const payload = timestamp ? `${timestamp}.${body}` : body;
      const expected = crypto
        .createHmac("sha256", webhookSecret)
        .update(payload)
        .digest("hex");

      // Validate lengths match before constant-time comparison
      const sigBuf = Buffer.from(signature);
      const expBuf = Buffer.from(expected);
      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        console.warn("[IDV Didit] Webhook signature mismatch");
        return null;
      }
    }

    const data = JSON.parse(body);
    const sessionId = data.session_id || data.data?.session_id || data.id;
    const status = mapDiditStatus(data.status || data.data?.status || "");

    if (!sessionId) {
      console.warn("[IDV Didit] Webhook missing session_id");
      return null;
    }

    return {
      sessionId,
      status,
      shouldFetchResult: status === "approved" || status === "declined",
    };
  },
};
