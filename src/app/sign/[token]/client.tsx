"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  AlertTriangle,
  FileText,
  ChevronRight,
  Clock,
  XCircle,
  CheckCircle,
} from "lucide-react";
import SignaturePad from "@/components/onboarding/signature-pad";
import PdfViewer from "@/components/onboarding/pdf-viewer";
import SigningComplete from "@/components/onboarding/signing-complete";

// ── Types ────────────────────────────────────────────────────

interface DocumentInfo {
  id: string;
  docType: string;
  docTitle: string;
  status: string;
  docOrder: number;
  pdfUrl?: string | null;
}

interface OnboardingData {
  clientFirstName: string;
  clientLastName: string;
  clientEmail: string;
  brokerageName: string | null;
  agentFullName: string | null;
  agentLicense: string | null;
  commissionPct: number | null;
  monthlyRent: number | null;
  termDays: number | null;
  onboardingStatus: string;
  documents: DocumentInfo[];
}

type Step = "loading" | "welcome" | "signing" | "complete" | "error" | "already_complete";

// ── Component ────────────────────────────────────────────────

export default function SigningClient({ token }: { token: string }) {
  const [step, setStep] = useState<Step>("loading");
  const [data, setData] = useState<OnboardingData | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [docIndex, setDocIndex] = useState(0);
  const [signature, setSignature] = useState<string | null>(null);
  const [pdfViewed, setPdfViewed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState("");

  // ── Fetch onboarding data ─────────────────────────────────

  useEffect(() => {
    async function verify() {
      try {
        const res = await fetch(`/api/onboarding/${token}/verify`);
        if (res.status === 404) {
          setErrorMsg("This signing link is not valid.");
          setStep("error");
          return;
        }
        if (res.status === 410) {
          const body = await res.json();
          setErrorMsg(body.error || "This signing link is no longer valid.");
          setStep("error");
          return;
        }
        if (!res.ok) {
          setErrorMsg("Something went wrong. Please try again later.");
          setStep("error");
          return;
        }

        const body = await res.json();
        setData(body);

        if (body.onboardingStatus === "completed") {
          setStep("already_complete");
        } else {
          // Find first unsigned doc
          const firstUnsigned = body.documents.findIndex((d: DocumentInfo) => d.status !== "signed");
          setDocIndex(firstUnsigned >= 0 ? firstUnsigned : 0);
          setStep("welcome");
        }
      } catch {
        setErrorMsg("Unable to load signing page. Please check your connection.");
        setStep("error");
      }
    }
    verify();
  }, [token]);

  // ── Sign document ─────────────────────────────────────────

  const handleSign = useCallback(async () => {
    if (!data || !signature) return;
    const doc = data.documents[docIndex];
    if (!doc) return;

    setSigning(true);
    setSignError("");

    try {
      const res = await fetch(`/api/onboarding/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: doc.id,
          signatureImage: signature,
          signerName: `${data.clientFirstName} ${data.clientLastName}`,
          signerEmail: data.clientEmail,
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        setSignError(body.error || "Failed to sign document");
        setSigning(false);
        return;
      }

      if (body.allComplete) {
        setStep("complete");
      } else {
        // Advance to next document
        setSignature(null);
        setPdfViewed(false);
        setDocIndex((i) => i + 1);
      }
    } catch {
      setSignError("Network error. Please try again.");
    } finally {
      setSigning(false);
    }
  }, [data, docIndex, signature, token]);

  // ── Render ────────────────────────────────────────────────

  if (step === "loading") {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center py-24">
          <Loader2 className="h-8 w-8 text-blue-600 animate-spin mb-4" />
          <p className="text-sm text-slate-500">Loading your documents...</p>
        </div>
      </Shell>
    );
  }

  if (step === "error") {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
            {errorMsg.includes("expired") ? (
              <Clock className="h-7 w-7 text-red-500" />
            ) : (
              <XCircle className="h-7 w-7 text-red-500" />
            )}
          </div>
          <h2 className="mb-2 text-xl font-bold text-slate-900">Unable to Continue</h2>
          <p className="mb-6 max-w-sm text-sm text-slate-500">{errorMsg}</p>
          <p className="text-xs text-slate-400">
            Please contact your agent for a new signing link.
          </p>
        </div>
      </Shell>
    );
  }

  if (step === "already_complete") {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-7 w-7 text-green-600" />
          </div>
          <h2 className="mb-2 text-xl font-bold text-slate-900">Already Signed</h2>
          <p className="mb-6 max-w-sm text-sm text-slate-500">
            All documents for this onboarding have already been signed.
          </p>
          <a
            href={`/api/onboarding/${token}/download`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Download Your Copies
          </a>
        </div>
      </Shell>
    );
  }

  if (!data) return null;

  // ── Welcome Step ──────────────────────────────────────────

  if (step === "welcome") {
    return (
      <Shell>
        <div className="py-8 animate-[fade-in_0.3s_ease-out]">
          {/* Brokerage branding */}
          {data.brokerageName && (
            <div className="mb-6 text-center">
              <span className="text-lg font-bold text-slate-900">{data.brokerageName}</span>
            </div>
          )}

          <h1 className="mb-2 text-2xl font-bold text-slate-900 text-center">
            Welcome, {data.clientFirstName}
          </h1>
          <p className="mb-8 text-center text-sm text-slate-500 max-w-md mx-auto">
            {data.agentFullName} at {data.brokerageName} has invited you to review and sign
            your tenant representation documents.
          </p>

          {/* Summary */}
          {(data.commissionPct || data.termDays) && (
            <div className="mb-8 mx-auto max-w-sm rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="grid grid-cols-2 gap-4 text-center">
                {data.commissionPct != null && (
                  <div>
                    <div className="text-xs text-slate-400">Commission</div>
                    <div className="text-lg font-bold text-slate-900">{data.commissionPct}%</div>
                  </div>
                )}
                {data.termDays != null && (
                  <div>
                    <div className="text-xs text-slate-400">Term Length</div>
                    <div className="text-lg font-bold text-slate-900">{data.termDays} days</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Document list */}
          <div className="mb-8 mx-auto max-w-sm">
            <p className="mb-3 text-sm font-medium text-slate-700">
              You&apos;ll be signing {data.documents.length} document{data.documents.length !== 1 ? "s" : ""}:
            </p>
            <ol className="space-y-2">
              {data.documents.map((doc, i) => (
                <li key={doc.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-slate-700 truncate block">{doc.docTitle}</span>
                  </div>
                  {doc.status === "signed" ? (
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-slate-300 flex-shrink-0" />
                  )}
                </li>
              ))}
            </ol>
          </div>

          {/* CTA */}
          <div className="text-center">
            <button
              onClick={() => setStep("signing")}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              Get Started
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Legal notice */}
          <p className="mt-8 text-center text-xs text-slate-400 max-w-sm mx-auto">
            By proceeding, you confirm your identity as{" "}
            <span className="font-medium">{data.clientFirstName} {data.clientLastName}</span>{" "}
            ({data.clientEmail}).
          </p>
        </div>
      </Shell>
    );
  }

  // ── Signing Step ──────────────────────────────────────────

  if (step === "signing") {
    const doc = data.documents[docIndex];
    if (!doc) {
      setStep("complete");
      return null;
    }

    const totalDocs = data.documents.length;
    const progressPct = ((docIndex) / totalDocs) * 100;

    return (
      <Shell>
        <div className="py-6 animate-[fade-in_0.3s_ease-out]" key={doc.id}>
          {/* Progress bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">
                Document {docIndex + 1} of {totalDocs}
              </span>
              <span className="text-xs text-slate-400">
                {Math.round(progressPct)}% complete
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-600 transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Document title */}
          <h2 className="mb-4 text-lg font-bold text-slate-900">{doc.docTitle}</h2>

          {/* PDF Viewer */}
          {doc.pdfUrl ? (
            <PdfViewer
              pdfUrl={doc.pdfUrl}
              title={doc.docTitle}
              onViewed={() => setPdfViewed(true)}
            />
          ) : (
            <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 py-16 text-center">
              <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">Document preview not available</p>
              <p className="text-xs text-slate-400 mt-1">
                You may still sign to acknowledge this document
              </p>
              {!pdfViewed && (
                <button
                  onClick={() => setPdfViewed(true)}
                  className="mt-3 text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  I acknowledge this document
                </button>
              )}
            </div>
          )}

          {/* Signature Pad */}
          <div className="mt-6">
            <SignaturePad
              onSignature={(dataUrl) => setSignature(dataUrl)}
              onClear={() => setSignature(null)}
              label={`Sign as ${data.clientFirstName} ${data.clientLastName}`}
              disabled={signing}
            />
          </div>

          {/* Error */}
          {signError && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {signError}
            </div>
          )}

          {/* Submit */}
          <div className="mt-6">
            <button
              onClick={handleSign}
              disabled={signing || !signature || (!pdfViewed && !!doc.pdfUrl)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              {signing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing...
                </>
              ) : docIndex < totalDocs - 1 ? (
                <>
                  Sign &amp; Continue
                  <ChevronRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  Sign &amp; Complete
                  <CheckCircle className="w-4 h-4" />
                </>
              )}
            </button>
            {!pdfViewed && doc.pdfUrl && (
              <p className="mt-2 text-center text-xs text-slate-400">
                Please review the document above before signing
              </p>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  // ── Complete Step ─────────────────────────────────────────

  if (step === "complete") {
    return (
      <Shell>
        <SigningComplete
          onboardingData={{
            clientFirstName: data.clientFirstName,
            agentFullName: data.agentFullName,
            brokerageName: data.brokerageName,
            documents: data.documents.map((d) => ({
              docTitle: d.docTitle,
              signedAt: new Date().toISOString(),
            })),
          }}
          downloadUrl={`/api/onboarding/${token}/download`}
        />
      </Shell>
    );
  }

  return null;
}

// ── Shell Layout ────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-white">
      {/* Header */}
      <header className="border-b border-slate-100 bg-white">
        <div className="mx-auto max-w-2xl px-4 py-4">
          <span className="text-lg font-bold text-slate-900">VettdRE</span>
          <span className="ml-2 text-xs text-slate-400">Secure Document Signing</span>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-2xl px-4">
        {children}
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-2xl px-4 py-6 text-center">
          <p className="text-xs text-slate-400">
            Powered by VettdRE &middot; Documents are signed electronically and legally binding
          </p>
        </div>
      </footer>
    </div>
  );
}
