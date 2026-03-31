"use server";

import prisma from "@/lib/prisma";
import { sendTransactionalEmail, isResendConfigured } from "@/lib/resend";
import { getTwilio } from "@/lib/twilio";

// ── Types ────────────────────────────────────────────────────

interface InviteEmailParams {
  clientEmail: string;
  clientFirstName: string;
  agentFullName: string;
  brokerageName: string;
  signingUrl: string;
  personalNote?: string;
  orgId?: string;
  agentUserId?: string;
}

interface CompleteNotificationParams {
  agentEmail: string;
  agentFirstName: string;
  clientFullName: string;
  onboardingId: string;
}

interface ReminderParams {
  clientEmail: string;
  clientFirstName: string;
  agentFullName: string;
  brokerageName: string;
  signingUrl: string;
  daysRemaining: number;
}

// ── Email Templates ──────────────────────────────────────────

function inviteEmailHtml(params: InviteEmailParams): string {
  const { clientFirstName, agentFullName, brokerageName, signingUrl, personalNote } = params;
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:#1e40af;padding:24px 32px;">
      <h1 style="margin:0;color:#fff;font-size:18px;font-weight:600;">${brokerageName}</h1>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 16px;color:#334155;font-size:15px;">Hi ${clientFirstName},</p>
      <p style="margin:0 0 16px;color:#334155;font-size:15px;">
        ${agentFullName} at ${brokerageName} has invited you to review and sign your tenant representation documents.
      </p>
      ${personalNote ? `<div style="margin:0 0 16px;padding:12px 16px;background:#f1f5f9;border-radius:8px;border-left:3px solid #3b82f6;">
        <p style="margin:0;color:#475569;font-size:14px;font-style:italic;">"${personalNote}"</p>
        <p style="margin:8px 0 0;color:#64748b;font-size:12px;">— ${agentFullName}</p>
      </div>` : ""}
      <div style="text-align:center;margin:24px 0;">
        <a href="${signingUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
          Review &amp; Sign Documents
        </a>
      </div>
      <p style="margin:16px 0 0;color:#94a3b8;font-size:13px;">
        This link will expire in a few days. If you have questions, reply to this email or contact your agent directly.
      </p>
    </div>
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
      <p style="margin:0;color:#94a3b8;font-size:11px;text-align:center;">
        Powered by VettdRE &middot; Secure electronic document signing
      </p>
    </div>
  </div>
</body>
</html>`.trim();
}

function completeEmailHtml(params: CompleteNotificationParams): string {
  const { agentFirstName, clientFullName, onboardingId } = params;
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:32px;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;width:48px;height:48px;border-radius:50%;background:#dcfce7;line-height:48px;text-align:center;font-size:24px;">✓</div>
    </div>
    <h2 style="margin:0 0 8px;text-align:center;color:#166534;font-size:18px;">Documents Signed</h2>
    <p style="margin:0 0 16px;text-align:center;color:#334155;font-size:15px;">
      Hi ${agentFirstName}, <strong>${clientFullName}</strong> has signed all onboarding documents.
    </p>
    <p style="margin:0;text-align:center;color:#64748b;font-size:13px;">
      View the onboarding details and generate an invoice from your VettdRE dashboard.
    </p>
  </div>
</body>
</html>`.trim();
}

function reminderEmailHtml(params: ReminderParams): string {
  const { clientFirstName, agentFullName, brokerageName, signingUrl, daysRemaining } = params;
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:32px;">
    <p style="margin:0 0 16px;color:#334155;font-size:15px;">Hi ${clientFirstName},</p>
    <p style="margin:0 0 16px;color:#334155;font-size:15px;">
      This is a reminder from ${agentFullName} at ${brokerageName} — you have documents waiting for your signature.
      ${daysRemaining > 0 ? `This link expires in <strong>${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}</strong>.` : "This link expires soon."}
    </p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${signingUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
        Review &amp; Sign Now
      </a>
    </div>
    <p style="margin:16px 0 0;color:#94a3b8;font-size:13px;">
      If you've already signed, please disregard this email.
    </p>
  </div>
</body>
</html>`.trim();
}

// ── Send Functions ───────────────────────────────────────────

export async function sendOnboardingInviteEmail(params: InviteEmailParams): Promise<void> {
  const subject = `${params.agentFullName} at ${params.brokerageName} — Please sign your tenant representation documents`;
  const html = inviteEmailHtml(params);

  try {
    // 1. Try Resend first
    if (isResendConfigured()) {
      const result = await sendTransactionalEmail({ to: params.clientEmail, subject, html });
      if (result.success) {
        console.log("[Onboarding] Invite sent via Resend to:", params.clientEmail);
        return;
      }
      console.warn("[Onboarding] Resend failed, falling back to Gmail:", result.error);
    }

    // 2. Fall back to Gmail if agent has it connected
    if (params.orgId || params.agentUserId) {
      const gmailAccount = await prisma.gmailAccount.findFirst({
        where: params.agentUserId
          ? { userId: params.agentUserId }
          : { user: { orgId: params.orgId! } },
        select: { id: true, userId: true },
      });

      if (gmailAccount) {
        const { sendEmail } = await import("@/lib/gmail-send");
        await sendEmail({
          gmailAccountId: gmailAccount.id,
          orgId: params.orgId,
          to: params.clientEmail,
          subject,
          bodyHtml: html,
        });
        console.log("[Onboarding] Invite sent via Gmail to:", params.clientEmail);
        return;
      }
    }

    console.warn("[Onboarding] No email provider available — invite not sent to:", params.clientEmail);
    console.warn("[Onboarding] Signing URL:", params.signingUrl);
  } catch (error) {
    console.error("[Onboarding] Failed to send invite email:", error);
  }
}

export async function sendOnboardingCompleteNotification(params: CompleteNotificationParams): Promise<void> {
  const subject = `${params.clientFullName} has signed all onboarding documents`;
  const html = completeEmailHtml(params);

  try {
    if (isResendConfigured()) {
      const result = await sendTransactionalEmail({ to: params.agentEmail, subject, html });
      if (result.success) {
        console.log("[Onboarding] Completion notification sent to:", params.agentEmail);
        return;
      }
      console.warn("[Onboarding] Resend failed for completion notification:", result.error);
    }

    console.log(`[Onboarding] Agent notification (no email provider): ${params.agentEmail} — ${params.clientFullName} signed all docs (${params.onboardingId})`);
  } catch (error) {
    console.error("[Onboarding] Failed to send completion notification:", error);
  }
}

export async function sendOnboardingReminder(params: ReminderParams): Promise<void> {
  const subject = `Reminder: Please sign your documents — ${params.daysRemaining > 0 ? `${params.daysRemaining} day${params.daysRemaining !== 1 ? "s" : ""} remaining` : "expiring soon"}`;
  const html = reminderEmailHtml(params);

  try {
    if (isResendConfigured()) {
      const result = await sendTransactionalEmail({ to: params.clientEmail, subject, html });
      if (result.success) {
        console.log("[Onboarding] Reminder sent to:", params.clientEmail);
        return;
      }
      console.warn("[Onboarding] Resend failed for reminder:", result.error);
    }

    console.warn("[Onboarding] No email provider — reminder not sent to:", params.clientEmail);
  } catch (error) {
    console.error("[Onboarding] Failed to send reminder:", error);
  }
}

// ── SMS Functions ───────────────────────────────────────────

interface SmsInviteParams {
  clientPhone: string;
  clientFirstName: string;
  agentFullName: string;
  brokerageName: string;
  signingUrl: string;
  fromNumber: string; // E.164 Twilio number
}

interface SmsReminderParams {
  clientPhone: string;
  clientFirstName: string;
  agentFullName: string;
  brokerageName: string;
  signingUrl: string;
  daysRemaining: number;
  fromNumber: string;
}

export async function sendOnboardingInviteSms(params: SmsInviteParams): Promise<{ success: boolean; error?: string }> {
  const { clientPhone, clientFirstName, agentFullName, brokerageName, signingUrl, fromNumber } = params;

  const body =
    `Hi ${clientFirstName}, ${agentFullName} at ${brokerageName} has invited you to sign your tenant representation documents.\n\n` +
    `Review & sign here: ${signingUrl}\n\n` +
    `This link expires in a few days. Reply STOP to opt out.`;

  try {
    const twilio = getTwilio();
    await twilio.messages.create({
      to: clientPhone,
      from: fromNumber,
      body,
    });
    console.log("[Onboarding] SMS invite sent to:", clientPhone);
    return { success: true };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown SMS error";
    console.error("[Onboarding] SMS invite failed:", msg);
    return { success: false, error: msg };
  }
}

export async function sendOnboardingReminderSms(params: SmsReminderParams): Promise<{ success: boolean; error?: string }> {
  const { clientPhone, clientFirstName, agentFullName, brokerageName, signingUrl, daysRemaining, fromNumber } = params;

  const urgency = daysRemaining > 0
    ? `Your link expires in ${daysRemaining} day${daysRemaining !== 1 ? "s" : ""}.`
    : "Your link expires soon.";

  const body =
    `Hi ${clientFirstName}, reminder from ${agentFullName} at ${brokerageName} — you have documents waiting for your signature. ${urgency}\n\n` +
    `Sign here: ${signingUrl}\n\n` +
    `Reply STOP to opt out.`;

  try {
    const twilio = getTwilio();
    await twilio.messages.create({
      to: clientPhone,
      from: fromNumber,
      body,
    });
    console.log("[Onboarding] SMS reminder sent to:", clientPhone);
    return { success: true };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown SMS error";
    console.error("[Onboarding] SMS reminder failed:", msg);
    return { success: false, error: msg };
  }
}

/**
 * Look up the org's Twilio phone number to send from.
 * Prefers the current user's number, falls back to any active org number.
 */
export async function getOrgTwilioNumber(orgId: string, userId?: string): Promise<string | null> {
  // Try user-specific number first
  if (userId) {
    const userPhone = await prisma.phoneNumber.findFirst({
      where: { userId, organizationId: orgId, status: "active" },
      select: { number: true },
    });
    if (userPhone) return userPhone.number;
  }

  // Fall back to any active org number
  const orgPhone = await prisma.phoneNumber.findFirst({
    where: { organizationId: orgId, status: "active" },
    select: { number: true },
  });
  return orgPhone?.number ?? null;
}
