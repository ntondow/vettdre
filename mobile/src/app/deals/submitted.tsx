// ── Deal Submitted Confirmation ──────────────────────────────
// Shown after successful deal submission. Spring-animated checkmark.

import { useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { fmtCurrency } from "@/lib/format";

export default function DealSubmittedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ address: string; payout: string; queued: string }>();
  const wasQueued = params.queued === "1";
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.sequence([
      Animated.spring(scale, {
        toValue: 1,
        tension: 60,
        friction: 6,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Animated.View
          style={[styles.checkCircle, { transform: [{ scale }] }]}
        >
          <Text style={styles.checkEmoji}>✅</Text>
        </Animated.View>

        <Animated.View style={{ opacity, alignItems: "center" }}>
          <Text style={styles.title}>
            {wasQueued ? "Deal Saved!" : "Deal Submitted!"}
          </Text>
          <Text style={styles.subtitle}>
            {wasQueued
              ? "You're offline — this deal will be submitted automatically when you reconnect."
              : `${params.address || "Your deal"} is now pending review`}
          </Text>

          {params.payout && Number(params.payout) > 0 && (
            <View style={styles.payoutCard}>
              <Text style={styles.payoutLabel}>Estimated Payout</Text>
              <Text style={styles.payoutValue}>
                {fmtCurrency(Number(params.payout))}
              </Text>
            </View>
          )}

          <View style={styles.actions}>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.replace("/(tabs)/pipeline");
              }}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text style={styles.primaryBtnText}>View Pipeline</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.replace("/deals/submit");
              }}
              style={({ pressed }) => [
                styles.secondaryBtn,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text style={styles.secondaryBtnText}>Submit Another</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    width: "85%",
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 32,
    alignItems: "center",
  },
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#F0FDF4",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  checkEmoji: { fontSize: 36 },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
  },

  payoutCard: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 14,
    backgroundColor: "#F0FDF4",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#BBF7D0",
    alignItems: "center",
  },
  payoutLabel: { fontSize: 12, color: "#166534", fontWeight: "500" },
  payoutValue: {
    fontSize: 28,
    fontWeight: "800",
    color: "#16A34A",
    marginTop: 2,
  },

  actions: { marginTop: 24, gap: 10, width: "100%" },
  primaryBtn: {
    paddingVertical: 14,
    backgroundColor: "#2563EB",
    borderRadius: 12,
    alignItems: "center",
  },
  primaryBtnText: { fontSize: 15, fontWeight: "600", color: "#fff" },
  secondaryBtn: {
    paddingVertical: 14,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  secondaryBtnText: { fontSize: 15, fontWeight: "600", color: "#64748B" },
});
