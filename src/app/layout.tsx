import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VettdRE — AI-Native Real Estate CRM",
  description: "Intelligence-driven CRM for modern real estate professionals.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
