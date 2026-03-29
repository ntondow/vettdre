import type { Metadata } from "next";
import AgentJoinClient from "./client";

export const metadata: Metadata = {
  title: "Join Brokerage | VettdRE",
};

export default async function AgentJoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <AgentJoinClient token={token} />;
}
