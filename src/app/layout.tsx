import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "VettdRE — AI-Native Real Estate CRM",
  description: "Intelligence-driven CRM for modern real estate professionals.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "VettdRE",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/icon-192.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#1E40AF" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
