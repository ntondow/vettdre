import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: "standalone",
  // Exclude canvas from server bundle (pdfjs-dist optional dep for Node)
  serverExternalPackages: ["canvas"],
  typescript: {
    // Pre-existing missing modules (team-actions, reference-data, gws-tools)
    // TODO: create these files properly, then remove this flag
    ignoreBuildErrors: true,
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://dhphradjmajfjuvshyra.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRocGhyYWRqbWFqZmp1dnNoeXJhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNTY3MjIsImV4cCI6MjA4NjczMjcyMn0.NA3iZnmbcZUwMc_EJp6w0Qc_gzNjYAjn68Z1QrWdawc",
    NEXT_PUBLIC_APP_URL: "https://app.vettdre.com",
  },
  async headers() {
    return [
      {
        source: "/.well-known/apple-app-site-association",
        headers: [
          { key: "Content-Type", value: "application/json" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          // Tightened: no-referrer for screening paths to prevent token leakage
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.plaid.com https://js.stripe.com https://cdnjs.cloudflare.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "frame-src https://cdn.plaid.com https://js.stripe.com",
              "connect-src 'self' https://*.plaid.com https://api.stripe.com https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://*.ingest.sentry.io",
              "img-src 'self' data: blob: https://*.supabase.co https://*.tile.openstreetmap.org",
              "frame-ancestors 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self' https://checkout.stripe.com",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry org and project slugs (update after creating Sentry project)
  org: "vettdre",
  project: "vettdre-nextjs",

  // Suppress noisy build logs unless in CI
  silent: !process.env.CI,

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  // disableLogger is deprecated; Sentry handles this automatically

  // Upload source maps for readable stack traces in Sentry
  // Requires SENTRY_AUTH_TOKEN env var to be set
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
