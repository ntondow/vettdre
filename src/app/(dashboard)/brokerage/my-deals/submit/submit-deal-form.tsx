"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  User,
  ChevronDown,
  ChevronRight,
  Upload,
  X,
  FileText,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { submitDeal, quickAddProperty } from "@/app/(dashboard)/brokerage/deal-submissions/actions";
import { uploadFile } from "@/lib/bms-files";
import type {
  DealType,
  CommissionType,
  RepresentedSide,
} from "@/lib/bms-types";

// ── Types ────────────────────────────────────────────────────

interface ExclusiveBuilding {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  landlordName?: string | null;
  landlordEmail?: string | null;
  landlordPhone?: string | null;
  managementCo?: string | null;
  totalUnits?: number | null;
}

interface Props {
  agentInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    licenseNumber?: string;
  };
  orgSplits: {
    defaultHouseExclusiveSplitPct?: number;
    defaultPersonalExclusiveSplitPct?: number;
  };
  agentSplitOverrides?: {
    houseExclusiveSplitPct?: number;
    personalExclusiveSplitPct?: number;
    defaultSplitPct?: number;
  };
  exclusiveBuildings: ExclusiveBuilding[];
}

type ExclusiveType = "brokerage" | "personal";

interface FormErrors {
  [key: string]: string;
}

interface DocSlot {
  label: string;
  key: string;
  required: boolean;
  file: File | null;
}

// ── Sub-components ───────────────────────────────────────────

function SelectCard({
  selected,
  onClick,
  label,
  description,
  icon,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg border-2 p-4 text-left transition-all ${
        selected
          ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600"
          : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span
          className={`text-sm font-semibold ${
            selected ? "text-blue-700" : "text-slate-700"
          }`}
        >
          {label}
        </span>
      </div>
      {description && (
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      )}
    </button>
  );
}

function CurrencyInput({
  value,
  onChange,
  placeholder,
  id,
  disabled,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
        $
      </span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.]/g, "");
          onChange(raw);
        }}
        placeholder={placeholder ?? "0.00"}
        className={`w-full rounded-lg border border-slate-300 py-2 pl-7 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          disabled ? "cursor-not-allowed bg-slate-50 text-slate-400" : ""
        }`}
      />
    </div>
  );
}

function PercentInput({
  value,
  onChange,
  placeholder,
  id,
  disabled,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.]/g, "");
          onChange(raw);
        }}
        placeholder={placeholder ?? "0"}
        className={`w-full rounded-lg border border-slate-300 py-2 pl-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          disabled ? "cursor-not-allowed bg-slate-50 text-slate-400" : ""
        }`}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
        %
      </span>
    </div>
  );
}

function FieldError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-red-600">
      <AlertCircle className="h-3 w-3 flex-shrink-0" />
      {error}
    </p>
  );
}

// ── Helpers ──────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(n);

const INPUT =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const INPUT_RO =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-slate-50 text-slate-500 cursor-not-allowed";
const LABEL = "block text-sm font-medium text-slate-700 mb-1";

// ── Main Component ───────────────────────────────────────────

export default function SubmitDealForm({
  agentInfo,
  orgSplits,
  agentSplitOverrides,
  exclusiveBuildings,
}: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLDivElement>(null);

  // ── State ────────────────────────────────────────────────
  const [dealType, setDealType] = useState<"lease" | "sale">("lease");
  const [exclusiveType, setExclusiveType] =
    useState<ExclusiveType>("brokerage");
  const [selectedBuildingId, setSelectedBuildingId] = useState("");
  const [buildingSearch, setBuildingSearch] = useState("");
  const [showBuildingDropdown, setShowBuildingDropdown] = useState(false);

  // Quick-add building
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddSaving, setQuickAddSaving] = useState(false);
  const [quickAddName, setQuickAddName] = useState("");
  const [quickAddAddress, setQuickAddAddress] = useState("");
  const [quickAddCity, setQuickAddCity] = useState("New York");
  const [quickAddState, setQuickAddState] = useState("NY");
  const [quickAddZip, setQuickAddZip] = useState("");
  const [quickAddLandlord, setQuickAddLandlord] = useState("");
  const [quickAddLandlordEmail, setQuickAddLandlordEmail] = useState("");
  const [quickAddLandlordPhone, setQuickAddLandlordPhone] = useState("");
  const [quickAddMgmt, setQuickAddMgmt] = useState("");

  // Track mutable buildings list (starts from server data, grows with quick-adds)
  const [buildings, setBuildings] = useState<ExclusiveBuilding[]>(exclusiveBuildings);

  // Brokerage address (auto-fills from building, but editable)
  const [brokerageAddress, setBrokerageAddress] = useState("");

  // Property (manual for personal)
  const [propertyAddress, setPropertyAddress] = useState("");
  const [propertyUnit, setPropertyUnit] = useState("");
  const [propertyCity, setPropertyCity] = useState("New York");
  const [propertyState, setPropertyState] = useState("NY");
  const [landlordName, setLandlordName] = useState("");
  const [landlordEmail, setLandlordEmail] = useState("");
  const [landlordPhone, setLandlordPhone] = useState("");

  // Deal details — lease
  const [tenantName, setTenantName] = useState("");
  const [tenantEmail, setTenantEmail] = useState("");
  const [tenantPhone, setTenantPhone] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [leaseStart, setLeaseStart] = useState("");
  const [leaseEnd, setLeaseEnd] = useState("");
  const [moveInDate, setMoveInDate] = useState("");

  // Deal details — sale
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [closingDate, setClosingDate] = useState("");
  const [representedSide, setRepresentedSide] = useState<
    RepresentedSide | ""
  >("");

  // Commission
  const [commissionMode, setCommissionMode] =
    useState<CommissionType>("flat");
  const [commissionPct, setCommissionPct] = useState("");
  const [commissionFlat, setCommissionFlat] = useState("");

  // Co-broker
  const [showCoBroker, setShowCoBroker] = useState(false);
  const [coBrokeAgent, setCoBrokeAgent] = useState("");
  const [coBrokeBrokerage, setCoBrokeBrokerage] = useState("");

  // Documents
  const [docs, setDocs] = useState<DocSlot[]>([
    { label: "Signed Lease / Contract", key: "signed_lease", required: true, file: null },
    { label: "Agency Disclosure", key: "agency_disclosure", required: true, file: null },
    { label: "Fair Housing Notice", key: "fair_housing", required: true, file: null },
    { label: "Commission Agreement", key: "commission_agreement", required: false, file: null },
  ]);

  // Notes
  const [notes, setNotes] = useState("");

  // UI
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  // ── Derived: selected building ────────────────────────────
  const selectedBuilding = useMemo(
    () => buildings.find((b) => b.id === selectedBuildingId) ?? null,
    [buildings, selectedBuildingId],
  );

  const filteredBuildings = useMemo(() => {
    const q = buildingSearch.toLowerCase().trim();
    if (!q) return buildings;
    return buildings.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        (b.address && b.address.toLowerCase().includes(q)),
    );
  }, [buildings, buildingSearch]);

  // ── Derived: is lease type ────────────────────────────────
  const isLeaseType = dealType === "lease" || dealType === "rental";

  // ── Derived: transaction value ────────────────────────────
  const transactionValue = useMemo(() => {
    if (isLeaseType) {
      const monthly = parseFloat(monthlyRent) || 0;
      return monthly * 12;
    }
    return parseFloat(salePrice) || 0;
  }, [isLeaseType, monthlyRent, salePrice]);

  // ── Derived: split percentages ────────────────────────────
  // Resolution: agent override → org default → hardcoded fallback (70 agent exclusive, 35 brokerage exclusive)
  const { agentSplitPct, houseSplitPct, splitSource } = useMemo(() => {
    let agentPct: number | undefined;
    let source = "";

    if (exclusiveType === "brokerage") {
      if (agentSplitOverrides?.houseExclusiveSplitPct != null) {
        agentPct = agentSplitOverrides.houseExclusiveSplitPct;
        source = "Your split";
      } else if (orgSplits.defaultHouseExclusiveSplitPct != null) {
        agentPct = orgSplits.defaultHouseExclusiveSplitPct;
        source = "Brokerage default";
      } else {
        agentPct = 35;
        source = "Brokerage default";
      }
    } else {
      // agent exclusive (personal)
      if (agentSplitOverrides?.personalExclusiveSplitPct != null) {
        agentPct = agentSplitOverrides.personalExclusiveSplitPct;
        source = "Your split";
      } else if (orgSplits.defaultPersonalExclusiveSplitPct != null) {
        agentPct = orgSplits.defaultPersonalExclusiveSplitPct;
        source = "Brokerage default";
      } else {
        agentPct = 70;
        source = "Brokerage default";
      }
    }

    return {
      agentSplitPct: agentPct,
      houseSplitPct: 100 - agentPct,
      splitSource: source,
    };
  }, [exclusiveType, orgSplits, agentSplitOverrides]);

  // ── Derived: commission totals ────────────────────────────
  const { totalCommission, agentPayout, housePayout } = useMemo(() => {
    let total = 0;
    if (commissionMode === "percentage") {
      const pct = parseFloat(commissionPct) || 0;
      total = (transactionValue * pct) / 100;
    } else {
      total = parseFloat(commissionFlat) || 0;
    }

    const agentOut = (total * agentSplitPct) / 100;
    const houseOut = total - agentOut;

    return {
      totalCommission: total,
      agentPayout: agentOut,
      housePayout: houseOut,
    };
  }, [commissionMode, commissionPct, commissionFlat, transactionValue, agentSplitPct]);

  // ── Validation ────────────────────────────────────────────
  const validate = useCallback((): FormErrors => {
    const e: FormErrors = {};

    // Property
    if (exclusiveType === "brokerage") {
      if (!selectedBuildingId) e.building = "Please select a building";
    } else {
      if (!propertyAddress.trim()) e.propertyAddress = "Address is required";
    }

    // Deal details
    if (isLeaseType) {
      if (!tenantName.trim()) e.tenantName = "Tenant name is required";
      if (!monthlyRent || parseFloat(monthlyRent) <= 0)
        e.monthlyRent = "Monthly rent is required";
      if (!leaseStart) e.leaseStart = "Lease start date is required";
      if (!leaseEnd) e.leaseEnd = "Lease end date is required";
    } else {
      if (!clientName.trim()) e.clientName = "Client name is required";
      if (!salePrice || parseFloat(salePrice) <= 0)
        e.salePrice = "Sale price is required";
      if (!closingDate) e.closingDate = "Closing date is required";
      if (!representedSide) e.representedSide = "Please select a side";
    }

    // Commission
    if (commissionMode === "percentage") {
      const pct = parseFloat(commissionPct);
      if (!pct || pct <= 0 || pct > 100)
        e.commissionPct = "Enter a valid commission percentage";
    } else {
      const flat = parseFloat(commissionFlat);
      if (!flat || flat <= 0) e.commissionFlat = "Enter a valid commission amount";
    }

    // Required documents
    for (const doc of docs) {
      if (doc.required && !doc.file) {
        e[`doc_${doc.key}`] = `${doc.label} is required`;
      }
    }

    return e;
  }, [
    exclusiveType,
    selectedBuildingId,
    propertyAddress,
    dealType,
    isLeaseType,
    tenantName,
    monthlyRent,
    leaseStart,
    leaseEnd,
    clientName,
    salePrice,
    closingDate,
    representedSide,
    commissionMode,
    commissionPct,
    commissionFlat,
    docs,
  ]);

  // ── Scroll to first error ─────────────────────────────────
  const scrollToFirstError = useCallback((errs: FormErrors) => {
    const firstKey = Object.keys(errs)[0];
    if (!firstKey) return;
    const el =
      document.getElementById(firstKey) ??
      document.querySelector(`[data-field="${firstKey}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) {
        el.focus();
      }
    }
  }, []);

  // ── Submit handler ────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      scrollToFirstError(errs);
      return;
    }

    setSubmitting(true);
    try {
      // Resolve property address
      let address = propertyAddress;
      let unit = propertyUnit;
      let city = propertyCity;
      let state = propertyState;

      if (exclusiveType === "brokerage") {
        address = brokerageAddress || (selectedBuilding?.address ?? selectedBuilding?.name ?? "");
        city = selectedBuilding?.city ?? "New York";
        state = selectedBuilding?.state ?? "NY";
      }

      const dealTypeVal: DealType = dealType as DealType;

      const isLease = dealType === "lease" || dealType === "rental";

      const result = await submitDeal({
        agentFirstName: agentInfo.firstName,
        agentLastName: agentInfo.lastName,
        agentEmail: agentInfo.email,
        agentPhone: agentInfo.phone,
        agentLicense: agentInfo.licenseNumber,

        propertyAddress: address,
        unit: unit || undefined,
        city: city || undefined,
        state: state || "NY",

        dealType: dealTypeVal,
        transactionValue,
        closingDate:
          isLease
            ? moveInDate || leaseStart || undefined
            : closingDate || undefined,

        commissionType: commissionMode,
        commissionPct:
          commissionMode === "percentage"
            ? parseFloat(commissionPct) || 0
            : undefined,
        commissionFlat:
          commissionMode === "flat"
            ? parseFloat(commissionFlat) || 0
            : undefined,
        totalCommission,
        agentSplitPct,
        houseSplitPct,
        agentPayout,
        housePayout,

        exclusiveType: exclusiveType,
        bmsPropertyId: exclusiveType === "brokerage" ? selectedBuildingId || undefined : undefined,

        landlordName: landlordName || (exclusiveType === "brokerage" && selectedBuilding?.landlordName) || undefined,
        landlordEmail: landlordEmail || (exclusiveType === "brokerage" && selectedBuilding?.landlordEmail) || undefined,
        landlordPhone: landlordPhone || (exclusiveType === "brokerage" && selectedBuilding?.landlordPhone) || undefined,
        managementCo: exclusiveType === "brokerage" && selectedBuilding?.managementCo ? selectedBuilding.managementCo : undefined,

        leaseStartDate: isLease ? leaseStart || undefined : undefined,
        leaseEndDate: isLease ? leaseEnd || undefined : undefined,
        monthlyRent: isLease ? parseFloat(monthlyRent) || undefined : undefined,

        tenantName: isLease ? tenantName || undefined : undefined,
        tenantEmail: isLease ? tenantEmail || undefined : undefined,
        tenantPhone: isLease ? tenantPhone || undefined : undefined,

        clientName: isLease ? tenantName : clientName || undefined,
        clientEmail: isLease ? tenantEmail : clientEmail || undefined,
        clientPhone: isLease ? tenantPhone : clientPhone || undefined,
        representedSide:
          !isLease ? (representedSide as RepresentedSide) : undefined,

        coBrokeAgent: coBrokeAgent || undefined,
        coBrokeBrokerage: coBrokeBrokerage || undefined,

        notes: notes || undefined,

        requiredDocs: {
          signedLease: !!docs.find((d) => d.key === "signed_lease")?.file,
          agencyDisclosure: !!docs.find((d) => d.key === "agency_disclosure")?.file,
          fairHousing: !!docs.find((d) => d.key === "fair_housing")?.file,
          commissionAgreement: !!docs.find((d) => d.key === "commission_agreement")?.file,
        },
      });

      if (!result.success) {
        setErrors({ _form: result.error ?? "Failed to submit deal" });
        setSubmitting(false);
        return;
      }

      // Upload documents
      const submissionId = (result.data as Record<string, unknown> | undefined)?.id as string | undefined;
      if (submissionId) {
        for (const doc of docs) {
          if (doc.file) {
            const fd = new FormData();
            fd.append("file", doc.file);
            await uploadFile(fd, "deal_submission", submissionId);
          }
        }
      }

      router.push("/brokerage/my-deals?submitted=1");
    } catch (err) {
      console.error("Submit error:", err);
      setErrors({ _form: "An unexpected error occurred" });
      setSubmitting(false);
    }
  }, [
    validate,
    scrollToFirstError,
    exclusiveType,
    selectedBuilding,
    brokerageAddress,
    propertyAddress,
    propertyUnit,
    propertyCity,
    propertyState,
    dealType,
    agentInfo,
    transactionValue,
    closingDate,
    leaseStart,
    commissionMode,
    commissionPct,
    commissionFlat,
    totalCommission,
    agentSplitPct,
    houseSplitPct,
    agentPayout,
    housePayout,
    tenantName,
    tenantEmail,
    tenantPhone,
    clientName,
    clientEmail,
    clientPhone,
    representedSide,
    coBrokeAgent,
    coBrokeBrokerage,
    notes,
    docs,
    router,
  ]);

  // ── Doc file handler ──────────────────────────────────────
  const setDocFile = (key: string, file: File | null) => {
    setDocs((prev) =>
      prev.map((d) => (d.key === key ? { ...d, file } : d)),
    );
    // Clear error for this doc
    if (file) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[`doc_${key}`];
        return next;
      });
    }
  };

  // ── One Month Rent helper ─────────────────────────────────
  const applyOneMonthRent = () => {
    setCommissionMode("percentage");
    setCommissionPct("8.33");
  };

  // ── Quick-add building handler ───────────────────────────────
  const handleQuickAdd = useCallback(async () => {
    if (!quickAddName.trim() || !quickAddAddress.trim()) return;
    setQuickAddSaving(true);
    try {
      const result = await quickAddProperty({
        name: quickAddName.trim(),
        address: quickAddAddress.trim(),
        city: quickAddCity || "New York",
        state: quickAddState || "NY",
        zipCode: quickAddZip || undefined,
        landlordName: quickAddLandlord || undefined,
        landlordEmail: quickAddLandlordEmail || undefined,
        landlordPhone: quickAddLandlordPhone || undefined,
        managementCo: quickAddMgmt || undefined,
      });

      if (result.success && result.data) {
        const newBuilding = result.data as unknown as ExclusiveBuilding;
        setBuildings((prev) => [...prev, newBuilding]);
        setSelectedBuildingId(newBuilding.id);
        setBrokerageAddress(newBuilding.address ?? quickAddAddress.trim());
        setBuildingSearch("");
        setShowBuildingDropdown(false);
        setShowQuickAdd(false);
        // Reset quick-add fields
        setQuickAddName("");
        setQuickAddAddress("");
        setQuickAddCity("New York");
        setQuickAddState("NY");
        setQuickAddZip("");
        setQuickAddLandlord("");
        setQuickAddLandlordEmail("");
        setQuickAddLandlordPhone("");
        setQuickAddMgmt("");
        // Clear building error
        setErrors((prev) => {
          const next = { ...prev };
          delete next.building;
          return next;
        });
      } else {
        setErrors((prev) => ({ ...prev, building: result.error ?? "Failed to add building" }));
      }
    } catch (err) {
      console.error("Quick add failed:", err);
      setErrors((prev) => ({ ...prev, building: "Failed to add building" }));
    } finally {
      setQuickAddSaving(false);
    }
  }, [
    quickAddName, quickAddAddress, quickAddCity, quickAddState, quickAddZip,
    quickAddLandlord, quickAddLandlordEmail, quickAddLandlordPhone, quickAddMgmt,
  ]);

  // ── Render ────────────────────────────────────────────────

  return (
    <div ref={formRef} className="mx-auto max-w-3xl px-4 pb-40 pt-6 md:px-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Submit a Deal</h1>
          <p className="text-sm text-slate-500">
            {agentInfo.firstName} {agentInfo.lastName}
          </p>
        </div>
      </div>

      {/* Form-level error */}
      {errors._form && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {errors._form}
        </div>
      )}

      {/* ─── 1. Deal Type + Exclusive Type ──────────────────── */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-base font-semibold text-slate-800">
          Deal Type
        </h2>
        <div className="mb-4 flex gap-3">
          <SelectCard
            selected={dealType === "lease"}
            onClick={() => setDealType("lease")}
            label="Lease"
            description="Residential or commercial lease"
            icon={<FileText className="h-4 w-4" />}
          />
          <SelectCard
            selected={dealType === "sale"}
            onClick={() => setDealType("sale")}
            label="Sale"
            description="Purchase or sale transaction"
            icon={<Building2 className="h-4 w-4" />}
          />
        </div>

        <h2 className="mb-3 text-base font-semibold text-slate-800">
          Exclusive Type
        </h2>
        <div className="flex gap-3">
          <SelectCard
            selected={exclusiveType === "brokerage"}
            onClick={() => setExclusiveType("brokerage")}
            label="Brokerage Exclusive"
            description="Building managed by the brokerage"
            icon={<Building2 className="h-4 w-4" />}
          />
          <SelectCard
            selected={exclusiveType === "personal"}
            onClick={() => setExclusiveType("personal")}
            label="Agent Exclusive"
            description="Your own client / off-market"
            icon={<User className="h-4 w-4" />}
          />
        </div>
      </section>

      {/* ─── 2. Property Info ───────────────────────────────── */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-base font-semibold text-slate-800">
          Property Information
        </h2>

        {exclusiveType === "brokerage" ? (
          <>
            {/* Searchable building dropdown */}
            <div className="relative mb-4" data-field="building">
              <label className={LABEL}>Building *</label>
              <div className="relative">
                <input
                  id="building"
                  type="text"
                  value={
                    selectedBuilding
                      ? `${selectedBuilding.name}${selectedBuilding.address ? ` - ${selectedBuilding.address}` : ""}`
                      : buildingSearch
                  }
                  onChange={(e) => {
                    setBuildingSearch(e.target.value);
                    setSelectedBuildingId("");
                    setBrokerageAddress("");
                    setShowBuildingDropdown(true);
                  }}
                  onFocus={() => setShowBuildingDropdown(true)}
                  placeholder="Search buildings..."
                  className={INPUT}
                />
                <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
              <FieldError error={errors.building} />

              {showBuildingDropdown && !showQuickAdd && (
                <div className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {filteredBuildings.length === 0 ? (
                    <div className="px-3 py-4 text-center text-sm text-slate-500">
                      No buildings found
                    </div>
                  ) : (
                    filteredBuildings.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          setSelectedBuildingId(b.id);
                          setBrokerageAddress(b.address ?? "");
                          setBuildingSearch("");
                          setShowBuildingDropdown(false);
                          setErrors((prev) => {
                            const next = { ...prev };
                            delete next.building;
                            return next;
                          });
                        }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-blue-50 ${
                          b.id === selectedBuildingId
                            ? "bg-blue-50 font-medium text-blue-700"
                            : "text-slate-700"
                        }`}
                      >
                        <div className="font-medium">{b.name}</div>
                        {b.address && (
                          <div className="text-xs text-slate-500">
                            {b.address}
                            {b.city ? `, ${b.city}` : ""}
                            {b.state ? ` ${b.state}` : ""}
                          </div>
                        )}
                      </button>
                    ))
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setShowQuickAdd(true);
                      setShowBuildingDropdown(false);
                    }}
                    className="w-full border-t border-slate-100 px-3 py-2.5 text-left text-sm font-medium text-blue-600 hover:bg-blue-50"
                  >
                    + Add New Building
                  </button>
                </div>
              )}

              {showQuickAdd && (
                <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50/50 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-800">Add New Building</h3>
                    <button
                      type="button"
                      onClick={() => setShowQuickAdd(false)}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-0.5">Building Name *</label>
                        <input type="text" value={quickAddName} onChange={(e) => setQuickAddName(e.target.value)} placeholder="e.g., Beach Haven" className={INPUT} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-0.5">Address *</label>
                        <input type="text" value={quickAddAddress} onChange={(e) => setQuickAddAddress(e.target.value)} placeholder="123 Main Street" className={INPUT} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-0.5">City</label>
                        <input type="text" value={quickAddCity} onChange={(e) => setQuickAddCity(e.target.value)} className={INPUT} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-0.5">State</label>
                        <input type="text" value={quickAddState} onChange={(e) => setQuickAddState(e.target.value)} className={INPUT} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-0.5">Zip</label>
                        <input type="text" value={quickAddZip} onChange={(e) => setQuickAddZip(e.target.value)} className={INPUT} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-0.5">Landlord Name</label>
                        <input type="text" value={quickAddLandlord} onChange={(e) => setQuickAddLandlord(e.target.value)} className={INPUT} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-0.5">Landlord Email</label>
                        <input type="email" value={quickAddLandlordEmail} onChange={(e) => setQuickAddLandlordEmail(e.target.value)} className={INPUT} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-0.5">Landlord Phone</label>
                        <input type="tel" value={quickAddLandlordPhone} onChange={(e) => setQuickAddLandlordPhone(e.target.value)} className={INPUT} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-0.5">Management Co</label>
                      <input type="text" value={quickAddMgmt} onChange={(e) => setQuickAddMgmt(e.target.value)} className={INPUT} />
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button type="button" onClick={() => setShowQuickAdd(false)} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100">
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleQuickAdd}
                        disabled={quickAddSaving || !quickAddName.trim() || !quickAddAddress.trim()}
                        className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {quickAddSaving ? "Saving..." : "Add Building"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Read-only building summary */}
            {selectedBuilding && (
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-slate-500">Address:</span>{" "}
                    <span className="font-medium text-slate-700">
                      {selectedBuilding.address ?? "-"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Landlord:</span>{" "}
                    <span className="font-medium text-slate-700">
                      {selectedBuilding.landlordName ?? "-"}
                    </span>
                  </div>
                  {selectedBuilding.managementCo && (
                    <div>
                      <span className="text-slate-500">Mgmt Co:</span>{" "}
                      <span className="font-medium text-slate-700">
                        {selectedBuilding.managementCo}
                      </span>
                    </div>
                  )}
                  {selectedBuilding.totalUnits && (
                    <div>
                      <span className="text-slate-500">Units:</span>{" "}
                      <span className="font-medium text-slate-700">
                        {selectedBuilding.totalUnits}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Property address — auto-fills from building, editable */}
            <div className="mt-3">
              <label htmlFor="brokerageAddress" className={LABEL}>
                Property Address
              </label>
              <input
                id="brokerageAddress"
                type="text"
                value={brokerageAddress}
                onChange={(e) => setBrokerageAddress(e.target.value)}
                placeholder="Auto-fills from building, or enter manually"
                className={INPUT}
              />
            </div>

            {/* Unit for brokerage exclusive */}
            <div className="mt-3">
              <label htmlFor="propertyUnit" className={LABEL}>
                Unit
              </label>
              <input
                id="propertyUnit"
                type="text"
                value={propertyUnit}
                onChange={(e) => setPropertyUnit(e.target.value)}
                placeholder="e.g., 4B"
                className={INPUT}
              />
            </div>
          </>
        ) : (
          <>
            {/* Manual address fields for personal */}
            <div className="mb-3">
              <label htmlFor="propertyAddress" className={LABEL}>
                Property Address *
              </label>
              <input
                id="propertyAddress"
                type="text"
                value={propertyAddress}
                onChange={(e) => setPropertyAddress(e.target.value)}
                placeholder="123 Main Street"
                className={INPUT}
              />
              <FieldError error={errors.propertyAddress} />
            </div>

            <div className="mb-3 grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="propertyUnit2" className={LABEL}>
                  Unit
                </label>
                <input
                  id="propertyUnit2"
                  type="text"
                  value={propertyUnit}
                  onChange={(e) => setPropertyUnit(e.target.value)}
                  placeholder="4B"
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="propertyCity" className={LABEL}>
                  City
                </label>
                <input
                  id="propertyCity"
                  type="text"
                  value={propertyCity}
                  onChange={(e) => setPropertyCity(e.target.value)}
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="propertyState" className={LABEL}>
                  State
                </label>
                <input
                  id="propertyState"
                  type="text"
                  value={propertyState}
                  onChange={(e) => setPropertyState(e.target.value)}
                  className={INPUT}
                />
              </div>
            </div>

            <div className="mb-3 grid grid-cols-3 gap-3">
              <div>
                <label htmlFor="landlordName" className={LABEL}>
                  Landlord Name
                </label>
                <input
                  id="landlordName"
                  type="text"
                  value={landlordName}
                  onChange={(e) => setLandlordName(e.target.value)}
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="landlordEmail" className={LABEL}>
                  Landlord Email
                </label>
                <input
                  id="landlordEmail"
                  type="email"
                  value={landlordEmail}
                  onChange={(e) => setLandlordEmail(e.target.value)}
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="landlordPhone" className={LABEL}>
                  Landlord Phone
                </label>
                <input
                  id="landlordPhone"
                  type="tel"
                  value={landlordPhone}
                  onChange={(e) => setLandlordPhone(e.target.value)}
                  className={INPUT}
                />
              </div>
            </div>
          </>
        )}
      </section>

      {/* ─── 3. Deal Details ────────────────────────────────── */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-base font-semibold text-slate-800">
          Deal Details
        </h2>

        {isLeaseType ? (
          <>
            <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label htmlFor="tenantName" className={LABEL}>
                  Tenant Name *
                </label>
                <input
                  id="tenantName"
                  type="text"
                  value={tenantName}
                  onChange={(e) => setTenantName(e.target.value)}
                  placeholder="John Smith"
                  className={INPUT}
                />
                <FieldError error={errors.tenantName} />
              </div>
              <div>
                <label htmlFor="tenantEmail" className={LABEL}>
                  Tenant Email
                </label>
                <input
                  id="tenantEmail"
                  type="email"
                  value={tenantEmail}
                  onChange={(e) => setTenantEmail(e.target.value)}
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="tenantPhone" className={LABEL}>
                  Tenant Phone
                </label>
                <input
                  id="tenantPhone"
                  type="tel"
                  value={tenantPhone}
                  onChange={(e) => setTenantPhone(e.target.value)}
                  className={INPUT}
                />
              </div>
            </div>

            <div className="mb-3">
              <label htmlFor="monthlyRent" className={LABEL}>
                Monthly Rent *
              </label>
              <CurrencyInput
                id="monthlyRent"
                value={monthlyRent}
                onChange={setMonthlyRent}
                placeholder="3,500.00"
              />
              <FieldError error={errors.monthlyRent} />
              {monthlyRent && parseFloat(monthlyRent) > 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  Annual: {fmt(parseFloat(monthlyRent) * 12)}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label htmlFor="leaseStart" className={LABEL}>
                  Lease Start *
                </label>
                <input
                  id="leaseStart"
                  type="date"
                  value={leaseStart}
                  onChange={(e) => setLeaseStart(e.target.value)}
                  className={INPUT}
                />
                <FieldError error={errors.leaseStart} />
              </div>
              <div>
                <label htmlFor="leaseEnd" className={LABEL}>
                  Lease End *
                </label>
                <input
                  id="leaseEnd"
                  type="date"
                  value={leaseEnd}
                  onChange={(e) => setLeaseEnd(e.target.value)}
                  className={INPUT}
                />
                <FieldError error={errors.leaseEnd} />
              </div>
              <div>
                <label htmlFor="moveInDate" className={LABEL}>
                  Move-in Date
                </label>
                <input
                  id="moveInDate"
                  type="date"
                  value={moveInDate}
                  onChange={(e) => setMoveInDate(e.target.value)}
                  className={INPUT}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              <div>
                <label htmlFor="clientName" className={LABEL}>
                  Client Name *
                </label>
                <input
                  id="clientName"
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Jane Doe"
                  className={INPUT}
                />
                <FieldError error={errors.clientName} />
              </div>
              <div>
                <label htmlFor="clientEmail" className={LABEL}>
                  Client Email
                </label>
                <input
                  id="clientEmail"
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="clientPhone" className={LABEL}>
                  Client Phone
                </label>
                <input
                  id="clientPhone"
                  type="tel"
                  value={clientPhone}
                  onChange={(e) => setClientPhone(e.target.value)}
                  className={INPUT}
                />
              </div>
            </div>

            <div className="mb-3">
              <label htmlFor="salePrice" className={LABEL}>
                Sale Price *
              </label>
              <CurrencyInput
                id="salePrice"
                value={salePrice}
                onChange={setSalePrice}
                placeholder="1,500,000.00"
              />
              <FieldError error={errors.salePrice} />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label htmlFor="closingDate" className={LABEL}>
                  Closing Date *
                </label>
                <input
                  id="closingDate"
                  type="date"
                  value={closingDate}
                  onChange={(e) => setClosingDate(e.target.value)}
                  className={INPUT}
                />
                <FieldError error={errors.closingDate} />
              </div>
              <div>
                <label htmlFor="representedSide" className={LABEL}>
                  Represented Side *
                </label>
                <select
                  id="representedSide"
                  value={representedSide}
                  onChange={(e) =>
                    setRepresentedSide(e.target.value as RepresentedSide)
                  }
                  className={INPUT}
                >
                  <option value="">Select...</option>
                  <option value="buyer">Buyer</option>
                  <option value="seller">Seller</option>
                  <option value="landlord">Landlord</option>
                  <option value="tenant">Tenant</option>
                </select>
                <FieldError error={errors.representedSide} />
              </div>
            </div>
          </>
        )}
      </section>

      {/* ─── 4. Commission & Split ──────────────────────────── */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-base font-semibold text-slate-800">
          Commission & Split
        </h2>

        {/* Mode toggle */}
        <div className="mb-4 flex gap-2">
          <button
            type="button"
            onClick={() => setCommissionMode("percentage")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              commissionMode === "percentage"
                ? "bg-blue-100 text-blue-700"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Percentage
          </button>
          <button
            type="button"
            onClick={() => setCommissionMode("flat")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              commissionMode === "flat"
                ? "bg-blue-100 text-blue-700"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Flat Amount
          </button>
        </div>

        {commissionMode === "percentage" ? (
          <div className="mb-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label htmlFor="commissionPct" className={LABEL}>
                  Commission %
                </label>
                <PercentInput
                  id="commissionPct"
                  value={commissionPct}
                  onChange={setCommissionPct}
                  placeholder="6"
                />
                <FieldError error={errors.commissionPct} />
              </div>
              {isLeaseType && (
                <button
                  type="button"
                  onClick={applyOneMonthRent}
                  className="mb-0.5 whitespace-nowrap rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  One Month Rent (8.33%)
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="mb-3">
            <label htmlFor="commissionFlat" className={LABEL}>
              Flat Commission Amount
            </label>
            <CurrencyInput
              id="commissionFlat"
              value={commissionFlat}
              onChange={setCommissionFlat}
              placeholder="5,000.00"
            />
            <FieldError error={errors.commissionFlat} />
          </div>
        )}

        {/* Total commission display */}
        {totalCommission > 0 && (
          <div className="mb-4 rounded-lg bg-slate-50 p-3">
            <div className="text-sm text-slate-600">Total Commission</div>
            <div className="text-lg font-bold text-slate-900">
              {fmt(totalCommission)}
            </div>
          </div>
        )}

        {/* Split preview */}
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700">Split Preview</span>
            <span className="text-xs text-slate-500">{splitSource}</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-slate-500">
                Agent ({agentSplitPct}%)
              </div>
              <div className="text-base font-semibold text-green-700">
                {fmt(agentPayout)}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">
                House ({houseSplitPct}%)
              </div>
              <div className="text-base font-semibold text-slate-700">
                {fmt(housePayout)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 5. Co-Broker (collapsible) ─────────────────────── */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setShowCoBroker(!showCoBroker)}
          className="flex w-full items-center justify-between px-5 py-4"
        >
          <span className="text-base font-semibold text-slate-800">
            Co-Broker
          </span>
          {showCoBroker ? (
            <ChevronDown className="h-5 w-5 text-slate-400" />
          ) : (
            <ChevronRight className="h-5 w-5 text-slate-400" />
          )}
        </button>
        {showCoBroker && (
          <div className="border-t border-slate-100 px-5 pb-5 pt-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label htmlFor="coBrokeAgent" className={LABEL}>
                  Agent Name
                </label>
                <input
                  id="coBrokeAgent"
                  type="text"
                  value={coBrokeAgent}
                  onChange={(e) => setCoBrokeAgent(e.target.value)}
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="coBrokeBrokerage" className={LABEL}>
                  Brokerage
                </label>
                <input
                  id="coBrokeBrokerage"
                  type="text"
                  value={coBrokeBrokerage}
                  onChange={(e) => setCoBrokeBrokerage(e.target.value)}
                  className={INPUT}
                />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ─── 6. Required Documents ──────────────────────────── */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-base font-semibold text-slate-800">
          Required Documents
        </h2>
        <div className="space-y-3">
          {docs.map((doc) => (
            <div
              key={doc.key}
              data-field={`doc_${doc.key}`}
              className={`rounded-lg border p-3 ${
                errors[`doc_${doc.key}`]
                  ? "border-red-300 bg-red-50"
                  : "border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-700">
                    {doc.label}
                    {doc.required && (
                      <span className="ml-1 text-red-500">*</span>
                    )}
                  </span>
                </div>
                {doc.file ? (
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle2 className="h-3 w-3" />
                      {doc.file.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDocFile(doc.key, null)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                    <Upload className="h-3 w-3" />
                    Upload
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        setDocFile(doc.key, f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>
              <FieldError error={errors[`doc_${doc.key}`]} />
            </div>
          ))}
        </div>
      </section>

      {/* ─── 7. Notes ───────────────────────────────────────── */}
      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-base font-semibold text-slate-800">Notes</h2>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Any additional information about this deal..."
          className={INPUT + " resize-none"}
        />
      </section>

      {/* ─── Sticky Bottom Bar ──────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-safe">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 md:px-6">
          <div className="min-w-0">
            <div className="text-xs text-slate-500">Total Commission</div>
            <div className="text-lg font-bold text-slate-900">
              {fmt(totalCommission)}
            </div>
            {totalCommission > 0 && (
              <div className="text-xs text-slate-500">
                You earn {fmt(agentPayout)} ({agentSplitPct}%)
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Deal"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
