"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import WizardShell from "@/components/screening/wizard/WizardShell";
import LandingView from "@/components/screening/wizard/LandingView";
import OtpStep from "@/components/screening/wizard/OtpStep";
import PersonalInfoStep from "@/components/screening/wizard/PersonalInfoStep";
import SignatureStep from "@/components/screening/wizard/SignatureStep";
import PlaidStep from "@/components/screening/wizard/PlaidStep";
import DocumentUploadStep from "@/components/screening/wizard/DocumentUploadStep";
import PaymentStep from "@/components/screening/wizard/PaymentStep";
import ConfirmationStep from "@/components/screening/wizard/ConfirmationStep";
import { WIZARD_STEPS, BASE_SCREENING_FEE_CENTS } from "@/lib/screening/constants";

// ── Types ─────────────────────────────────────────────────────

type WizardStep = "landing" | "otp" | "personal_info" | "signature" | "plaid" | "documents" | "payment" | "confirmation";

interface ApplicationData {
  application: {
    id: string;
    propertyAddress: string;
    unitNumber: string | null;
    monthlyRent: number;
    screeningTier: string;
    status: string;
    vettdreRiskScore: number | null;
    riskRecommendation: string | null;
  };
  applicants: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    role: string;
    status: string;
    personalInfo: Record<string, unknown> | null;
  }>;
  orgName: string;
  agentName: string | null;
  legalDocs: Array<{ type: string; label: string; version: string }>;
  fieldConfig: any;
}

// ── Component ─────────────────────────────────────────────────

export default function ScreeningWizardClient({ token }: { token: string }) {
  const searchParams = useSearchParams();

  const [step, setStep] = useState<WizardStep>("landing");
  const [data, setData] = useState<ApplicationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // OTP state
  const [otpMaskedEmail, setOtpMaskedEmail] = useState<string | null>(null);

  // Plaid state
  const [plaidLinkToken, setPlaidLinkToken] = useState<string | null>(null);
  const [plaidConnected, setPlaidConnected] = useState<{ institutionName: string } | null>(null);

  // ── Load application data ──────────────────────────────────

  // Use ref to avoid searchParams in useCallback deps (which causes re-creation on every render)
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/screen/${token}`);

      if (res.status === 404) {
        setError("This screening link is not valid.");
        return;
      }
      if (res.status === 410) {
        const body = await res.json();
        setError(body.error || "This application is no longer available.");
        return;
      }
      if (!res.ok) {
        setError("Something went wrong. Please try again later.");
        return;
      }

      const body = await res.json();
      setData(body);

      // Resume from URL params (e.g., returning from Stripe)
      const urlStep = searchParamsRef.current.get("step");
      if (urlStep === "confirmation") {
        setStep("confirmation");
      } else if (body.application.status === "processing" || body.application.status === "complete") {
        setStep("confirmation");
      }
    } catch {
      setError("Failed to load application. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Helpers ────────────────────────────────────────────────

  const primaryApplicant = data?.applicants?.find((a) => a.role === "main");
  const applicantId = primaryApplicant?.id;

  const apiPost = async (path: string, body: Record<string, unknown>): Promise<any> => {
    const res = await fetch(`/api/screen/${token}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || "Request failed");
    }
    return res.json();
  };

  // ── Step Handlers ──────────────────────────────────────────

  const handleStart = async () => {
    setError(null);
    try {
      setSaving(true);
      const res = await fetch(`/api/screen/${token}/otp-send`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Failed to send verification code");
        return;
      }
      setOtpMaskedEmail(body.maskedEmail);
      setStep("otp");
    } catch {
      setError("Failed to send verification code. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleOtpResend = async () => {
    const res = await fetch(`/api/screen/${token}/otp-send`, { method: "POST" });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "Failed to resend code");
    if (body.maskedEmail) setOtpMaskedEmail(body.maskedEmail);
  };

  const handleOtpVerify = async (code: string) => {
    const res = await fetch(`/api/screen/${token}/otp-verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const body = await res.json();
    return {
      success: !!body.success,
      error: body.error,
      remainingAttempts: body.remainingAttempts,
    };
  };

  const handleOtpVerified = () => {
    setStep("personal_info");
  };

  const handlePersonalInfoComplete = async (formData: Record<string, unknown>) => {
    if (!applicantId) { setError("Application data is missing. Please refresh the page."); return; }
    try {
      setError(null);
      setSaving(true);
      await apiPost("/personal-info", { applicantId, formData });
      setStep("signature");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSignatureComplete = async (signatures: Array<{ documentType: string; signatureData: string }>) => {
    if (!applicantId) { setError("Application data is missing. Please refresh the page."); return; }
    try {
      setError(null);
      setSaving(true);
      await apiPost("/signature", {
        applicantId,
        signatures: signatures.map((s) => ({
          ...s,
          ipAddress: "client",  // Server will capture real IP
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        })),
      });
      // Request Plaid Link token for next step
      await requestPlaidLinkToken();
      setStep("plaid");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const requestPlaidLinkToken = async () => {
    if (!applicantId) return;
    try {
      const result = await apiPost("/plaid-link", { applicantId });
      setPlaidLinkToken(result.linkToken);
    } catch {
      // Non-blocking — user can skip Plaid
      console.error("Failed to create Plaid Link token");
    }
  };

  const handlePlaidSuccess = async (publicToken: string, metadata: { institution: { institution_id: string; name: string } }) => {
    if (!applicantId) { setError("Application data is missing. Please refresh the page."); return; }
    try {
      setError(null);
      setSaving(true);
      await apiPost("/plaid-exchange", {
        applicantId,
        publicToken,
        institutionId: metadata.institution.institution_id,
        institutionName: metadata.institution.name,
      });
      setPlaidConnected({ institutionName: metadata.institution.name });
      setStep("documents");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handlePlaidSkip = async () => {
    if (!applicantId) { setError("Application data is missing. Please refresh the page."); return; }
    try {
      setError(null);
      setSaving(true);
      await apiPost("/plaid-skip", { applicantId });
      setStep("documents");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDocumentsComplete = async (documents: Array<{ file: File; documentType: string }>) => {
    if (!applicantId) { setError("Application data is missing. Please refresh the page."); return; }
    try {
      setError(null);
      setSaving(true);

      // Build FormData with files and document types
      const formData = new FormData();
      formData.append("applicantId", applicantId);

      // Append each file and its document type
      for (const doc of documents) {
        formData.append("files", doc.file);
        formData.append("documentTypes", doc.documentType);
      }

      // Send multipart form data to API route
      const res = await fetch(`/api/screen/${token}/documents`, {
        method: "POST",
        body: formData,
        // Don't set Content-Type header — browser will set it with boundary
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || "Failed to upload documents");
      }

      setStep("payment");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreatePaymentSession = async (): Promise<string | null> => {
    if (!applicantId) { setError("Application data is missing. Please refresh the page."); return null; }
    try {
      const result = await apiPost("/payment", { applicantId });
      return result.sessionUrl || null;
    } catch (e: any) {
      setError(e.message);
      return null;
    }
  };

  const handleRefreshStatus = async () => {
    try {
      const res = await fetch(`/api/screen/${token}/status`);
      if (res.ok) {
        const body = await res.json();
        if (data) {
          setData({
            ...data,
            application: {
              ...data.application,
              status: body.status,
              vettdreRiskScore: body.vettdreRiskScore,
              riskRecommendation: body.riskRecommendation,
            },
          });
        }
      }
    } catch {
      // Silent — polling, don't show errors
    }
  };

  // ── Rendering ──────────────────────────────────────────────

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent mx-auto" />
          <p className="text-sm text-slate-400 mt-3">Loading your application...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !data) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="text-center max-w-sm">
          <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-red-600 text-xl">!</span>
          </div>
          <h1 className="text-lg font-semibold text-slate-900 mb-2">Application Unavailable</h1>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { application, orgName, agentName, legalDocs, fieldConfig } = data;

  // Determine step index for progress bar
  const stepIndex = WIZARD_STEPS.findIndex((s) => s.key === step);
  const currentStepNum = stepIndex >= 0 ? stepIndex + 1 : 0;
  const currentStepLabel = WIZARD_STEPS.find((s) => s.key === step)?.label || "";

  // Landing page — no shell, but centered with max-width
  if (step === "landing") {
    return (
      <div className="min-h-dvh bg-white flex flex-col">
        <main className="mx-auto px-4 w-full flex-1 max-w-lg">
          <LandingView
            propertyAddress={application.propertyAddress}
            unitNumber={application.unitNumber || undefined}
            orgName={orgName}
            agentName={agentName || "Your Agent"}
            tier={application.screeningTier}
            onStart={handleStart}
          />
        </main>
      </div>
    );
  }

  // OTP verification step — no shell, centered like landing
  if (step === "otp") {
    return (
      <div className="min-h-dvh bg-white flex flex-col">
        <main className="mx-auto px-4 w-full flex-1 max-w-lg flex items-center justify-center">
          <OtpStep
            maskedEmail={otpMaskedEmail || "your email"}
            onVerified={handleOtpVerified}
            onResend={handleOtpResend}
            onVerify={handleOtpVerify}
          />
        </main>
      </div>
    );
  }

  // Confirmation — no shell (full-screen feel)
  if (step === "confirmation") {
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <ConfirmationStep
          status={application.status}
          riskScore={application.vettdreRiskScore != null ? Number(application.vettdreRiskScore) : null}
          onRefresh={handleRefreshStatus}
        />
      </div>
    );
  }

  // Active wizard step — wrapped in shell
  return (
    <>
      {/* Dismissable error banner */}
      {error && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-2">×</button>
        </div>
      )}

      <WizardShell
        currentStep={currentStepNum}
        totalSteps={WIZARD_STEPS.length}
        stepLabel={currentStepLabel}
        propertyAddress={application.propertyAddress}
        orgName={orgName}
      >
        {step === "personal_info" && (
          <PersonalInfoStep
            fieldConfig={fieldConfig}
            applicantRole={primaryApplicant?.role || "main"}
            initialData={(primaryApplicant?.personalInfo as Record<string, unknown>) || {}}
            onComplete={handlePersonalInfoComplete}
            saving={saving}
          />
        )}

        {step === "signature" && (
          <SignatureStep
            legalDocs={legalDocs}
            onComplete={handleSignatureComplete}
            saving={saving}
          />
        )}

        {step === "plaid" && (
          <PlaidStep
            linkToken={plaidLinkToken}
            screeningToken={token}
            onSuccess={handlePlaidSuccess}
            onSkip={handlePlaidSkip}
            loading={saving}
            connected={plaidConnected || undefined}
          />
        )}

        {step === "documents" && (
          <DocumentUploadStep
            onComplete={handleDocumentsComplete}
            saving={saving}
          />
        )}

        {step === "payment" && (
          <PaymentStep
            amount={BASE_SCREENING_FEE_CENTS}
            onCreateSession={handleCreatePaymentSession}
          />
        )}
      </WizardShell>
    </>
  );
}
