"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, ShieldCheck, AlertTriangle, CheckCircle, Camera, SkipForward } from "lucide-react";

interface Props {
  token: string;
  applicantId: string;
  onComplete: () => void;
  onSkip: () => void;
  saving: boolean;
}

type IdvState = "intro" | "verifying" | "polling" | "approved" | "declined" | "error";

const MAX_ATTEMPTS = 3;

export default function IdvStep({ token, applicantId, onComplete, onSkip, saving }: Props) {
  const [state, setState] = useState<IdvState>("intro");
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const pollCleanupRef = useRef<(() => void) | null>(null);

  // On mount: check if returning from IDV provider redirect
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("idv_status") === "complete") {
      // Recover the sessionId saved before redirect and poll it
      const savedSessionId = sessionStorage.getItem("idv_session_id");
      if (savedSessionId) {
        setSessionId(savedSessionId);
        pollCleanupRef.current = pollStatus(savedSessionId);
      }
      // If no saved session, stay at intro — user can restart
    }
    return () => { pollCleanupRef.current?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startVerification = async () => {
    try {
      setState("verifying");
      setError(null);

      const res = await fetch(`/api/screen/${token}/idv-start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicantId }),
      });

      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error || "Failed to start verification");
      }

      // Already approved from previous session
      if (body.status === "approved") {
        setState("approved");
        return;
      }

      setSessionId(body.sessionId);
      setAttempts((a) => a + 1);

      // Persist sessionId so we can recover it after redirect return
      sessionStorage.setItem("idv_session_id", body.sessionId);

      // Redirect to provider's hosted verification page
      window.location.href = body.verificationUrl;
    } catch (e: any) {
      setError(e.message);
      setState("error");
    }
  };

  const pollStatus = (sid: string): (() => void) => {
    setState("polling");
    setError(null);

    let polls = 0;
    const maxPolls = 60; // 3 minutes at 3s intervals

    const interval = setInterval(async () => {
      polls++;
      if (polls > maxPolls) {
        clearInterval(interval);
        setState("error");
        setError("The verification provider is taking longer than usual. You can try again with a different photo or skip this step to continue your application.");
        return;
      }

      try {
        const res = await fetch(`/api/screen/${token}/idv-status?sessionId=${sid}`);
        if (!res.ok) return;

        const body = await res.json();

        if (body.status === "approved") {
          clearInterval(interval);
          setState("approved");
        } else if (body.status === "declined") {
          clearInterval(interval);
          setState("declined");
        } else if (body.status === "expired" || body.status === "abandoned") {
          clearInterval(interval);
          setState("error");
          setError("Verification session expired. Please try again.");
        }
      } catch {
        // Silent — keep polling
      }
    }, 3000);

    return () => clearInterval(interval);
  };

  // Handle returning from IDV provider redirect (manual trigger)
  const handleReturnFromProvider = () => {
    if (sessionId) {
      pollCleanupRef.current?.();
      pollCleanupRef.current = pollStatus(sessionId);
    }
  };

  // ── Intro State ──────────────────────────────────────────────

  if (state === "intro") {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-7 h-7 text-blue-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Verify Your Identity</h2>
          <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
            For your security, we need to verify your identity. This takes about 2 minutes
            and requires a government-issued photo ID and a selfie.
          </p>
        </div>

        <div className="bg-slate-50 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">What you&apos;ll need:</h3>
          <ul className="space-y-2">
            <li className="flex items-start gap-3 text-sm text-slate-600">
              <Camera className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <span>A government-issued photo ID (passport, driver&apos;s license, or national ID card)</span>
            </li>
            <li className="flex items-start gap-3 text-sm text-slate-600">
              <Camera className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <span>A device with a camera for a quick selfie</span>
            </li>
          </ul>
        </div>

        <div className="bg-blue-50 rounded-xl p-4">
          <p className="text-xs text-blue-700">
            <strong>Privacy:</strong> Your ID photos are processed securely by our verification partner
            and are not stored after verification is complete. This check helps protect you against
            identity theft and fraud.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 rounded-lg p-3 text-sm text-red-700">{error}</div>
        )}

        <div className="space-y-3">
          <button
            onClick={startVerification}
            disabled={saving}
            className="w-full rounded-xl bg-blue-600 text-white py-3 text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
            Verify My Identity
          </button>

          <button
            onClick={onSkip}
            className="w-full rounded-xl border border-slate-200 text-slate-500 py-3 text-sm font-medium hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
          >
            <SkipForward className="w-4 h-4" />
            Skip for Now
          </button>

          <p className="text-xs text-center text-slate-400">
            Skipping identity verification may result in a lower screening score
            and flag your application for manual review.
          </p>
        </div>
      </div>
    );
  }

  // ── Verifying (redirecting to provider) ────────────────────

  if (state === "verifying") {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-sm text-slate-500">Preparing identity verification...</p>
      </div>
    );
  }

  // ── Polling (returned from provider) ───────────────────────

  if (state === "polling") {
    return (
      <div className="flex flex-col items-center justify-center py-16 space-y-4">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <p className="text-sm font-medium text-slate-700">Checking verification results...</p>
        <p className="text-xs text-slate-400">This usually takes just a few seconds</p>
      </div>
    );
  }

  // ── Approved ───────────────────────────────────────────────

  if (state === "approved") {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-6">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-900">Identity Verified</h2>
          <p className="text-sm text-slate-500 mt-1">
            Your identity has been successfully verified. Let&apos;s continue with your application.
          </p>
        </div>
        <button
          onClick={onComplete}
          disabled={saving}
          className="rounded-xl bg-blue-600 text-white px-8 py-3 text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    );
  }

  // ── Declined ───────────────────────────────────────────────

  if (state === "declined") {
    const canRetry = attempts < MAX_ATTEMPTS;

    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-6">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-amber-600" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-900">Verification Unsuccessful</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
            We weren&apos;t able to verify your identity. This can happen if the photo was blurry
            or the ID was expired.
            {canRetry && " You can try again with a different ID or better lighting."}
          </p>
        </div>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          {canRetry && (
            <button
              onClick={startVerification}
              className="w-full rounded-xl bg-blue-600 text-white py-3 text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              Try Again ({MAX_ATTEMPTS - attempts} {MAX_ATTEMPTS - attempts === 1 ? "attempt" : "attempts"} left)
            </button>
          )}
          <button
            onClick={onSkip}
            className="w-full rounded-xl border border-slate-200 text-slate-500 py-3 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Skip & Continue
          </button>
        </div>
      </div>
    );
  }

  // ── Error State ────────────────────────────────────────────

  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-6">
      <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
        <AlertTriangle className="w-8 h-8 text-red-600" />
      </div>
      <div className="text-center">
        <h2 className="text-xl font-bold text-slate-900">Something Went Wrong</h2>
        <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">
          {error || "We encountered an issue with identity verification."}
        </p>
      </div>
      <div className="flex flex-col gap-3 w-full max-w-xs">
        {attempts < MAX_ATTEMPTS && (
          <button
            onClick={startVerification}
            className="w-full rounded-xl bg-blue-600 text-white py-3 text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        )}
        {sessionId && (
          <button
            onClick={handleReturnFromProvider}
            className="w-full rounded-xl border border-blue-200 text-blue-600 py-3 text-sm font-medium hover:bg-blue-50 transition-colors"
          >
            I Already Completed Verification
          </button>
        )}
        <button
          onClick={onSkip}
          className="w-full rounded-xl border border-slate-200 text-slate-500 py-3 text-sm font-medium hover:bg-slate-50 transition-colors"
        >
          Skip & Continue
        </button>
      </div>
    </div>
  );
}
