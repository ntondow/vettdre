/**
 * Stripe Identity Verification Provider (Fallback)
 *
 * Uses Stripe Identity for document + selfie verification.
 * Only used as fallback when Didit is unavailable.
 */

import { getStripe } from "@/lib/stripe";
import type {
  IdvProviderClient,
  CreateSessionParams,
  CreateSessionResult,
  IdvResult,
  IdvStatus,
  WebhookParseResult,
} from "./idv-provider";

function mapStripeStatus(status: string): IdvStatus {
  switch (status) {
    case "verified":
      return "approved";
    case "canceled":
      return "abandoned";
    case "requires_input":
      return "in_progress";
    default:
      return "created";
  }
}

function mapStripeLastError(lastError: { code?: string } | null): IdvStatus {
  if (!lastError) return "approved";
  switch (lastError.code) {
    case "document_expired":
    case "document_unverified_other":
    case "document_type_not_supported":
    case "selfie_document_missing_photo":
    case "selfie_face_mismatch":
    case "selfie_unverified_other":
      return "declined";
    default:
      return "declined";
  }
}

// ── Provider Implementation ──────────────────────────────────

export const stripeIdentityProvider: IdvProviderClient = {
  name: "stripe",

  async createSession(params: CreateSessionParams): Promise<CreateSessionResult> {
    const stripe = getStripe();

    const session = await stripe.identity.verificationSessions.create({
      type: "document",
      metadata: {
        applicationId: params.applicationId,
        applicantId: params.applicantId,
      },
      options: {
        document: {
          require_matching_selfie: true,
        },
      },
      return_url: params.returnUrl,
    });

    return {
      provider: "stripe",
      sessionId: session.id,
      verificationUrl: session.url!,
    };
  },

  async getResult(sessionId: string): Promise<IdvResult> {
    const stripe = getStripe();

    const session = await stripe.identity.verificationSessions.retrieve(
      sessionId,
      { expand: ["verified_outputs"] },
    );

    let status: IdvStatus;
    if (session.status === "verified") {
      status = session.last_error ? mapStripeLastError(session.last_error) : "approved";
    } else if (session.status === "canceled") {
      status = "abandoned";
    } else {
      status = mapStripeStatus(session.status);
    }

    const outputs = (session as any).verified_outputs;

    return {
      provider: "stripe",
      sessionId,
      status,
      documentType: outputs?.id_number_type || undefined,
      firstName: outputs?.first_name || undefined,
      lastName: outputs?.last_name || undefined,
      dateOfBirth: outputs?.dob
        ? `${outputs.dob.year}-${String(outputs.dob.month).padStart(2, "0")}-${String(outputs.dob.day).padStart(2, "0")}`
        : undefined,
      nationality: undefined,
      issuingCountry: outputs?.issuing_country || undefined,
      // Stripe doesn't expose granular scores; use 95 for verified, 0 for failed
      livenessScore: status === "approved" ? 95 : undefined,
      faceMatchScore: status === "approved" ? 95 : undefined,
      documentQuality: status === "approved" ? 90 : undefined,
      warnings: session.last_error ? [session.last_error.code || "verification_failed"] : [],
      rawResponse: JSON.stringify(session),
    };
  },

  async parseWebhook(
    body: string,
    headers: Record<string, string>,
  ): Promise<WebhookParseResult | null> {
    // Stripe webhook signature verification is handled by the existing
    // /api/webhooks/stripe route. This method is called after verification.
    const data = JSON.parse(body);
    const eventType = data.type;

    if (!eventType?.startsWith("identity.verification_session.")) {
      return null;
    }

    const session = data.data?.object;
    if (!session?.id) return null;

    const status = mapStripeStatus(session.status);

    return {
      sessionId: session.id,
      status,
      shouldFetchResult: session.status === "verified" || session.status === "canceled",
    };
  },
};
