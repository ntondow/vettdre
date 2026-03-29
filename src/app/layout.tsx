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
  title: "VettdRE — Real Estate Intelligence",
  description:
    "Search any building. Unmask every owner. Model every deal. One platform for the entire real estate workflow.",
  manifest: "/manifest.json",
  metadataBase: (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_APP_URL || "");
    } catch {
      return new URL("https://vettdre.com");
    }
  })(),
  openGraph: {
    title: "VettdRE — Real Estate Intelligence, Verified.",
    description:
      "Search 1M+ buildings, unmask LLC owners, and underwrite deals — all on one platform.",
    url: "/",
    siteName: "VettdRE",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "VettdRE — Real Estate Intelligence",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "VettdRE — Real Estate Intelligence, Verified.",
    description:
      "Search 1M+ buildings, unmask LLC owners, and underwrite deals — all on one platform.",
    images: ["/og-image.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "VettdRE",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="theme-color" content="#0A0A0A" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
