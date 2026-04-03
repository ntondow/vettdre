// ── Deal Submission Screen ────────────────────────────────────
// Agent self-service deal submission from mobile.
// Auto-fills agent info, calculates commission splits in real-time.

import { useState, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { HeaderBar } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { enqueueOrSend } from "@/lib/offline-queue";
import { fmtCurrency, fmtCurrencyCompact } from "@/lib/format";

type DealType = "sale" | "lease" | "rental";

const DEAL_TYPES: Array<{ value: DealType; label: string; icon: string }> = [
  { value: "rental", label: "Rental", icon: "🏠" },
  { value: "sale", label: "Sale", icon: "🏢" },
  { value: "lease", label: "Lease", icon: "📋" },
];

export default function DealSubmitScreen() {
  const router = useRouter();
  const { agent } = useAuth();

  const [dealType, setDealType] = useState<DealType>("rental");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [unit, setUnit] = useState("");
  const [transactionValue, setTransactionValue] = useState("");
  const [commissionPct, setCommissionPct] = useState("6");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Real-time commission calculation
  const commission = useMemo(() => {
    const txVal = parseFloat(transactionValue) || 0;
    const rate = parseFloat(commissionPct) || 0;
    const total = txVal * (rate / 100);
    const agentSplit = Number(agent?.defaultSplitPct ?? 70);
    const agentPayout = total * (agentSplit / 100);
    const housePayout = total - agentPayout;
    return { total, agentPayout, housePayout, agentSplit };
  }, [transactionValue, commissionPct, agent]);

  const canSubmit =
    propertyAddress.trim().length > 0 &&
    parseFloat(transactionValue) > 0;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const { queued } = await enqueueOrSend("/api/mobile/deals/submit", {
        propertyAddress: propertyAddress.trim(),
        unit: unit.trim() || undefined,
        dealType,
        transactionValue: parseFloat(transactionValue),
        commissionPct: parseFloat(commissionPct) || undefined,
        clientName: clientName.trim() || undefined,
        clientEmail: clientEmail.trim() || undefined,
        clientPhone: clientPhone.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      router.replace({
        pathname: "/deals/submitted",
        params: {
          address: propertyAddress.trim(),
          payout: commission.agentPayout.toFixed(0),
          queued: queued ? "1" : "0",
        },
      });
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Submission Failed", err.message || "Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <HeaderBar title="Submit Deal" onBack={() => router.back()} />

      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Deal Type Selector */}
          <Text style={styles.sectionLabel}>DEAL TYPE</Text>
          <View style={styles.typeRow}>
            {DEAL_TYPES.map((dt) => (
              <Pressable
                key={dt.value}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setDealType(dt.value);
                }}
                style={[
                  styles.typeCard,
                  dealType === dt.value && styles.typeCardActive,
                ]}
              >
                <Text style={styles.typeIcon}>{dt.icon}</Text>
                <Text
                  style={[
                    styles.typeLabel,
                    dealType === dt.value && styles.typeLabelActive,
                  ]}
                >
                  {dt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Property Info */}
          <Text style={[styles.sectionLabel, { marginTop: 24 }]}>
            PROPERTY
          </Text>

          <Text style={styles.fieldLabel}>Address *</Text>
          <TextInput
            style={styles.input}
            placeholder="425 W 52nd St, New York"
            placeholderTextColor="#CBD5E1"
            value={propertyAddress}
            onChangeText={setPropertyAddress}
            autoCapitalize="words"
            returnKeyType="next"
            accessibilityLabel="Property address"
          />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Unit</Text>
              <TextInput
                style={styles.input}
                placeholder="4A"
                placeholderTextColor="#CBD5E1"
                value={unit}
                onChangeText={setUnit}
                returnKeyType="next"
              />
            </View>
            <View style={{ flex: 2 }}>
              <Text style={styles.fieldLabel}>
                {dealType === "rental" ? "Monthly Rent *" : "Sale Price *"}
              </Text>
              <TextInput
                style={styles.input}
                placeholder={dealType === "rental" ? "3500" : "850000"}
                placeholderTextColor="#CBD5E1"
                value={transactionValue}
                onChangeText={setTransactionValue}
                keyboardType="numeric"
                returnKeyType="next"
              />
            </View>
          </View>

          {/* Commission */}
          <Text style={[styles.sectionLabel, { marginTop: 24 }]}>
            COMMISSION
          </Text>

          <Text style={styles.fieldLabel}>Commission Rate (%)</Text>
          <TextInput
            style={styles.input}
            placeholder="6"
            placeholderTextColor="#CBD5E1"
            value={commissionPct}
            onChangeText={setCommissionPct}
            keyboardType="decimal-pad"
            returnKeyType="done"
          />

          {/* Live Commission Preview */}
          {commission.total > 0 && (
            <View style={styles.commCard}>
              <View style={styles.commRow}>
                <Text style={styles.commLabel}>Total Commission</Text>
                <Text style={styles.commValue}>
                  {fmtCurrency(commission.total)}
                </Text>
              </View>
              <View style={styles.commDivider} />
              <View style={styles.commRow}>
                <Text style={styles.commLabel}>
                  Your Payout ({commission.agentSplit}%)
                </Text>
                <Text style={[styles.commValue, { color: "#10B981" }]}>
                  {fmtCurrency(commission.agentPayout)}
                </Text>
              </View>
              <View style={styles.commRow}>
                <Text style={styles.commLabelSmall}>
                  House ({100 - commission.agentSplit}%)
                </Text>
                <Text style={styles.commLabelSmall}>
                  {fmtCurrency(commission.housePayout)}
                </Text>
              </View>
            </View>
          )}

          {/* Client Info */}
          <Text style={[styles.sectionLabel, { marginTop: 24 }]}>
            CLIENT (OPTIONAL)
          </Text>

          <Text style={styles.fieldLabel}>Client Name</Text>
          <TextInput
            style={styles.input}
            placeholder="Jane Smith"
            placeholderTextColor="#CBD5E1"
            value={clientName}
            onChangeText={setClientName}
            autoCapitalize="words"
            returnKeyType="next"
          />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="jane@email.com"
                placeholderTextColor="#CBD5E1"
                value={clientEmail}
                onChangeText={setClientEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                returnKeyType="next"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Phone</Text>
              <TextInput
                style={styles.input}
                placeholder="(555) 123-4567"
                placeholderTextColor="#CBD5E1"
                value={clientPhone}
                onChangeText={setClientPhone}
                keyboardType="phone-pad"
                returnKeyType="next"
              />
            </View>
          </View>

          {/* Notes */}
          <Text style={styles.fieldLabel}>Notes</Text>
          <TextInput
            style={[styles.input, { height: 80, textAlignVertical: "top" }]}
            placeholder="Additional details about this deal..."
            placeholderTextColor="#CBD5E1"
            value={notes}
            onChangeText={setNotes}
            multiline
            returnKeyType="done"
            accessibilityLabel="Notes"
          />

          <View style={{ height: 100 }} />
        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Bottom CTA */}
      <View style={styles.bottomBar}>
        <Pressable
          onPress={handleSubmit}
          disabled={!canSubmit || submitting}
          accessibilityRole="button"
          accessibilityLabel="Submit deal"
          style={({ pressed }) => [
            styles.submitBtn,
            (!canSubmit || submitting) && styles.submitBtnDisabled,
            pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
          ]}
        >
          <Text
            style={[
              styles.submitBtnText,
              (!canSubmit || submitting) && styles.submitBtnTextDisabled,
            ]}
          >
            {submitting
              ? "Submitting..."
              : commission.agentPayout > 0
                ? `Submit Deal · ${fmtCurrencyCompact(commission.agentPayout)}`
                : "Submit Deal"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  scroll: { flex: 1 },
  scrollContent: { padding: 20 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94A3B8",
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#475569",
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    color: "#0F172A",
    backgroundColor: "#F8FAFC",
  },
  row: { flexDirection: "row", gap: 12 },

  // Deal type selector
  typeRow: { flexDirection: "row", gap: 8 },
  typeCard: {
    flex: 1,
    padding: 16,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
  },
  typeCardActive: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  typeIcon: { fontSize: 22, marginBottom: 4 },
  typeLabel: { fontSize: 13, fontWeight: "600", color: "#64748B" },
  typeLabelActive: { color: "#2563EB" },

  // Commission preview
  commCard: {
    marginTop: 16,
    padding: 16,
    backgroundColor: "#F0FDF4",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  commRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  commLabel: { fontSize: 14, fontWeight: "500", color: "#0F172A" },
  commLabelSmall: { fontSize: 12, color: "#64748B" },
  commValue: { fontSize: 16, fontWeight: "700", color: "#0F172A" },
  commDivider: {
    height: 1,
    backgroundColor: "#D1FAE5",
    marginVertical: 8,
  },

  // Bottom
  bottomBar: {
    padding: 16,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    backgroundColor: "#fff",
  },
  submitBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  submitBtnDisabled: { backgroundColor: "#E2E8F0" },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  submitBtnTextDisabled: { color: "#94A3B8" },
});
