"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Building2, Loader2, AlertCircle, UserPlus, LogIn } from "lucide-react";
import { getInviteDetails } from "@/app/(dashboard)/brokerage/agents/onboarding-actions";

interface InviteDetails {
  agentName: string;
  brokerageName: string;
  agentEmail: string;
}

export default function AgentJoinClient({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<InviteDetails | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function load() {
      try {
        const result = await getInviteDetails(token);
        setDetails(result);
      } catch {
        setDetails(null);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  const acceptPath = `/join/agent/${token}/accept`;

  // ── Loading ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading invitation...</p>
        </div>
      </div>
    );
  }

  // ── Invalid / Expired ──────────────────────────────────────

  if (!details) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-6 w-6 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">
            Invitation Not Found
          </h1>
          <p className="text-sm text-slate-500 mb-6">
            This invitation link is no longer valid. It may have already been used or was revoked by the brokerage.
          </p>
          <p className="text-sm text-slate-400">
            Please contact your broker for a new invitation.
          </p>
        </div>
      </div>
    );
  }

  // ── Valid Invite ────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 p-8">
        {/* Logo / Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-xl bg-blue-600 flex items-center justify-center mx-auto mb-4">
            <Building2 className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">
            Vettd<span className="text-blue-600">RE</span>
          </h1>
        </div>

        {/* Invite message */}
        <div className="text-center mb-8">
          <h2 className="text-xl font-bold text-slate-900 mb-2">
            You&apos;ve been invited!
          </h2>
          <p className="text-sm text-slate-600">
            <span className="font-semibold text-slate-800">{details.brokerageName}</span>{" "}
            has invited you to join as an agent.
          </p>
        </div>

        {/* Agent info card */}
        <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <span className="text-sm font-semibold text-blue-600">
                {details.agentName.split(" ").map(n => n[0]).join("").slice(0, 2)}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">{details.agentName}</p>
              <p className="text-xs text-slate-500 truncate">{details.agentEmail}</p>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="space-y-3">
          <button
            onClick={() => router.push(`/login?redirect=${encodeURIComponent(acceptPath)}`)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <LogIn className="h-4 w-4" />
            I already have an account
          </button>
          <button
            onClick={() => router.push(`/signup?redirect=${encodeURIComponent(acceptPath)}`)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-slate-700 text-sm font-medium rounded-lg border border-slate-300 hover:bg-slate-50 transition-colors"
          >
            <UserPlus className="h-4 w-4" />
            Create an account
          </button>
        </div>

        <p className="text-xs text-slate-400 text-center mt-6">
          After signing in, your account will be linked to {details.brokerageName}.
        </p>
      </div>
    </div>
  );
}
