"use client";

import React, { useState } from "react";
import { Loader2, CheckCircle, ChevronRight, ChevronLeft, FileText } from "lucide-react";
import SignaturePad from "@/components/onboarding/signature-pad";

interface LegalDoc {
  type: string;
  label: string;
  version: string;
}

interface Props {
  legalDocs: LegalDoc[];
  onComplete: (signatures: Array<{ documentType: string; signatureData: string }>) => void;
  saving: boolean;
}

// Legal text for each document type
const LEGAL_TEXTS: Record<string, string> = {
  credit_pull_consent:
    "I authorize VettdRE and its partner screening companies to obtain credit reports about me from consumer reporting agencies. This authorization applies only to the current screening application and does not authorize any ongoing access to my credit information. I understand that a credit pull may affect my credit score.",
  fcra_disclosure:
    "In accordance with the Fair Credit Reporting Act (FCRA), you are being notified that a consumer report about you may be requested in connection with your application. The consumer report may contain information about your credit history, employment, criminal history, evictions, and other matters relevant to a determination regarding your application.",
  screening_terms:
    "By proceeding with this screening application, you agree to all terms and conditions outlined in this screening agreement. This includes authorization for background checks, credit pulls, employment verification, and document review. You certify that all information provided is accurate and complete.",
  privacy_disclosure:
    "Your privacy is important. We collect and process your personal information solely for the purpose of tenant screening. Your information is encrypted, stored securely, and will not be shared with third parties without your consent except as required by law.",
  fair_housing_notice:
    "In accordance with the Fair Housing Act, we do not discriminate on the basis of race, color, religion, sex, national origin, familial status, disability, sexual orientation, or gender identity. All applicants are evaluated fairly and consistently based on objective screening criteria.",
};

export default function SignatureStep({ legalDocs, onComplete, saving }: Props) {
  // Track which doc we're viewing (0-indexed), or null = all reviewed → show signature
  const [currentDocIndex, setCurrentDocIndex] = useState(0);
  const [reviewedDocs, setReviewedDocs] = useState<Set<string>>(new Set());
  const [signatureData, setSignatureData] = useState<string | null>(null);

  const allReviewed = reviewedDocs.size === legalDocs.length;
  const showSignature = allReviewed;
  const currentDoc = legalDocs[currentDocIndex];

  const handleNextDoc = () => {
    // Mark current as reviewed
    setReviewedDocs((prev) => new Set(prev).add(currentDoc.type));

    if (currentDocIndex < legalDocs.length - 1) {
      setCurrentDocIndex(currentDocIndex + 1);
    }
    // If it was the last doc, allReviewed will become true and show signature
  };

  const handlePrevDoc = () => {
    if (currentDocIndex > 0) {
      setCurrentDocIndex(currentDocIndex - 1);
    }
  };

  const handleSubmit = () => {
    if (!signatureData || !allReviewed) return;
    // Apply single signature to all documents
    const signaturesArray = legalDocs.map((doc) => ({
      documentType: doc.type,
      signatureData,
    }));
    onComplete(signaturesArray);
  };

  // ── Signature view (after all docs reviewed) ──────────────
  if (showSignature) {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-slate-900 mb-2">
            Sign Your Application
          </h2>
          <p className="text-sm text-slate-600">
            By signing below, you acknowledge that you have reviewed and agree to all of the following documents:
          </p>
        </div>

        {/* Reviewed documents checklist */}
        <div className="space-y-2">
          {legalDocs.map((doc) => (
            <div
              key={doc.type}
              className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3"
            >
              <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
              <span className="text-sm text-green-900 font-medium">{doc.label}</span>
              <span className="text-xs text-green-600 ml-auto">v{doc.version}</span>
            </div>
          ))}
        </div>

        {/* Signature Pad */}
        <div className="border border-slate-200 rounded-lg p-4 bg-white">
          <SignaturePad
            label="Your Signature"
            height={160}
            onSignature={(dataUrl) => setSignatureData(dataUrl)}
            onClear={() => setSignatureData(null)}
            disabled={saving}
          />
        </div>

        {/* Back to review + Submit */}
        <div className="flex gap-3">
          <button
            onClick={() => {
              setCurrentDocIndex(0);
              setReviewedDocs(new Set());
              setSignatureData(null);
            }}
            className="flex-shrink-0 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Review Again
          </button>

          <button
            onClick={handleSubmit}
            disabled={!signatureData || saving}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                Confirm & Continue
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── Document review view ──────────────────────────────────
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base sm:text-lg font-semibold text-slate-900 mb-2">
          Review Legal Documents
        </h2>
        <p className="text-sm text-slate-600">
          Please read each document carefully. You'll sign once after reviewing all documents.
        </p>
      </div>

      {/* Progress indicator */}
      <div className="flex items-center gap-2">
        {legalDocs.map((doc, i) => (
          <div
            key={doc.type}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              reviewedDocs.has(doc.type)
                ? "bg-green-500"
                : i === currentDocIndex
                ? "bg-blue-500"
                : "bg-slate-200"
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-slate-500">
        Document {currentDocIndex + 1} of {legalDocs.length}
      </p>

      {/* Current document */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200">
          <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <div>
            <div className="text-sm font-semibold text-slate-900">{currentDoc.label}</div>
            <div className="text-xs text-slate-500">Version {currentDoc.version}</div>
          </div>
        </div>

        <div className="px-4 py-5 sm:px-6">
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
            {LEGAL_TEXTS[currentDoc.type] || `[${currentDoc.label} content]`}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        {currentDocIndex > 0 && (
          <button
            onClick={handlePrevDoc}
            className="flex-shrink-0 inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </button>
        )}

        <button
          onClick={handleNextDoc}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 transition-colors"
        >
          {currentDocIndex < legalDocs.length - 1 ? (
            <>
              I've Read This — Next Document
              <ChevronRight className="w-4 h-4" />
            </>
          ) : (
            <>
              I've Read This — Proceed to Sign
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
