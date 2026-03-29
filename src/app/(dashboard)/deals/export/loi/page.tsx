"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileSignature,
  Download,
  FileText,
  ChevronDown,
  User,
  Building2,
  DollarSign,
  Calendar,
  ClipboardList,
} from "lucide-react";
import ResearchLayout from "@/components/research/research-layout";
import { getDealAnalyses, getDealAnalysis, getUserProfile } from "../../actions";
import { logGeneratedDocument, getBrandingForExport } from "../actions";
import { LOI_DEFAULTS } from "@/lib/loi-template";
import type { LoiData } from "@/lib/loi-template";

// ── Types ────────────────────────────────────────────────────

interface DealOption {
  id: string;
  name: string | null;
  address: string | null;
  borough: string | null;
  inputs: any;
  outputs: any;
}

const fmt = (n: number) => `$${n.toLocaleString()}`;

// ── Component ────────────────────────────────────────────────

export default function LoiGeneratorPage() {
  const [deals, setDeals] = useState<DealOption[]>([]);
  const [dealsLoaded, setDealsLoaded] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState("");
  const [toast, setToast] = useState("");
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [generatingDocx, setGeneratingDocx] = useState(false);

  // LOI form fields
  const [buyerEntity, setBuyerEntity] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [sellerAddress, setSellerAddress] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [bbl, setBbl] = useState("");
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [earnestMoneyPercent, setEarnestMoneyPercent] = useState(LOI_DEFAULTS.earnestMoneyPercent);
  const [dueDiligenceDays, setDueDiligenceDays] = useState(LOI_DEFAULTS.dueDiligenceDays);
  const [financingDays, setFinancingDays] = useState(LOI_DEFAULTS.financingContingencyDays);
  const [closingDays, setClosingDays] = useState(LOI_DEFAULTS.closingDays);
  const [contingencies, setContingencies] = useState("");
  const [additionalTerms, setAdditionalTerms] = useState("");

  // Broker info (auto-loaded)
  const [brokerName, setBrokerName] = useState("");
  const [brokerEmail, setBrokerEmail] = useState("");
  const [brokerPhone, setBrokerPhone] = useState("");
  const [brokerLicense, setBrokerLicense] = useState("");
  const [brokerage, setBrokerage] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  // Load deals
  const loadDeals = useCallback(async () => {
    if (dealsLoaded) return;
    try {
      const result = await getDealAnalyses();
      setDeals(result as DealOption[]);
      setDealsLoaded(true);
    } catch {
      setDealsLoaded(true);
    }
  }, [dealsLoaded]);

  // Load user profile on mount
  useEffect(() => {
    loadDeals();
    (async () => {
      try {
        const profile = await getUserProfile();
        if (profile) {
          setBrokerName(profile.fullName || "");
          setBrokerEmail(profile.email || "");
          setBrokerPhone(profile.phone || "");
          setBrokerLicense(profile.licenseNumber || "");
          setBrokerage(profile.brokerage || "");
        }
      } catch {}
    })();
  }, [loadDeals]);

  // Pre-fill from deal
  const handleDealSelect = async (dealId: string) => {
    setSelectedDealId(dealId);
    if (!dealId) return;

    try {
      const deal = await getDealAnalysis(dealId);
      const inp = deal.inputs as any;

      setPropertyAddress(deal.address || inp?.address || "");
      setBbl(deal.bbl || inp?.bbl || "");
      setPurchasePrice(inp?.purchasePrice || inp?.purchase_price || 0);

      // Try to extract owner info from inputs
      if (inp?.ownerName) setSellerName(inp.ownerName);
      if (inp?.ownerAddress) setSellerAddress(inp.ownerAddress);
    } catch {
      showToast("Failed to load deal");
    }
  };

  // Build LoiData
  const buildLoiData = (): LoiData => ({
    propertyAddress,
    bbl: bbl || undefined,
    ownerName: sellerName || "Property Owner",
    ownerAddress: sellerAddress || undefined,
    offerPrice: purchasePrice,
    earnestMoneyPercent,
    dueDiligenceDays,
    financingContingencyDays: financingDays,
    closingDays,
    buyerEntity: buyerEntity || brokerName || "Buyer",
    buyerAddress: buyerAddress || undefined,
    brokerName: brokerName || undefined,
    brokerEmail: brokerEmail || undefined,
    brokerPhone: brokerPhone || undefined,
    brokerLicense: brokerLicense || undefined,
    brokerage: brokerage || undefined,
  });

  // Generate PDF
  const handleGeneratePdf = async () => {
    if (!propertyAddress || !purchasePrice) {
      showToast("Property address and purchase price are required");
      return;
    }
    setGeneratingPdf(true);
    try {
      const { generateLoiPdf } = await import("@/lib/loi-pdf");
      const data = buildLoiData();
      const pdf = generateLoiPdf(data);
      pdf.download();

      const fileName = `LOI-${propertyAddress.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-")}.pdf`;
      await logGeneratedDocument({
        docType: "loi",
        propertyAddress,
        dealId: selectedDealId || undefined,
        fileName,
      });
      showToast("LOI PDF downloaded");
    } catch {
      showToast("PDF generation failed");
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Generate Word
  const handleGenerateDocx = async () => {
    if (!propertyAddress || !purchasePrice) {
      showToast("Property address and purchase price are required");
      return;
    }
    setGeneratingDocx(true);
    try {
      const { generateLoiDocx } = await import("@/lib/loi-docx");
      const data = buildLoiData();
      await generateLoiDocx(data);

      const fileName = `LOI-${propertyAddress.replace(/[^a-zA-Z0-9-_ ]/g, "").replace(/\s+/g, "-")}.docx`;
      await logGeneratedDocument({
        docType: "loi",
        propertyAddress,
        dealId: selectedDealId || undefined,
        fileName,
        fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      showToast("LOI Word document downloaded");
    } catch {
      showToast("Word generation failed");
    } finally {
      setGeneratingDocx(false);
    }
  };

  const earnestAmount = Math.round(purchasePrice * (earnestMoneyPercent / 100));

  return (
    <ResearchLayout
      icon={FileSignature}
      iconColor="text-violet-400"
      iconBg="bg-violet-600/20"
      title="LOI Generator"
      subtitle="Generate Letters of Intent from deal analyses"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Form */}
        <div className="lg:col-span-2 space-y-5">
          {/* Deal Selector */}
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Pre-fill from a Saved Deal (optional)
            </label>
            <div className="relative">
              <select
                value={selectedDealId}
                onChange={(e) => handleDealSelect(e.target.value)}
                onFocus={loadDeals}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-sm text-white appearance-none pr-10 focus:outline-none focus:ring-1 focus:ring-violet-500"
              >
                <option value="">Choose a deal to pre-fill...</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id} className="bg-[#0B0F19]">
                    {d.name || d.address || d.id.slice(0, 8)}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            </div>
          </div>

          {/* Property Section */}
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
              <Building2 className="w-4 h-4" />
              Property
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Property Address *</label>
              <input
                type="text"
                value={propertyAddress}
                onChange={(e) => setPropertyAddress(e.target.value)}
                placeholder="123 Main Street, New York, NY"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
          </div>

          {/* Parties Section */}
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
              <User className="w-4 h-4" />
              Parties
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Buyer Entity Name</label>
                <input
                  type="text"
                  value={buyerEntity}
                  onChange={(e) => setBuyerEntity(e.target.value)}
                  placeholder="Buyer LLC"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Seller Name</label>
                <input
                  type="text"
                  value={sellerName}
                  onChange={(e) => setSellerName(e.target.value)}
                  placeholder="Property Owner"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
            </div>
          </div>

          {/* Terms Section */}
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
              <DollarSign className="w-4 h-4" />
              Offer Terms
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Purchase Price *</label>
                <input
                  type="number"
                  value={purchasePrice || ""}
                  onChange={(e) => setPurchasePrice(Number(e.target.value))}
                  placeholder="5000000"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">
                  Earnest Money ({earnestMoneyPercent}% = {fmt(earnestAmount)})
                </label>
                <input
                  type="number"
                  value={earnestMoneyPercent}
                  onChange={(e) => setEarnestMoneyPercent(Number(e.target.value))}
                  step={0.5}
                  min={0}
                  max={20}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 text-sm font-medium text-slate-300 pt-2">
              <Calendar className="w-4 h-4" />
              Timeline
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Due Diligence (days)</label>
                <input
                  type="number"
                  value={dueDiligenceDays}
                  onChange={(e) => setDueDiligenceDays(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Financing (days)</label>
                <input
                  type="number"
                  value={financingDays}
                  onChange={(e) => setFinancingDays(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Closing (days)</label>
                <input
                  type="number"
                  value={closingDays}
                  onChange={(e) => setClosingDays(Number(e.target.value))}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </div>
            </div>
          </div>

          {/* Additional Terms */}
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
              <ClipboardList className="w-4 h-4" />
              Additional Terms
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Contingencies</label>
              <textarea
                value={contingencies}
                onChange={(e) => setContingencies(e.target.value)}
                rows={2}
                placeholder="Any additional contingencies..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Additional Terms</label>
              <textarea
                value={additionalTerms}
                onChange={(e) => setAdditionalTerms(e.target.value)}
                rows={2}
                placeholder="Any additional terms or notes..."
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-violet-500 resize-none"
              />
            </div>
          </div>

          {/* Generate Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleGeneratePdf}
              disabled={generatingPdf || !propertyAddress || !purchasePrice}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-violet-600 hover:bg-violet-700 disabled:bg-white/5 disabled:text-slate-600 text-white rounded-xl text-sm font-medium transition-colors"
            >
              {generatingPdf ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Generate PDF
            </button>
            <button
              onClick={handleGenerateDocx}
              disabled={generatingDocx || !propertyAddress || !purchasePrice}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-white/5 hover:bg-white/10 disabled:bg-white/[0.02] disabled:text-slate-600 text-white rounded-xl text-sm font-medium transition-colors border border-white/10"
            >
              {generatingDocx ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <FileText className="w-4 h-4" />
              )}
              Generate Word
            </button>
          </div>
        </div>

        {/* Right: Preview */}
        <div className="space-y-5">
          {/* LOI Preview Card */}
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
            <h3 className="text-sm font-medium text-slate-300 mb-3">LOI Preview</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Property</span>
                <span className="text-white truncate ml-2">{propertyAddress || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Buyer</span>
                <span className="text-white">{buyerEntity || brokerName || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Seller</span>
                <span className="text-white">{sellerName || "—"}</span>
              </div>
              <div className="border-t border-white/5 my-2" />
              <div className="flex justify-between">
                <span className="text-slate-500">Purchase Price</span>
                <span className="text-white font-medium">{purchasePrice ? fmt(purchasePrice) : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Earnest Money</span>
                <span className="text-white">{purchasePrice ? fmt(earnestAmount) : "—"}</span>
              </div>
              <div className="border-t border-white/5 my-2" />
              <div className="flex justify-between">
                <span className="text-slate-500">Due Diligence</span>
                <span className="text-white">{dueDiligenceDays} days</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Financing</span>
                <span className="text-white">{financingDays} days</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Closing</span>
                <span className="text-white">{closingDays} days</span>
              </div>
            </div>
          </div>

          {/* Broker Info */}
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
            <h3 className="text-sm font-medium text-slate-300 mb-3">Broker Info</h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Name</span>
                <span className="text-white">{brokerName || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Brokerage</span>
                <span className="text-white">{brokerage || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">License</span>
                <span className="text-white">{brokerLicense || "—"}</span>
              </div>
              <p className="text-[10px] text-slate-600 pt-1">
                Auto-loaded from your profile. Update in Settings.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-emerald-600 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg z-50 animate-[fade-in_0.2s_ease]">
          {toast}
        </div>
      )}
    </ResearchLayout>
  );
}
