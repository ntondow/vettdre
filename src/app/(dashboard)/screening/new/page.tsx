"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createApplication, sendInvite } from "../actions";
import type { CreateApplicationInput } from "../actions";

const INPUT = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors";
const LABEL = "block text-sm font-medium text-slate-700 mb-1";

interface ApplicantRow {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: "main" | "co_applicant" | "guarantor" | "occupant";
}

const EMPTY_APPLICANT: ApplicantRow = { firstName: "", lastName: "", email: "", phone: "", role: "main" };

export default function NewScreeningPage() {
  const router = useRouter();
  const [propertyAddress, setPropertyAddress] = useState("");
  const [unitNumber, setUnitNumber] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [tier, setTier] = useState<"base" | "enhanced">("base");
  const [leaseStartDate, setLeaseStartDate] = useState("");
  const [applicants, setApplicants] = useState<ApplicantRow[]>([{ ...EMPTY_APPLICANT }]);
  const [sendMethod, setSendMethod] = useState<"email" | "sms" | "email+sms">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateApplicant = (idx: number, field: keyof ApplicantRow, value: string) => {
    setApplicants(prev => prev.map((a, i) => i === idx ? { ...a, [field]: value } : a));
  };

  const addApplicant = () => {
    setApplicants(prev => [...prev, { ...EMPTY_APPLICANT, role: "co_applicant" }]);
  };

  const removeApplicant = (idx: number) => {
    if (applicants.length <= 1) return;
    // Prevent removing the primary applicant (index 0)
    if (idx === 0) return;
    setApplicants(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent, andSend: boolean) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const rent = parseFloat(monthlyRent);
    if (isNaN(rent) || rent <= 0) {
      setError("Please enter a valid monthly rent amount");
      setLoading(false);
      return;
    }

    // Ensure primary applicant exists
    const hasPrimary = applicants.some(a => a.role === "main");
    if (!hasPrimary) {
      setError("A primary applicant is required");
      setLoading(false);
      return;
    }

    const input: CreateApplicationInput = {
      propertyAddress,
      unitNumber: unitNumber || undefined,
      monthlyRent: rent,
      tier,
      applicants: applicants.map(a => ({
        firstName: a.firstName,
        lastName: a.lastName,
        email: a.email,
        phone: a.phone || undefined,
        role: a.role,
      })),
    };

    const result = await createApplication(input);

    if ("error" in result) {
      setError(result.error);
      setLoading(false);
      return;
    }

    // Optionally send invite immediately
    if (andSend) {
      await sendInvite(result.id, sendMethod);
    }

    router.push(`/screening/${result.id}`);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">New Screening Application</h1>
        <p className="text-sm text-slate-500 mt-0.5">Create a screening application and invite applicants</p>
      </div>

      <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-6">
        {/* Property Info */}
        <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Property Information</h2>

          <div>
            <label className={LABEL}>Property Address *</label>
            <input type="text" value={propertyAddress} onChange={(e) => setPropertyAddress(e.target.value)} className={INPUT} required placeholder="123 Main St, Brooklyn, NY 11201" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Unit Number</label>
              <input type="text" value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} className={INPUT} placeholder="4A" />
            </div>
            <div>
              <label className={LABEL}>Monthly Rent *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                <input type="number" value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value)} className={`${INPUT} pl-7`} required placeholder="2,500" min="1" step="1" />
              </div>
            </div>
          </div>

          <div>
            <label className={LABEL}>Lease Start Date</label>
            <input type="date" value={leaseStartDate} onChange={(e) => setLeaseStartDate(e.target.value)} className={INPUT} />
          </div>
        </div>

        {/* Tier Selection */}
        <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Screening Tier</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(["base", "enhanced"] as const).map((t) => {
              const info = t === "base"
                ? { label: "Base", price: "$20", payer: "Applicant pays", desc: "Single bureau + bank verification + AI doc analysis" }
                : { label: "Enhanced", price: "$20 + $49", payer: "Applicant + org card", desc: "Tri-bureau + employment verify + extended history" };

              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTier(t)}
                  className={`text-left rounded-lg border-2 p-4 transition-colors ${
                    tier === t ? "border-blue-600 bg-blue-50/50" : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-slate-900">{info.label}</span>
                    <span className="text-xs font-medium text-slate-500">{info.price}</span>
                  </div>
                  <p className="text-xs text-slate-500">{info.payer}</p>
                  <p className="text-xs text-slate-400 mt-1">{info.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Applicants */}
        <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Applicants</h2>
            <button type="button" onClick={addApplicant} className="text-xs text-blue-600 font-medium hover:underline">
              + Add applicant
            </button>
          </div>

          {applicants.map((a, idx) => (
            <div key={idx} className="space-y-3 pb-4 border-b border-slate-100 last:border-0 last:pb-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">
                  {idx === 0 ? "Primary Applicant" : `Applicant ${idx + 1}`}
                </span>
                <div className="flex items-center gap-2">
                  {idx > 0 && (
                    <>
                      <select
                        value={a.role}
                        onChange={(e) => updateApplicant(idx, "role", e.target.value)}
                        className="text-xs border border-slate-200 rounded px-2 py-1"
                      >
                        <option value="co_applicant">Co-Applicant</option>
                        <option value="guarantor">Guarantor</option>
                        <option value="occupant">Occupant</option>
                      </select>
                      <button type="button" onClick={() => removeApplicant(idx)} className="text-xs text-red-500 hover:underline">
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>First Name *</label>
                  <input type="text" value={a.firstName} onChange={(e) => updateApplicant(idx, "firstName", e.target.value)} className={INPUT} required />
                </div>
                <div>
                  <label className={LABEL}>Last Name *</label>
                  <input type="text" value={a.lastName} onChange={(e) => updateApplicant(idx, "lastName", e.target.value)} className={INPUT} required />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Email *</label>
                  <input type="email" value={a.email} onChange={(e) => updateApplicant(idx, "email", e.target.value)} className={INPUT} required />
                </div>
                <div>
                  <label className={LABEL}>Phone</label>
                  <input type="tel" value={a.phone} onChange={(e) => updateApplicant(idx, "phone", e.target.value)} className={INPUT} placeholder="(555) 555-5555" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Delivery Method */}
        <div className="bg-white rounded-lg border border-slate-200 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Invite Method</h2>
          <div className="flex gap-2">
            {(["email", "sms", "email+sms"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSendMethod(m)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  sendMethod === m ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {m === "email" ? "Email" : m === "sms" ? "SMS" : "Email + SMS"}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-lg bg-slate-100 text-slate-700 px-4 py-2.5 text-sm font-medium hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            {loading ? "Creating..." : "Save as Draft"}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={(e) => handleSubmit(e, true)}
            className="flex-1 rounded-lg bg-blue-600 text-white px-4 py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create & Send Invite"}
          </button>
        </div>
      </form>
    </div>
  );
}
