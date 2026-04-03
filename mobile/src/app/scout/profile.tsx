// ── Scout: Building Profile Screen ────────────────────────────
// Full building intelligence card — the core value prop.
// Shows PLUTO data, violations, owner info, distress signals,
// and quick actions (save, contact owner, share).

import { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Share,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { FadeInView, StatusBadge, SectionHeader, HeaderBar } from "@/components/ui";
import { ContactSheet } from "@/components/scout/contact-sheet";
import { AIOwnershipCard } from "@/components/scout/ai-ownership-card";
import { DistressCard } from "@/components/scout/distress-card";
import { ViolationsGrid } from "@/components/scout/violations-grid";
import { saveBuilding, isBuildingSaved, removeSavedBuilding } from "@/lib/offline-cache";
import { saveBuildingToServer } from "@/lib/api";
import { fmtCurrency, fmtNumber } from "@/lib/format";
import { COLORS, RADIUS, FONT, SPACING } from "@/lib/theme";

// ── Component ────────────────────────────────────────────────

export default function ProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ profileData: string }>();
  const [savedBuilding, setSavedBuilding] = useState(false);
  const [showContactSheet, setShowContactSheet] = useState(false);

  // Parse profile data from navigation params
  const profile = useMemo(() => {
    try {
      return JSON.parse(params.profileData || "{}");
    } catch {
      return {};
    }
  }, [params.profileData]);

  const pluto = profile.pluto || {};
  const address = pluto.address || profile.address || "Unknown Address";
  const borough =
    ["", "Manhattan", "Bronx", "Brooklyn", "Queens", "Staten Island"][
      parseInt(pluto.borocode || "0")
    ] || "";
  const bbl = `${pluto.borocode || ""}${String(pluto.block || "").padStart(5, "0")}${String(pluto.lot || "").padStart(4, "0")}`;

  const violationSummary = profile.violationSummary || {
    total: 0, open: 0, classA: 0, classB: 0, classC: 0,
  };
  const complaintSummary = profile.complaintSummary || {
    total: 0, recent: 0, topTypes: [],
  };

  const contacts = useMemo(() => {
    if (!profile.rankedContacts) return [];
    return profile.rankedContacts.filter(
      (c: any) => c.phone || c.email
    );
  }, [profile.rankedContacts]);

  // Check if already saved on mount
  useEffect(() => {
    if (bbl) {
      isBuildingSaved(bbl).then(setSavedBuilding).catch(() => {});
    }
  }, [bbl]);

  const handleSave = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (savedBuilding) {
      await removeSavedBuilding(bbl);
      setSavedBuilding(false);
    } else {
      const units = parseInt(pluto.unitstotal || "0");
      const year = parseInt(pluto.yearbuilt || "0");
      const assessed = parseFloat(pluto.assesstot || "0");

      await saveBuilding({
        bbl,
        address,
        borough,
        neighborhood: pluto.neighborhood || "",
        zipCode: pluto.zipcode || "",
        buildingClass: pluto.bldgclass || "",
        buildingClassDesc: pluto.bldgclassdesc || "",
        yearBuilt: year,
        numFloors: parseInt(pluto.numfloors || "0"),
        unitsTotal: units,
        unitsRes: parseInt(pluto.unitsres || "0"),
        lotArea: parseFloat(pluto.lotarea || "0"),
        bldgArea: parseFloat(pluto.bldgarea || "0"),
        zoneDist1: pluto.zonedist1 || "",
        builtFAR: parseFloat(pluto.builtfar || "0"),
        maxFAR: parseFloat(pluto.residfar || "0"),
        assessTotal: assessed,
        ownerName: pluto.ownername || "Unknown",
        lastSalePrice: profile.lastSalePrice || null,
        lastSaleDate: profile.lastSaleDate || null,
        mortgageAmount: profile.mortgageAmount || null,
        mortgageLender: profile.mortgageLender || null,
        hpdViolations: violationSummary,
        hpdComplaints: complaintSummary,
        rentStabilized: !!profile.rentStabilized,
        rsUnits: profile.rsUnits || null,
        activePermits: profile.activePermits || 0,
        recentPermits: profile.recentPermits || [],
        aiNotes: profile.aiNotes || null,
        ownerConfidence: profile.ownerConfidence || 0,
        distressScore: profile.distressScore || 0,
      });
      setSavedBuilding(true);

      saveBuildingToServer({
        bbl,
        address,
        borough,
        totalUnits: units || undefined,
        yearBuilt: year || undefined,
        ownerName: pluto.ownername || undefined,
        lastSalePrice: profile.lastSalePrice || undefined,
        assessedValue: assessed ? Math.round(assessed) : undefined,
      }).catch(() => {});
    }
  };

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const distressScore = profile.distressScore || 0;
    try {
      await Share.share({
        message: `${address}, ${borough}\n${fmtNumber(parseInt(pluto.unitsres || "0"))} units · Built ${pluto.yearbuilt || "?"}\nOwner: ${pluto.ownername || "Unknown"}\nDistress: ${distressScore}/100\n\nScouted with VettdRE`,
      });
    } catch {}
  };

  const handleContactOwner = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (contacts.length > 0) {
      setShowContactSheet(true);
    } else {
      Alert.alert(
        "No Contact Info",
        `No phone or email found for ${pluto.ownername || "the owner"}. Try enriching this contact from the web app.`
      );
    }
  };

  return (
    <View style={styles.container}>
      <HeaderBar
        title="Building Profile"
        onBack={() => router.back()}
        right={
          <Pressable
            onPress={handleShare}
            hitSlop={12}
            style={({ pressed }) => [pressed && { opacity: 0.6 }]}
          >
            <Text style={{ fontSize: 18 }}>↗</Text>
          </Pressable>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ─────────────────────────────────────────── */}
        <FadeInView delay={0}>
          <View style={styles.heroCard}>
            <Text style={styles.heroAddress}>{address}</Text>
            <Text style={styles.heroBorough}>
              {borough}
              {pluto.zipcode ? ` · ${pluto.zipcode}` : ""}
            </Text>

            <View style={styles.heroStats}>
              {[
                { value: fmtNumber(parseInt(pluto.unitsres || "0")), label: "Units" },
                { value: pluto.numfloors || "—", label: "Floors" },
                { value: pluto.yearbuilt || "—", label: "Built" },
                { value: fmtCurrency(parseInt(pluto.assesstot || "0")), label: "Assessed" },
              ].map((stat, i) => (
                <View key={stat.label} style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                  {i > 0 && <View style={styles.heroDivider} />}
                  <View style={styles.heroStat}>
                    <Text style={styles.heroStatValue}>{stat.value}</Text>
                    <Text style={styles.heroStatLabel}>{stat.label}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </FadeInView>

        {/* ── Distress Score ──────────────────────────────── */}
        <FadeInView delay={100}>
          <View style={styles.section}>
            <SectionHeader label="Risk Assessment" />
            <DistressCard
              score={profile.distressScore || 0}
              signals={profile.distressSignals}
            />
          </View>
        </FadeInView>

        {/* ── AI Ownership Intelligence ────────────────── */}
        <FadeInView delay={200}>
          <View style={styles.section}>
            <SectionHeader label="AI Ownership Analysis" />
            <AIOwnershipCard
              plutoOwnerName={pluto.ownername || "Unknown"}
              rankedContacts={profile.rankedContacts || []}
              phoneRankings={profile.phoneRankings || []}
              leadVerification={profile.leadVerification || null}
              hpdContacts={profile.hpdContacts || []}
              apolloEnrichment={profile.apolloEnrichment || null}
              apolloOrgEnrichment={profile.apolloOrgEnrichment || null}
              apolloKeyPeople={profile.apolloKeyPeople || []}
              pdlEnrichment={profile.pdlEnrichment || null}
              address={address}
              onContactOwner={handleContactOwner}
            />
          </View>
        </FadeInView>

        {/* ── Violations ──────────────────────────────────── */}
        <FadeInView delay={300}>
          <View style={styles.section}>
            <SectionHeader label="HPD Violations" />
            <ViolationsGrid
              violations={violationSummary}
              complaints={complaintSummary}
              violationsList={profile.violations || []}
            />
          </View>
        </FadeInView>

        {/* ── Building Details ────────────────────────────── */}
        <FadeInView delay={400}>
          <View style={styles.section}>
            <SectionHeader label="Building Details" />
            <View style={styles.infoCard}>
              {[
                ["BBL", bbl],
                ["Building Class", pluto.bldgclass || "—"],
                ["Zoning", pluto.zonedist1 || "—"],
                ["Lot Area", `${fmtNumber(parseInt(pluto.lotarea || "0"))} sf`],
                ["Building Area", `${fmtNumber(parseInt(pluto.bldgarea || "0"))} sf`],
                [
                  "FAR",
                  pluto.builtfar
                    ? `${parseFloat(pluto.builtfar).toFixed(2)} / ${parseFloat(pluto.residfar || pluto.commfar || "0").toFixed(2)} max`
                    : "—",
                ],
                [
                  "Rent Stabilized",
                  profile.rentStabilized
                    ? `${profile.rentStabilized.status}${profile.rentStabilized.estimatedUnits ? ` (~${profile.rentStabilized.estimatedUnits} units)` : ""}${profile.rentStabilized.confidence ? ` · ${profile.rentStabilized.confidence} conf.` : ""}`
                    : "Unknown",
                ],
              ].map(([label, value]) => (
                <View key={label} style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{label}</Text>
                  <Text style={styles.detailValue}>{value}</Text>
                </View>
              ))}
            </View>
          </View>
        </FadeInView>

        {/* ── Recent Permits ──────────────────────────────── */}
        {profile.permits && profile.permits.length > 0 && (
          <FadeInView delay={500}>
            <View style={styles.section}>
              <SectionHeader label={`DOB Permits (${profile.permits.length})`} />
              {profile.permits.slice(0, 5).map((p: any, i: number) => (
                <View key={i} style={styles.permitCard}>
                  <View style={styles.permitHeader}>
                    <StatusBadge
                      status={p.job_status === "A" ? "active" : "pending"}
                      label={p.job_type || "Permit"}
                      size="xs"
                    />
                    <Text style={styles.permitDate}>
                      {p.filing_date
                        ? new Date(p.filing_date).toLocaleDateString()
                        : "—"}
                    </Text>
                  </View>
                  <Text style={styles.permitDesc} numberOfLines={2}>
                    {p.job_description || p.work_type || "No description"}
                  </Text>
                </View>
              ))}
            </View>
          </FadeInView>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Sticky Bottom Actions ─────────────────────────── */}
      <View style={styles.bottomBar}>
        <Pressable
          onPress={handleSave}
          style={({ pressed }) => [
            styles.saveBtn,
            savedBuilding && styles.saveBtnSaved,
            pressed && { opacity: 0.9 },
          ]}
        >
          <Text
            style={[
              styles.saveBtnText,
              savedBuilding && styles.saveBtnTextSaved,
            ]}
          >
            {savedBuilding ? "✓ Saved" : "Save Building"}
          </Text>
        </Pressable>
        <Pressable
          onPress={handleContactOwner}
          style={({ pressed }) => [
            styles.contactBtn,
            pressed && { opacity: 0.9 },
          ]}
        >
          <Text style={styles.contactBtnText}>Contact Owner</Text>
        </Pressable>
      </View>

      {/* ── Contact Owner Sheet ──────────────────────────── */}
      <ContactSheet
        visible={showContactSheet}
        onClose={() => setShowContactSheet(false)}
        ownerName={pluto.ownername || "Owner"}
        address={address}
        contacts={contacts}
      />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.xl, paddingTop: 0 },

  // Hero
  heroCard: {
    backgroundColor: COLORS.text,
    borderRadius: RADIUS.xxl,
    padding: SPACING.xxl,
    marginBottom: SPACING.xl,
  },
  heroAddress: {
    fontSize: 20,
    fontWeight: FONT.weight.bold,
    color: COLORS.white,
    letterSpacing: -0.3,
  },
  heroBorough: {
    fontSize: FONT.size.base,
    color: "rgba(255,255,255,0.6)",
    marginTop: SPACING.xs,
    marginBottom: SPACING.xl,
  },
  heroStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroStat: { alignItems: "center", flex: 1 },
  heroStatValue: {
    fontSize: FONT.size.xxl,
    fontWeight: FONT.weight.bold,
    color: COLORS.white,
    letterSpacing: -0.3,
  },
  heroStatLabel: {
    fontSize: 10,
    color: "rgba(255,255,255,0.5)",
    marginTop: 2,
    fontWeight: FONT.weight.semibold,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  heroDivider: {
    width: 1,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.15)",
  },

  // Section
  section: { marginBottom: SPACING.xl },

  // Info card
  infoCard: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  infoLabel: { fontSize: FONT.size.md, color: COLORS.textSecondary, fontWeight: FONT.weight.medium },
  infoValue: { fontSize: FONT.size.md, color: COLORS.text, fontWeight: FONT.weight.semibold, flexShrink: 1, textAlign: "right" },
  infoDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.md,
  },

  // Details
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  detailLabel: { fontSize: FONT.size.md, color: COLORS.textSecondary, fontWeight: FONT.weight.medium },
  detailValue: { fontSize: FONT.size.md, color: COLORS.text, fontWeight: FONT.weight.semibold },

  // Permits
  permitCard: {
    padding: 14,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
  },
  permitHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  permitDate: { fontSize: FONT.size.xs, color: COLORS.textMuted, fontWeight: FONT.weight.medium },
  permitDesc: { fontSize: FONT.size.md, color: "#475569", lineHeight: 18 },

  // Bottom bar
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    gap: 10,
    padding: SPACING.lg,
    paddingBottom: 36,
    backgroundColor: COLORS.bg,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  saveBtn: {
    flex: 1,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: COLORS.bgTertiary,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  saveBtnSaved: {
    backgroundColor: "#DCFCE7",
    borderColor: COLORS.successBorder,
  },
  saveBtnText: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold, color: COLORS.text },
  saveBtnTextSaved: { color: COLORS.successText },
  contactBtn: {
    flex: 1,
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: COLORS.primary,
  },
  contactBtnText: { fontSize: FONT.size.lg, fontWeight: FONT.weight.bold, color: COLORS.white },
});
