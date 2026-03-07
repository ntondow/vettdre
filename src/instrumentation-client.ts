import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance monitoring: 10% of transactions in production, 100% in dev
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Set environment for filtering in Sentry dashboard
  environment: process.env.NODE_ENV || "development",

  // Session replay: capture 10% of sessions, 100% of sessions with errors
  integrations: [
    Sentry.replayIntegration(),
  ],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

// Instrument Next.js App Router navigations
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
