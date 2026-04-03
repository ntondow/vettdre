// ── Distress Score Card ───────────────────────────────────────
// Renders the risk assessment card with meter and distress signals.

import { View, Text, StyleSheet } from "react-native";
import { COLORS, RADIUS, FONT, SPACING } from "@/lib/theme";

interface DistressCardProps {
  score: number;
  signals?: string[];
}

function getDistressLabel(score: number): { text: string; color: string } {
  if (score >= 70) return { text: "High Distress", color: COLORS.danger };
  if (score >= 40) return { text: "Moderate", color: COLORS.warning };
  if (score >= 15) return { text: "Low Risk", color: COLORS.success };
  return { text: "Stable", color: COLORS.textMuted };
}

export function DistressCard({ score, signals }: DistressCardProps) {
  const distress = getDistressLabel(score);

  return (
    <>
      <View style={styles.card}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Distress Score</Text>
          <Text style={[styles.value, { color: distress.color }]}>
            {score}/100
          </Text>
          <Text style={[styles.label, { color: distress.color }]}>
            {distress.text}
          </Text>
        </View>
        <View style={styles.meter}>
          <View
            style={[
              styles.fill,
              {
                height: `${Math.min(100, score)}%`,
                backgroundColor: distress.color,
              },
            ]}
          />
        </View>
      </View>
      {signals && signals.length > 0 && (
        <View style={styles.signalsList}>
          {signals.slice(0, 4).map((signal, i) => (
            <View key={i} style={styles.signalRow}>
              <Text style={styles.signalDot}>⚠️</Text>
              <Text style={styles.signalText}>{signal}</Text>
            </View>
          ))}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: COLORS.bgSecondary,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
  },
  title: { fontSize: FONT.size.md, color: COLORS.textSecondary, fontWeight: FONT.weight.medium },
  value: { fontSize: FONT.size.hero, fontWeight: FONT.weight.extrabold, letterSpacing: -0.5 },
  label: { fontSize: FONT.size.md, fontWeight: FONT.weight.semibold, marginTop: 2 },
  meter: {
    width: 12,
    height: 60,
    backgroundColor: COLORS.border,
    borderRadius: 6,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  fill: { width: "100%", borderRadius: 6 },
  signalsList: { marginTop: SPACING.md, gap: 6 },
  signalRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  signalDot: { fontSize: 12 },
  signalText: { fontSize: FONT.size.md, color: COLORS.textSecondary, flex: 1 },
});
