import type { Metadata } from "next";
import PublicSubmissionClient from "./client";

export const metadata: Metadata = {
  title: "Submit a Deal | VettdRE",
};

export default async function PublicSubmitDealPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return <PublicSubmissionClient token={token} />;
}
