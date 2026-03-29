"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Home,
  Building2,
  Landmark,
  User,
  ChevronDown,
  Check,
  FileText,
  Upload,
  X,
  Loader2,
  AlertTriangle,
  DollarSign,
  Percent,
  ChevronUp,
} from "lucide-react";
import { submitDeal } from "@/app/(dashboard)/brokerage/deal-submissions/actions";
import { uploadFile } from "@/lib/bms-files";
import type { ExclusiveType, DealSubmissionInput, RequiredDocs } from "@/lib/bms-types";

// ── Types ───────────────────────────────────────────────────

interface AgentInfo {
  agentId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  licenseNumber: string;
}

interface OrgSplits {
  defaultHouseExclusiveSplitPct: number;
  defaultPersonalExclusiveSplitPct: number;
}

interface AgentSplitOverrides {
  houseExclusiveSplitPct: number | null;
  personalExclusiveSplitPct: number | null;
}

interface ExclusiveBuilding {
  id: string;
  name: string;
  address?: string;
  landlordName?: string;
  landlordEmail?: string;
  landlordPhone?: string;
  billingEntityAddress?: string;
  managementCo?: string;
  billingEntityName?: string;
  billingEntityEmail?: string;
  billingEntityPhone?: string;
}

interface Props {
  agentInfo: AgentInfo;
  orgSplits: OrgSplits;
  agentSplitOverrides: AgentSplitOverrides;
  exclusiveBuildings: ExclusiveBuilding[];
}

interface FileSlot {
  key: keyof RequiredDocs;
  label: string;
  required: boolean;
  file: File | null;
}

// ── Helpers ─────────────────────────────────────────────────

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = ".pdf,.jpg,.jpeg,.png,.doc,.docx";

// ── Component ───────────────────────────────────────────────

export default function SubmitDealForm({
  agentInfo,
  orgSplits,
  agentSplitOverrides,
  exclusiveBuildings,
}: Props) {
  const router = useRouter();

  // Section 1: Deal Type & Exclusive Type
  const [dealType, setDealType] = useState<"lease" | "sale" | "">("");
  const [exclusiveType, setExclusiveType] = useState<ExclusiveType | "">("");

  // Section 2: Property & Building
  const [bmsPropertyId, setBmsPropertyId] = useState("");
  const [buildingSearch, setBuildingSearch] = useState("");
  const [buildingDropdownOpen, setBuildingDropdownOpen] = useState(false);
  const [propertyAddress, setPropertyAddress] = useState("");
  const [unit, setUnit] = useState("");
  const [city, setCity] = useState("New York");
  const [state, setState] = useState("NY");

  // Landlord (personal exclusive or auto-filled)
  const [landlordName, setLandlordName] = useState("");
  const [landlordEmail, setLandlordEmail] = useState("");
  const [landlordPhone, setLandlordPhone] = useState("");
  const [landlordAddress, setLandlordAddress] = useState("");
  const [managementCo, setManagementCo] = useState("");

  // Section 3: Deal Details - Lease
  const [tenantName, setTenantName] = useState("");
  const [tenantEmail, setTenantEmail] = useState("");
  const [tenantPhone, setTenantPhone] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [leaseStartDate, setLeaseStartDate] = useState("");
  const [leaseEndDate, setLeaseEndDate] = useState("");

  // Section 3: Deal Details - Sale
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [closingDate, setClosingDate] = useState("");
  const [representedSide, setRepresentedSide] = useState<"buyer" | "seller" | "">("");

  // Section 4: Commission
  const [commissionType, setCommissionType] = useState<"percentage" | "flat">("percentage");
  const [commissionPct, setCommissionPct] = useState("");
  const [commissionFlat, setCommissionFlat] = useState("");

  // Section 5: Co-Broker
  const [showCoBroker, setShowCoBroker] = useState(false);
  const [coBrokeAgent, setCoBrokeAgent] = useState("");
  const [coBrokeBrokerage, setCoBrokeBrokerage] = useState("");

  // Section 6: Documents
  const [fileSlots, setFileSlots] = useState<FileSlot[]>([
    { key: "signedLease", label: "Signed Lease / Contract", required: true, file: null },
    { key: "agencyDisclosure", label: "NYS Agency Disclosure (DOS 1736)", required: true, file: null },
    { key: "fairHousing", label: "Fair Housing Notice", required: true, file: null },
    { key: "commissionAgreement", label: "Commission Agreement", required: false, file: null },
  ]);

  // Section 7: Notes
  const [notes, setNotes] = useState("");

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);

  // ── Selected Building ─────────────────────────────────────

  const selectedBuilding = useMemo(
    () => exclusiveBuildings.find((b) => b.id === bmsPropertyId) ?? null,
    [bmsPropertyId, exclusiveBuildings],
  );

  const filteredBuildings = useMemo(() => {
    if (!buildingSearch.trim()) return exclusiveBuildings;
    const q = buildingSearch.toLowerCase();
    return exclusiveBuildings.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.address && b.address.toLowerCase().includes(q)),
    );
  }, [buildingSearch, exclusiveBuildings]);

  const selectBuilding = useCallback(
    (b: ExclusiveBuilding) => {
      setBmsPropertyId(b.id);
      setPropertyAddress(b.address ?? "");
      setLandlordName(b.landlordName ?? "");
      setLandlordEmail(b.landlordEmail ?? "");
      setLandlordPhone(b.landlordPhone ?? "");
      setLandlordAddress(b.billingEntityAddress ?? "");
      setManagementCo(b.managementCo ?? "");
      setBuildingDropdownOpen(false);
      setBuildingSearch("");
    },
    [],
  );

  // ── Split Calculation ─────────────────────────────────────

  const splitInfo = useMemo(() => {
    if (!exclusiveType) return null;

    let agentPct: number;
    let source: string;

    if (exclusiveType === "brokerage") {
      if (agentSplitOverrides.houseExclusiveSplitPct != null) {
        agentPct = agentSplitOverrides.houseExclusiveSplitPct;
        source = "Agent override";
      } else {
        agentPct = orgSplits.defaultHouseExclusiveSplitPct;
        source = "Brokerage default";
      }
    } else {
      if (agentSplitOverrides.personalExclusiveSplitPct != null) {
        agentPct = agentSplitOverrides.personalExclusiveSplitPct;
        source = "Agent override";
      } else {
        agentPct = orgSplits.defaultPersonalExclusiveSplitPct;
        source = "Brokerage default";
      }
    }

    return { agentPct, housePct: 100 - agentPct, source };
  }, [exclusiveType, agentSplitOverrides, orgSplits]);

  // ── Commission Calculation ────────────────────────────────

  const transactionValue = useMemo(() => {
    if (dealType === "lease") return parseFloat(monthlyRent) || 0;
    return parseFloat(salePrice) || 0;
  }, [dealType, monthlyRent, salePrice]);

  const totalCommission = useMemo(() => {
    if (commissionType === "flat") return parseFloat(commissionFlat) || 0;
    const pct = parseFloat(commissionPct) || 0;
    return transactionValue * (pct / 100);
  }, [commissionType, commissionPct, commissionFlat, transactionValue]);

  const agentPayout = useMemo(() => {
    if (!splitInfo) return 0;
    return totalCommission * (splitInfo.agentPct / 100);
  }, [totalCommission, splitInfo]);

  const housePayout = useMemo(() => {
    if (!splitInfo) return 0;
    return totalCommission * (splitInfo.housePct / 100);
  }, [totalCommission, splitInfo]);

  // ── File Handling ─────────────────────────────────────────

  const handleFileSelect = (idx: number, file: File | null) => {
    if (file && file.size > MAX_FILE_SIZE) {
      setFieldErrors((prev) => ({ ...prev, [`doc_${idx}`]: "File exceeds 10 MB limit" }));
      return;
    }
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[`doc_${idx}`];
      return next;
    });
    setFileSlots((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], file };
      return copy;
    });
  };

  // ── Validation ────────────────────────────────────────────

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};

    if (!dealType) errs.dealType = "Select a deal type";
    if (!exclusiveType) errs.exclusiveType = "Select an exclusive type";

    if (exclusiveType === "brokerage" && !bmsPropertyId) {
      errs.bmsPropertyId = "Select an exclusive building";
    }
    if (exclusiveType === "personal" && !propertyAddress.trim()) {
      errs.propertyAddress = "Property address is required";
    }

    if (dealType === "lease") {
      if (!tenantName.trim()) errs.tenantName = "Tenant name is required";
      if (!monthlyRent || parseFloat(monthlyRent) <= 0) errs.monthlyRent = "Monthly rent is required";
      if (!leaseStartDate) errs.leaseStartDate = "Lease start date is required";
      if (!leaseEndDate) errs.leaseEndDate = "Lease end date is required";
    }
    if (dealType === "sale") {
      if (!clientName.trim()) errs.clientName = "Client name is required";
      if (!salePrice || parseFloat(salePrice) <= 0) errs.salePrice = "Sale price is required";
      if (!closingDate) errs.closingDate = "Closing date is required";
    }

    if (totalCommission <= 0) errs.commission = "Commission must be greater than zero";

    // Required docs
    for (let i = 0; i < fileSlots.length; i++) {
      if (fileSlots[i].required && !fileSlots[i].file) {
        errs[`doc_${i}`] = `${fileSlots[i].label} is required`;
      }
    }

    return errs;
  };

  // ── Submit ────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setFieldErrors({});

    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      // Scroll to first error
      const firstKey = Object.keys(errs)[0];
      const el = document.querySelector(`[data-field="${firstKey}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setSubmitting(true);

    try {
      const requiredDocs: RequiredDocs = {
        signedLease: !!fileSlots[0].file,
        agencyDisclosure: !!fileSlots[1].file,
        fairHousing: !!fileSlots[2].file,
        commissionAgreement: !!fileSlots[3].file,
      };

      const input: DealSubmissionInput = {
        agentFirstName: agentInfo.firstName,
        agentLastName: agentInfo.lastName,
        agentEmail: agentInfo.email,
        agentPhone: agentInfo.phone || undefined,
        agentLicense: agentInfo.licenseNumber || undefined,
        propertyAddress: propertyAddress || selectedBuilding?.address || "",
        unit: unit || undefined,
        city: exclusiveType === "personal" ? city : undefined,
        state: exclusiveType === "personal" ? state : "NY",
        dealType: dealType as "lease" | "sale",
        transactionValue,
        closingDate: dealType === "sale" ? closingDate : undefined,
        commissionType,
        commissionPct: commissionType === "percentage" ? parseFloat(commissionPct) : undefined,
        commissionFlat: commissionType === "flat" ? parseFloat(commissionFlat) : undefined,
        totalCommission,
        agentSplitPct: splitInfo?.agentPct ?? 70,
        houseSplitPct: splitInfo?.housePct ?? 30,
        agentPayout,
        housePayout,
        exclusiveType: exclusiveType as ExclusiveType,
        bmsPropertyId: exclusiveType === "brokerage" ? bmsPropertyId : undefined,
        landlordName: landlordName || undefined,
        landlordEmail: landlordEmail || undefined,
        landlordPhone: landlordPhone || undefined,
        landlordAddress: landlordAddress || undefined,
        managementCo: managementCo || undefined,
        leaseStartDate: dealType === "lease" ? leaseStartDate : undefined,
        leaseEndDate: dealType === "lease" ? leaseEndDate : undefined,
        monthlyRent: dealType === "lease" ? parseFloat(monthlyRent) : undefined,
        tenantName: dealType === "lease" ? tenantName : undefined,
        tenantEmail: dealType === "lease" ? tenantEmail || undefined : undefined,
        tenantPhone: dealType === "lease" ? tenantPhone || undefined : undefined,
        clientName: dealType === "sale" ? clientName : undefined,
        clientEmail: dealType === "sale" ? clientEmail || undefined : undefined,
        clientPhone: dealType === "sale" ? clientPhone || undefined : undefined,
        representedSide: dealType === "sale" && representedSide ? (representedSide as "buyer" | "seller") : undefined,
        coBrokeAgent: showCoBroker ? coBrokeAgent || undefined : undefined,
        coBrokeBrokerage: showCoBroker ? coBrokeBrokerage || undefined : undefined,
        notes: notes || undefined,
        requiredDocs,
      };

      const result = await submitDeal(input);
      if (!result.success) {
        setSubmitError(result.error ?? "Failed to submit deal");
        setSubmitting(false);
        return;
      }

      const submissionId = (result.data as { id: string })?.id;

      // Upload files
      if (submissionId) {
        const uploadErrors: string[] = [];
        for (const slot of fileSlots) {
          if (!slot.file) continue;
          const fd = new FormData();
          fd.append("file", slot.file);
          const uploadResult = await uploadFile(fd, "deal_submission", submissionId);
          if (uploadResult.error) {
            uploadErrors.push(`${slot.label}: ${uploadResult.error}`);
          }
        }
        if (uploadErrors.length > 0) {
          // Submission succeeded but some uploads failed — still redirect with warning
          console.warn("File upload errors:", uploadErrors);
        }
      }

      router.push("/brokerage/my-deals?submitted=1");
    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : "Failed to submit deal");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="min-h-dvh bg-slate-50 pb-24">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5">
          <a
            href="/brokerage/my-deals"
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            My Deals
          </a>
          <h1 className="text-xl font-semibold text-slate-900">Submit a Deal</h1>
        </div>
      </header>

      <form ref={formRef} onSubmit={handleSubmit} className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {submitError && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {submitError}
            <button type="button" onClick={() => setSubmitError(null)} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Section 1: Deal Type & Exclusive Type ────────── */}
        <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Deal Type</h2>

          <div className="space-y-4">
            <div data-field="dealType">
              <div className="grid grid-cols-2 gap-3">
                <SelectCard
                  selected={dealType === "lease"}
                  onClick={() => setDealType("lease")}
                  icon={<Home className="w-5 h-5" />}
                  title="Lease"
                  description="Residential or commercial lease"
                />
                <SelectCard
                  selected={dealType === "sale"}
                  onClick={() => setDealType("sale")}
                  icon={<Building2 className="w-5 h-5" />}
                  title="Sale"
                  description="Property sale or purchase"
                />
              </div>
              <FieldError error={fieldErrors.dealType} />
            </div>

            <div data-field="exclusiveType">
              <label className="block text-sm font-medium text-slate-700 mb-2">Exclusive Type</label>
              <div className="grid grid-cols-2 gap-3">
                <SelectCard
                  selected={exclusiveType === "brokerage"}
                  onClick={() => setExclusiveType("brokerage")}
                  icon={<Landmark className="w-5 h-5" />}
                  title="Brokerage Exclusive"
                  description="From a brokerage-exclusive building"
                />
                <SelectCard
                  selected={exclusiveType === "personal"}
                  onClick={() => setExclusiveType("personal")}
                  icon={<User className="w-5 h-5" />}
                  title="Personal Exclusive"
                  description="Your own client/lead"
                />
              </div>
              <FieldError error={fieldErrors.exclusiveType} />
            </div>
          </div>
        </section>

        {/* ── Section 2: Property & Building ───────────────── */}
        {exclusiveType && (
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Property Info</h2>

            {exclusiveType === "brokerage" ? (
              <div className="space-y-4">
                {/* Building combobox */}
                <div data-field="bmsPropertyId" className="relative">
                  <label className="block text-sm font-medium text-slate-600 mb-1">
                    Select Exclusive Building <span className="text-red-500">*</span>
                  </label>
                  {selectedBuilding ? (
                    <div className="flex items-center justify-between border border-blue-200 bg-blue-50 rounded-lg px-4 py-3">
                      <div>
                        <div className="font-medium text-slate-900">{selectedBuilding.name}</div>
                        <div className="text-sm text-slate-500">{selectedBuilding.address}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setBmsPropertyId("");
                          setPropertyAddress("");
                          setLandlordName("");
                          setLandlordEmail("");
                          setLandlordPhone("");
                          setLandlordAddress("");
                          setManagementCo("");
                        }}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div>
                      <button
                        type="button"
                        onClick={() => setBuildingDropdownOpen(!buildingDropdownOpen)}
                        className="w-full flex items-center justify-between border border-slate-200 rounded-lg px-3 py-2 text-sm text-left hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <span className="text-slate-400">Choose a building...</span>
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      </button>
                      {buildingDropdownOpen && (
                        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          <div className="p-2 border-b border-slate-100">
                            <input
                              type="text"
                              placeholder="Search buildings..."
                              value={buildingSearch}
                              onChange={(e) => setBuildingSearch(e.target.value)}
                              className="w-full border border-slate-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                              autoFocus
                            />
                          </div>
                          {filteredBuildings.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-slate-400">No buildings found</div>
                          ) : (
                            filteredBuildings.map((b) => (
                              <button
                                key={b.id}
                                type="button"
                                onClick={() => selectBuilding(b)}
                                className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-sm"
                              >
                                <div className="font-medium text-slate-900">{b.name}</div>
                                <div className="text-xs text-slate-500">{b.address}</div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <FieldError error={fieldErrors.bmsPropertyId} />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">
                    Unit {dealType === "lease" && <span className="text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="e.g. 4B"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Auto-filled landlord info (read-only) */}
                {selectedBuilding && landlordName && (
                  <div className="bg-slate-50 rounded-lg p-4 space-y-1">
                    <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Landlord Info (from building)</div>
                    {landlordName && <div className="text-sm text-slate-700"><span className="text-slate-400">Name:</span> {landlordName}</div>}
                    {landlordEmail && <div className="text-sm text-slate-700"><span className="text-slate-400">Email:</span> {landlordEmail}</div>}
                    {landlordPhone && <div className="text-sm text-slate-700"><span className="text-slate-400">Phone:</span> {landlordPhone}</div>}
                    {landlordAddress && <div className="text-sm text-slate-700"><span className="text-slate-400">Address:</span> {landlordAddress}</div>}
                    {managementCo && <div className="text-sm text-slate-700"><span className="text-slate-400">Mgmt Co:</span> {managementCo}</div>}
                  </div>
                )}
              </div>
            ) : (
              /* Personal Exclusive */
              <div className="space-y-4">
                <div data-field="propertyAddress">
                  <label className="block text-sm font-medium text-slate-600 mb-1">
                    Property Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={propertyAddress}
                    onChange={(e) => setPropertyAddress(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <FieldError error={fieldErrors.propertyAddress} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Unit</label>
                    <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">City</label>
                    <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">State</label>
                    <input type="text" value={state} onChange={(e) => setState(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 mt-4">
                  <div className="text-sm font-semibold text-slate-700 mb-3">Landlord / Owner</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1">Name</label>
                      <input type="text" value={landlordName} onChange={(e) => setLandlordName(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1">Email</label>
                      <input type="email" value={landlordEmail} onChange={(e) => setLandlordEmail(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1">Phone</label>
                      <input type="tel" value={landlordPhone} onChange={(e) => setLandlordPhone(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-600 mb-1">Address</label>
                      <input type="text" value={landlordAddress} onChange={(e) => setLandlordAddress(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-slate-600 mb-1">Management Company</label>
                      <input type="text" value={managementCo} onChange={(e) => setManagementCo(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Section 3: Deal Details ──────────────────────── */}
        {dealType && exclusiveType && (
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Deal Details</h2>

            {dealType === "lease" ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div data-field="tenantName" className="sm:col-span-2">
                    <label className="block text-sm font-medium text-slate-600 mb-1">
                      Tenant Name <span className="text-red-500">*</span>
                    </label>
                    <input type="text" value={tenantName} onChange={(e) => setTenantName(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <FieldError error={fieldErrors.tenantName} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Tenant Email</label>
                    <input type="email" value={tenantEmail} onChange={(e) => setTenantEmail(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Tenant Phone</label>
                    <input type="tel" value={tenantPhone} onChange={(e) => setTenantPhone(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>

                <div data-field="monthlyRent">
                  <label className="block text-sm font-medium text-slate-600 mb-1">
                    Monthly Rent <span className="text-red-500">*</span>
                  </label>
                  <CurrencyInput value={monthlyRent} onChange={setMonthlyRent} />
                  <FieldError error={fieldErrors.monthlyRent} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div data-field="leaseStartDate">
                    <label className="block text-sm font-medium text-slate-600 mb-1">
                      Lease Start Date <span className="text-red-500">*</span>
                    </label>
                    <input type="date" value={leaseStartDate} onChange={(e) => setLeaseStartDate(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <FieldError error={fieldErrors.leaseStartDate} />
                  </div>
                  <div data-field="leaseEndDate">
                    <label className="block text-sm font-medium text-slate-600 mb-1">
                      Lease End Date <span className="text-red-500">*</span>
                    </label>
                    <input type="date" value={leaseEndDate} onChange={(e) => setLeaseEndDate(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <FieldError error={fieldErrors.leaseEndDate} />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Move-in / Closing Date</label>
                  <input type="date" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 sm:max-w-xs" />
                </div>
              </div>
            ) : (
              /* Sale */
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div data-field="clientName" className="sm:col-span-2">
                    <label className="block text-sm font-medium text-slate-600 mb-1">
                      Buyer / Client Name <span className="text-red-500">*</span>
                    </label>
                    <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <FieldError error={fieldErrors.clientName} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Buyer Email</label>
                    <input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Buyer Phone</label>
                    <input type="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>

                <div data-field="salePrice">
                  <label className="block text-sm font-medium text-slate-600 mb-1">
                    Sale Price <span className="text-red-500">*</span>
                  </label>
                  <CurrencyInput value={salePrice} onChange={setSalePrice} />
                  <FieldError error={fieldErrors.salePrice} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div data-field="closingDate">
                    <label className="block text-sm font-medium text-slate-600 mb-1">
                      Closing Date <span className="text-red-500">*</span>
                    </label>
                    <input type="date" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <FieldError error={fieldErrors.closingDate} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Represented Side</label>
                    <select
                      value={representedSide}
                      onChange={(e) => setRepresentedSide(e.target.value as "buyer" | "seller" | "")}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">Select...</option>
                      <option value="buyer">Buyer</option>
                      <option value="seller">Seller</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Section 4: Commission & Split ────────────────── */}
        {dealType && exclusiveType && (
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Commission & Split</h2>

            <div className="space-y-4">
              {/* Commission type toggle */}
              <div data-field="commission">
                <label className="block text-sm font-medium text-slate-600 mb-2">Commission Type</label>
                <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setCommissionType("percentage")}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${commissionType === "percentage" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    Percentage
                  </button>
                  <button
                    type="button"
                    onClick={() => setCommissionType("flat")}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${commissionType === "flat" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    Flat Amount
                  </button>
                </div>
              </div>

              {commissionType === "percentage" ? (
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Commission %</label>
                  <div className="flex items-center gap-2">
                    <PercentInput value={commissionPct} onChange={setCommissionPct} />
                    {dealType === "lease" && (
                      <button
                        type="button"
                        onClick={() => setCommissionPct("8.33")}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap px-2 py-1 rounded border border-blue-200 hover:bg-blue-50 transition-colors"
                      >
                        One Month Rent
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1">Flat Commission Amount</label>
                  <CurrencyInput value={commissionFlat} onChange={setCommissionFlat} />
                </div>
              )}
              <FieldError error={fieldErrors.commission} />

              {/* Total commission display */}
              {totalCommission > 0 && (
                <div className="bg-slate-50 rounded-lg p-4">
                  <div className="text-sm text-slate-500">Total Commission</div>
                  <div className="text-2xl font-bold text-slate-900">{USD.format(totalCommission)}</div>
                </div>
              )}

              {/* Split preview */}
              {splitInfo && totalCommission > 0 && (
                <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-slate-700">
                      {exclusiveType === "brokerage" ? "Brokerage Exclusive" : "Personal Exclusive"} split: {splitInfo.agentPct}/{splitInfo.housePct}
                    </div>
                    <span className="text-xs text-slate-400">({splitInfo.source})</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-emerald-50 rounded-lg p-3">
                      <div className="text-xs text-emerald-600 font-medium">Your Payout</div>
                      <div className="text-lg font-bold text-emerald-700">{USD.format(agentPayout)}</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <div className="text-xs text-slate-500 font-medium">House Payout</div>
                      <div className="text-lg font-bold text-slate-700">{USD.format(housePayout)}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* ── Section 5: Co-Broker (collapsible) ───────────── */}
        {dealType && exclusiveType && (
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setShowCoBroker(!showCoBroker)}
              className="w-full flex items-center justify-between p-6 text-left"
            >
              <h2 className="text-lg font-semibold text-slate-900">Co-Broker</h2>
              {showCoBroker ? (
                <ChevronUp className="w-5 h-5 text-slate-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-400" />
              )}
            </button>
            {showCoBroker && (
              <div className="px-6 pb-6 space-y-4 border-t border-slate-100 pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Co-Broker Agent Name</label>
                    <input type="text" value={coBrokeAgent} onChange={(e) => setCoBrokeAgent(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-600 mb-1">Co-Broker Brokerage</label>
                    <input type="text" value={coBrokeBrokerage} onChange={(e) => setCoBrokeBrokerage(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Section 6: Required Documents ────────────────── */}
        {dealType && exclusiveType && (
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Required Documents</h2>
            <div className="space-y-3">
              {fileSlots.map((slot, idx) => (
                <div key={slot.key} data-field={`doc_${idx}`}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-slate-700">
                      {slot.file ? (
                        <Check className="w-4 h-4 text-emerald-500 inline mr-1.5" />
                      ) : slot.required ? (
                        <span className="inline-block w-4 h-4 border-2 border-slate-300 rounded mr-1.5 align-text-bottom" />
                      ) : (
                        <span className="inline-block w-4 h-4 border-2 border-dashed border-slate-200 rounded mr-1.5 align-text-bottom" />
                      )}
                      {slot.label}
                      {slot.required ? (
                        <span className="text-red-500 ml-0.5">*</span>
                      ) : (
                        <span className="text-xs text-slate-400 ml-2">Upload if applicable</span>
                      )}
                    </label>
                  </div>

                  {slot.file ? (
                    <div className="flex items-center gap-3 bg-slate-50 rounded-lg p-3">
                      <FileText className="w-5 h-5 text-slate-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-700 truncate">{slot.file.name}</div>
                        <div className="text-xs text-slate-400">{formatFileSize(slot.file.size)}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleFileSelect(idx, null)}
                        className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-lg p-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors">
                      <Upload className="w-4 h-4 text-slate-400" />
                      <span className="text-sm text-slate-500">Click to upload or drag and drop</span>
                      <input
                        type="file"
                        accept={ACCEPTED_TYPES}
                        className="hidden"
                        onChange={(e) => handleFileSelect(idx, e.target.files?.[0] ?? null)}
                      />
                    </label>
                  )}
                  <FieldError error={fieldErrors[`doc_${idx}`]} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Section 7: Notes ─────────────────────────────── */}
        {dealType && exclusiveType && (
          <section className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Notes</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes for the manager..."
              rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </section>
        )}
      </form>

      {/* ── Sticky Bottom Bar ──────────────────────────────── */}
      {dealType && exclusiveType && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 z-10 pb-safe">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
            <div className="text-sm text-slate-600 hidden sm:block">
              {totalCommission > 0 ? (
                <>
                  Total Commission: <span className="font-semibold text-slate-900">{USD.format(totalCommission)}</span>
                  {agentPayout > 0 && (
                    <>
                      {" "}&middot;{" "}Your Payout: <span className="font-semibold text-emerald-700">{USD.format(agentPayout)}</span>
                    </>
                  )}
                </>
              ) : (
                <span className="text-slate-400">Enter deal details above</span>
              )}
            </div>
            <button
              type="submit"
              form="submit-deal-form"
              onClick={handleSubmit}
              disabled={submitting || !dealType || !exclusiveType}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg px-6 py-2.5 transition-colors"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? "Submitting..." : "Submit Deal"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────

function SelectCard({
  selected,
  onClick,
  icon,
  title,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all text-center ${
        selected
          ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/20"
          : "border-slate-200 hover:border-slate-300 bg-white"
      }`}
    >
      <div className={selected ? "text-blue-600" : "text-slate-400"}>{icon}</div>
      <div className={`text-sm font-semibold ${selected ? "text-blue-700" : "text-slate-700"}`}>{title}</div>
      <div className="text-xs text-slate-500">{description}</div>
    </button>
  );
}

function CurrencyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9.]/g, "");
          onChange(v);
        }}
        placeholder="0.00"
        className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}

function PercentInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative w-32">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9.]/g, "");
          onChange(v);
        }}
        placeholder="0.00"
        className="w-full pr-8 pl-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <Percent className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
    </div>
  );
}

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="mt-1 text-xs text-red-600">{error}</p>;
}
