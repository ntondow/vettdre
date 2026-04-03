// ── ErrorBoundary ────────────────────────────────────────────
// Catches unhandled JS errors anywhere in the component tree.
// Shows a friendly recovery UI instead of a white screen crash.

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  SafeAreaView,
} from "react-native";
import * as Haptics from "expo-haptics";

interface Props {
  children: ReactNode;
  /** Optional fallback component */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console in dev, would send to Sentry in production
    console.error("[ErrorBoundary] Caught error:", error, info.componentStack);
  }

  handleRecover = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.content}>
            <Text style={styles.emoji}>⚠️</Text>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.message}>
              The app hit an unexpected error. This has been logged and we'll
              look into it.
            </Text>

            {__DEV__ && this.state.error && (
              <View style={styles.debugCard}>
                <Text style={styles.debugTitle}>Debug Info</Text>
                <Text style={styles.debugText} numberOfLines={6}>
                  {this.state.error.message}
                </Text>
              </View>
            )}

            <Pressable
              onPress={this.handleRecover}
              style={({ pressed }) => [
                styles.retryBtn,
                pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              ]}
            >
              <Text style={styles.retryText}>Try Again</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

/**
 * Lightweight error screen for individual route-level errors.
 * Use as: <ScreenErrorState onRetry={() => refetch()} message="..." />
 */
export function ScreenErrorState({
  message = "Failed to load. Check your connection and try again.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.screenError}>
      <Text style={styles.screenErrorEmoji}>😵</Text>
      <Text style={styles.screenErrorText}>{message}</Text>
      {onRetry && (
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onRetry();
          }}
          style={styles.screenRetryBtn}
        >
          <Text style={styles.screenRetryText}>Retry</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Full-screen crash boundary
  container: { flex: 1, backgroundColor: "#fff" },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emoji: { fontSize: 48, marginBottom: 16 },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#0F172A",
    textAlign: "center",
  },
  message: {
    fontSize: 15,
    color: "#64748B",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
  },
  debugCard: {
    marginTop: 20,
    padding: 16,
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FECACA",
    width: "100%",
  },
  debugTitle: { fontSize: 12, fontWeight: "700", color: "#991B1B", marginBottom: 4 },
  debugText: { fontSize: 11, color: "#B91C1C", fontFamily: "monospace" },
  retryBtn: {
    marginTop: 28,
    paddingHorizontal: 32,
    paddingVertical: 14,
    backgroundColor: "#2563EB",
    borderRadius: 14,
  },
  retryText: { fontSize: 16, fontWeight: "600", color: "#fff" },

  // In-screen error state
  screenError: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  screenErrorEmoji: { fontSize: 36, marginBottom: 12 },
  screenErrorText: {
    fontSize: 15,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 22,
  },
  screenRetryBtn: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: "#F1F5F9",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  screenRetryText: { fontSize: 14, fontWeight: "600", color: "#475569" },
});
