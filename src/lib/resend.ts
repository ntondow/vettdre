// ============================================================
// Resend — Transactional email client
// ============================================================

import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;
const resendClient = resendApiKey ? new Resend(resendApiKey) : null;

const DEFAULT_FROM = "VettdRE <noreply@vettdre.com>";

interface SendParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
}

export async function sendTransactionalEmail(
  params: SendParams,
): Promise<{ success: boolean; error?: string }> {
  if (!resendClient) {
    console.warn("[Resend] RESEND_API_KEY not configured — email not sent to:", params.to);
    return { success: false, error: "Resend not configured" };
  }

  try {
    const { data, error } = await resendClient.emails.send({
      from: params.from || DEFAULT_FROM,
      to: params.to,
      subject: params.subject,
      html: params.html,
      replyTo: params.replyTo,
    });

    if (error) {
      console.error("[Resend] Send failed:", error);
      return { success: false, error: error.message };
    }

    console.log("[Resend] Email sent:", data?.id, "to:", params.to);
    return { success: true };
  } catch (err) {
    console.error("[Resend] Error:", err);
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export function isResendConfigured(): boolean {
  return !!resendClient;
}
