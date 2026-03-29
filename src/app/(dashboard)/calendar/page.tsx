import Header from "@/components/layout/header";
import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import { redirect } from "next/navigation";
import CalendarView from "./calendar-view";

async function getData() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return null;
  const user = await prisma.user.findUnique({ where: { authProviderId: authUser.id } });
  if (!user) return null;

  const gmailAccount = await prisma.gmailAccount.findFirst({
    where: { userId: user.id, isActive: true },
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
