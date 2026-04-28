import Header from "@/components/layout/header";
import prisma from "@/lib/prisma";
import { getCurrentOrgContext } from "@/lib/auth-context";
import { redirect } from "next/navigation";
import CalendarView from "./calendar-view";

async function getData(overrideAsOrg?: string) {
  const ctx = await getCurrentOrgContext({ overrideAsOrg });
  if (!ctx) return null;

  const gmailAccount = await prisma.gmailAccount.findFirst({
    where: { userId: ctx.userId, isActive: true },
  });

  return {
    gmailConnected: !!gmailAccount,
  };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ as_org?: string }>;
}) {
  const { as_org } = await searchParams;
  const data = await getData(as_org);
  if (!data) redirect("/login");

  return (
    <>
      <Header title="Calendar" />
      <CalendarView gmailConnected={data.gmailConnected} />
    </>
  );
}
