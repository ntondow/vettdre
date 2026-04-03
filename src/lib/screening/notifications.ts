/**
 * Screening Notification Helpers
 *
 * Email (Resend), SMS (Twilio), and Push notifications for screening events.
 * Follows patterns from lib/onboarding-notifications.ts and lib/deal-notifications.ts.
 */

import { sendTransactionalEmail } from "@/lib/resend";
import { getTwilio } from "@/lib/twilio";
import { sendPushNotification } from "@/lib/push-notifications";
import { formatCents, getRiskScoreColor } from "./utils";
import { STATUS_CONFIG, RISK_COLORS } from "./constants";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.vettdre.com";

// ── Invite Notifications ──────────────────────────────────────

export async function sendScreeningInviteEmail(params: {
  applicantEmail: string;
  applicantFirstName: string;
  agentName: string;
  propertyAddress: string;
  unitNumber?: string;
  screeningUrl: string;
}): Promise<{ success: boolean; error?: string }> {
  const { applicantEmail, applicantFirstName, agentName, propertyAddress, unitNumber, screeningUrl } = params;
  const property = unitNumber ? `${propertyAddress}, Unit ${unitNumber}` : propertyAddress;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-size: 20px; font-weight: 700;">Vettd<span style="color: #2563eb;">RE</span></span>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px;">
        <h2 style="margin: 0 0 8px; font-size: 18px; color: #0f172a;">Complete Your Rental Application</h2>
        <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 16px;">
          Hi ${applicantFirstName || "there"},<br/><br/>
          ${agentName} has invited you to complete a rental application for <strong>${property}</strong>.
        </p>
        <p style="font-size: 14px; color: #475569; line-height: 1.6; margin: 0 0 24px;">
          This quick, secure process includes identity verification, a credit check, and bank account verification.
          The application fee is <strong>$20.00</strong>, compliant with NYC screening fee regulations.
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${screeningUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
            Start Application
          </a>
        </div>
        <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 16px 0 0;">
          This link is unique to your application. Do not share it with others.
        </p>
      </div>
      <p style="font-size: 11px; color: #94a3b8; text-align: center; margin-top: 16px;">
        Powered by VettdRE • Secure tenant screening
      </p>
    </div>
  `;

  return sendTransactionalEmail({
    to: applicantEmail,
    subject: `Complete Your Rental Application — ${property}`,
    html,
  });
}

export async function sendScreeningInviteSMS(params: {
  applicantPhone: string;
  agentName: string;
  propertyAddress: string;
  screeningUrl: string;
  fromNumber: string;
}): Promise<void> {
  const { applicantPhone, agentName, propertyAddress, screeningUrl, fromNumber } = params;

  try {
    await getTwilio().messages.create({
      body: `${agentName} invited you to complete a rental application for ${propertyAddress}. Start here: ${screeningUrl}`,
      from: fromNumber,
      to: applicantPhone,
    });
  } catch (error) {
    console.error("Failed to send screening invite SMS:", error);
  }
}

// ── Agent Notifications ───────────────────────────────────────

export async function notifyAgentScreeningComplete(params: {
  agentEmail: string;
  agentUserId: string;
  agentFirstName: string;
  applicantName: string;
  propertyAddress: string;
  riskScore: number;
  recommendation: string;
  applicationId: string;
}): Promise<void> {
  const { agentEmail, agentUserId, agentFirstName, applicantName, propertyAddress, riskScore, recommendation, applicationId } = params;

  const color = getRiskScoreColor(riskScore);
  const colorMap = { green: "#059669", yellow: "#d97706", red: "#dc2626" };
  const bgMap = { green: "#d1fae5", yellow: "#fef3c7", red: "#fee2e2" };
  const recLabel = recommendation === "approve" ? "APPROVE" : recommendation === "conditional" ? "CONDITIONAL" : "DECLINE";

  // Email notification
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-size: 20px; font-weight: 700;">Vettd<span style="color: #2563eb;">RE</span></span>
      </div>
      <div style="background: ${bgMap[color]}; border: 1px solid ${colorMap[color]}20; border-radius: 12px; padding: 24px;">
        <div style="display: inline-block; background: ${colorMap[color]}; color: white; padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: 600; margin-bottom: 12px;">
          ${recLabel}
        </div>
        <h2 style="margin: 0 0 8px; font-size: 18px; color: #0f172a;">Screening Report Ready</h2>
        <p style="font-size: 14px; color: #334155; line-height: 1.6; margin: 0 0 8px;">
          Hi ${agentFirstName},<br/><br/>
          The screening report for <strong>${applicantName}</strong> at <strong>${propertyAddress}</strong> is ready.
        </p>
        <div style="background: white; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <div style="font-size: 32px; font-weight: 700; color: ${colorMap[color]}; text-align: center;">
            ${riskScore}
          </div>
          <div style="font-size: 12px; color: #64748b; text-align: center;">VettdRE Risk Score</div>
        </div>
      </div>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${APP_URL}/screening/${applicationId}" style="display: inline-block; background: #2563eb; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          View Full Report
        </a>
      </div>
    </div>
  `;

  // Fire email (non-blocking)
  sendTransactionalEmail({
    to: agentEmail,
    subject: `Screening ${recLabel}: ${applicantName} — ${propertyAddress}`,
    html,
  }).catch(err => console.error("Screening email error:", err));

  // Fire push notification (non-blocking)
  sendPushNotification(agentUserId, {
    title: `Screening ${recLabel}`,
    body: `${applicantName} at ${propertyAddress} — Score: ${riskScore}`,
    url: `/screening/${applicationId}`,
    tag: "screening_complete",
  }).catch(err => console.error("Screening push error:", err));
}

export async function notifyAgentEnhancedDowngrade(params: {
  agentEmail: string;
  agentFirstName: string;
  applicantName: string;
  propertyAddress: string;
  applicationId: string;
  failureReason: string;
}): Promise<void> {
  const { agentEmail, agentFirstName, applicantName, propertyAddress, applicationId, failureReason } = params;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-size: 20px; font-weight: 700;">Vettd<span style="color: #2563eb;">RE</span></span>
      </div>
      <div style="background: #fff7ed; border: 1px solid #fdba7420; border-radius: 12px; padding: 24px;">
        <div style="display: inline-block; background: #f97316; color: white; padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: 600; margin-bottom: 12px;">
          NOTICE
        </div>
        <h2 style="margin: 0 0 8px; font-size: 18px; color: #0f172a;">Enhanced Screening Downgraded</h2>
        <p style="font-size: 14px; color: #334155; line-height: 1.6;">
          Hi ${agentFirstName},<br/><br/>
          The enhanced screening charge for <strong>${applicantName}</strong> at <strong>${propertyAddress}</strong> could not be processed.
          <br/><br/>
          <strong>Reason:</strong> ${failureReason}
          <br/><br/>
          The application will proceed with a base screening instead. To retry the enhanced screening, update your card on file and contact support.
        </p>
      </div>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${APP_URL}/screening/billing" style="display: inline-block; background: #2563eb; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Update Card
        </a>
      </div>
    </div>
  `;

  sendTransactionalEmail({
    to: agentEmail,
    subject: `Enhanced Screening Downgraded — ${applicantName}`,
    html,
  }).catch(err => console.error("Downgrade email error:", err));
}

// ── Pipeline Failure Notification ────────────────────────────

export async function notifyAgentScreeningFailed(params: {
  agentEmail: string;
  agentUserId: string;
  agentFirstName: string;
  applicantName: string;
  propertyAddress: string;
  applicationId: string;
  failureReasons: string[];
}): Promise<void> {
  const { agentEmail, agentUserId, agentFirstName, applicantName, propertyAddress, applicationId, failureReasons } = params;

  const reasonsList = failureReasons.map(r => `<li style="margin-bottom: 4px;">${r}</li>`).join("");

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-size: 20px; font-weight: 700;">Vettd<span style="color: #2563eb;">RE</span></span>
      </div>
      <div style="background: #fef2f2; border: 1px solid #fecaca40; border-radius: 12px; padding: 24px;">
        <div style="display: inline-block; background: #dc2626; color: white; padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: 600; margin-bottom: 12px;">
          ACTION NEEDED
        </div>
        <h2 style="margin: 0 0 8px; font-size: 18px; color: #0f172a;">Screening Pipeline Error</h2>
        <p style="font-size: 14px; color: #334155; line-height: 1.6;">
          Hi ${agentFirstName},<br/><br/>
          The screening for <strong>${applicantName}</strong> at <strong>${propertyAddress}</strong> encountered errors during processing.
        </p>
        <ul style="font-size: 13px; color: #64748b; padding-left: 20px;">${reasonsList}</ul>
        <p style="font-size: 14px; color: #334155; line-height: 1.6;">
          The application has been marked as complete with partial results. Please review the application and contact support if the issue persists.
        </p>
      </div>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${APP_URL}/screening/${applicationId}" style="display: inline-block; background: #2563eb; color: white; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          View Application
        </a>
      </div>
    </div>
  `;

  sendTransactionalEmail({
    to: agentEmail,
    subject: `Screening Error — ${applicantName} at ${propertyAddress}`,
    html,
  }).catch(err => console.error("Screening failure email error:", err));

  sendPushNotification(agentUserId, {
    title: "Screening Pipeline Error",
    body: `Screening for ${applicantName} at ${propertyAddress} had processing errors. Review needed.`,
    url: `/screening/${applicationId}`,
    tag: "screening_failed",
  }).catch(err => console.error("Screening failure push error:", err));
}
