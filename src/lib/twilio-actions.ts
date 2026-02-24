"use server";

import prisma from "@/lib/prisma";
import { getTwilio } from "@/lib/twilio";
import { createClient } from "@/lib/supabase/server";
import type { UserPlan } from "@/lib/feature-gate";

// ============================================================
// Auth helper
// ============================================================

async function getAuthUser() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;
  return prisma.user.findUnique({ where: { authProviderId: authUser.id } });
}

// ============================================================
// Number Management
// ============================================================

export async function searchAvailableNumbers(areaCode: string, limit?: number) {
  try {
    const twilio = getTwilio();
    const numbers = await twilio.availablePhoneNumbers("US").local.list({
      areaCode: parseInt(areaCode, 10),
      limit: limit || 10,
      smsEnabled: true,
      voiceEnabled: true,
    });
    return {
      numbers: numbers.map((n: any) => ({
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        locality: n.locality,
        region: n.region,
        postalCode: n.postalCode,
      })),
    };
  } catch (error) {
    console.error("searchAvailableNumbers error:", error);
    return { numbers: [], error: "Failed to search numbers" };
  }
}

export async function purchaseNumber(phoneNumber: string) {
  const user = await getAuthUser();
  if (!user) return { error: "Not authenticated" };

  // Plan check: free/explorer cannot purchase
  const plan = user.plan as UserPlan;
  if (plan === "free" || plan === "explorer") {
    return { error: "Upgrade to Pro or higher to purchase a phone number" };
  }

  // Check if user already has a number (pro gets 1, team/enterprise get up to 5)
  const existingCount = await prisma.phoneNumber.count({
    where: { userId: user.id, status: "active" },
  });
  const maxNumbers = plan === "team" || plan === "enterprise" ? 5 : 1;
  if (existingCount >= maxNumbers) {
    return { error: `You can have up to ${maxNumbers} active phone number${maxNumbers > 1 ? "s" : ""}` };
  }

  try {
    const twilio = getTwilio();
    const purchased = await twilio.incomingPhoneNumbers.create({
      phoneNumber,
      smsUrl: "https://app.vettdre.com/api/twilio/sms",
      smsMethod: "POST",
      voiceUrl: "https://app.vettdre.com/api/twilio/voice",
      voiceMethod: "POST",
      statusCallback: "https://app.vettdre.com/api/twilio/status",
      statusCallbackMethod: "POST",
    });

    const areaCode = phoneNumber.length >= 5 ? phoneNumber.slice(2, 5) : null;

    const phoneRecord = await prisma.phoneNumber.create({
      data: {
        number: purchased.phoneNumber,
        twilioSid: purchased.sid,
        friendlyName: purchased.friendlyName,
        areaCode,
        userId: user.id,
        organizationId: user.orgId,
        status: "active",
      },
    });

    return { success: true, phoneNumber: phoneRecord };
  } catch (error: any) {
    console.error("purchaseNumber error:", error);
    return { error: error.message || "Failed to purchase number" };
  }
}

export async function releaseNumber(phoneNumberId: string) {
  const user = await getAuthUser();
  if (!user) return { error: "Not authenticated" };

  const phone = await prisma.phoneNumber.findFirst({
    where: { id: phoneNumberId, userId: user.id, status: "active" },
  });
  if (!phone) return { error: "Phone number not found" };

  try {
    const twilio = getTwilio();
    await twilio.incomingPhoneNumbers(phone.twilioSid).remove();
    await prisma.phoneNumber.update({
      where: { id: phone.id },
      data: { status: "released" },
    });
    return { success: true };
  } catch (error: any) {
    console.error("releaseNumber error:", error);
    return { error: error.message || "Failed to release number" };
  }
}

export async function updateForwardingNumber(phoneNumberId: string, forwardingNumber: string) {
  const user = await getAuthUser();
  if (!user) return { error: "Not authenticated" };

  const phone = await prisma.phoneNumber.findFirst({
    where: { id: phoneNumberId, userId: user.id, status: "active" },
  });
  if (!phone) return { error: "Phone number not found" };

  await prisma.phoneNumber.update({
    where: { id: phone.id },
    data: { forwardingNumber: forwardingNumber || null },
  });
  return { success: true };
}

// ============================================================
// SMS
// ============================================================

export async function sendSMS(to: string, body: string) {
  const user = await getAuthUser();
  if (!user) return { error: "Not authenticated" };

  const phone = await prisma.phoneNumber.findFirst({
    where: { userId: user.id, status: "active" },
    orderBy: { createdAt: "asc" },
  });
  if (!phone) return { error: "No phone number configured. Go to Settings > Phone to set one up." };

  try {
    const twilio = getTwilio();
    const message = await twilio.messages.create({
      body,
      from: phone.number,
      to,
    });

    // Try to match to a contact by phone number
    const contact = await prisma.contact.findFirst({
      where: {
        orgId: user.orgId,
        OR: [{ phone: to }, { secondaryPhone: to }],
      },
    });

    const sms = await prisma.smsMessage.create({
      data: {
        phoneNumberId: phone.id,
        userId: user.id,
        contactId: contact?.id || null,
        direction: "outbound",
        from: phone.number,
        to,
        body,
        status: "sent",
        twilioSid: message.sid,
      },
    });

    // Log activity if contact matched
    if (contact) {
      await prisma.activity.create({
        data: {
          orgId: user.orgId,
          contactId: contact.id,
          userId: user.id,
          type: "text",
          direction: "outbound",
          subject: "SMS sent",
          body,
        },
      });
      await prisma.contact.update({
        where: { id: contact.id },
        data: { lastContactedAt: new Date(), lastActivityAt: new Date() },
      });
    }

    return { success: true, message: sms };
  } catch (error: any) {
    console.error("sendSMS error:", error);
    return { error: error.message || "Failed to send SMS" };
  }
}

// ============================================================
// Conversations
// ============================================================

export async function getConversation(contactNumber: string) {
  const user = await getAuthUser();
  if (!user) return { messages: [] };

  const phone = await prisma.phoneNumber.findFirst({
    where: { userId: user.id, status: "active" },
    orderBy: { createdAt: "asc" },
  });
  if (!phone) return { messages: [] };

  const messages = await prisma.smsMessage.findMany({
    where: {
      phoneNumberId: phone.id,
      OR: [
        { from: contactNumber, to: phone.number },
        { from: phone.number, to: contactNumber },
      ],
    },
    orderBy: { createdAt: "asc" },
    include: { contact: { select: { id: true, firstName: true, lastName: true } } },
  });

  return {
    messages: messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      from: m.from,
      to: m.to,
      body: m.body,
      status: m.status,
      mediaUrls: m.mediaUrls,
      createdAt: m.createdAt.toISOString(),
      contact: m.contact,
    })),
  };
}

export async function getConversationList() {
  const user = await getAuthUser();
  if (!user) return { conversations: [], hasPhone: false };

  const phone = await prisma.phoneNumber.findFirst({
    where: { userId: user.id, status: "active" },
    orderBy: { createdAt: "asc" },
  });
  if (!phone) return { conversations: [], hasPhone: false };

  // Get all messages for this phone number, most recent first
  const messages = await prisma.smsMessage.findMany({
    where: { phoneNumberId: phone.id },
    orderBy: { createdAt: "desc" },
    include: { contact: { select: { id: true, firstName: true, lastName: true } } },
  });

  // Group by the "other" party phone number
  const convMap = new Map<string, {
    contactNumber: string;
    contactName: string | null;
    contactId: string | null;
    lastMessage: string;
    lastAt: string;
    direction: string;
    unread: number;
  }>();

  for (const m of messages) {
    const other = m.direction === "outbound" ? m.to : m.from;
    if (!convMap.has(other)) {
      const name = m.contact ? `${m.contact.firstName} ${m.contact.lastName}`.trim() : null;
      convMap.set(other, {
        contactNumber: other,
        contactName: name,
        contactId: m.contact?.id || null,
        lastMessage: m.body,
        lastAt: m.createdAt.toISOString(),
        direction: m.direction,
        unread: 0,
      });
    }
    // Count inbound messages as "unread" (simple heuristic — last outbound resets count)
    // For now just count inbound messages that are newer than the last outbound in this conversation
  }

  return {
    conversations: Array.from(convMap.values()),
    hasPhone: true,
    phoneNumber: phone.number,
  };
}

// ============================================================
// Calls
// ============================================================

export async function initiateCall(to: string) {
  const user = await getAuthUser();
  if (!user) return { error: "Not authenticated" };

  const phone = await prisma.phoneNumber.findFirst({
    where: { userId: user.id, status: "active" },
    orderBy: { createdAt: "asc" },
  });
  if (!phone) return { error: "No phone number configured" };

  try {
    const twilio = getTwilio();

    // Use TwiML to connect the call
    const twiml = `<Response><Dial callerId="${phone.number}">${to}</Dial></Response>`;
    const call = await twilio.calls.create({
      twiml,
      to,
      from: phone.number,
      statusCallback: "https://app.vettdre.com/api/twilio/status",
      statusCallbackMethod: "POST",
    });

    const contact = await prisma.contact.findFirst({
      where: {
        orgId: user.orgId,
        OR: [{ phone: to }, { secondaryPhone: to }],
      },
    });

    await prisma.phoneCall.create({
      data: {
        phoneNumberId: phone.id,
        userId: user.id,
        contactId: contact?.id || null,
        direction: "outbound",
        from: phone.number,
        to,
        status: "initiated",
        twilioSid: call.sid,
      },
    });

    if (contact) {
      await prisma.activity.create({
        data: {
          orgId: user.orgId,
          contactId: contact.id,
          userId: user.id,
          type: "call",
          direction: "outbound",
          subject: "Phone call initiated",
        },
      });
    }

    return { success: true, callSid: call.sid };
  } catch (error: any) {
    console.error("initiateCall error:", error);
    return { error: error.message || "Failed to initiate call" };
  }
}

// ============================================================
// Phone Settings
// ============================================================

export async function getUserPhoneNumbers() {
  const user = await getAuthUser();
  if (!user) return { numbers: [], plan: "free" as UserPlan };

  const numbers = await prisma.phoneNumber.findMany({
    where: { userId: user.id, status: "active" },
    orderBy: { createdAt: "asc" },
  });

  // Usage stats for current month
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [smsCount, callCount] = await Promise.all([
    prisma.smsMessage.count({
      where: { userId: user.id, createdAt: { gte: monthStart } },
    }),
    prisma.phoneCall.count({
      where: { userId: user.id, createdAt: { gte: monthStart } },
    }),
  ]);

  return {
    numbers: numbers.map((n) => ({
      id: n.id,
      number: n.number,
      friendlyName: n.friendlyName,
      areaCode: n.areaCode,
      forwardingNumber: n.forwardingNumber,
      createdAt: n.createdAt.toISOString(),
    })),
    plan: user.plan as UserPlan,
    smsThisMonth: smsCount,
    callsThisMonth: callCount,
  };
}

// ============================================================
// SMS Templates
// ============================================================

export async function getSmsTemplates() {
  const user = await getAuthUser();
  if (!user) return [];

  const templates = await prisma.emailTemplate.findMany({
    where: { orgId: user.orgId, channel: "sms" },
    orderBy: { timesUsed: "desc" },
  });
  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    body: t.body,
    category: t.category,
    timesUsed: t.timesUsed,
  }));
}

export async function seedSmsTemplates() {
  const user = await getAuthUser();
  if (!user) return;

  const existing = await prisma.emailTemplate.count({
    where: { orgId: user.orgId, channel: "sms" },
  });
  if (existing > 0) return;

  const templates = [
    {
      name: "Property Outreach",
      body: "Hi, I'm {{user_name}} with {{company}}. I'm reaching out about your property at {{address}}. Would you have a few minutes to discuss?",
      category: "Cold Outreach",
    },
    {
      name: "Follow Up",
      body: "Following up on my previous message about {{address}}. I'd love to schedule a quick call at your convenience.",
      category: "Follow Up",
    },
    {
      name: "Property Interest",
      body: "Hi, I recently looked into {{address}} and believe there may be an interesting opportunity. Are you open to a conversation?",
      category: "Cold Outreach",
    },
  ];

  await prisma.emailTemplate.createMany({
    data: templates.map((t) => ({
      orgId: user.orgId,
      createdBy: user.id,
      name: t.name,
      body: t.body,
      channel: "sms" as const,
      category: t.category,
    })),
  });
}
