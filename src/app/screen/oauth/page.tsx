"use client";

import { useEffect } from "react";
import { usePlaidLink } from "react-plaid-link";
import { useSearchParams } from "next/navigation";

/**
 * Plaid OAuth redirect page.
 *
 * After a user authenticates with their bank via OAuth, Plaid redirects them
 * to this page with an `oauth_state_id` query parameter. We use that to
 * resume the Plaid Link flow by calling `usePlaidLink` with
 * `receivedRedirectUri` set to the current URL.
 *
 * The link token was stored in sessionStorage before the OAuth redirect began
 * (in PlaidStep.tsx). We read it back here to reinitialize the Link handler.
 */
export default function PlaidOAuthRedirect() {
  const searchParams = useSearchParams();
  const oauthStateId = searchParams.get("oauth_state_id");

  // Retrieve stored link token and screening token from sessionStorage
  const storedLinkToken =
    typeof window !== "undefined"
      ? sessionStorage.getItem("plaid_link_token")
      : null;
  const screeningToken =
    typeof window !== "undefined"
      ? sessionStorage.getItem("screening_token")
      : null;

  const { open, ready } = usePlaidLink({
    token: storedLinkToken,
    receivedRedirectUri: typeof window !== "undefined" ? window.location.href : undefined,
    onSuccess: async (publicToken, metadata) => {
      if (!screeningToken) {
        console.error("No screening token found in session");
        return;
      }
      try {
        // Exchange the public token
        const res = await fetch(`/api/screen/${screeningToken}/plaid-exchange`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicToken,
            institutionName: metadata.institution?.name || null,
            institutionId: metadata.institution?.institution_id || null,
            accountIds: metadata.accounts?.map((a) => a.id) || [],
          }),
        });
        if (!res.ok) throw new Error("Exchange failed");

        // Redirect back to screening wizard
        window.location.href = `/screen/${screeningToken}?plaid_success=true`;
      } catch (err) {
        console.error("Plaid exchange error:", err);
        window.location.href = `/screen/${screeningToken}?plaid_error=true`;
      }
    },
    onExit: () => {
      // User cancelled — redirect back to screening wizard
      if (screeningToken) {
        window.location.href = `/screen/${screeningToken}?plaid_cancelled=true`;
      }
    },
  });

  // Auto-open Plaid Link when ready
  useEffect(() => {
    if (ready && oauthStateId) {
      open();
    }
  }, [ready, oauthStateId, open]);

  if (!oauthStateId) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-white">
        <p className="text-slate-500">Invalid OAuth redirect. Missing state parameter.</p>
      </div>
    );
  }

  if (!storedLinkToken) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-white">
        <div className="text-center">
          <p className="text-slate-500 mb-2">Session expired. Please restart the screening process.</p>
          <a href="/" className="text-blue-600 underline">Go home</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-slate-600">Connecting to your bank...</p>
        <p className="text-slate-400 text-sm mt-1">Please wait while we complete the verification.</p>
      </div>
    </div>
  );
}
