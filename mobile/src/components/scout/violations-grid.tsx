// ── Violations Grid ───────────────────────────────────────────
// HPD violation counts in a 4-box grid + complaint summary.
// Tappable — expands to show individual open violations.

import { useState, useCallback } from "react";
import { View, Text, Pressable, StyleSheet, LayoutAnimation, Platform, UIManager } from "react-native";
import { COLORS, RADIUS, FONT, SPACING } from "@/lib/theme";

// Enable LayoutAnimation on Android
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface ViolationSummary {
  total: number;
  open: number;
  classA: number;
  classB: number;
  classC: number;
}

interface ComplaintSummary {
  total: number;
  recent: number;
  topTypes: string[];
}

export interface ViolationItem {
  violationId: string;
  class: string;
  inspectionDate: string;
  approvedDate?: string;
  status: string;
  statusDate?: string;
  novDescription: string;
  currentStatus: string;
  currentStatusDate?: string;
  orderNumber?: string;
}

interface ViolationsGridProps {
  violations: ViolationSummary;
  complaints: ComplaintSummary;
  violationsList?: ViolationItem[];
}

const BOXES: Array<{
  key: keyof ViolationSummary;
  label: string;
  bg: string;
  color: string;
}> = [
  { key: "open", label: "Open", bg: COLORS.dangerBg, color: COLORS.danger },
  { key: "classB", label: "Class B", bg: COLORS.warningBg, color: COLORS.warning },
  { key: "classC", label: "Class C", bg: COLORS.primaryLight, color: COLORS.primary },
  { key: "total", label: "Total", bg: COLORS.bgTertiary, color: COLORS.textSecondary },
];

function getClassColor(cls: string): { bg: string; color: string } {
  switch (cls) {
    case "C": return { bg: COLORS.dangerBg, color: COLORS.danger };
    case "B": return { bg: COLORS.warningBg, color: COLORS.warning };
    case "A": return { bg: COLORS.primaryLight, color: COLORS.primary };
    default: return { bg: COLORS.bgTertiary, color: COLORS.textSecondary };
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

const MAX_VISIBLE = 15;

export function ViolationsGrid({ violations, complaints, violationsList }: ViolationsGridProps) {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // Filter to open violations, sorted by inspection date (newest first)
  const openViolations = (violationsList || [])
    .filter((v) => v.currentStatus === "VIOLATION OPEN" || v.status === "Open")
    .sort((a, b) => {
      const da = a.inspectionDate ? new Date(a.inspectionDate).getTime() : 0;
      const db = b.inspectionDate ? new Date(b.inspectionDate).getTime() : 0;
      return db - da;
    });

  const hasViolations = openViolations.length > 0;
  const displayedViolations = showAll ? openViolations : openViolations.slice(0, MAX_VISIBLE);

  const toggleExpanded = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((prev) => !prev);
  }, []);

  const toggleShowAll = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowAll((prev) => !prev);
  }, []);

  return (
    <>
      <Pressable
        onPress={hasViolations ? toggleExpanded : undefined}
        style={({ pressed }) => [pressed && hasViolations && { opacity: 0.85 }]}
      >
        <View style={styles.grid}>
          {BOXES.map((box) => (
            <View key={box.key} style={[styles.box, { backgroundColor: box.bg }]}>
              <Text style={[styles.count, { color: box.color }]}>
                {violations[box.key]}
              </Text>
              <Text style={styles.label}>{box.label}</Text>
            </View>
          ))}
        </View>

        {hasViolations && (
          <View style={styles.tapHint}>
            <Text style={styles.tapHintText}>
              {expanded ? "Tap to collapse" : `Tap to view ${openViolations.length} open violations`}
            </Text>
            <Text style={styles.chevron}>{expanded ? "▲" : "▼"}</Text>
          </View>
        )}
      </Pressable>

      {/* ── Expanded Violations List ───────────────────────── */}
      {expanded && hasViolations && (
        <View style={styles.listContainer}>
          {displayedViolations.map((v, i) => {
            const cls = getClassColor(v.class);
            return (
              <View key={v.violationId || i} style={styles.violationRow}>
                <View style={styles.violationHeader}>
                  <View style={[styles.classBadge, { backgroundColor: cls.bg }]}>
                    <Text style={[styles.classBadgeText, { color: cls.color }]}>
                      Class {v.class || "?"}
                    </Text>
                  </View>
                  <Text style={styles.violationDate}>
                    {formatDate(v.inspectionDate)}
                  </Text>
                </View>
                <Text style={styles.violationDesc} numberOfLines={3}>
                  {v.novDescription || "No description available"}
                </Text>
                {v.orderNumber ? (
                  <Text style={styles.violationMeta}>
                    Order #{v.orderNumber}
                  </Text>
                ) : null}
              </View>
            );
          })}

          {openViolations.length > MAX_VISIBLE && (
            <Pressable onPress={toggleShowAll} style={styles.showMoreBtn}>
              <Text style={styles.showMoreText}>
                {showAll
                  ? "Show fewer"
                  : `Show all ${openViolations.length} violations`}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      {complaints.total > 0 && (
        <View style={styles.complaintsRow}>
          <Text style={styles.complaintsText}>
            {complaints.total} HPD complaints
            {complaints.recent > 0 ? ` (${complaints.recent} recent)` : ""}
          </Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", gap: SPACING.sm },
  box: {
    flex: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    alignItems: "center",
  },
  count: { fontSize: 20, fontWeight: "800" },
  label: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: "600",
    marginTop: 2,
    textTransform: "uppercase",
  },

  // Tap hint
  tapHint: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: SPACING.sm,
    gap: 6,
  },
  tapHintText: {
    fontSize: FONT.size.sm,
    color: COLORS.primary,
    fontWeight: FONT.weight.medium,
  },
  chevron: {
    fontSize: 10,
    color: COLORS.primary,
  },

  // Violations list
  listContainer: {
    marginTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    paddingTop: SPACING.md,
  },
  violationRow: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  violationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  classBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
  },
  classBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  violationDate: {
    fontSize: FONT.size.xs,
    color: COLORS.textMuted,
    fontWeight: FONT.weight.medium,
  },
  violationDesc: {
    fontSize: FONT.size.md,
    color: COLORS.text,
    lineHeight: 18,
  },
  violationMeta: {
    fontSize: FONT.size.xs,
    color: COLORS.textMuted,
    marginTop: 4,
  },

  // Show more
  showMoreBtn: {
    alignItems: "center",
    paddingVertical: SPACING.md,
  },
  showMoreText: {
    fontSize: FONT.size.md,
    color: COLORS.primary,
    fontWeight: FONT.weight.semibold,
  },

  // Complaints
  complaintsRow: {
    marginTop: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: COLORS.warningBg,
    borderRadius: RADIUS.sm + 2,
  },
  complaintsText: {
    fontSize: FONT.size.md,
    color: COLORS.warningText,
    fontWeight: FONT.weight.medium,
  },
});
