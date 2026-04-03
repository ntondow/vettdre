// ── Scout: Resolving Screen ───────────────────────────────────
// Full-screen loading animation that plays while the backend
// resolves the building. Steps animate in progressively, then
// navigates to the building profile on success.
//
// Presented as a transparent modal (see _layout.tsx).

import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  ActivityIndicator,
  Pressable,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  scoutByAddress,
  scoutByBBL,
  scoutByCoords,
  scoutByScreenshot,
  scoutByUrl,
} from "@/lib/api";
import { ProgressSteps } from "@/components/ui";

const STEPS = [
  { label: "Identifying building", icon: "🏢" },
  { label: "Pulling NYC records", icon: "🗄️" },
  { label: "Checking violations", icon: "⚠️" },
  { label: "Finding owner contacts", icon: "👤" },
  { label: "Running AI analysis", icon: "🤖" },
];

export default function ResolvingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    mode: string;
    imageBase64?: string;
    lat?: string;
    lng?: string;
    url?: string;
    address?: string;
    bbl?: string;
  }>();

  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const navigatedRef = useRef(false);
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  // Fade in backdrop
  useEffect(() => {
    Animated.timing(backdropOpacity, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [backdropOpacity]);

  // Animate steps progressively while the API call runs
  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];

    // Step animation: advance every ~1.5s for perceived progress
    for (let i = 1; i <= STEPS.length - 1; i++) {
      timers.push(
        setTimeout(() => {
          setCurrentStep(i);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }, i * 1500)
      );
    }

    return () => timers.forEach(clearTimeout);
  }, []);

  // API call
  useEffect(() => {
    if (navigatedRef.current) return;

    const fetchProfile = async () => {
      try {
        let profile;

        switch (params.mode) {
          case "camera":
          case "screenshot":
            if (params.imageBase64) {
              // If we have GPS coords from the camera, use those (faster)
              if (
                params.mode === "camera" &&
                params.lat &&
                params.lng &&
                parseFloat(params.lat) !== 0
              ) {
                profile = await scoutByCoords(
                  parseFloat(params.lat),
                  parseFloat(params.lng)
                );
              } else {
                profile = await scoutByScreenshot(params.imageBase64);
              }
            }
            break;

          case "url":
            if (params.url) {
              profile = await scoutByUrl(params.url);
            }
            break;

          case "address":
            if (params.address) {
              profile = await scoutByAddress(params.address);
            }
            break;

          case "bbl":
            if (params.bbl) {
              profile = await scoutByBBL(params.bbl);
            }
            break;

          default:
            throw new Error(`Unknown scout mode: ${params.mode}`);
        }

        if (!profile) {
          throw new Error("No building data returned");
        }

        // Complete all steps
        setCurrentStep(STEPS.length);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // Brief pause to show completed state, then navigate
        await new Promise((r) => setTimeout(r, 600));

        if (!navigatedRef.current) {
          navigatedRef.current = true;
          // Navigate to profile, passing the data
          router.replace({
            pathname: "/scout/profile",
            params: {
              profileData: JSON.stringify(profile),
            },
          });
        }
      } catch (err: any) {
        console.error("[resolving] Error:", err);
        setError(err.message || "Failed to identify building");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    };

    fetchProfile();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Animated.View style={[styles.container, { opacity: backdropOpacity }]}>
      <View style={styles.card}>
        <Text style={styles.title}>
          {error ? "Scout Failed" : "Scouting Building..."}
        </Text>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.back();
              }}
              style={({ pressed }) => [
                styles.retryBtn,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={styles.retryBtnText}>Try Again</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <ProgressSteps
              steps={STEPS}
              currentStep={currentStep}
              style={{ marginTop: 24, marginBottom: 24 }}
            />

            {currentStep < STEPS.length && (
              <View style={styles.spinnerRow}>
                <ActivityIndicator size="small" color="#2563EB" />
                <Text style={styles.spinnerText}>
                  {STEPS[Math.min(currentStep, STEPS.length - 1)].label}...
                </Text>
              </View>
            )}

            {currentStep >= STEPS.length && (
              <View style={styles.doneRow}>
                <Text style={styles.doneCheck}>✓</Text>
                <Text style={styles.doneText}>Profile ready!</Text>
              </View>
            )}
          </>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  spinnerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  spinnerText: { fontSize: 14, color: "#64748B", fontWeight: "500" },
  doneRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  doneCheck: {
    fontSize: 16,
    fontWeight: "700",
    color: "#10B981",
  },
  doneText: { fontSize: 15, fontWeight: "600", color: "#10B981" },
  errorBox: { alignItems: "center", marginTop: 20 },
  errorText: {
    fontSize: 14,
    color: "#EF4444",
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 20,
  },
  retryBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  retryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
