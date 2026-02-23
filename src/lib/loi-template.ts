// ============================================================
// LOI Template — structured Letter of Intent content
// ============================================================

export interface LoiData {
  // Property
  propertyAddress: string;
  bbl?: string;

  // Owner / Seller
  ownerName: string;
  ownerAddress?: string;

  // Offer terms
  offerPrice: number;
  earnestMoneyPercent: number;
  dueDiligenceDays: number;
  financingContingencyDays: number;
  closingDays: number;

  // Buyer
  buyerEntity: string;
  buyerAddress?: string;

  // Broker
  brokerName?: string;
  brokerEmail?: string;
  brokerPhone?: string;
  brokerLicense?: string;
  brokerage?: string;

  // Date
  date?: string;
}

export const LOI_DEFAULTS = {
  earnestMoneyPercent: 2,
  dueDiligenceDays: 45,
  financingContingencyDays: 30,
  closingDays: 30,
};

export interface LoiSection {
  title: string;
  body: string;
}

const fmt = (n: number) => `$${n.toLocaleString()}`;

export function generateLoiContent(data: LoiData): LoiSection[] {
  const earnestAmount = Math.round(data.offerPrice * (data.earnestMoneyPercent / 100));
  const dateStr = data.date || new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return [
    {
      title: "Property",
      body: `The property located at ${data.propertyAddress}${data.bbl ? ` (BBL: ${data.bbl})` : ""} (the "Property").`,
    },
    {
      title: "Purchase Price",
      body: `The purchase price for the Property shall be ${fmt(data.offerPrice)} (the "Purchase Price"), payable in cash and/or financing at closing.`,
    },
    {
      title: "Earnest Money Deposit",
      body: `Within five (5) business days of the execution of the Purchase and Sale Agreement ("PSA"), Buyer shall deposit ${fmt(earnestAmount)} (${data.earnestMoneyPercent}% of the Purchase Price) as an earnest money deposit (the "Deposit") with a mutually agreed-upon escrow agent. The Deposit shall be applicable to the Purchase Price at closing.`,
    },
    {
      title: "Due Diligence Period",
      body: `Buyer shall have a period of ${data.dueDiligenceDays} days from the date of the fully executed PSA (the "Due Diligence Period") to conduct its inspection and review of the Property, including but not limited to physical inspections, environmental assessments, title review, survey, zoning compliance, and review of all leases, contracts, and financial records. If Buyer is not satisfied with the results of its due diligence, in its sole discretion, Buyer may terminate the PSA and receive a full refund of the Deposit.`,
    },
    {
      title: "Financing Contingency",
      body: `This transaction is contingent upon Buyer obtaining financing satisfactory to Buyer within ${data.financingContingencyDays} days of the execution of the PSA. In the event Buyer is unable to secure financing, Buyer may terminate the PSA and receive a full refund of the Deposit.`,
    },
    {
      title: "Closing",
      body: `Closing shall occur within ${data.closingDays} days following the expiration of the Due Diligence Period, or at such other time as mutually agreed upon by the parties. Seller shall deliver the Property free and clear of all liens and encumbrances, except for those acceptable to Buyer.`,
    },
    {
      title: "Title and Survey",
      body: `Seller shall provide, at Seller's expense, a current title commitment and existing survey for the Property. Buyer shall have the right to obtain a new survey at Buyer's expense. Any title defects or survey matters objectionable to Buyer must be cured by Seller prior to closing.`,
    },
    {
      title: "Representations and Warranties",
      body: `Seller shall represent and warrant that: (a) Seller has full authority to sell the Property; (b) there are no pending or threatened actions, suits, or proceedings affecting the Property; (c) the Property complies with all applicable laws, ordinances, and regulations; and (d) all financial statements and rent rolls provided to Buyer are true and accurate.`,
    },
    {
      title: "Confidentiality",
      body: `The terms and conditions of this Letter of Intent and any subsequent PSA shall be kept confidential by both parties and shall not be disclosed to any third party without the prior written consent of the other party, except as required by law or to the parties' respective advisors, attorneys, and lenders.`,
    },
    {
      title: "Non-Binding Nature",
      body: `This Letter of Intent is intended to express the mutual interest of the parties in pursuing the transaction described herein. Except for the provisions regarding Confidentiality, this Letter of Intent is non-binding and does not create any legal obligation on either party. A binding agreement shall only arise upon the execution of a mutually acceptable Purchase and Sale Agreement.`,
    },
    {
      title: "Expiration",
      body: `This Letter of Intent shall remain open for acceptance until 5:00 PM Eastern Time on the date that is fourteen (14) calendar days from the date of this letter. If not accepted by such date, this Letter of Intent shall be deemed withdrawn.`,
    },
  ];
}

export function generateLoiPlainText(data: LoiData): string {
  const dateStr = data.date || new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const sections = generateLoiContent(data);

  const lines: string[] = [
    "LETTER OF INTENT",
    "NON-BINDING",
    "",
    `Date: ${dateStr}`,
    "",
    `To: ${data.ownerName}`,
    ...(data.ownerAddress ? [data.ownerAddress] : []),
    "",
    `Re: Letter of Intent to Purchase — ${data.propertyAddress}`,
    "",
    `Dear ${data.ownerName},`,
    "",
    `${data.buyerEntity} ("Buyer") hereby submits this non-binding Letter of Intent to purchase the property described below from ${data.ownerName} ("Seller") on the following terms and conditions:`,
    "",
  ];

  sections.forEach((section, i) => {
    lines.push(`${i + 1}. ${section.title}`);
    lines.push("");
    lines.push(section.body);
    lines.push("");
  });

  lines.push("");
  lines.push("We look forward to your favorable response and to working together toward a mutually beneficial transaction.");
  lines.push("");
  lines.push("Sincerely,");
  lines.push("");
  lines.push("____________________________");
  lines.push(`${data.buyerEntity}`);
  if (data.brokerName) lines.push(`${data.brokerName}`);
  if (data.brokerage) lines.push(`${data.brokerage}`);
  if (data.brokerLicense) lines.push(`License #${data.brokerLicense}`);
  if (data.brokerEmail) lines.push(data.brokerEmail);
  if (data.brokerPhone) lines.push(data.brokerPhone);

  lines.push("");
  lines.push("");
  lines.push("ACKNOWLEDGED AND AGREED:");
  lines.push("");
  lines.push("____________________________");
  lines.push(`${data.ownerName} (Seller)`);
  lines.push("");
  lines.push("Date: ____________________");

  return lines.join("\n");
}

export function getLoiCoverEmailSubject(data: LoiData): string {
  return `Letter of Intent — ${data.propertyAddress}`;
}

export function getLoiCoverEmailHtml(data: LoiData): string {
  const dateStr = data.date || new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return `
<div style="font-family: Arial, sans-serif; font-size: 14px; color: #1e293b; line-height: 1.6;">
  <p>Dear ${data.ownerName},</p>

  <p>Please find attached our Letter of Intent for the property located at <strong>${data.propertyAddress}</strong>.</p>

  <p>We have outlined the key terms of our proposed acquisition, including a purchase price of <strong>${fmt(data.offerPrice)}</strong>. The LOI is non-binding and intended to express our genuine interest in acquiring this property.</p>

  <p>We would welcome the opportunity to discuss the terms at your convenience. Please do not hesitate to reach out with any questions or to schedule a call.</p>

  <p>Best regards,</p>

  <p style="margin-bottom: 4px;"><strong>${data.brokerName || data.buyerEntity}</strong></p>
  ${data.brokerage ? `<p style="margin: 0; color: #64748b;">${data.brokerage}</p>` : ""}
  ${data.brokerPhone ? `<p style="margin: 0; color: #64748b;">${data.brokerPhone}</p>` : ""}
  ${data.brokerEmail ? `<p style="margin: 0; color: #64748b;">${data.brokerEmail}</p>` : ""}
  ${data.brokerLicense ? `<p style="margin: 0; color: #94a3b8; font-size: 12px;">License #${data.brokerLicense}</p>` : ""}
</div>`.trim();
}
