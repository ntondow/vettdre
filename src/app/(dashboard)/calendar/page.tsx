import Header from "@/components/layout/header";
import prisma from "@/lib/prisma";
import { getCurrentOrgContext } from "@/lib/auth-context";
import { redirect } from "next/navigation";
import CalendarView from "./calendar-view";

async function getData() {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return null;

  const gmailAccount = await prisma.gmailAccount.findFirst({
    where: { userId: ctx.userId, isActive: true },
  });

  return {
    gmailConnected: !!gmailAccount,
  };
}

export default async function CalendarPage() {
  const data = await getData();
  if (!data) redirect("/login");

  return (
    <>
      <Header title="Calendar" />
      <CalendarView gmailConnected={data.gmailConnected} />
    </>
  );
}
