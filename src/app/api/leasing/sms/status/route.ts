import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";
import prisma from "@/lib/prisma";
import { getTwilio } from "@/lib/twilio";
import { normalizePhone } from "@/lib/leasing-types";

export const dynamic = "force-dynamic";

// Twilio SMS Delivery Status Callback
// Updates LeasingMessage.deliveryStatus and triggers escalation on repeated failures

export async function POST(request: NextRequest) {
  const body = await request.text();
  const params = new URLSearchParams(body);

  // Validate Twilio signature (same pattern as inbound webhook)
  const signature = request.headers.get("x-twilio-signature") || "";
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (authToken) {
    const url = request.url;
    const paramsObj: Record<string, string> = {};
    params.forEach((v, k) => { paramsObj[k] = v; });
    const isValid = twilio.validateRequest(authToken, signature, url, paramsObj);
    if (!isValid) {
      console.error("[leasing/sms/status] Invalid Twilio signature");
      return new NextResponse("", { status: 200 });
    }
  }

  const messageSid = params.get("MessageSid") || "";
  const messageStatus = params.get("MessageStatus") || "";
  const to = params.get("To") || "";
  const from = params.get("From") || "";
  const errorCode = params.get("ErrorCode") || "";
  const errorMessage = params.get("ErrorMessage") || "";

  if (!messageSid || !messageStatus) {
    return new NextResponse("", { status: 200 });
  }

  try {
    // Find the message by Twilio SID
    const message = await prisma.leasingMessage.findFirst({
      where: { twilioSid: messageSid },
      select: {
        id: true,
        conversationId: true,
        sender: true,
        conversation: {
          select: {
            id: true,
            orgId: true,
            configId: true,
            prospectPhone: true,
            prospectName: true,
            status: true,
            config: {
              select: {
                id: true,
                qualCriteria: true,
                property: { select: { name: true, address: true, landlordPhone: true } },
                twilioNumber: { select: { number: true } },
              },
            },
          },
        },
      },
    });

    if (!message) {
      console.log("[leasing/sms/status] Message not found for SID:", messageSid);
      return new NextResponse("", { status: 200 });
    }

    // Update delivery status
    await prisma.leasingMessage.update({
      where: { id: message.id },
      data: { deliveryStatus: messageStatus },
    });

    // On failure/undelivered: store error in conversation metadata + check for repeated failures
    if (messageStatus === "failed" || messageStatus === "undelivered") {
      console.error("[leasing/sms/status] Delivery failed", {
        messageSid,
        messageStatus,
        errorCode,
        errorMessage,
        conversationId: message.conversationId,
      });

      // Store last delivery error in conversation qualData
      const conversation = message.conversation;
      const currentQual = (conversation.config && typeof conversation.config === "object")
        ? {}
        : {};
      // Use raw update to merge into qualData JSON
      await prisma.$executeRaw`
        UPDATE leasing_conversations
        SET qual_data = jsonb_set(
          COALESCE(qual_data, '{}'::jsonb),
          '{lastDeliveryError}',
          ${JSON.stringify({
            errorCode,
            errorMessage,
            timestamp: new Date().toISOString(),
            messageSid,
          })}::jsonb
        )
        WHERE id = ${message.conversationId}
      `;

      // Check for 3+ consecutive delivery failures to same prospect
      const prospectPhone = normalizePhone(to); // "To" in status callback = the recipient = prospect
      const recentOutbound = await prisma.leasingMessage.findMany({
        where: {
          conversationId: message.conversationId,
          sender: "ai",
          twilioSid: { not: null },
        },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { deliveryStatus: true },
      });

      const consecutiveFailures = recentOutbound.every(
        (m) => m.deliveryStatus === "failed" || m.deliveryStatus === "undelivered"
      );

      if (recentOutbound.length >= 3 && consecutiveFailures) {
        console.warn("[leasing/sms/status] 3+ consecutive delivery failures — escalating", {
          conversationId: message.conversationId,
          prospectPhone,
        });

        // Escalate via the existing path
        const config = conversation.config;
        const qualCriteria = (config.qualCriteria && typeof config.qualCriteria === "object")
          ? config.qualCriteria as Record<string, unknown>
          : {};
        const escalationPhone = normalizePhone(
          (qualCriteria.escalationPhone as string) || config.property.landlordPhone || ""
        );

        await prisma.leasingConversation.update({
          where: { id: message.conversationId },
          data: {
            status: "escalated",
            escalatedAt: new Date(),
            escalationReason: "sms_delivery_failure",
          },
        });

        if (escalationPhone && config.twilioNumber?.number) {
          const prospectLabel = conversation.prospectName || prospectPhone;
          const notifBody = [
            `⚠️ SMS delivery failures for ${prospectLabel}`,
            `3+ consecutive messages failed to deliver.`,
            `Error: ${errorCode || "unknown"} — ${errorMessage || "No details"}`,
            `Property: ${config.property.name || config.property.address || "Unknown"}`,
            `You may need to contact them by other means.`,
          ].join("\n");

          try {
            const twilioClient = getTwilio();
            await twilioClient.messages.create({
              body: notifBody,
              from: config.twilioNumber.number,
              to: escalationPhone,
            });
          } catch (err) {
            console.error("[leasing/sms/status] Failed to send escalation SMS:", err);
          }
        }
      }
    }
  } catch (error) {
    console.error("[leasing/sms/status] Error processing status callback:", error);
  }

  // Always return 200
  return new NextResponse("", { status: 200 });
}
