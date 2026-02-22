export type ContactType = "landlord" | "buyer" | "seller" | "renter";

export interface LandlordTypeData {
  entityName?: string;
  entityType?: "individual" | "llc" | "corp" | "trust";
  role?: string;
  portfolioSize?: number;
  totalUnits?: number;
  buildings?: { address: string; bbl: string; units: number }[];
  mailingAddress?: string;
  managementCompany?: string;
  yearsOwned?: number;
  lastSalePrice?: number;
  estimatedValue?: number;
  violationCount?: number;
  distressScore?: number;
  rentStabilizedPct?: number;
  preferredContact?: "phone" | "email" | "in-person" | "mail";
  bestTimeToReach?: string;
  decisionMaker?: boolean;
  exclusiveStatus?: "none" | "verbal" | "written" | "expired";
  commissionTerms?: string;
}

export interface BuyerTypeData {
  buyerType?: "first-time" | "investor" | "upgrade" | "downsize" | "pied-a-terre";
  preApproved?: boolean;
  preApprovalAmount?: number;
  lender?: string;
  cashBuyer?: boolean;
  budgetMin?: number;
  budgetMax?: number;
  targetNeighborhoods?: string[];
  targetBoroughs?: string[];
  propertyType?: string;
  bedroomsMin?: number;
  bedroomsMax?: number;
  bathroomsMin?: number;
  sqftMin?: number;
  mustHaves?: string[];
  dealBreakers?: string[];
  moveTimeline?: string;
  currentSituation?: string;
  reasonForBuying?: string;
  competingAgents?: boolean;
  exclusiveBuyer?: boolean;
}

export interface SellerTypeData {
  propertyAddress?: string;
  propertyType?: string;
  askingPrice?: number;
  estimatedValue?: number;
  reasonForSelling?: string;
  sellTimeline?: string;
  mortgageBalance?: number;
  equity?: number;
  ownerOccupied?: boolean;
  tenantSituation?: string;
  condition?: string;
  renovations?: string[];
  listingStatus?: string;
  listingPrice?: number;
  listingDate?: string;
  daysOnMarket?: number;
  exclusiveAgreement?: boolean;
  exclusiveExpiration?: string;
  commissionRate?: number;
  cobrokeRate?: number;
  photographyStatus?: string;
  stagingStatus?: string;
}

export interface RenterTypeData {
  budgetMin?: number;
  budgetMax?: number;
  targetNeighborhoods?: string[];
  targetBoroughs?: string[];
  bedrooms?: string;
  moveInDate?: string;
  leaseLength?: string;
  currentSituation?: string;
  currentRent?: number;
  creditScore?: string;
  annualIncome?: number;
  employmentStatus?: string;
  employer?: string;
  guarantor?: string;
  pets?: string;
  roommates?: string;
  mustHaves?: string[];
  dealBreakers?: string[];
  brokerFee?: boolean;
  documentsReady?: string[];
  urgency?: string;
}

export type TypeData = LandlordTypeData | BuyerTypeData | SellerTypeData | RenterTypeData;

export const CONTACT_TYPE_META: Record<ContactType, { label: string; icon: string; color: string; bgColor: string }> = {
  landlord: { label: "Landlord", icon: "🏢", color: "text-purple-700", bgColor: "bg-purple-50" },
  buyer:    { label: "Buyer",    icon: "🏠", color: "text-emerald-700", bgColor: "bg-emerald-50" },
  seller:   { label: "Seller",   icon: "💰", color: "text-amber-700", bgColor: "bg-amber-50" },
  renter:   { label: "Renter",   icon: "🔑", color: "text-blue-700", bgColor: "bg-blue-50" },
};
