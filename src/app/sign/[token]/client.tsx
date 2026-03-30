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
  Lock,
  Eye,
} from "lucide-react";
import SignaturePad from "@/components/onboarding/signature-pad";
import PdfViewer from "@/components/onboarding/pdf-viewer";
import PdfFieldViewer from "@/components/onboarding/pdf-field-viewer";
import SigningComplete from "@/components/onboarding/signing-complete";
import type { TemplateFieldDefinition } from "@/lib/onboarding-types";

// ── Types ────────────────────────────────────────────────────

interface DocumentInfo {
  id: string;
  docType: string;
  docTitle: string;
  status: string;
  docOrder: number;
  pdfUrl?: string | null;
  fields?: TemplateFieldDefinition[];
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
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [pdfViewed, setPdfViewed] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState("");
  const [focusedFieldId, setFocusedFieldId] = useState<string | null>(null);
  const [showMobilePdf, setShowMobilePdf] = useState(false);

  // ── Fetch onboarding data ─────────────────────────────────

  useEffect(() => {
    async function verify() {
      try {
        const res = await fetch(`/api/onboarding/${token}/verify`);
        if (res.status === 404) { setErrorMsg("This signing link is not valid."); setStep("error"); return; }
        if (res.status === 410) { const body = await res.json(); setErrorMsg(body.error || "No longer valid."); setStep("error"); return; }
        if (!res.ok) { setErrorMsg("Something went wrong."); setStep("error"); return; }

        const body = await res.json();
        setData(body);

        if (body.onboardingStatus === "completed") {
          setStep("already_complete");
        } else {
          const firstUnsigned = body.documents.findIndex((d: DocumentInfo) => d.status !== "signed");
          setDocIndex(firstUnsigned >= 0 ? firstUnsigned : 0);
          setStep("welcome");
        }
      } catch {
        setErrorMsg("Unable to load. Check your connection.");
        setStep("error");
      }
    }
    verify();
  }, [token]);

  // Init field values when doc changes
  useEffect(() => {
    if (!data) return;
    const doc = data.documents[docIndex];
    if (!doc?.fields?.length) { setFieldValues({}); return; }
    // Pre-populate with prefilled values (read-only fields)
    const init: Record<string, string> = {};
    // Don't pre-populate here — agent already pre-filled the PDF
    setFieldValues(init);
  }, [data, docIndex]);

  // ── Helpers ───────────────────────────────────────────────

  const currentDoc = data?.documents[docIndex];
  const hasTemplateFields = currentDoc?.fields && currentDoc.fields.length > 0;
  const signatureFields = hasTemplateFields
    ? currentDoc!.fields!.filter((f) => f.type === "signature" || f.type === "initials")
    : [];
  const fillableFields = hasTemplateFields
    ? currentDoc!.fields!.filter((f) => f.type !== "signature" && f.type !== "initials" && !f.prefillKey)
    : [];
  const prefillFields = hasTemplateFields
    ? currentDoc!.fields!.filter((f) => !!f.prefillKey && f.type !== "signature" && f.type !== "initials")
    : [];

  // Validation
  const canSubmit = useCallback(() => {
    if (!currentDoc) return false;
    if (hasTemplateFields) {
      const requiredFields = currentDoc.fields!.filter((f) => f.required);
      for (const f of requiredFields) {
        if (!fieldValues[f.id]) return false;
      }
      return true;
    }
    // Legacy: need signature + PDF viewed
    return !!fieldValues.__legacySignature && pdfViewed;
  }, [currentDoc, hasTemplateFields, fieldValues, pdfViewed]);

  // ── Sign document ─────────────────────────────────────────

  const handleSign = useCallback(async () => {
    if (!data || !currentDoc) return;
    setSigning(true);
    setSignError("");

    try {
      // For legacy docs, use the signature from __legacySignature
      const sigImage = hasTemplateFields
        ? (signatureFields.length > 0 ? fieldValues[signatureFields[0].id] : undefined)
        : fieldValues.__legacySignature;

      const res = await fetch(`/api/onboarding/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: currentDoc.id,
          signatureImage: sigImage || undefined,
          signerName: `${data.clientFirstName} ${data.clientLastName}`,
          signerEmail: data.clientEmail,
          fieldValues: hasTemplateFields ? fieldValues : undefined,
        }),
      });

      const body = await res.json();
      if (!res.ok) { setSignError(body.error || "Failed to sign"); setSigning(false); return; }

      if (body.allComplete) {
        setStep("complete");
      } else {
        setFieldValues({});
        setPdfViewed(false);
        setDocIndex((i) => i + 1);
      }
    } catch {
      setSignError("Network error. Please try again.");
    } finally {
      setSigning(false);
    }
  }, [data, currentDoc, hasTemplateFields, fieldValues, signatureFields, token, pdfViewed]);

  // ── Render ────────────────────────────────────────────────

  if (step === "loading") {
    return <Shell><div className="flex flex-col items-center justify-center py-24"><Loader2 className="h-8 w-8 text-blue-600 animate-spin mb-4" /><p className="text-sm text-slate-500">Loading your documents...</p></div></Shell>;
  }

  if (step === "error") {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
            {errorMsg.includes("expired") ? <Clock className="h-7 w-7 text-red-500" /> : <XCircle className="h-7 w-7 text-red-500" />}
          </div>
          <h2 className="mb-2 text-xl font-bold text-slate-900">Unable to Continue</h2>
          <p className="mb-6 max-w-sm text-sm text-slate-500">{errorMsg}</p>
          <p className="text-xs text-slate-400">Contact your agent for a new signing link.</p>
        </div>
      </Shell>
    );
  }

  if (step === "already_complete") {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100"><CheckCircle className="h-7 w-7 text-green-600" /></div>
          <h2 className="mb-2 text-xl font-bold text-slate-900">Already Signed</h2>
          <p className="mb-6 max-w-sm text-sm text-slate-500">All documents have been signed.</p>
          <a href={`/api/onboarding/${token}/download`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700">Download Copies</a>
        </div>
      </Shell>
    );
  }

  if (!data) return null;

  // ── Welcome ───────────────────────────────────────────────

  if (step === "welcome") {
    return (
      <Shell>
        <div className="py-8 animate-[fade-in_0.3s_ease-out]">
          {data.brokerageName && <div className="mb-6 text-center"><span className="text-lg font-bold text-slate-900">{data.brokerageName}</span></div>}
          <h1 className="mb-2 text-2xl font-bold text-slate-900 text-center">Welcome, {data.clientFirstName}</h1>
          <p className="mb-8 text-center text-sm text-slate-500 max-w-md mx-auto">
            {data.agentFullName} at {data.brokerageName} has invited you to review and sign documents.
          </p>
          {(data.commissionPct || data.termDays) && (
            <div className="mb-8 mx-auto max-w-sm rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="grid grid-cols-2 gap-4 text-center">
                {data.commissionPct != null && <div><div className="text-xs text-slate-400">Commission</div><div className="text-lg font-bold text-slate-900">{data.commissionPct}%</div></div>}
                {data.termDays != null && <div><div className="text-xs text-slate-400">Term</div><div className="text-lg font-bold text-slate-900">{data.termDays} days</div></div>}
              </div>
            </div>
          )}
          <div className="mb-8 mx-auto max-w-sm">
            <p className="mb-3 text-sm font-medium text-slate-700">You&apos;ll be signing {data.documents.length} document{data.documents.length !== 1 ? "s" : ""}:</p>
            <ol className="space-y-2">
              {data.documents.map((doc, i) => (
                <li key={doc.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{i + 1}</span>
                  <span className="text-sm font-medium text-slate-700 truncate flex-1">{doc.docTitle}</span>
                  {doc.status === "signed" ? <CheckCircle className="w-4 h-4 text-green-500" /> : <FileText className="w-4 h-4 text-slate-300" />}
                </li>
              ))}
            </ol>
          </div>
          <div className="text-center">
            <button onClick={() => setStep("signing")} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-8 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700">
              Get Started <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <p className="mt-8 text-center text-xs text-slate-400 max-w-sm mx-auto">
            By proceeding, you confirm your identity as <span className="font-medium">{data.clientFirstName} {data.clientLastName}</span> ({data.clientEmail}).
          </p>
        </div>
      </Shell>
    );
  }

  // ── Signing Step ──────────────────────────────────────────

  if (step === "signing" && currentDoc) {
    const totalDocs = data.documents.length;
    const progressPct = (docIndex / totalDocs) * 100;

    return (
      <Shell wide={hasTemplateFields}>
        <div className="py-4 animate-[fade-in_0.3s_ease-out]" key={currentDoc.id}>
          {/* Progress */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">Document {docIndex + 1} of {totalDocs}</span>
              <span className="text-xs text-slate-400">{Math.round(progressPct)}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-blue-600 transition-all duration-500" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          <h2 className="mb-4 text-lg font-bold text-slate-900">{currentDoc.docTitle}</h2>

          {hasTemplateFields ? (
            /* ── Template-based: form + PDF preview ─────────── */
            <div className="flex flex-col md:flex-row gap-6">
              {/* LEFT: Form fields */}
              <div className="w-full md:w-[40%] space-y-4 order-2 md:order-1">
                {/* Pre-filled fields (read-only) */}
                {prefillFields.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Pre-filled by your agent</p>
                    {prefillFields.map((field) => (
                      <div key={field.id} className="mb-2">
                        <label className="block text-xs font-medium text-slate-500 mb-0.5 flex items-center gap-1">
                          <Lock className="w-3 h-3" /> {field.label}
                        </label>
                        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-slate-600">{fieldValues[field.id] || "—"}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Fillable fields */}
                {fillableFields.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Please fill in</p>
                    {fillableFields.map((field) => (
                      <div key={field.id} className="mb-3">
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          {field.label} {field.required && <span className="text-red-500">*</span>}
                        </label>
                        {field.type === "date" ? (
                          <input
                            type="date"
                            value={fieldValues[field.id] || ""}
                            onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                            onFocus={() => setFocusedFieldId(field.id)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : field.type === "checkbox" ? (
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={fieldValues[field.id] === "true"}
                              onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.id]: e.target.checked ? "true" : "" }))}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm text-slate-600">I agree</span>
                          </label>
                        ) : (
                          <input
                            type="text"
                            value={fieldValues[field.id] || ""}
                            onChange={(e) => setFieldValues((prev) => ({ ...prev, [field.id]: e.target.value }))}
                            onFocus={() => setFocusedFieldId(field.id)}
                            placeholder={field.label}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Signature fields */}
                {signatureFields.map((field) => (
                  <div key={field.id}>
                    <SignaturePad
                      label={field.label + (field.required ? " *" : "")}
                      height={field.type === "initials" ? 100 : 180}
                      onSignature={(dataUrl) => setFieldValues((prev) => ({ ...prev, [field.id]: dataUrl }))}
                      onClear={() => setFieldValues((prev) => { const n = { ...prev }; delete n[field.id]; return n; })}
                      disabled={signing}
                    />
                  </div>
                ))}

                {signError && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {signError}
                  </div>
                )}

                <button
                  onClick={handleSign}
                  disabled={signing || !canSubmit()}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                >
                  {signing ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing...</> : docIndex < totalDocs - 1 ? <>Sign &amp; Continue <ChevronRight className="w-4 h-4" /></> : <>Sign &amp; Complete <CheckCircle className="w-4 h-4" /></>}
                </button>
              </div>

              {/* RIGHT: PDF preview with field overlays */}
              <div className="w-full md:w-[60%] order-1 md:order-2">
                {/* Mobile: collapsed */}
                <div className="md:hidden mb-4">
                  <button onClick={() => setShowMobilePdf(!showMobilePdf)} className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
                    <Eye className="w-4 h-4" /> {showMobilePdf ? "Hide" : "Preview"} Document
                  </button>
                  {showMobilePdf && currentDoc.pdfUrl && (
                    <div className="mt-3">
                      <PdfFieldViewer pdfUrl={currentDoc.pdfUrl} fields={currentDoc.fields || []} fieldValues={fieldValues} selectedFieldId={focusedFieldId} onFieldClick={setFocusedFieldId} />
                    </div>
                  )}
                </div>
                {/* Desktop: always visible */}
                <div className="hidden md:block sticky top-4">
                  {currentDoc.pdfUrl ? (
                    <PdfFieldViewer pdfUrl={currentDoc.pdfUrl} fields={currentDoc.fields || []} fieldValues={fieldValues} selectedFieldId={focusedFieldId} onFieldClick={setFocusedFieldId} />
                  ) : (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 py-16 text-center">
                      <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                      <p className="text-sm text-slate-500">PDF preview not available</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ── Legacy: PDF view + signature pad ────────────── */
            <>
              {currentDoc.pdfUrl ? (
                <PdfViewer pdfUrl={currentDoc.pdfUrl} title={currentDoc.docTitle} onViewed={() => setPdfViewed(true)} />
              ) : (
                <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 py-16 text-center">
                  <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">Preview not available</p>
                  {!pdfViewed && <button onClick={() => setPdfViewed(true)} className="mt-3 text-xs text-blue-600 hover:text-blue-700 font-medium">I acknowledge this document</button>}
                </div>
              )}
              <div className="mt-6">
                <SignaturePad
                  label={`Sign as ${data.clientFirstName} ${data.clientLastName}`}
                  onSignature={(dataUrl) => setFieldValues((prev) => ({ ...prev, __legacySignature: dataUrl }))}
                  onClear={() => setFieldValues((prev) => { const n = { ...prev }; delete n.__legacySignature; return n; })}
                  disabled={signing}
                />
              </div>
              {signError && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {signError}
                </div>
              )}
              <div className="mt-6">
                <button
                  onClick={handleSign}
                  disabled={signing || !canSubmit()}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                >
                  {signing ? <><Loader2 className="w-4 h-4 animate-spin" /> Signing...</> : docIndex < totalDocs - 1 ? <>Sign &amp; Continue <ChevronRight className="w-4 h-4" /></> : <>Sign &amp; Complete <CheckCircle className="w-4 h-4" /></>}
                </button>
                {!pdfViewed && currentDoc.pdfUrl && <p className="mt-2 text-center text-xs text-slate-400">Please review the document above before signing</p>}
              </div>
            </>
          )}
        </div>
      </Shell>
    );
  }

  // ── Complete ──────────────────────────────────────────────

  if (step === "complete") {
    return (
      <Shell>
        <SigningComplete
          onboardingData={{
            clientFirstName: data.clientFirstName,
            agentFullName: data.agentFullName,
            brokerageName: data.brokerageName,
            documents: data.documents.map((d) => ({ docTitle: d.docTitle, signedAt: new Date().toISOString() })),
          }}
          downloadUrl={`/api/onboarding/${token}/download`}
        />
      </Shell>
    );
  }

  return null;
}

// ── Shell Layout ────────────────────────────────────────────

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-dvh bg-white">
      <header className="border-b border-slate-100 bg-white">
        <div className={`mx-auto px-4 py-4 ${wide ? "max-w-5xl" : "max-w-2xl"}`}>
          <span className="text-lg font-bold text-slate-900">VettdRE</span>
          <span className="ml-2 text-xs text-slate-400">Secure Document Signing</span>
        </div>
      </header>
      <main className={`mx-auto px-4 ${wide ? "max-w-5xl" : "max-w-2xl"}`}>{children}</main>
      <footer className="mt-12 border-t border-slate-100 bg-slate-50">
        <div className={`mx-auto px-4 py-6 text-center ${wide ? "max-w-5xl" : "max-w-2xl"}`}>
          <p className="text-xs text-slate-400">Powered by VettdRE &middot; Documents are signed electronically and legally binding</p>
        </div>
      </footer>
    </div>
  );
}
