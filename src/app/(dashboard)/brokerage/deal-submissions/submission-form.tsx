"use client";

import { useState, useCallback } from "react";
import { ChevronDown } from "lucide-react";
import { DEAL_TYPE_LABELS } from "@/lib/bms-types";
import type { DealType, CommissionType, RepresentedSide } from "@/lib/bms-types";

// ── Types ─────────────────────────────────────────────────────

export interface SubmissionFormData {
  agentFirstName: string;
  agentLastName: string;
  agentEmail: string;
  agentPhone: string;
  agentLicense: string;

  propertyAddress: string;
  unit: string;
  city: string;
  state: string;

  dealType: DealType;
  transactionValue: number;
  closingDate: string;

  commissionType: CommissionType;
  commissionPct: number;
  commissionFlat: number;
  totalCommission: number;
  agentSplitPct: number;
  houseSplitPct: number;
  agentPayout: number;
  housePayout: number;

  clientName: string;
  clientEmail: string;
  clientPhone: string;
  representedSide: RepresentedSide | "";

  coBrokeAgent: string;
  coBrokeBrokerage: string;

  notes: string;
}

interface Props {
  onSubmit: (data: SubmissionFormData) => Promise<void>;
  defaultAgentInfo?: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    license?: string;
  };
  defaultSplitPct?: number;
  isPublic?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);

const INPUT = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const INPUT_RO = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-500 cursor-not-allowed";
const LABEL = "block text-sm font-medium text-slate-700 mb-1";
const SECTION = "text-base font-semibold text-slate-800 mb-3";

// ── Component ─────────────────────────────────────────────────

export default function SubmissionForm({ onSubmit, defaultAgentInfo, defaultSplitPct = 70, isPublic = false }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [showCoBroke, setShowCoBroke] = useState(false);

  const [form, setForm] = useState<SubmissionFormData>({
    agentFirstName: defaultAgentInfo?.firstName || "",
    agentLastName: defaultAgentInfo?.lastName || "",
    agentEmail: defaultAgentInfo?.email || "",
    agentPhone: defaultAgentInfo?.phone || "",
    agentLicense: defaultAgentInfo?.license || "",

    propertyAddress: "",
    unit: "",
    city: "",
    state: "NY",

    dealType: "sale",
    transactionValue: 0,
    closingDate: "",

    commissionType: "percentage",
    commissionPct: 0,
    commissionFlat: 0,
    totalCommission: 0,
    agentSplitPct: defaultSplitPct,
    houseSplitPct: 100 - defaultSplitPct,
    agentPayout: 0,
    housePayout: 0,

    clientName: "",
    clientEmail: "",
    clientPhone: "",
    representedSide: "",

    coBrokeAgent: "",
    coBrokeBrokerage: "",

    notes: "",
  });

  const recalculate = useCallback(
    (patch: Partial<SubmissionFormData>) => {
      const next = { ...form, ...patch };
      const tv = next.transactionValue || 0;
      const tc =
        next.commissionType === "percentage"
          ? tv * (next.commissionPct || 0) / 100
          : next.commissionFlat || 0;
      const asp = next.agentSplitPct || 0;
      const hsp = 100 - asp;
      next.totalCommission = tc;
      next.houseSplitPct = hsp;
      next.agentPayout = tc * asp / 100;
      next.housePayout = tc * hsp / 100;
      setForm(next);
    },
    [form],
  );

  const set = (patch: Partial<SubmissionFormData>) => setForm(prev => ({ ...prev, ...patch }));
  const setCalc = (patch: Partial<SubmissionFormData>) => recalculate(patch);

  const agentRO = !!defaultAgentInfo;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onSubmit(form);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-8">

      {/* ── Agent Information ──────────────────────────────── */}
      <section>
        <h3 className={SECTION}>Agent Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>First Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              required
              value={form.agentFirstName}
              onChange={e => set({ agentFirstName: e.target.value })}
              readOnly={agentRO}
              className={agentRO ? INPUT_RO : INPUT}
              placeholder="Jane"
            />
          </div>
          <div>
            <label className={LABEL}>Last Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              required
              value={form.agentLastName}
              onChange={e => set({ agentLastName: e.target.value })}
              readOnly={agentRO}
              className={agentRO ? INPUT_RO : INPUT}
              placeholder="Smith"
            />
          </div>
          <div>
            <label className={LABEL}>Email <span className="text-red-500">*</span></label>
            <input
              type="email"
              required
              value={form.agentEmail}
              onChange={e => set({ agentEmail: e.target.value })}
              readOnly={agentRO}
              className={agentRO ? INPUT_RO : INPUT}
              placeholder="jane@brokerage.com"
            />
          </div>
          <div>
            <label className={LABEL}>Phone</label>
            <input
              type="tel"
              value={form.agentPhone}
              onChange={e => set({ agentPhone: e.target.value })}
              readOnly={agentRO}
              className={agentRO ? INPUT_RO : INPUT}
              placeholder="(212) 555-0100"
            />
          </div>
          <div className="md:col-span-2">
            <label className={LABEL}>License #</label>
            <input
              type="text"
              value={form.agentLicense}
              onChange={e => set({ agentLicense: e.target.value })}
              readOnly={agentRO}
              className={agentRO ? INPUT_RO : INPUT}
              placeholder="10401234567"
            />
          </div>
        </div>
      </section>

      {/* ── Property & Transaction ────────────────────────── */}
      <section>
        <h3 className={SECTION}>Property & Transaction</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className={LABEL}>Property Address <span className="text-red-500">*</span></label>
            <input
              type="text"
              required
              value={form.propertyAddress}
              onChange={e => set({ propertyAddress: e.target.value })}
              className={INPUT}
              placeholder="123 Main Street, Brooklyn, NY 11201"
            />
          </div>
          <div>
            <label className={LABEL}>Unit / Apt</label>
            <input
              type="text"
              value={form.unit}
              onChange={e => set({ unit: e.target.value })}
              className={INPUT}
              placeholder="4A"
            />
          </div>
          <div>
            <label className={LABEL}>State</label>
            <select
              value={form.state}
              onChange={e => set({ state: e.target.value })}
              className={INPUT}
            >
              <option value="NY">New York</option>
              <option value="NJ">New Jersey</option>
              <option value="CT">Connecticut</option>
              <option value="PA">Pennsylvania</option>
            </select>
          </div>
          <div>
            <label className={LABEL}>Deal Type</label>
            <select
              value={form.dealType}
              onChange={e => set({ dealType: e.target.value as DealType })}
              className={INPUT}
            >
              {Object.entries(DEAL_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Transaction Value <span className="text-red-500">*</span></label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
              <input
                type="number"
                required
                min={0}
                step="0.01"
                value={form.transactionValue || ""}
                onChange={e => setCalc({ transactionValue: parseFloat(e.target.value) || 0 })}
                className={INPUT + " pl-7"}
                placeholder="1,250,000"
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <label className={LABEL}>Closing Date <span className="text-red-500">*</span></label>
            <input
              type="date"
              required
              value={form.closingDate}
              onChange={e => set({ closingDate: e.target.value })}
              className={INPUT}
            />
          </div>
        </div>
      </section>

      {/* ── Commission ────────────────────────────────────── */}
      <section>
        <h3 className={SECTION}>Commission</h3>
        <div className="space-y-4">

          {/* Type toggle */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="commissionType"
                value="percentage"
                checked={form.commissionType === "percentage"}
                onChange={() => setCalc({ commissionType: "percentage", commissionFlat: 0 })}
                className="text-blue-600"
              />
              <span className="text-sm text-slate-700">Percentage of transaction</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="commissionType"
                value="flat"
                checked={form.commissionType === "flat"}
                onChange={() => setCalc({ commissionType: "flat", commissionPct: 0 })}
                className="text-blue-600"
              />
              <span className="text-sm text-slate-700">Flat fee</span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {form.commissionType === "percentage" ? (
              <div>
                <label className={LABEL}>Commission %</label>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={form.commissionPct || ""}
                    onChange={e => setCalc({ commissionPct: parseFloat(e.target.value) || 0 })}
                    className={INPUT + " pr-8"}
                    placeholder="6.00"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
                </div>
              </div>
            ) : (
              <div>
                <label className={LABEL}>Flat Commission</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.commissionFlat || ""}
                    onChange={e => setCalc({ commissionFlat: parseFloat(e.target.value) || 0 })}
                    className={INPUT + " pl-7"}
                    placeholder="25,000"
                  />
                </div>
              </div>
            )}

            <div>
              <label className={LABEL}>Agent Split %</label>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  value={form.agentSplitPct || ""}
                  onChange={e => setCalc({ agentSplitPct: parseFloat(e.target.value) || 0 })}
                  className={INPUT + " pr-8"}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">%</span>
              </div>
            </div>

            <div>
              <label className={LABEL}>House Split %</label>
              <input
                type="number"
                readOnly
                value={form.houseSplitPct.toFixed(2)}
                className={INPUT_RO}
              />
            </div>
          </div>

          {/* Summary box */}
          {form.totalCommission > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-xs text-slate-500 mb-1">Total Commission</div>
                  <div className="text-base font-semibold text-slate-800">{formatCurrency(form.totalCommission)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">Agent Payout</div>
                  <div className="text-base font-semibold text-green-600">{formatCurrency(form.agentPayout)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-1">House Payout</div>
                  <div className="text-base font-semibold text-blue-600">{formatCurrency(form.housePayout)}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Client Information ────────────────────────────── */}
      <section>
        <h3 className={SECTION}>Client Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Client Name</label>
            <input
              type="text"
              value={form.clientName}
              onChange={e => set({ clientName: e.target.value })}
              className={INPUT}
              placeholder="John Buyer"
            />
          </div>
          <div>
            <label className={LABEL}>Represented Side</label>
            <select
              value={form.representedSide}
              onChange={e => set({ representedSide: e.target.value as RepresentedSide | "" })}
              className={INPUT}
            >
              <option value="">— Select —</option>
              <option value="buyer">Buyer</option>
              <option value="seller">Seller</option>
              <option value="landlord">Landlord</option>
              <option value="tenant">Tenant</option>
            </select>
          </div>
          <div>
            <label className={LABEL}>Client Email</label>
            <input
              type="email"
              value={form.clientEmail}
              onChange={e => set({ clientEmail: e.target.value })}
              className={INPUT}
              placeholder="john@example.com"
            />
          </div>
          <div>
            <label className={LABEL}>Client Phone</label>
            <input
              type="tel"
              value={form.clientPhone}
              onChange={e => set({ clientPhone: e.target.value })}
              className={INPUT}
              placeholder="(212) 555-0200"
            />
          </div>
        </div>
      </section>

      {/* ── Co-Broke Details (collapsible) ────────────────── */}
      <section>
        <button
          type="button"
          onClick={() => setShowCoBroke(!showCoBroke)}
          className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${showCoBroke ? "rotate-0" : "-rotate-90"}`}
          />
          Co-Broke Details
        </button>
        {showCoBroke && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            <div>
              <label className={LABEL}>Co-Broke Agent</label>
              <input
                type="text"
                value={form.coBrokeAgent}
                onChange={e => set({ coBrokeAgent: e.target.value })}
                className={INPUT}
                placeholder="Agent name"
              />
            </div>
            <div>
              <label className={LABEL}>Co-Broke Brokerage</label>
              <input
                type="text"
                value={form.coBrokeBrokerage}
                onChange={e => set({ coBrokeBrokerage: e.target.value })}
                className={INPUT}
                placeholder="Brokerage name"
              />
            </div>
          </div>
        )}
      </section>

      {/* ── Notes ─────────────────────────────────────────── */}
      <section>
        <h3 className={SECTION}>Notes</h3>
        <textarea
          value={form.notes}
          onChange={e => set({ notes: e.target.value })}
          rows={3}
          className={INPUT}
          placeholder="Any additional notes about this deal..."
        />
      </section>

      {/* ── Submit ────────────────────────────────────────── */}
      <div className="flex justify-end pt-2 pb-8">
        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Submitting..." : isPublic ? "Submit Deal" : "Submit for Approval"}
        </button>
      </div>
    </form>
  );
}
