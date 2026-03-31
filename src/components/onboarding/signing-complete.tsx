"use client";

import { CheckCircle, Download, FileCheck } from "lucide-react";

interface SignedDoc {
  docTitle: string;
  signedAt: string | null;
}

interface Props {
  onboardingData: {
    clientFirstName: string;
    agentFullName: string | null;
    brokerageName: string | null;
    documents: SignedDoc[];
  };
  downloadUrl: string;
}

function formatDate(iso: string | null): string {
  if (!iso) return "Just now";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SigningComplete({ onboardingData, downloadUrl }: Props) {
  const { clientFirstName, agentFullName, brokerageName, documents } = onboardingData;

  return (
    <div className="mx-auto max-w-lg px-4 py-8 sm:py-12 text-center">
      {/* Success icon */}
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
        <CheckCircle className="h-9 w-9 text-green-600" />
      </div>

      {/* Heading */}
      <h1 className="mb-2 text-xl sm:text-2xl font-bold text-slate-900">
        All documents signed successfully!
      </h1>
      <p className="mb-8 text-sm text-slate-500">
        Thank you, {clientFirstName}. Your documents have been securely signed and recorded.
      </p>

      {/* Document list */}
      <div className="mb-8 rounded-xl border border-slate-200 bg-white text-left">
        <div className="border-b border-slate-100 px-5 py-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Signed Documents
          </span>
        </div>
        <ul className="divide-y divide-slate-100">
          {documents.map((doc, i) => (
            <li key={i} className="flex items-center gap-3 px-5 py-3">
              <FileCheck className="h-4 w-4 flex-shrink-0 text-green-500" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-700 truncate">
                  {doc.docTitle}
                </div>
                <div className="text-xs text-slate-400">
                  Signed {formatDate(doc.signedAt)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Download button */}
      <a
        href={downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-6 w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3.5 sm:py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 active:bg-blue-800"
      >
        <Download className="h-4 w-4" />
        Download Your Copies
      </a>

      {/* Agent notification */}
      {agentFullName && (
        <p className="mt-6 text-sm text-slate-500">
          Your agent <span className="font-medium text-slate-700">{agentFullName}</span>
          {brokerageName && (
            <>
              {" "}at <span className="font-medium text-slate-700">{brokerageName}</span>
            </>
          )}
          {" "}has been notified.
        </p>
      )}

      {/* Footer */}
      <p className="mt-8 text-xs text-slate-400">
        A copy of all signed documents has been emailed to you for your records.
      </p>
    </div>
  );
}
