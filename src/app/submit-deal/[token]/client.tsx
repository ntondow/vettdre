"use client";

import { useState } from "react";
import { Building2, CheckCircle, AlertCircle } from "lucide-react";
import SubmissionForm from "@/app/(dashboard)/brokerage/deal-submissions/submission-form";
import type { SubmissionFormData } from "@/app/(dashboard)/brokerage/deal-submissions/submission-form";
import { createPublicDealSubmission } from "@/app/(dashboard)/brokerage/deal-submissions/actions";
import type { DealSubmissionInput } from "@/lib/bms-types";

type Stage = "form" | "success" | "error";

export default function PublicSubmissionClient({ token }: { token: string }) {
  const [stage, setStage] = useState<Stage>("form");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(data: SubmissionFormData) {
    setSubmitting(true);
    setErrorMsg("");

    try {
      const input: DealSubmissionInput = {
        agentFirstName: data.agentFirstName,
        agentLastName: data.agentLastName,
        agentEmail: data.agentEmail,
        agentPhone: data.agentPhone,
        agentLicense: data.agentLicense,
        propertyAddress: data.propertyAddress,
        unit: data.unit,
        city: data.city,
        state: data.state,
        dealType: data.dealType,
        transactionValue: data.transactionValue,
        closingDate: data.closingDate,
        commissionType: data.commissionType,
        commissionPct: data.commissionPct,
        commissionFlat: data.commissionFlat,
        totalCommission: data.totalCommission,
        agentSplitPct: data.agentSplitPct,
        houseSplitPct: data.houseSplitPct,
        agentPayout: data.agentPayout,
        housePayout: data.housePayout,
        clientName: data.clientName,
        clientEmail: data.clientEmail,
        clientPhone: data.clientPhone,
        representedSide: data.representedSide || undefined,
        coBrokeAgent: data.coBrokeAgent,
        coBrokeBrokerage: data.coBrokeBrokerage,
        notes: data.notes,
      };

      const result = await createPublicDealSubmission(token, input);

      if (!result.success) {
        setErrorMsg(result.error || "Failed to submit deal");
        setStage("error");
      } else {
        setStage("success");
      }
    } catch {
      setErrorMsg("Something went wrong. Please try again.");
      setStage("error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-2xl px-6 py-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-600 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Submit a Deal</h1>
            <p className="text-xs text-slate-500">Powered by VettdRE</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl px-6 py-8">
        {/* Error banner */}
        {stage === "error" && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
            <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-red-800">{errorMsg}</p>
              <button
                onClick={() => setStage("form")}
                className="mt-2 text-sm text-red-600 hover:text-red-700 underline underline-offset-2"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Form */}
        {(stage === "form" || stage === "error") && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <SubmissionForm
              onSubmit={handleSubmit}
              isPublic
            />
            {submitting && (
              <div className="mt-4 flex items-center justify-center gap-2 text-sm text-slate-500">
                <div className="h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                Submitting...
              </div>
            )}
          </div>
        )}

        {/* Success */}
        {stage === "success" && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm flex flex-col items-center text-center">
            <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <CheckCircle className="h-7 w-7 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900 mb-2">
              Deal Submitted Successfully
            </h2>
            <p className="text-sm text-slate-500 mb-6 max-w-sm">
              Your deal submission has been received and is pending review by your brokerage.
              You&apos;ll be notified when it&apos;s been processed.
            </p>
            <button
              onClick={() => {
                setStage("form");
                setErrorMsg("");
              }}
              className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              Submit Another Deal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
