import type { Metadata } from "next";
import SigningClient from "./client";

export const metadata: Metadata = {
  title: "Sign Documents | VettdRE",
};

export default async function SigningPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return <SigningClient token={token} />;
}
