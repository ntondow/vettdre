// ── AI Ownership Intelligence Card ──────────────────────────
// Rich owner profile card showing AI-verified ownership data:
// confidence scoring, ranked phones, verification signals,
// mailing addresses, associated entities, and enrichment data.

import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Linking,
} from "react-native";
import {
  Phone,
  Mail,
  MapPin,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Building2,
  User,
  ExternalLink,
  CheckCircle2,
  XCircle,
  MessageSquare,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { COLORS, RADIUS, FONT, SPACING, SHADOW } from "@/lib/theme";

// ── Types ────────────────────────────────────────────────────

interface RankedContact {
  name: string;
  phone: string;
  email: string;
  role: string;
  source: string;
  score: number;
  address: string;
}

interface PhoneRanking {
  phone: string;
  score: number;
  reason: string;
  isPrimary: boolean;
  names: string[];
  sources: string[];
  filingCount: number;
}

interface ConfidenceFactor {
  name: string;
  points: number;
  maxPoints: number;
  source: string;
  matched: boolean;
}

interface LeadVerification {
  confidenceScore: {
    total: number;
    grade: "A" | "B" | "C" | "D" | "F";
    factors: ConfidenceFactor[];
    recommendation: string;
  } | null;
  verified: boolean;
  verificationDetails: string[];
}

interface HpdContact {
  type: string;
  corporateName: string;
  firstName: string;
  lastName: string;
  title: string;
  businessAddress: string;
  businessCity: string;
  businessState: string;
  businessZip: string;
}

interface AIOwnershipCardProps {
  plutoOwnerName: string;
  rankedContacts: RankedContact[];
  phoneRankings: PhoneRanking[];
  leadVerification: LeadVerification | null;
  hpdContacts: HpdContact[];
  apolloEnrichment: any;
  apolloOrgEnrichment: any;
  apolloKeyPeople: any[];
  pdlEnrichment: any;
  address: string;
  onContactOwner: () => void;
}

// ── Helpers ──────────────────────────────────────────────────

function getGradeConfig(grade: string) {
  switch (grade) {
    case "A":
      return { color: "#166534", bg: "#F0FDF4", border: "#BBF7D0", label: "High Confidence" };
    case "B":
      return { color: "#1E40AF", bg: "#EFF6FF", border: "#BFDBFE", label: "Good Confidence" };
    case "C":
      return { color: "#92400E", bg: "#FFFBEB", border: "#FDE68A", label: "Moderate" };
    case "D":
      return { color: "#9A3412", bg: "#FFF7ED", border: "#FED7AA", label: "Low Confidence" };
    default:
      return { color: "#991B1B", bg: "#FEF2F2", border: "#FECACA", label: "Insufficient Data" };
  }
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === "1") {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

function getBestOwnerName(
  rankedContacts: RankedContact[],
  plutoOwnerName: string,
  apolloEnrichment: any,
  pdlEnrichment: any,
): { name: string; source: string } {
  // Prefer the top-ranked individual (not an LLC)
  const topIndividual = rankedContacts.find(
    (c) => !c.name.toUpperCase().match(/LLC|CORP|INC|L\.P\.|TRUST|ASSOCIATES/)
  );
  if (topIndividual && topIndividual.name.length > 3) {
    return { name: topIndividual.name, source: topIndividual.source };
  }

  // Apollo enrichment
  if (apolloEnrichment?.name) {
    return { name: apolloEnrichment.name, source: "Apollo.io" };
  }

  // PDL enrichment
  if (pdlEnrichment?.fullName) {
    return { name: pdlEnrichment.fullName, source: "People Data Labs" };
  }

  return { name: plutoOwnerName || "Unknown Owner", source: "PLUTO" };
}

function getBestCorpName(
  rankedContacts: RankedContact[],
  hpdContacts: HpdContact[],
  apolloOrgEnrichment: any,
): string | null {
  // Check HPD corporate owner
  const hpdCorp = hpdContacts.find(
    (c) => c.type === "CorporateOwner" && c.corporateName
  );
  if (hpdCorp?.corporateName) return hpdCorp.corporateName;

  // Check ranked contacts for LLC/Corp
  const topCorp = rankedContacts.find((c) =>
    c.name.toUpperCase().match(/LLC|CORP|INC|L\.P\./)
  );
  if (topCorp) return topCorp.name;

  // Apollo org
  if (apolloOrgEnrichment?.name) return apolloOrgEnrichment.name;

  return null;
}

function getPrimaryPhone(
  rankedContacts: RankedContact[],
  phoneRankings: PhoneRanking[],
): { phone: string; source: string; score: number } | null {
  // Best phone from rankings (sorted by score)
  const best = phoneRankings
    .sort((a, b) => b.score - a.score)
    .find((p) => p.phone);
  if (best) {
    return {
      phone: best.phone,
      source: best.sources.join(", "),
      score: best.score,
    };
  }

  // Fallback to ranked contacts
  const withPhone = rankedContacts.find((c) => c.phone);
  if (withPhone) {
    return { phone: withPhone.phone, source: withPhone.source, score: withPhone.score };
  }

  return null;
}

function getPrimaryEmail(
  rankedContacts: RankedContact[],
  apolloEnrichment: any,
  pdlEnrichment: any,
): { email: string; source: string } | null {
  if (apolloEnrichment?.email) {
    return { email: apolloEnrichment.email, source: "Apollo.io" };
  }
  if (pdlEnrichment?.emails?.length > 0) {
    return { email: pdlEnrichment.emails[0], source: "PDL" };
  }
  const withEmail = rankedContacts.find((c) => c.email);
  if (withEmail) {
    return { email: withEmail.email, source: withEmail.source };
  }
  return null;
}

function getMailingAddress(hpdContacts: HpdContact[]): string | null {
  // Prefer CorporateOwner or IndividualOwner business address
  const ownerTypes = ["CorporateOwner", "IndividualOwner", "HeadOfficer", "Agent"];
  for (const type of ownerTypes) {
    const contact = hpdContacts.find(
      (c) => c.type === type && c.businessAddress
    );
    if (contact?.businessAddress) {
      const parts = [
        contact.businessAddress,
        contact.businessCity,
        contact.businessState,
        contact.businessZip,
      ].filter(Boolean);
      return parts.join(", ");
    }
  }
  return null;
}

// ── Component ────────────────────────────────────────────────

export function AIOwnershipCard({
  plutoOwnerName,
  rankedContacts,
  phoneRankings,
  leadVerification,
  hpdContacts,
  apolloEnrichment,
  apolloOrgEnrichment,
  apolloKeyPeople,
  pdlEnrichment,
  address,
  onContactOwner,
}: AIOwnershipCardProps) {
  const [showFactors, setShowFactors] = useState(false);
  const [showAllPhones, setShowAllPhones] = useState(false);
  const [showKeyPeople, setShowKeyPeople] = useState(false);

  const confidence = leadVerification?.confidenceScore;
  const gradeConfig = getGradeConfig(confidence?.grade || "F");
  const owner = getBestOwnerName(rankedContacts, plutoOwnerName, apolloEnrichment, pdlEnrichment);
  const corpName = getBestCorpName(rankedContacts, hpdContacts, apolloOrgEnrichment);
  const primaryPhone = getPrimaryPhone(rankedContacts, phoneRankings);
  const primaryEmail = getPrimaryEmail(rankedContacts, apolloEnrichment, pdlEnrichment);
  const mailingAddress = getMailingAddress(hpdContacts);
  const matchedFactors = confidence?.factors?.filter((f) => f.matched) || [];
  const unmatchedFactors = confidence?.factors?.filter((f) => !f.matched) || [];

  // Secondary phones (beyond the primary)
  const secondaryPhones = phoneRankings
    .sort((a, b) => b.score - a.score)
    .filter((p) => p.phone && p.phone !== primaryPhone?.phone)
    .slice(0, 4);

  const handleCall = (phone: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(`tel:${phone}`);
  };

  const handleSms = (phone: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(`sms:${phone}`);
  };

  const handleEmail = (email: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Linking.openURL(
      `mailto:${email}?subject=${encodeURIComponent(`Inquiry: ${address}`)}&body=${encodeURIComponent(`Hi,\n\nI'm reaching out regarding the property at ${address}.\n\n`)}`
    );
  };

  return (
    <View style={styles.container}>
      {/* ── Confidence Header ────────────────────────────── */}
      <View style={[styles.confidenceHeader, { backgroundColor: gradeConfig.bg, borderColor: gradeConfig.border }]}>
        <View style={styles.confidenceRow}>
          <View style={styles.confidenceLeft}>
            {confidence?.grade === "A" || confidence?.grade === "B" ? (
              <ShieldCheck size={20} color={gradeConfig.color} />
            ) : confidence?.grade === "C" ? (
              <Shield size={20} color={gradeConfig.color} />
            ) : (
              <ShieldAlert size={20} color={gradeConfig.color} />
            )}
            <Text style={[styles.confidenceLabel, { color: gradeConfig.color }]}>
              AI Ownership Analysis
            </Text>
          </View>
          <View style={[styles.gradeBadge, { backgroundColor: gradeConfig.color }]}>
            <Text style={styles.gradeText}>
              {confidence?.grade || "?"} · {confidence?.total ?? 0}%
            </Text>
          </View>
        </View>
        <Text style={[styles.confidenceDesc, { color: gradeConfig.color }]}>
          {gradeConfig.label}
        </Text>
      </View>

      {/* ── Most Likely Owner ────────────────────────────── */}
      <View style={styles.ownerSection}>
        <View style={styles.ownerRow}>
          <View style={styles.ownerAvatar}>
            <User size={20} color={COLORS.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.ownerLabel}>Most Likely Owner</Text>
            <Text style={styles.ownerName}>{owner.name}</Text>
            {corpName && corpName !== owner.name && (
              <View style={styles.corpRow}>
                <Building2 size={12} color={COLORS.textSecondary} />
                <Text style={styles.corpName}>{corpName}</Text>
              </View>
            )}
            <Text style={styles.sourceTag}>via {owner.source}</Text>
          </View>
        </View>
      </View>

      {/* ── Primary Phone ("Call First") ─────────────────── */}
      {primaryPhone && (
        <View style={styles.primaryPhoneCard}>
          <View style={styles.callFirstBadge}>
            <Phone size={10} color={COLORS.successDark} />
            <Text style={styles.callFirstText}>CALL FIRST</Text>
          </View>
          <View style={styles.phoneRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.phoneNumber}>
                {formatPhone(primaryPhone.phone)}
              </Text>
              <Text style={styles.phoneSource}>
                {primaryPhone.source}
              </Text>
            </View>
            <View style={styles.phoneActions}>
              <Pressable
                onPress={() => handleCall(primaryPhone.phone)}
                style={[styles.phoneActionBtn, { backgroundColor: COLORS.successBg }]}
              >
                <Phone size={16} color={COLORS.successDark} />
              </Pressable>
              <Pressable
                onPress={() => handleSms(primaryPhone.phone)}
                style={[styles.phoneActionBtn, { backgroundColor: COLORS.primaryLight }]}
              >
                <MessageSquare size={16} color={COLORS.primary} />
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {/* ── Primary Email ────────────────────────────────── */}
      {primaryEmail && (
        <Pressable
          onPress={() => handleEmail(primaryEmail.email)}
          style={styles.emailRow}
        >
          <Mail size={16} color="#EA580C" />
          <View style={{ flex: 1 }}>
            <Text style={styles.emailText}>{primaryEmail.email}</Text>
            <Text style={styles.emailSource}>via {primaryEmail.source}</Text>
          </View>
          <ExternalLink size={12} color={COLORS.textMuted} />
        </Pressable>
      )}

      {/* ── Mailing Address ──────────────────────────────── */}
      {mailingAddress && (
        <View style={styles.addressRow}>
          <MapPin size={16} color={COLORS.textSecondary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.addressLabel}>Mailing Address</Text>
            <Text style={styles.addressText}>{mailingAddress}</Text>
          </View>
        </View>
      )}

      {/* ── Secondary Phones (Collapsible) ───────────────── */}
      {secondaryPhones.length > 0 && (
        <View style={styles.secondarySection}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowAllPhones(!showAllPhones);
            }}
            style={styles.collapseHeader}
          >
            <Text style={styles.collapseTitle}>
              {secondaryPhones.length} More Phone{secondaryPhones.length > 1 ? "s" : ""}
            </Text>
            {showAllPhones ? (
              <ChevronUp size={16} color={COLORS.textMuted} />
            ) : (
              <ChevronDown size={16} color={COLORS.textMuted} />
            )}
          </Pressable>

          {showAllPhones &&
            secondaryPhones.map((p, i) => (
              <View key={i} style={styles.secondaryPhoneRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.secondaryPhone}>
                    {formatPhone(p.phone)}
                  </Text>
                  <Text style={styles.secondaryPhoneDetail}>
                    {p.names.slice(0, 2).join(", ")}
                    {p.sources.length > 0 ? ` · ${p.sources[0]}` : ""}
                    {p.filingCount > 1 ? ` · ${p.filingCount} filings` : ""}
                  </Text>
                </View>
                <Pressable
                  onPress={() => handleCall(p.phone)}
                  style={[styles.smallCallBtn]}
                >
                  <Phone size={14} color={COLORS.primary} />
                </Pressable>
              </View>
            ))}
        </View>
      )}

      {/* ── Verification Signals ─────────────────────────── */}
      {confidence && confidence.factors && confidence.factors.length > 0 && (
        <View style={styles.verificationSection}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowFactors(!showFactors);
            }}
            style={styles.collapseHeader}
          >
            <Text style={styles.collapseTitle}>
              Verification Signals ({matchedFactors.length}/{confidence.factors.length})
            </Text>
            {showFactors ? (
              <ChevronUp size={16} color={COLORS.textMuted} />
            ) : (
              <ChevronDown size={16} color={COLORS.textMuted} />
            )}
          </Pressable>

          {showFactors && (
            <View style={styles.factorsGrid}>
              {matchedFactors.map((f, i) => (
                <View key={`m-${i}`} style={styles.factorRow}>
                  <CheckCircle2 size={14} color={COLORS.successDark} />
                  <Text style={styles.factorName}>{f.name}</Text>
                  <Text style={styles.factorPoints}>+{f.points}</Text>
                </View>
              ))}
              {unmatchedFactors.map((f, i) => (
                <View key={`u-${i}`} style={[styles.factorRow, { opacity: 0.5 }]}>
                  <XCircle size={14} color={COLORS.textMuted} />
                  <Text style={[styles.factorName, { color: COLORS.textMuted }]}>
                    {f.name}
                  </Text>
                  <Text style={[styles.factorPoints, { color: COLORS.textMuted }]}>
                    0/{f.maxPoints}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* ── Apollo Key People (Collapsible) ──────────────── */}
      {apolloKeyPeople && apolloKeyPeople.length > 0 && (
        <View style={styles.keyPeopleSection}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setShowKeyPeople(!showKeyPeople);
            }}
            style={styles.collapseHeader}
          >
            <Text style={styles.collapseTitle}>
              Key People at Org ({apolloKeyPeople.length})
            </Text>
            {showKeyPeople ? (
              <ChevronUp size={16} color={COLORS.textMuted} />
            ) : (
              <ChevronDown size={16} color={COLORS.textMuted} />
            )}
          </Pressable>

          {showKeyPeople &&
            apolloKeyPeople.slice(0, 5).map((person: any, i: number) => (
              <View key={i} style={styles.keyPersonRow}>
                <View style={styles.keyPersonAvatar}>
                  <Text style={styles.keyPersonInitial}>
                    {(person.name || person.first_name || "?")[0]}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.keyPersonName}>
                    {person.name || [person.first_name, person.last_name].filter(Boolean).join(" ")}
                  </Text>
                  <Text style={styles.keyPersonTitle}>
                    {person.title || person.headline || "—"}
                  </Text>
                </View>
                {(person.email || person.phone) && (
                  <View style={styles.keyPersonActions}>
                    {person.phone && (
                      <Pressable onPress={() => handleCall(person.phone)} hitSlop={8}>
                        <Phone size={14} color={COLORS.primary} />
                      </Pressable>
                    )}
                    {person.email && (
                      <Pressable onPress={() => handleEmail(person.email)} hitSlop={8}>
                        <Mail size={14} color="#EA580C" />
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            ))}
        </View>
      )}

      {/* ── Recommendation ───────────────────────────────── */}
      {confidence?.recommendation && (
        <View style={styles.recommendationCard}>
          <Text style={styles.recommendationText}>
            {confidence.recommendation}
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
  },

  // Confidence header
  confidenceHeader: {
    padding: SPACING.lg,
    borderBottomWidth: 1,
  },
  confidenceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  confidenceLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  confidenceLabel: {
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.bold,
  },
  gradeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  gradeText: {
    fontSize: FONT.size.sm,
    fontWeight: FONT.weight.bold,
    color: COLORS.white,
  },
  confidenceDesc: {
    fontSize: FONT.size.sm,
    fontWeight: FONT.weight.medium,
    marginTop: 4,
  },

  // Owner section
  ownerSection: {
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  ownerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  ownerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  ownerLabel: {
    fontSize: FONT.size.xs,
    fontWeight: FONT.weight.semibold,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  ownerName: {
    fontSize: FONT.size.xxl,
    fontWeight: FONT.weight.bold,
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  corpRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  corpName: {
    fontSize: FONT.size.md,
    color: COLORS.textSecondary,
    fontWeight: FONT.weight.medium,
  },
  sourceTag: {
    fontSize: FONT.size.xs,
    color: COLORS.textMuted,
    marginTop: 4,
  },

  // Primary phone
  primaryPhoneCard: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.successBorder,
  },
  callFirstBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 8,
  },
  callFirstText: {
    fontSize: 10,
    fontWeight: FONT.weight.bold,
    color: COLORS.successDark,
    letterSpacing: 1,
  },
  phoneRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  phoneNumber: {
    fontSize: FONT.size.xl,
    fontWeight: FONT.weight.bold,
    color: COLORS.text,
    letterSpacing: 0.3,
  },
  phoneSource: {
    fontSize: FONT.size.xs,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  phoneActions: {
    flexDirection: "row",
    gap: 8,
  },
  phoneActionBtn: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.md,
    justifyContent: "center",
    alignItems: "center",
  },

  // Email
  emailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  emailText: {
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.medium,
    color: COLORS.text,
  },
  emailSource: {
    fontSize: FONT.size.xs,
    color: COLORS.textMuted,
  },

  // Address
  addressRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  addressLabel: {
    fontSize: FONT.size.xs,
    color: COLORS.textMuted,
    fontWeight: FONT.weight.semibold,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  addressText: {
    fontSize: FONT.size.base,
    color: COLORS.text,
    fontWeight: FONT.weight.medium,
    marginTop: 2,
  },

  // Secondary phones
  secondarySection: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: "hidden",
  },
  collapseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: SPACING.md,
  },
  collapseTitle: {
    fontSize: FONT.size.md,
    fontWeight: FONT.weight.semibold,
    color: COLORS.textSecondary,
  },
  secondaryPhoneRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  secondaryPhone: {
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.semibold,
    color: COLORS.text,
  },
  secondaryPhoneDetail: {
    fontSize: FONT.size.xs,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  smallCallBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryLight,
    justifyContent: "center",
    alignItems: "center",
  },

  // Verification signals
  verificationSection: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: "hidden",
  },
  factorsGrid: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
  },
  factorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 5,
  },
  factorName: {
    flex: 1,
    fontSize: FONT.size.sm,
    color: COLORS.text,
    fontWeight: FONT.weight.medium,
  },
  factorPoints: {
    fontSize: FONT.size.sm,
    fontWeight: FONT.weight.bold,
    color: COLORS.successDark,
    minWidth: 30,
    textAlign: "right",
  },

  // Key people
  keyPeopleSection: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    overflow: "hidden",
  },
  keyPersonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  keyPersonAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },
  keyPersonInitial: {
    fontSize: FONT.size.sm,
    fontWeight: FONT.weight.bold,
    color: COLORS.textSecondary,
  },
  keyPersonName: {
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.semibold,
    color: COLORS.text,
  },
  keyPersonTitle: {
    fontSize: FONT.size.xs,
    color: COLORS.textMuted,
  },
  keyPersonActions: {
    flexDirection: "row",
    gap: 12,
  },

  // Recommendation
  recommendationCard: {
    margin: SPACING.lg,
    padding: SPACING.md,
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  recommendationText: {
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
    lineHeight: 18,
    fontStyle: "italic",
  },
});
