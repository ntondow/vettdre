// ── Client Invite Screen ──────────────────────────────────────
// Form to create a new client onboarding invite.
// Collects client info, selects delivery method, and sends.

import { useState } from "react";
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
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { HeaderBar } from "@/components/ui";
import { sendClientInvite } from "@/lib/api";
import NetInfo from "@react-native-community/netinfo";

type DeliveryMethod = "email" | "sms" | "email+sms" | "link";

const DELIVERY_OPTIONS: Array<{
  value: DeliveryMethod;
  label: string;
  icon: string;
  desc: string;
}> = [
  { value: "email", label: "Email", icon: "✉️", desc: "Send signing link via email" },
  { value: "sms", label: "SMS", icon: "💬", desc: "Text the signing link" },
  { value: "email+sms", label: "Both", icon: "📲", desc: "Email + text message" },
  { value: "link", label: "Link Only", icon: "🔗", desc: "Copy link to share manually" },
];

export default function InviteScreen() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("email");
  const [isSending, setIsSending] = useState(false);

  const canSend = () => {
    if (!firstName.trim() || !lastName.trim()) return false;
    if (deliveryMethod === "email" || deliveryMethod === "email+sms") {
      if (!email.trim()) return false;
    }
    if (deliveryMethod === "sms" || deliveryMethod === "email+sms") {
      if (!phone.trim()) return false;
    }
    return true;
  };

  const handleSend = async () => {
    if (!canSend() || isSending) return;
    setIsSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      // Client invites require server-side PDF generation — can't be queued offline
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        Alert.alert(
          "No Connection",
          "Client invites require an internet connection to generate documents. Please try again when you're online."
        );
        setIsSending(false);
        return;
      }

      await sendClientInvite({
        clientFirstName: firstName.trim(),
        clientLastName: lastName.trim(),
        clientEmail: email.trim(),
        clientPhone: phone.trim() || undefined,
        propertyAddress: propertyAddress.trim() || undefined,
        templateIds: [], // Use org defaults
        sentVia: deliveryMethod,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      router.replace({
        pathname: "/clients/invite-sent",
        params: {
          clientName: `${firstName.trim()} ${lastName.trim()}`,
          method: deliveryMethod,
        },
      });
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Failed to Send", err.message || "Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <View style={styles.container}>
      <HeaderBar title="Invite Client" onBack={() => router.back()} />

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
          {/* ── Client Info ──────────────────────────────── */}
          <Text style={styles.sectionLabel}>CLIENT INFORMATION</Text>

          <View style={styles.row}>
            <View style={styles.halfField}>
              <Text style={styles.fieldLabel}>First Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Jane"
                placeholderTextColor="#CBD5E1"
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
                returnKeyType="next"
                accessibilityLabel="Client first name"
              />
            </View>
            <View style={styles.halfField}>
              <Text style={styles.fieldLabel}>Last Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Smith"
                placeholderTextColor="#CBD5E1"
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
                returnKeyType="next"
                accessibilityLabel="Client last name"
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="jane@email.com"
            placeholderTextColor="#CBD5E1"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            accessibilityLabel="Client email"
          />

          <Text style={styles.fieldLabel}>Phone</Text>
          <TextInput
            style={styles.input}
            placeholder="(555) 123-4567"
            placeholderTextColor="#CBD5E1"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            returnKeyType="next"
            accessibilityLabel="Client phone number"
          />

          <Text style={styles.fieldLabel}>Property Address (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="425 W 52nd St, New York"
            placeholderTextColor="#CBD5E1"
            value={propertyAddress}
            onChangeText={setPropertyAddress}
            autoCapitalize="words"
            returnKeyType="done"
          />

          {/* ── Delivery Method ──────────────────────────── */}
          <Text style={[styles.sectionLabel, { marginTop: 24 }]}>
            DELIVERY METHOD
          </Text>

          {DELIVERY_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setDeliveryMethod(opt.value);
              }}
              style={[
                styles.deliveryCard,
                deliveryMethod === opt.value && styles.deliveryCardActive,
              ]}
            >
              <Text style={styles.deliveryIcon}>{opt.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    styles.deliveryLabel,
                    deliveryMethod === opt.value && styles.deliveryLabelActive,
                  ]}
                >
                  {opt.label}
                </Text>
                <Text style={styles.deliveryDesc}>{opt.desc}</Text>
              </View>
              <View
                style={[
                  styles.radio,
                  deliveryMethod === opt.value && styles.radioActive,
                ]}
              >
                {deliveryMethod === opt.value && (
                  <View style={styles.radioDot} />
                )}
              </View>
            </Pressable>
          ))}

          {/* ── Templates Note ────────────────────────────── */}
          <View style={styles.noteCard}>
            <Text style={styles.noteText}>
              📄 Your org's default document templates (Agency Disclosure, Fair
              Housing Notice, Tenant Rep Agreement) will be automatically
              included and pre-filled with your info.
            </Text>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* ── Bottom CTA ────────────────────────────────────── */}
      <View style={styles.bottomBar}>
        <Pressable
          onPress={handleSend}
          disabled={!canSend() || isSending}
          accessibilityRole="button"
          accessibilityLabel="Send client invite"
          style={({ pressed }) => [
            styles.sendBtn,
            (!canSend() || isSending) && styles.sendBtnDisabled,
            pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
          ]}
        >
          <Text
            style={[
              styles.sendBtnText,
              (!canSend() || isSending) && styles.sendBtnTextDisabled,
            ]}
          >
            {isSending ? "Sending..." : "Send Invite"}
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
    marginBottom: 12,
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
  halfField: { flex: 1 },

  // Delivery
  deliveryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    marginBottom: 10,
    backgroundColor: "#F8FAFC",
  },
  deliveryCardActive: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  deliveryIcon: { fontSize: 22 },
  deliveryLabel: { fontSize: 15, fontWeight: "600", color: "#0F172A" },
  deliveryLabelActive: { color: "#2563EB" },
  deliveryDesc: { fontSize: 12, color: "#64748B", marginTop: 1 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#CBD5E1",
    justifyContent: "center",
    alignItems: "center",
  },
  radioActive: { borderColor: "#2563EB" },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#2563EB",
  },

  // Note
  noteCard: {
    marginTop: 20,
    padding: 16,
    backgroundColor: "#F0FDF4",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  noteText: { fontSize: 13, color: "#166534", lineHeight: 20 },

  // Bottom
  bottomBar: {
    padding: 16,
    paddingBottom: 36,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    backgroundColor: "#fff",
  },
  sendBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  sendBtnDisabled: { backgroundColor: "#E2E8F0" },
  sendBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  sendBtnTextDisabled: { color: "#94A3B8" },
});
