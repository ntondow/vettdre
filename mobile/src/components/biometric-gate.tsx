// ── Biometric Gate ───────────────────────────────────────────
// Full-screen overlay that locks the app behind Face ID /
// Touch ID when returning from background. Only renders if
// the user has enabled biometric lock in settings.

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  AppState,
  type AppStateStatus,
  Animated,
} from "react-native";
import { Shield } from "lucide-react-native";
import { COLORS, FONT, RADIUS, SPACING } from "@/lib/theme";
import {
  isBiometricEnabled,
  authenticateBiometric,
} from "@/lib/biometric-lock";

const LOCK_AFTER_MS = 3_000; // lock after 3 seconds in background

export function BiometricGate({ children }: { children: React.ReactNode }) {
  const [locked, setLocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const mountedRef = useRef(true);
  const appState = useRef(AppState.currentState);
  const leftAt = useRef<number>(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // On mount, check if we should show the lock immediately
  useEffect(() => {
    mountedRef.current = true;

    (async () => {
      try {
        const enabled = await isBiometricEnabled();
        if (!mountedRef.current) return;
        if (enabled) {
          setLocked(true);
          promptUnlock();
        }
      } catch {
        // If we can't check, skip the lock
      } finally {
        if (mountedRef.current) setChecking(false);
      }
    })();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Watch for background → foreground transitions
  useEffect(() => {
    const sub = AppState.addEventListener(
      "change",
      async (next: AppStateStatus) => {
        if (
          appState.current === "active" &&
          (next === "background" || next === "inactive")
        ) {
          leftAt.current = Date.now();
        }

        if (
          next === "active" &&
          (appState.current === "background" ||
            appState.current === "inactive")
        ) {
          const elapsed = Date.now() - leftAt.current;
          try {
            const enabled = await isBiometricEnabled();
            if (!mountedRef.current) return;
            if (enabled && elapsed >= LOCK_AFTER_MS) {
              fadeAnim.setValue(1);
              setLocked(true);
              promptUnlock();
            }
          } catch {
            // Skip lock on error
          }
        }

        appState.current = next;
      }
    );
    return () => sub.remove();
  }, []);

  async function promptUnlock() {
    try {
      const ok = await authenticateBiometric();
      if (!mountedRef.current) return;
      if (ok) {
        // Animate out
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start(() => {
          if (mountedRef.current) setLocked(false);
        });
      }
    } catch {
      // Auth failed — keep locked, user can retry via button
    }
  }

  // While checking preferences on first mount, render nothing extra
  if (checking) return <>{children}</>;

  return (
    <>
      {children}
      {locked && (
        <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
          <View style={styles.content}>
            <View style={styles.iconCircle}>
              <Shield size={40} color={COLORS.primary} />
            </View>
            <Text style={styles.title}>VettdRE is Locked</Text>
            <Text style={styles.subtitle}>
              Authenticate to continue
            </Text>
            <Pressable
              onPress={promptUnlock}
              style={({ pressed }) => [
                styles.unlockBtn,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={styles.unlockBtnText}>Unlock</Text>
            </Pressable>
          </View>
        </Animated.View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.bg,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  content: {
    alignItems: "center",
    paddingHorizontal: SPACING.xxxl,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primaryLight,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: SPACING.xxl,
  },
  title: {
    fontSize: FONT.size.title,
    fontWeight: FONT.weight.bold,
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONT.size.base,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xxxl,
  },
  unlockBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
  },
  unlockBtnText: {
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.semibold,
    color: COLORS.white,
  },
});
