"use client";

import { useState, useCallback, useMemo } from "react";
import { DEAL_TYPE_LABELS } from "@/lib/bms-types";
import type { DealType, CommissionType, RepresentedSide, BrokerageConfig } from "@/lib/bms-types";

// ── Types ─────────────────────────────────────────────────────

export interface InvoiceFormData {
  agentName: string;
  agentEmail: string;
  agentLicense: string;

  propertyAddress: string;
  dealType: DealType;
  transactionValue: number;
  closingDate: string;
  clientName: string;
  representedSide: RepresentedSide | "";

  commissionType: CommissionType;
  commissionPct: number;
  commissionFlat: number;
  totalCommission: number;
  agentSplitPct: number;
  houseSplitPct: number;
  agentPayout: number;
  housePayout: number;

  paymentTerms: string;
  notes: string;
}

interface Props {
  onSubmit: (data: InvoiceFormData) => Promise<void>;
  brokerageConfig?: BrokerageConfig;
  defaultValues?: Partial<InvoiceFormData>;
}

// ── Helpers ───────────────────────────────────────────────────

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);

const INPUT = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const INPUT_RO = "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-500 cursor-not-allowed";
const LABEL = "block text-sm font-medium text-slate-700 mb-1";
const SECTION = "text-base font-semibold text-slate-800 mb-3";

const PAYMENT_TERMS_OPTIONS = [
  { label: "Due on Receipt", value: "Due on Receipt", days: 0 },
  { label: "Net 15", value: "Net 15", days: 15 },
  { label: "Net 30", value: "Net 30", days: 30 },
  { label: "Net 45", value: "Net 45", days: 45 },
  { label: "Net 60", value: "Net 60", days: 60 },
];

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Component ─────────────────────────────────────────────────

export default function InvoiceForm({ onSubmit, brokerageConfig, defaultValues }: Props) {
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState<InvoiceFormData>({
    agentName: defaultValues?.agentName || "",
    agentEmail: defaultValues?.agentEmail || "",
    agentLicense: defaultValues?.agentLicense || "",

    propertyAddress: defaultValues?.propertyAddress || "",
    dealType: defaultValues?.dealType || "sale",
    transactionValue: defaultValues?.transactionValue || 0,
    closingDate: defaultValues?.closingDate || "",
    clientName: defaultValues?.clientName || "",
    representedSide: defaultValues?.representedSide || "",

    commissionType: defaultValues?.commissionType || "percentage",
    commissionPct: defaultValues?.commissionPct || 0,
    commissionFlat: defaultValues?.commissionFlat || 0,
    totalCommission: defaultValues?.totalCommission || 0,
    agentSplitPct: defaultValues?.agentSplitPct || 70,
    houseSplitPct: defaultValues?.houseSplitPct || 30,
    agentPayout: defaultValues?.agentPayout || 0,
    housePayout: defaultValues?.housePayout || 0,

    paymentTerms: defaultValues?.paymentTerms || "Net 30",
    notes: defaultValues?.notes || "",
  });

  const recalculate = useCallback(
    (patch: Partial<InvoiceFormData>) => {
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

  const set = (patch: Partial<InvoiceFormData>) => setForm(prev => ({ ...prev, ...patch }));
  const setCalc = (patch: Partial<InvoiceFormData>) => recalculate(patch);

  const dueDate = useMemo(() => {
    const termsDays = PAYMENT_TERMS_OPTIONS.find(o => o.value === form.paymentTerms)?.days ?? 30;
    return addDays(new Date(), termsDays);
  }, [form.paymentTerms]);

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

      {/* ── Brokerage Preview ──────────────────────────────── */}
      {brokerageConfig && brokerageConfig.name && (
        <section className="rounded-lg bg-slate-50 border border-slate-200 p-4">
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">Invoice From</p>
          <p className="text-sm font-semibold text-slate-800">{brokerageConfig.name}</p>
          {brokerageConfig.address && (
            <p className="text-sm text-slate-500">{brokerageConfig.address}</p>
          )}
          {brokerageConfig.phone && (
            <p className="text-sm text-slate-500">{brokerageConfig.phone}</p>
          )}
          {brokerageConfig.licenseInfo && (
            <p className="text-xs text-slate-400 mt-1">{brokerageConfig.licenseInfo}</p>
          )}
        </section>
      )}

      {/* ── Agent Information ──────────────────────────────── */}
      <section>
        <h3 className={SECTION}>Agent Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className={LABEL}>Agent Name <span className="text-red-500">*</span></label>
            <input
              type="text"
              required
              value={form.agentName}
              onChange={e => set({ agentName: e.target.value })}
              className={INPUT}
              placeholder="Jane Smith"
            />
          </div>
          <div>
            <label className={LABEL}>Agent Email <span className="text-red-500">*</span></label>
            <input
              type="email"
              required
              value={form.agentEmail}
              onChange={e => set({ agentEmail: e.target.value })}
              className={INPUT}
              placeholder="jane@brokerage.com"
            />
          </div>
          <div>
            <label className={LABEL}>License #</label>
            <input
              type="text"
              value={form.agentLicense}
              onChange={e => set({ agentLicense: e.target.value })}
              className={INPUT}
              placeholder="10401234567"
            />
          </div>
        </div>
      </section>

      {/* ── Transaction Details ─────────────────────────────── */}
      <section>
        <h3 className={SECTION}>Transaction Details</h3>
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
          <div>
            <label className={LABEL}>Closing Date</label>
            <input
              type="date"
              value={form.closingDate}
              onChange={e => set({ closingDate: e.target.value })}
              className={INPUT}
            />
          </div>
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
          <div className="md:col-span-2">
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

      {/* ── Invoice Settings ───────────────────────────────── */}
      <section>
        <h3 className={SECTION}>Invoice Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>Payment Terms</label>
            <select
              value={form.paymentTerms}
              onChange={e => set({ paymentTerms: e.target.value })}
              className={INPUT}
            >
              {PAYMENT_TERMS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL}>Due Date</label>
            <input
              type="text"
              readOnly
              value={formatDate(dueDate)}
              className={INPUT_RO}
            />
          </div>
        </div>
      </section>

      {/* ── Notes ─────────────────────────────────────────── */}
      <section>
        <h3 className={SECTION}>Notes</h3>
        <textarea
          value={form.notes}
          onChange={e => set({ notes: e.target.value })}
          rows={3}
          className={INPUT}
          placeholder="Any additional notes for this invoice..."
        />
      </section>

      {/* ── Submit ────────────────────────────────────────── */}
      <div className="flex justify-end pt-2 pb-8">
        <button
          type="submit"
          disabled={submitting}
          className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Creating..." : "Create Invoice"}
        </button>
      </div>
    </form>
  );
}
