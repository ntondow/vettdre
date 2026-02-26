"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { acceptInvite, getInviteDetails } from "@/app/(dashboard)/brokerage/agents/onboarding-actions";
import { Loader2, CheckCircle2, AlertCircle, Building2 } from "lucide-react";
import { getUserIdFromAuth } from "./resolve-user";

export default function AcceptInviteClient({ token }: { token: string }) {
  const [status, setStatus] = useState<"loading" | "success" | "error" | "not-authed">("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [brokerageName, setBrokerageName] = useState("");
  const router = useRouter();
  const supabase = createClient();
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    async function process() {
      try {
        // 1. Check auth
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) {
          setStatus("not-authed");
          return;
        }

        // 2. Get invite details for display
        const details = await getInviteDetails(token);
        if (details) {
          setBrokerageName(details.brokerageName);
        }

        // 3. Resolve Supabase auth ID → User.id via server action
        const resolved = await getUserIdFromAuth();
        if (!resolved) {
          setErrorMsg("Could not find your user account. Please contact support.");
          setStatus("error");
          return;
        }

        // 4. Accept the invite
        const result = await acceptInvite(token, resolved.userId);
        if (!result.success) {
          setErrorMsg(result.error || "Failed to accept invitation");
          setStatus("error");
          return;
        }

        setStatus("success");
      } catch (err) {
        console.error("Accept invite error:", err);
        setErrorMsg("Something went wrong. Please try again.");
        setStatus("error");
      }
    }

    process();
  }, [token, supabase]);

  // ── Not authenticated — redirect to login ──────────────────

  if (status === "not-authed") {
    router.replace(`/login?redirect=${encodeURIComponent(`/join/agent/${token}/accept`)}`);
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Redirecting to sign in...</p>
        </div>
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Linking your account...</p>
        </div>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────

  if (status === "error") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-6 w-6 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">
            Could Not Accept Invitation
          </h1>
          <p className="text-sm text-slate-500 mb-6">{errorMsg}</p>
          <button
            onClick={() => router.push("/brokerage/my-deals")}
            className="px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ── Success ────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 p-8 text-center">
        <div className="w-14 h-14 rounded-xl bg-green-100 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="h-7 w-7 text-green-600" />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-2">
          Welcome!
        </h1>
        <p className="text-sm text-slate-600 mb-1">
          You&apos;ve been successfully linked to
        </p>
        {brokerageName && (
          <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 mb-6">
            <Building2 className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-semibold text-slate-800">{brokerageName}</span>
          </div>
        )}
        <div>
          <button
            onClick={() => router.push("/brokerage/my-deals")}
            className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
