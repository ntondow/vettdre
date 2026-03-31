// ============================================================
// Deal Submission Notifications — Email + In-App
// ============================================================

import { sendTransactionalEmail } from "@/lib/resend";
import prisma from "@/lib/prisma";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.vettdre.com";

// ── Types ────────────────────────────────────────────────────

interface NotifyParams {
  submissionId: string;
  orgId: string;
  agentId: string | null;
  propertyAddress: string;
  status: "approved" | "rejected" | "invoiced";
  reviewerName: string;
  rejectionReason?: string;
}

// ── Send Notification (email + in-app) ───────────────────────

export async function notifyAgentOfStatusChange(params: NotifyParams): Promise<void> {
  const { submissionId, orgId, agentId, propertyAddress, status, reviewerName, rejectionReason } = params;

  // Resolve the agent's email and name
  if (!agentId) return;

  const agent = await prisma.brokerAgent.findUnique({
    where: { id: agentId },
    select: { email: true, firstName: true, lastName: true, userId: true },
  });
  if (!agent?.email) return;

  const agentFirstName = agent.firstName || "Agent";
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { name: true },
  });
  const orgName = org?.name || "your brokerage";

  // ── Email notification ──────────────────────────────────────

  const subject = status === "approved"
    ? `Deal Approved: ${propertyAddress}`
    : status === "rejected"
      ? `Deal Update: ${propertyAddress}`
      : `Invoice Created: ${propertyAddress}`;

  const statusLabel = status === "approved" ? "Approved" : status === "rejected" ? "Needs Attention" : "Invoiced";
  const statusColor = status === "approved" ? "#16a34a" : status === "rejected" ? "#dc2626" : "#7c3aed";
  const statusBg = status === "approved" ? "#f0fdf4" : status === "rejected" ? "#fef2f2" : "#f5f3ff";

  const messageBody = status === "approved"
    ? `Your deal submission for <strong>${propertyAddress}</strong> has been approved by ${reviewerName}. You can view the details in your My Deals page.`
    : status === "rejected"
      ? `Your deal submission for <strong>${propertyAddress}</strong> needs attention.${rejectionReason ? ` <br/><br/><strong>Reason:</strong> ${rejectionReason}` : ""}`
      : `An invoice has been created for your approved deal at <strong>${propertyAddress}</strong>.`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-size: 20px; font-weight: 700; color: #0f172a;">Vettd<span style="color: #2563eb;">RE</span></span>
      </div>
      <div style="background: ${statusBg}; border: 1px solid ${statusColor}20; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <div style="display: inline-block; background: ${statusColor}; color: white; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; padding: 3px 10px; border-radius: 99px; margin-bottom: 12px;">
          ${statusLabel}
        </div>
        <p style="font-size: 14px; color: #334155; line-height: 1.6; margin: 0;">
          Hi ${agentFirstName},<br/><br/>
          ${messageBody}
        </p>
      </div>
      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${APP_URL}/brokerage/my-deals" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; font-size: 14px; font-weight: 600; padding: 10px 24px; border-radius: 8px;">
          View My Deals
        </a>
      </div>
      <p style="font-size: 12px; color: #94a3b8; text-align: center;">
        ${orgName} &middot; Powered by VettdRE
      </p>
    </div>
  `;

  // Fire-and-forget — don't block the main action
  sendTransactionalEmail({ to: agent.email, subject, html }).catch((err) => {
    console.error("[deal-notifications] Email send failed:", err);
  });

  // ── In-app notification (AuditLog for agent visibility) ──────

  if (agent.userId) {
    try {
      await prisma.auditLog.create({
        data: {
          orgId,
          userId: agent.userId,
          actorName: reviewerName,
          action: `deal_submission_${status}`,
          entityType: "deal_submission",
          entityId: submissionId,
          metadata: {
            propertyAddress,
            status,
            rejectionReason: rejectionReason || null,
            isAgentNotification: true,
          },
        },
      });
    } catch (err) {
      console.error("[deal-notifications] AuditLog create failed:", err);
    }
  }
}
