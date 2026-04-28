import Header from "@/components/layout/header";
import prisma from "@/lib/prisma";
import { getCurrentOrgContext } from "@/lib/auth-context";
import { redirect } from "next/navigation";
import MessagesTabs from "./messages-tabs";
import { ensureDefaultLabels } from "./label-actions";
import { getFollowUpCount } from "./follow-up-actions";
import { seedDefaultTemplates } from "./template-actions";

async function getData(overrideAsOrg?: string) {
  const ctx = await getCurrentOrgContext({ overrideAsOrg });
  if (!ctx) return null;

  // Auto-unsnooze expired threads
  await prisma.emailMessage.updateMany({
    where: {
      orgId: ctx.orgId,
      snoozedUntil: { lte: new Date() },
      NOT: { snoozedUntil: null },
    },
    data: { snoozedUntil: null, isRead: false },
  });

  const gmailAccount = await prisma.gmailAccount.findFirst({
    where: { userId: ctx.userId, isActive: true },
  });

  // Seed default templates if none exist
  await seedDefaultTemplates({ overrideAsOrg });

  const [templates, unreadCount, labels, followUpCount] = await Promise.all([
    prisma.emailTemplate.findMany({
      where: { orgId: ctx.orgId },
      orderBy: { timesUsed: "desc" },
      take: 50,
    }),
    prisma.emailMessage.count({
      where: { orgId: ctx.orgId, isRead: false, direction: "inbound" },
    }),
    ensureDefaultLabels({ overrideAsOrg }),
    getFollowUpCount({ overrideAsOrg }),
  ]);

  return {
    gmailConnected: !!gmailAccount,
    gmailEmail: gmailAccount?.email || null,
    templates: JSON.parse(JSON.stringify(templates)),
    unreadCount,
    labels,
    followUpCount,
  };
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ as_org?: string }>;
}) {
  const { as_org } = await searchParams;
  const data = await getData(as_org);
  if (!data) redirect("/login");

  return (
    <>
      <Header title="Messages" />
      <MessagesTabs
        gmailConnected={data.gmailConnected}
        gmailEmail={data.gmailEmail}
        templates={data.templates}
        initialUnreadCount={data.unreadCount}
        initialLabels={data.labels}
        followUpCount={data.followUpCount}
      />
    </>
  );
}
