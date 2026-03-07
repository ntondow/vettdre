import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring: 10% of transactions in production, 100% in dev
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Set environment for filtering in Sentry dashboard
  environment: process.env.NODE_ENV || "development",

  // Enable structured logging
  enableLogs: true,
});
