// ── Skeleton Shimmer ─────────────────────────────────────────
// Animated loading placeholder with a shimmer sweep effect.
// Use <Skeleton width={100} height={14} /> anywhere loading
// states are needed instead of plain gray boxes.

import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated, type ViewStyle } from "react-native";
import { COLORS, RADIUS, SPACING } from "@/lib/theme";

interface SkeletonProps {
  /** Width in px or percentage string */
  width?: number | string;
  /** Height in px */
  height?: number;
  /** Border radius — defaults to RADIUS.sm (8) */
  borderRadius?: number;
  /** Additional style overrides */
  style?: ViewStyle;
}

export function Skeleton({
  width = "100%",
  height = 16,
  borderRadius = RADIUS.sm,
  style,
}: SkeletonProps) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 1],
  });

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: COLORS.skeleton,
          opacity,
        } as any,
        style,
      ]}
    />
  );
}

// ── Preset Skeleton Layouts ──────────────────────────────────

/** Skeleton for a list row (icon + 2 lines of text) */
export function SkeletonListItem() {
  return (
    <View style={skStyles.listItem}>
      <Skeleton width={44} height={44} borderRadius={22} />
      <View style={skStyles.listLines}>
        <Skeleton width="60%" height={14} />
        <Skeleton width="40%" height={12} />
      </View>
    </View>
  );
}

/** Skeleton for a stat card */
export function SkeletonCard() {
  return (
    <View style={skStyles.card}>
      <Skeleton width={80} height={12} />
      <Skeleton width={120} height={28} style={{ marginTop: 8 }} />
      <Skeleton width="100%" height={12} style={{ marginTop: 12 }} />
    </View>
  );
}

/** Skeleton for the earnings hero on the dashboard */
export function SkeletonEarningsCard() {
  return (
    <View style={skStyles.earningsCard}>
      <View style={skStyles.earningsRow}>
        <View>
          <Skeleton width={80} height={12} />
          <Skeleton width={160} height={32} style={{ marginTop: 8 }} />
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Skeleton width={60} height={12} />
          <Skeleton width={80} height={20} style={{ marginTop: 8 }} />
        </View>
      </View>
      <View style={skStyles.statsRow}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={skStyles.statBox}>
            <Skeleton width={32} height={18} />
            <Skeleton width={40} height={10} style={{ marginTop: 4 }} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** Skeleton for a schedule row */
export function SkeletonScheduleItem() {
  return (
    <View style={skStyles.scheduleItem}>
      <Skeleton width={4} height={36} borderRadius={2} />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width="70%" height={14} />
        <Skeleton width="40%" height={12} />
      </View>
    </View>
  );
}

const skStyles = StyleSheet.create({
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
  listLines: {
    flex: 1,
    gap: 6,
  },
  card: {
    padding: SPACING.lg,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: RADIUS.lg,
  },
  earningsCard: {
    backgroundColor: COLORS.text, // matches the dark earnings card bg
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  earningsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statsRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 14,
  },
  statBox: {
    flex: 1,
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    alignItems: "center",
  },
  scheduleItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.md,
    gap: 12,
  },
});
