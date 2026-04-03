"use client";

import React, { useState, useCallback } from "react";
import { Loader2, ChevronDown, ChevronUp, CheckCircle, ChevronRight } from "lucide-react";
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

// Placeholder legal text for each document type
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
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [signatures, setSignatures] = useState<Record<string, string>>({});

  const allSigned = legalDocs.every((doc) => signatures[doc.type]);

  const handleSignature = useCallback(
    (docType: string, signatureData: string) => {
      setSignatures((prev) => ({ ...prev, [docType]: signatureData }));
    },
    []
  );

  const handleSubmit = () => {
    if (!allSigned) return;
    const signaturesArray = legalDocs.map((doc) => ({
      documentType: doc.type,
      signatureData: signatures[doc.type],
    }));
    onComplete(signaturesArray);
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h2 className="text-base sm:text-lg font-semibold text-slate-900 mb-2">
          Review &amp; Sign Legal Documents
        </h2>
        <p className="text-sm text-slate-600">
          Please read and sign all required documents to continue.
        </p>
      </div>

      {/* Documents List */}
      <div className="space-y-3">
        {legalDocs.map((doc) => {
          const isSigned = !!signatures[doc.type];
          const isExpanded = expandedDoc === doc.type;

          return (
            <div
              key={doc.type}
              className="rounded-lg border border-slate-200 bg-white overflow-hidden"
            >
              {/* Header */}
              <button
                onClick={() => setExpandedDoc(isExpanded ? null : doc.type)}
                className="w-full flex items-center justify-between gap-3 px-4 py-4 sm:px-5 hover:bg-slate-50 active:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {isSigned ? (
                    <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-slate-300 flex-shrink-0" />
                  )}
                  <div className="text-left min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">
                      {doc.label}
                    </div>
                    <div className="text-xs text-slate-500">v{doc.version}</div>
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-slate-400 flex-shrink-0" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
                )}
              </button>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="border-t border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
                  {/* Legal Text */}
                  <div className="mb-5 pb-5 border-b border-slate-200">
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {LEGAL_TEXTS[doc.type] || `[${doc.label} content]`}
                    </p>
                  </div>

                  {/* Signature Pad */}
                  <SignaturePad
                    label={`Sign ${doc.label}`}
                    height={140}
                    onSignature={(dataUrl) => handleSignature(doc.type, dataUrl)}
                    onClear={() =>
                      setSignatures((prev) => {
                        const next = { ...prev };
                        delete next[doc.type];
                        return next;
                      })
                    }
                    disabled={saving}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      {allSigned && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-green-900">All documents signed</div>
              <div className="text-xs text-green-700 mt-0.5">
                Your signatures have been captured and will be included in your application.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={!allSigned || saving}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Saving...
          </>
        ) : (
          <>
            Continue
            <ChevronRight className="w-4 h-4" />
          </>
        )}
      </button>

      {!allSigned && (
        <p className="text-center text-xs text-slate-500">
          Please sign all documents to continue
        </p>
      )}
    </div>
  );
}
