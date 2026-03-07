import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Leasing Agent for NYC Landlords | VettdRE",
  description:
    "AI-powered SMS leasing assistant. Answers inquiries, books showings, and qualifies leads 24/7. Free to start, live in 3 minutes.",
};

export default function LeasingAgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
