// Screening module constants

// ── Fee Configuration ─────────────────────────────────────────
export const BASE_SCREENING_FEE_CENTS = parseInt(process.env.BASE_SCREENING_FEE_CENTS || "2000", 10);
export const ENHANCED_SCREENING_FEE_CENTS = parseInt(process.env.ENHANCED_SCREENING_FEE_CENTS || "4900", 10);

// ── Screening Tiers ───────────────────────────────────────────
export const SCREENING_TIERS = {
  base: {
    label: "Base Screening",
    description: "Credit, criminal, eviction + bank verification + AI document analysis",
    applicantFee: BASE_SCREENING_FEE_CENTS,
    orgFee: 0,
    creditBureaus: 1,
    transactionDays: 90,
    features: [
      "Single bureau soft-pull credit report",
      "Criminal + eviction check",
      "Plaid bank connection (90 days)",
      "AI document fraud detection",
      "Financial wellness profile",
      "VettdRE Risk Score + recommendation",
      "Consolidated PDF report",
    ],
  },
  enhanced: {
    label: "Enhanced Screening",
    description: "Everything in base + tri-bureau, employment verify, extended history",
    applicantFee: BASE_SCREENING_FEE_CENTS,
    orgFee: ENHANCED_SCREENING_FEE_CENTS,
    creditBureaus: 3,
    transactionDays: 365,
    features: [
      "Everything in Base, plus:",
      "Tri-bureau credit pull (Equifax + Experian + TransUnion)",
      "Employment verification",
      "Experian RentBureau rental payment history",
      "Extended transaction history (6-12 months)",
      "Automated landlord reference outreach",
      "Enhanced multi-document fraud analysis",
    ],
  },
} as const;

// ── Status Labels & Colors ────────────────────────────────────
export const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  draft:           { label: "Draft",            color: "#64748b", bgColor: "#f1f5f9" },
  invited:         { label: "Invited",          color: "#6366f1", bgColor: "#eef2ff" },
  in_progress:     { label: "In Progress",      color: "#f59e0b", bgColor: "#fffbeb" },
  pending_payment: { label: "Pending Payment",  color: "#f97316", bgColor: "#fff7ed" },
  processing:      { label: "Processing",       color: "#3b82f6", bgColor: "#eff6ff" },
  complete:        { label: "Complete",          color: "#10b981", bgColor: "#ecfdf5" },
  approved:        { label: "Approved",          color: "#059669", bgColor: "#d1fae5" },
  conditional:     { label: "Conditional",       color: "#d97706", bgColor: "#fef3c7" },
  denied:          { label: "Denied",            color: "#dc2626", bgColor: "#fee2e2" },
  withdrawn:       { label: "Withdrawn",         color: "#9ca3af", bgColor: "#f3f4f6" },
};

// ── Risk Score Thresholds ─────────────────────────────────────
export const RISK_THRESHOLDS = {
  approve: 75,
  conditional: 50,
  // Below 50 = decline
} as const;

export const RISK_COLORS = {
  approve:     { color: "#059669", bgColor: "#d1fae5", label: "Low Risk" },
  conditional: { color: "#d97706", bgColor: "#fef3c7", label: "Moderate Risk" },
  decline:     { color: "#dc2626", bgColor: "#fee2e2", label: "High Risk" },
} as const;

// ── Document Types ────────────────────────────────────────────
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  pay_stub: "Pay Stub",
  w2: "W-2",
  tax_return: "Tax Return",
  ten99: "1099",
  bank_statement: "Bank Statement",
  employment_letter: "Employment Letter",
  landlord_reference: "Landlord Reference",
  government_id: "Government ID",
  other: "Other",
};

// ── VettdRE Transaction Categories ────────────────────────────
export const VETTDRE_CATEGORIES = {
  income: ["income_salary", "income_freelance", "income_government", "income_other"],
  housing: ["rent_payment", "mortgage_payment"],
  bills: ["utilities", "insurance", "subscriptions"],
  debt: ["debt_payment", "loan_payment", "credit_card_payment"],
  living: ["groceries", "dining", "entertainment", "transportation"],
  transfers: ["transfer_in", "transfer_out", "atm_withdrawal", "cash_deposit"],
  red_flags: ["nsf_fee", "overdraft_fee", "late_fee", "gambling", "suspicious"],
} as const;

export const RED_FLAG_CATEGORIES = new Set(VETTDRE_CATEGORIES.red_flags);

// ── Applicant Wizard Steps ────────────────────────────────────
export const WIZARD_STEPS = [
  { step: 1, label: "Personal Info", key: "personal_info" },
  { step: 2, label: "Legal & E-Sign", key: "signature" },
  { step: 3, label: "Bank Account", key: "plaid" },
  { step: 4, label: "Documents", key: "documents" },
  { step: 5, label: "Payment", key: "payment" },
  { step: 6, label: "Confirmation", key: "confirmation" },
] as const;

// ── Legal Documents Required for E-Sign ───────────────────────
export const REQUIRED_LEGAL_DOCS = [
  { type: "credit_pull_consent", label: "Credit Pull Authorization", version: "1.0" },
  { type: "fcra_disclosure", label: "FCRA Disclosure", version: "1.0" },
  { type: "screening_terms", label: "Screening Terms & Conditions", version: "1.0" },
  { type: "privacy_disclosure", label: "Privacy Disclosure", version: "1.0" },
  { type: "fair_housing_notice", label: "Fair Housing Notice", version: "1.0" },
] as const;

// ── File Upload Limits ────────────────────────────────────────
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
export const MAX_FILES_PER_APPLICATION = 5;
export const ALLOWED_FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
];
export const ALLOWED_FILE_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".heic", ".heif"];

// ── Default Application Field Config ──────────────────────────
export const DEFAULT_FIELD_CONFIG = {
  sections: [
    {
      key: "personal",
      label: "Personal Information",
      fields: [
        { key: "firstName", label: "First Name", type: "text", required: true },
        { key: "lastName", label: "Last Name", type: "text", required: true },
        { key: "dateOfBirth", label: "Date of Birth", type: "date", required: true },
        { key: "ssn", label: "Social Security Number", type: "ssn", required: true, encrypted: true },
        { key: "phone", label: "Phone Number", type: "tel", required: true },
        { key: "email", label: "Email Address", type: "email", required: true },
      ],
    },
    {
      key: "address",
      label: "Current Address",
      fields: [
        { key: "currentAddress", label: "Street Address", type: "text", required: true },
        { key: "currentCity", label: "City", type: "text", required: true },
        { key: "currentState", label: "State", type: "select", required: true },
        { key: "currentZip", label: "ZIP Code", type: "text", required: true },
        { key: "monthsAtAddress", label: "Months at Current Address", type: "number", required: false },
        { key: "currentRent", label: "Current Monthly Rent", type: "currency", required: false },
        { key: "landlordName", label: "Current Landlord Name", type: "text", required: false },
        { key: "landlordPhone", label: "Current Landlord Phone", type: "tel", required: false },
      ],
    },
    {
      key: "employment",
      label: "Employment",
      fields: [
        { key: "employer", label: "Employer", type: "text", required: true },
        { key: "jobTitle", label: "Job Title", type: "text", required: false },
        { key: "monthlyIncome", label: "Monthly Gross Income", type: "currency", required: true },
        { key: "employmentDuration", label: "Months Employed", type: "number", required: false },
        { key: "supervisorName", label: "Supervisor Name", type: "text", required: false },
        { key: "supervisorPhone", label: "Supervisor Phone", type: "tel", required: false },
      ],
    },
    {
      key: "additional",
      label: "Additional Information",
      fields: [
        { key: "hasBeenEvicted", label: "Have you ever been evicted?", type: "boolean", required: true },
        { key: "hasFelony", label: "Have you ever been convicted of a felony?", type: "boolean", required: true },
        { key: "hasBankruptcy", label: "Have you filed for bankruptcy in the last 7 years?", type: "boolean", required: true },
        { key: "pets", label: "Do you have pets?", type: "boolean", required: false },
        { key: "petDetails", label: "If yes, describe pets", type: "text", required: false, showIf: { field: "pets", value: true } },
        { key: "additionalOccupants", label: "Number of additional occupants", type: "number", required: false },
      ],
    },
    {
      key: "references",
      label: "References",
      fields: [
        { key: "reference1Name", label: "Reference 1 - Name", type: "text", required: false },
        { key: "reference1Phone", label: "Reference 1 - Phone", type: "tel", required: false },
        { key: "reference1Relation", label: "Reference 1 - Relationship", type: "text", required: false },
        { key: "reference2Name", label: "Reference 2 - Name", type: "text", required: false },
        { key: "reference2Phone", label: "Reference 2 - Phone", type: "tel", required: false },
        { key: "reference2Relation", label: "Reference 2 - Relationship", type: "text", required: false },
      ],
    },
  ],
  roleOverrides: {
    guarantor: { skip: ["additional"], optional: ["address", "references"] },
    occupant: { skip: ["employment", "references"], optional: ["address"] },
    co_applicant: {},
  },
};
