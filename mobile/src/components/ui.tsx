// ── Shared UI Components ──────────────────────────────────────
// Reusable primitives used across all screens.

import { useEffect, useRef } from "react";
import {
  View,
  Text,
  Animated,
  StyleSheet,
  Pressable,
  ViewStyle,
  TextStyle,
} from "react-native";
import * as Haptics from "expo-haptics";

// ── Skeleton (shimmer loading placeholder) ───────────────────

export function Skeleton({
  width,
  height = 16,
  radius = 8,
  style,
}: {
  width: number | string;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: width as number,
          height,
          borderRadius: radius,
          backgroundColor: "#E2E8F0",
          opacity,
        },
        style,
      ]}
    />
  );
}

export function SkeletonCard({ style }: { style?: ViewStyle }) {
  return (
    <View style={[skeletonStyles.card, style]}>
      <Skeleton width={140} height={14} />
      <View style={{ height: 8 }} />
      <Skeleton width="100%" height={10} />
      <View style={{ height: 6 }} />
      <Skeleton width="70%" height={10} />
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  card: {
    padding: 20,
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 12,
  },
});

// ── StatCard ─────────────────────────────────────────────────

export function StatCard({
  label,
  value,
  trend,
  color = "#2563EB",
  onPress,
  style,
}: {
  label: string;
  value: string;
  trend?: string;
  color?: string;
  onPress?: () => void;
  style?: ViewStyle;
}) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  };

  const content = (
    <>
      <Text style={statStyles.label}>{label}</Text>
      <Text style={[statStyles.value, { color }]}>{value}</Text>
      {trend && (
        <Text
          style={[
            statStyles.trend,
            {
              color: trend.startsWith("+") || trend.startsWith("↑")
                ? "#10B981"
                : trend.startsWith("-") || trend.startsWith("↓")
                  ? "#EF4444"
                  : "#94A3B8",
            },
          ]}
        >
          {trend}
        </Text>
      )}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          statStyles.card,
          style,
          pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] },
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={[statStyles.card, style]}>{content}</View>;
}

const statStyles = StyleSheet.create({
  card: {
    flex: 1,
    padding: 16,
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  label: { fontSize: 11, fontWeight: "600", color: "#94A3B8", letterSpacing: 0.5 },
  value: { fontSize: 22, fontWeight: "700", marginTop: 4, letterSpacing: -0.5 },
  trend: { fontSize: 12, fontWeight: "600", marginTop: 2 },
});

// ── StatusBadge ──────────────────────────────────────────────

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  // Onboarding
  draft: { bg: "#F1F5F9", text: "#64748B" },
  sent: { bg: "#FEF3C7", text: "#92400E" },
  viewed: { bg: "#DBEAFE", text: "#1E40AF" },
  completed: { bg: "#DCFCE7", text: "#166534" },
  cancelled: { bg: "#FEE2E2", text: "#991B1B" },
  // Deal
  submitted: { bg: "#F1F5F9", text: "#334155" },
  approved: { bg: "#DCFCE7", text: "#166534" },
  rejected: { bg: "#FEE2E2", text: "#991B1B" },
  invoiced: { bg: "#E0E7FF", text: "#3730A3" },
  paid: { bg: "#D1FAE5", text: "#065F46" },
  // Listing
  available: { bg: "#DCFCE7", text: "#166534" },
  showing: { bg: "#DBEAFE", text: "#1E40AF" },
  application: { bg: "#FEF3C7", text: "#92400E" },
  leased: { bg: "#D1FAE5", text: "#065F46" },
  off_market: { bg: "#F1F5F9", text: "#64748B" },
  // Task
  pending: { bg: "#FEF3C7", text: "#92400E" },
  in_progress: { bg: "#DBEAFE", text: "#1E40AF" },
  // Generic
  active: { bg: "#DCFCE7", text: "#166534" },
  inactive: { bg: "#F1F5F9", text: "#64748B" },
};

export function StatusBadge({
  status,
  label,
  size = "sm",
  style,
}: {
  status: string;
  label?: string;
  size?: "xs" | "sm" | "md";
  style?: ViewStyle;
}) {
  const colors = STATUS_COLORS[status] || { bg: "#F1F5F9", text: "#64748B" };
  const displayLabel = label || status.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

  const fontSize = size === "xs" ? 9 : size === "sm" ? 10 : 12;
  const paddingH = size === "xs" ? 6 : size === "sm" ? 8 : 12;
  const paddingV = size === "xs" ? 2 : size === "sm" ? 3 : 5;

  return (
    <View
      style={[
        {
          backgroundColor: colors.bg,
          borderRadius: 6,
          paddingHorizontal: paddingH,
          paddingVertical: paddingV,
          alignSelf: "flex-start",
        },
        style,
      ]}
    >
      <Text
        style={{
          fontSize,
          fontWeight: "700",
          color: colors.text,
          letterSpacing: 0.3,
          textTransform: "uppercase",
        }}
      >
        {displayLabel}
      </Text>
    </View>
  );
}

// ── SectionHeader ────────────────────────────────────────────

export function SectionHeader({
  label,
  style,
}: {
  label: string;
  style?: TextStyle;
}) {
  return (
    <Text
      style={[
        {
          fontSize: 11,
          fontWeight: "600",
          color: "#94A3B8",
          letterSpacing: 1.2,
          marginBottom: 10,
          textTransform: "uppercase",
        },
        style,
      ]}
    >
      {label}
    </Text>
  );
}

// ── HeaderBar (back button + title) ──────────────────────────

export function HeaderBar({
  title,
  onBack,
  right,
  style,
}: {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[headerStyles.bar, style]}>
      {onBack ? (
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onBack();
          }}
          hitSlop={12}
          style={({ pressed }) => [
            headerStyles.backBtn,
            pressed && { opacity: 0.6 },
          ]}
        >
          <Text style={headerStyles.backArrow}>←</Text>
        </Pressable>
      ) : (
        <View style={{ width: 40 }} />
      )}
      <Text style={headerStyles.title} numberOfLines={1}>
        {title}
      </Text>
      {right || <View style={{ width: 40 }} />}
    </View>
  );
}

const headerStyles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: "#fff",
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  backArrow: { fontSize: 22, color: "#0F172A" },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    color: "#0F172A",
    textAlign: "center",
  },
});

// ── ProgressSteps (for resolving screen) ─────────────────────

export function ProgressSteps({
  steps,
  currentStep,
  style,
}: {
  steps: Array<{ label: string; icon?: string }>;
  currentStep: number;
  style?: ViewStyle;
}) {
  return (
    <View style={[progressStyles.container, style]}>
      {steps.map((step, i) => {
        const isComplete = i < currentStep;
        const isCurrent = i === currentStep;

        return (
          <FadeInView key={i} delay={i * 200}>
            <View style={progressStyles.row}>
              <View
                style={[
                  progressStyles.dot,
                  isComplete && progressStyles.dotComplete,
                  isCurrent && progressStyles.dotCurrent,
                ]}
              >
                {isComplete ? (
                  <Text style={progressStyles.check}>✓</Text>
                ) : (
                  <Text style={progressStyles.stepIcon}>
                    {step.icon || String(i + 1)}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  progressStyles.label,
                  isComplete && progressStyles.labelComplete,
                  isCurrent && progressStyles.labelCurrent,
                ]}
              >
                {step.label}
              </Text>
            </View>
          </FadeInView>
        );
      })}
    </View>
  );
}

const progressStyles = StyleSheet.create({
  container: { gap: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 14 },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#E2E8F0",
  },
  dotComplete: { backgroundColor: "#2563EB", borderColor: "#2563EB" },
  dotCurrent: { borderColor: "#2563EB", backgroundColor: "#EFF6FF" },
  check: { color: "#fff", fontSize: 14, fontWeight: "700" },
  stepIcon: { fontSize: 12, fontWeight: "600", color: "#94A3B8" },
  label: { fontSize: 15, color: "#94A3B8", fontWeight: "500" },
  labelComplete: { color: "#0F172A", fontWeight: "600" },
  labelCurrent: { color: "#2563EB", fontWeight: "600" },
});

// ── FadeInView (staggered animation wrapper) ─────────────────

export function FadeInView({
  children,
  delay = 0,
  duration = 400,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  style?: ViewStyle;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    const timeout = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration,
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);

    return () => clearTimeout(timeout);
  }, [delay, duration, opacity, translateY]);

  return (
    <Animated.View
      style={[{ opacity, transform: [{ translateY }] }, style]}
    >
      {children}
    </Animated.View>
  );
}
