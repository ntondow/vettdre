import prisma from "@/lib/prisma";

interface EmailInput {
  fromName: string;
  fromEmail: string;
  subject: string;
  bodyText: string;
}

interface ParseResult {
  leadSource: string;
  leadIntent: string;
  extractedName: string | null;
  extractedPhone: string | null;
  extractedBudget: string | null;
  extractedArea: string | null;
  summary: string;
  urgency: number;
}

/** Detect source from email headers without AI (fast, deterministic) */
function detectSource(fromEmail: string, bodyText: string): string | null {
  const email = fromEmail.toLowerCase();
  const body = bodyText.toLowerCase();

  if (email.includes("@streeteasy.com") || body.includes("streeteasy.com")) return "streeteasy";
  if (email.includes("@zillow.com") || email.includes("@trulia.com") || body.includes("zillow.com")) return "zillow";
  if (email.includes("@realtor.com") || email.includes("@move.com") || body.includes("realtor.com")) return "realtor";
  if (email.includes("@apartments.com") || email.includes("@costar.com") || body.includes("apartments.com")) return "apartments_com";
  if (email.includes("@renthop.com") || body.includes("renthop.com")) return "renthop";
  if (body.includes("referred by") || body.includes("recommended by") || body.includes("referral")) return "referral";

  return null;
}

/** Parse an inbound email with Claude AI */
export async function parseEmailWithAI(emailMessageId: string, input: EmailInput) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log("  Skipping AI parse — no ANTHROPIC_API_KEY");
    return;
  }

  // Quick source detection first (no AI cost)
  const detectedSource = detectSource(input.fromEmail, input.bodyText);

  const prompt = `Analyze this real estate email and extract structured data.

Email:
From: ${input.fromName} <${input.fromEmail}>
Subject: ${input.subject}
Body: ${input.bodyText.slice(0, 3000)}

Return ONLY valid JSON (no markdown, no explanation):
{
  "leadSource": "${detectedSource || 'unknown'}" or correct if you detect differently: "streeteasy"|"zillow"|"realtor"|"apartments_com"|"renthop"|"website"|"referral"|"cold"|"unknown",
  "leadIntent": "rental_inquiry"|"purchase_inquiry"|"seller_inquiry"|"listing_inquiry"|"showing_request"|"general",
  "extractedName": "full name if found, else null",
  "extractedPhone": "phone number if found, else null",
  "extractedBudget": "budget range if mentioned, else null",
  "extractedArea": "neighborhood or area of interest if mentioned, else null",
  "summary": "one sentence summary of what this person wants",
  "urgency": 1 to 5 (1=just browsing, 3=actively looking, 5=ready to sign/urgent)
}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      console.error("  Claude API error:", res.status);
      return;
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || "";

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("  Could not extract JSON from AI response");
      return;
    }

    const parsed: ParseResult = JSON.parse(jsonMatch[0]);

    await prisma.emailMessage.update({
      where: { id: emailMessageId },
      data: {
        aiParsed: true,
        leadSource: parsed.leadSource || detectedSource || "unknown",
        leadIntent: parsed.leadIntent || "general",
        extractedName: parsed.extractedName,
        extractedPhone: parsed.extractedPhone,
        extractedBudget: parsed.extractedBudget,
        extractedArea: parsed.extractedArea,
        aiSummary: parsed.summary,
        sentimentScore: Math.max(1, Math.min(5, parsed.urgency || 3)),
      },
    });

    console.log("  AI parsed:", input.subject?.slice(0, 50), "→", parsed.leadSource, parsed.leadIntent, "urgency:", parsed.urgency);
  } catch (err) {
    console.error("  AI parse error:", err);
  }
}
