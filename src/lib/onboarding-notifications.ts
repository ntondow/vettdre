"use server";

import prisma from "@/lib/prisma";

// ── Types ────────────────────────────────────────────────────

interface InviteEmailParams {
  clientEmail: string;
  clientFirstName: string;
  agentFullName: string;
  brokerageName: string;
  signingUrl: string;
  personalNote?: string;
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
  try {
    // Try to find agent's Gmail account for sending
    const agent = await prisma.brokerAgent.findFirst({
      where: { email: { contains: params.agentFullName.split(" ")[0], mode: "insensitive" } },
      select: { userId: true },
    });

    let gmailAccount = null;
    if (agent?.userId) {
      gmailAccount = await prisma.gmailAccount.findFirst({
        where: { userId: agent.userId },
        select: { id: true, email: true },
      });
    }

    if (gmailAccount) {
      // Use Gmail send
      const { sendEmail } = await import("@/lib/gmail-send");
      const user = agent?.userId ? await prisma.user.findUnique({ where: { id: agent.userId }, select: { orgId: true } }) : null;
      if (user?.orgId) {
        await sendEmail({
          gmailAccountId: gmailAccount.id,
          orgId: user.orgId,
          to: params.clientEmail,
          subject: `${params.agentFullName} at ${params.brokerageName} — Please sign your tenant representation documents`,
          bodyHtml: inviteEmailHtml(params),
        });
        return;
      }
    }

    // Fallback: log for now
    console.warn("[Onboarding] Email send not available — Gmail not connected. Would send invite to:", params.clientEmail);
    console.warn("[Onboarding] Signing URL:", params.signingUrl);
  } catch (error) {
    console.error("[Onboarding] Failed to send invite email:", error);
    // Non-fatal — the signing link still works
  }
}

export async function sendOnboardingCompleteNotification(params: CompleteNotificationParams): Promise<void> {
  try {
    console.log(`[Onboarding] Notifying agent ${params.agentEmail}: ${params.clientFullName} signed all docs (${params.onboardingId})`);
    // TODO: Send via Gmail if connected, or queue for email provider
    // For now, log the notification
  } catch (error) {
    console.error("[Onboarding] Failed to send completion notification:", error);
  }
}

export async function sendOnboardingReminder(params: ReminderParams): Promise<void> {
  try {
    // Try Gmail send, same as invite
    console.warn("[Onboarding] Reminder email not yet implemented. Would send to:", params.clientEmail);
    console.warn("[Onboarding] Signing URL:", params.signingUrl, "Days remaining:", params.daysRemaining);
  } catch (error) {
    console.error("[Onboarding] Failed to send reminder:", error);
  }
}
