"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "2rem",
          textAlign: "center",
          backgroundColor: "#f8fafc",
        }}>
          <div style={{
            maxWidth: "480px",
            padding: "2rem",
            borderRadius: "12px",
            backgroundColor: "white",
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 600, color: "#1e293b", marginBottom: "0.5rem" }}>
              Something went wrong
            </h1>
            <p style={{ color: "#64748b", marginBottom: "1.5rem", lineHeight: 1.5 }}>
              An unexpected error occurred. Our team has been notified and is looking into it.
            </p>
            <button
              onClick={reset}
              style={{
                padding: "0.625rem 1.25rem",
                backgroundColor: "#1E40AF",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
