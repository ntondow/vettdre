/**
 * FCRA Adverse Action Notice
 *
 * When a landlord/agent declines an applicant based on screening data,
 * FCRA Section 615(a) requires an adverse action notice to the consumer.
 *
 * Required disclosures:
 *   1. Name, address, and phone number of the credit bureau(s) used
 *   2. Statement that the bureau did not make the adverse decision
 *   3. Consumer's right to obtain a free copy of their report within 60 days
 *   4. Consumer's right to dispute the accuracy of the report
 *   5. The consumer's credit score(s) used in the decision
 */

import prisma from "@/lib/prisma";
import { sendTransactionalEmail } from "@/lib/resend";

// ── Bureau Contact Information ───────────────────────────────

const BUREAU_INFO: Record<string, { name: string; address: string; phone: string; website: string }> = {
  equifax: {
    name: "Equifax Information Services LLC",
    address: "P.O. Box 740241, Atlanta, GA 30374-0241",
    phone: "1-800-685-1111",
    website: "www.equifax.com",
  },
  experian: {
    name: "Experian",
    address: "P.O. Box 4500, Allen, TX 75013",
    phone: "1-888-397-3742",
    website: "www.experian.com",
  },
  transunion: {
    name: "TransUnion LLC",
    address: "P.O. Box 1000, Chester, PA 19016",
    phone: "1-800-916-8800",
    website: "www.transunion.com",
  },
};

// ── Send Adverse Action Notice ───────────────────────────────

export async function sendAdverseActionNotice(
  applicationId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const application = await prisma.screeningApplication.findUnique({
      where: { id: applicationId },
      include: {
        applicants: {
          where: { role: "main" },
          include: { creditReports: true },
        },
        organization: { select: { name: true } },
        agent: { select: { fullName: true } },
      },
    });

    if (!application) {
      return { success: false, error: "Application not found" };
    }

    const applicant = application.applicants[0];
    if (!applicant) {
      return { success: false, error: "No primary applicant found" };
    }

    // Collect bureau info from credit reports
    const creditReports = applicant.creditReports || [];
    const bureausUsed = creditReports
      .map((r) => r.bureau)
      .filter((b, i, arr) => arr.indexOf(b) === i); // dedupe

    const bureauSections = bureausUsed
      .map((bureau) => {
        const info = BUREAU_INFO[bureau];
        const report = creditReports.find((r) => r.bureau === bureau);
        if (!info) return "";
        return `
          <tr>
            <td style="padding: 12px; border-bottom: 1px solid #e2e8f0;">
              <strong>${info.name}</strong><br/>
              <span style="color: #64748b; font-size: 13px;">
                ${info.address}<br/>
                Phone: ${info.phone}<br/>
                Website: ${info.website}
              </span>
              ${report?.creditScore != null ? `<br/><span style="color: #334155; font-size: 13px;">Credit Score Provided: <strong>${report.creditScore}</strong> (${report.scoreModel || "VantageScore"})</span>` : ""}
            </td>
          </tr>`;
      })
      .join("");

    const applicantName = `${applicant.firstName || ""} ${applicant.lastName || ""}`.trim() || "Applicant";
    const propertyAddress = application.propertyAddress + (application.unitNumber ? ` #${application.unitNumber}` : "");
    const orgName = application.organization?.name || "Property Manager";
    const decisionDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; margin: 0; padding: 0;">
<div style="max-width: 600px; margin: 0 auto; padding: 32px 16px;">
  <div style="background: white; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">

    <!-- Header -->
    <div style="background: #1e293b; padding: 24px 32px;">
      <h1 style="color: white; font-size: 18px; margin: 0;">Notice of Adverse Action</h1>
      <p style="color: #94a3b8; font-size: 13px; margin: 6px 0 0;">Pursuant to the Fair Credit Reporting Act (FCRA)</p>
    </div>

    <div style="padding: 32px;">

      <!-- Applicant & Property -->
      <p style="color: #334155; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
        Dear ${applicantName},
      </p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
        This notice is to inform you that your rental application for
        <strong>${propertyAddress}</strong> submitted to <strong>${orgName}</strong>
        was not approved. This decision was based, in whole or in part, on information
        contained in a consumer report obtained from the consumer reporting agency(ies) listed below.
      </p>

      <p style="color: #64748b; font-size: 13px; margin: 0 0 24px;">
        Date of Decision: ${decisionDate}
      </p>

      <!-- Bureau Information -->
      <h2 style="color: #1e293b; font-size: 15px; margin: 0 0 12px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">
        Consumer Reporting Agency(ies) Used
      </h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        ${bureauSections || `
          <tr>
            <td style="padding: 12px; color: #64748b; font-size: 13px;">
              No credit bureau reports were used in this decision.
            </td>
          </tr>`}
      </table>

      <!-- FCRA Required Disclosures -->
      <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
        <h2 style="color: #1e293b; font-size: 15px; margin: 0 0 12px;">Your Rights Under Federal Law</h2>

        <p style="color: #334155; font-size: 13px; line-height: 1.6; margin: 0 0 12px;">
          <strong>1. The consumer reporting agency(ies) listed above did not make the decision
          to take adverse action.</strong> The decision was made solely by ${orgName}.
          The consumer reporting agency(ies) are unable to provide you the specific reasons
          why the adverse action was taken.
        </p>

        <p style="color: #334155; font-size: 13px; line-height: 1.6; margin: 0 0 12px;">
          <strong>2. You have the right to obtain a free copy of your consumer report.</strong>
          Under Section 612 of the FCRA, you are entitled to request a free copy of your
          consumer report from the reporting agency(ies) listed above within 60 days of
          receiving this notice. To obtain your free report, contact the agency(ies) directly
          using the information provided above.
        </p>

        <p style="color: #334155; font-size: 13px; line-height: 1.6; margin: 0 0 12px;">
          <strong>3. You have the right to dispute the accuracy or completeness of any
          information in your consumer report.</strong> Under Section 611 of the FCRA, you
          may dispute directly with the consumer reporting agency(ies) the accuracy or
          completeness of any information provided by them. The agency must investigate
          your dispute within 30 days and correct or delete any information that is found
          to be inaccurate, incomplete, or unverifiable.
        </p>

        <p style="color: #334155; font-size: 13px; line-height: 1.6; margin: 0;">
          <strong>4. You may also obtain a free annual credit report.</strong>
          You are entitled to one free consumer report per year from each of the nationwide
          consumer reporting agencies by visiting
          <a href="https://www.annualcreditreport.com" style="color: #2563eb;">www.annualcreditreport.com</a>
          or calling 1-877-322-8228.
        </p>
      </div>

      <!-- Additional Info -->
      <div style="border-top: 1px solid #e2e8f0; padding-top: 16px;">
        <p style="color: #64748b; font-size: 12px; line-height: 1.6; margin: 0;">
          This notice is provided in compliance with the Fair Credit Reporting Act
          (15 U.S.C. §1681 et seq.), Section 615(a). If you have questions about this
          notice, you may contact ${orgName}. If you believe your rights under the FCRA
          have been violated, you may file a complaint with the Consumer Financial
          Protection Bureau (CFPB) at
          <a href="https://www.consumerfinance.gov" style="color: #2563eb;">www.consumerfinance.gov</a>
          or the Federal Trade Commission (FTC) at
          <a href="https://www.ftc.gov" style="color: #2563eb;">www.ftc.gov</a>.
        </p>
      </div>

    </div>
  </div>

  <p style="text-align: center; color: #94a3b8; font-size: 11px; margin-top: 16px;">
    This is an automated notice required by federal law. Please do not reply to this email.
  </p>
</div>
</body>
</html>`;

    const result = await sendTransactionalEmail({
      to: applicant.email,
      subject: `Notice of Adverse Action — ${propertyAddress}`,
      html,
    });

    // Log the event
    await prisma.screeningEvent.create({
      data: {
        applicationId,
        applicantId: applicant.id,
        eventType: "adverse_action_sent",
        eventData: {
          bureausUsed,
          recipientEmail: applicant.email,
          sentAt: new Date().toISOString(),
        } as any,
      },
    });

    return result;
  } catch (error) {
    console.error("[Adverse Action] Failed to send notice:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
