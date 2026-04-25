import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isWebhookProcessed, markWebhookProcessed } from "@/lib/webhook-idempotency";
import { encryptToken } from "@/lib/encryption";
import { getIdvProviderByName } from "@/lib/screening/idv-factory";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();

    // Build headers map (lowercase keys)
    const headers: Record<string, string> = {};
    req.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    // Skip signature verification in mock mode
    const useMocks = process.env.SCREENING_USE_MOCKS === "true";

    // Parse + verify webhook via provider
    const provider = getIdvProviderByName("didit");
    let parsed;

    if (useMocks) {
      // In mock mode, just parse the body without signature check
      const data = JSON.parse(rawBody);
      const sessionId = data.session_id || data.data?.session_id || data.id;
      if (!sessionId) {
        return NextResponse.json({ error: "Missing session_id" }, { status: 400 });
      }
      parsed = {
        sessionId,
        status: data.status || "approved",
        shouldFetchResult: true,
      };
    } else {
      parsed = await provider.parseWebhook(rawBody, headers);
      if (!parsed) {
        console.warn("[IDV Webhook] Signature verification failed");
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    // Idempotency check
    const dedupKey = `didit_idv_${parsed.sessionId}_${parsed.status}`;
    if (await isWebhookProcessed("didit", dedupKey)) {
      return NextResponse.json({ received: true, deduplicated: true });
    }

    // Look up the verification record
    const verification = await prisma.identityVerification.findUnique({
      where: { providerSessionId: parsed.sessionId },
    });

    if (!verification) {
      console.warn(`[IDV Webhook] No verification found for sessionId=${parsed.sessionId}`);
      // Return 200 to prevent Didit from retrying
      return NextResponse.json({ received: true, unknown_session: true });
    }

    // If should fetch full result, do so
    if (parsed.shouldFetchResult) {
      try {
        const result = await provider.getResult(parsed.sessionId);

        await prisma.identityVerification.update({
          where: { providerSessionId: parsed.sessionId },
          data: {
            status: result.status,
            documentType: result.documentType,
            firstName: result.firstName,
            lastName: result.lastName,
            dateOfBirth: result.dateOfBirth ? new Date(result.dateOfBirth) : null,
            nationality: result.nationality,
            issuingCountry: result.issuingCountry,
            livenessScore: result.livenessScore,
            faceMatchScore: result.faceMatchScore,
            documentQuality: result.documentQuality,
            warnings: result.warnings,
            rawResponseEncrypted: encryptToken(result.rawResponse),
            completedAt: new Date(),
          },
        });

        await prisma.screeningEvent.create({
          data: {
            applicationId: verification.applicationId,
            applicantId: verification.applicantId,
            eventType: result.status === "approved" ? "idv_approved" : "idv_declined",
            eventData: {
              provider: "didit",
              sessionId: parsed.sessionId,
              status: result.status,
              livenessScore: result.livenessScore,
              faceMatchScore: result.faceMatchScore,
              documentQuality: result.documentQuality,
              source: "webhook",
            } as any,
          },
        });
      } catch (fetchError) {
        console.error("[IDV Webhook] Failed to fetch full result:", fetchError);
        // Still update status from webhook payload
        await prisma.identityVerification.update({
          where: { providerSessionId: parsed.sessionId },
          data: { status: parsed.status },
        });
      }
    } else {
      // Just update status
      await prisma.identityVerification.update({
        where: { providerSessionId: parsed.sessionId },
        data: {
          status: parsed.status,
          ...(["approved", "declined"].includes(parsed.status) ? { completedAt: new Date() } : {}),
        },
      });
    }

    // Mark as processed
    await markWebhookProcessed("didit", dedupKey, `idv_${parsed.status}`);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[IDV Webhook] Error:", error);
    // Return 200 to prevent infinite retries on our errors
    return NextResponse.json({ received: true, error: "Internal processing error" });
  }
}
