"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, AlertCircle } from "lucide-react";
import InvoiceForm from "../invoice-form";
import type { InvoiceFormData } from "../invoice-form";
import { createInvoice, getBrokerageConfig } from "../actions";
import type { BrokerageConfig, RepresentedSide } from "@/lib/bms-types";

export default function NewInvoicePage() {
  const router = useRouter();
  const [config, setConfig] = useState<BrokerageConfig | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    getBrokerageConfig().then(c => setConfig(c)).catch(() => {});
  }, []);

  async function handleSubmit(data: InvoiceFormData) {
    setError("");

    const result = await createInvoice({
      brokerageName: "",
      agentName: data.agentName,
      agentEmail: data.agentEmail || undefined,
      agentLicense: data.agentLicense || undefined,
      propertyAddress: data.propertyAddress,
      dealType: data.dealType,
      transactionValue: data.transactionValue,
      closingDate: data.closingDate || undefined,
      clientName: data.clientName || undefined,
      representedSide: (data.representedSide as RepresentedSide) || undefined,
      totalCommission: data.totalCommission,
      agentSplitPct: data.agentSplitPct,
      houseSplitPct: data.houseSplitPct,
      agentPayout: data.agentPayout,
      housePayout: data.housePayout,
      paymentTerms: data.paymentTerms,
      dueDate: "",
    });

    if (!result.success) {
      setError(result.error || "Failed to create invoice");
      return;
    }

    router.push("/brokerage/invoices");
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Back link */}
      <button
        onClick={() => router.push("/brokerage/invoices")}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Invoices
      </button>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Create Invoice</h1>
        <p className="text-sm text-slate-500 mt-1">Create a standalone commission invoice</p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
          <button
            onClick={() => setError("")}
            className="text-red-400 hover:text-red-600 text-sm"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Form */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <InvoiceForm
          onSubmit={handleSubmit}
          brokerageConfig={config || undefined}
        />
      </div>
    </div>
  );
}
