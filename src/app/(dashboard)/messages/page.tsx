import Header from "@/components/layout/header";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { redirect } from "next/navigation";
import MessagesTabs from "./messages-tabs";
import { ensureDefaultLabels } from "./label-actions";
import { getFollowUpCount } from "./follow-up-actions";
import { seedDefaultTemplates } from "./template-actions";

async function getData() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;
  const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
  if (!user) return null;

  // Auto-unsnooze expired threads
  await prisma.emailMessage.updateMany({
    where: {
      orgId: user.orgId,
      snoozedUntil: { lte: new Date() },
      NOT: { snoozedUntil: null },
    },
    data: { snoozedUntil: null, isRead: false },
  });

  const gmailAccount = await prisma.gmailAccount.findFirst({
    where: { userId: user.id, isActive: true },
  });

  // Seed default templates if none exist
  await seedDefaultTemplates();

  const [templates, unreadCount, labels, followUpCount] = await Promise.all([
    prisma.emailTemplate.findMany({
      where: { orgId: user.orgId },
      orderBy: { timesUsed: "desc" },
      take: 50,
    }),
    prisma.emailMessage.count({
      where: { orgId: user.orgId, isRead: false, direction: "inbound" },
    }),
    ensureDefaultLabels(),
    getFollowUpCount(),
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

export default async function MessagesPage() {
  const data = await getData();
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
