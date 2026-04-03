// ── Earnings Detail Screen ────────────────────────────────────
// Full earnings breakdown with period toggle and recent deal history.

import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { fetchEarnings } from "@/lib/api";
import {
  HeaderBar,
  StatCard,
  SectionHeader,
  FadeInView,
  Skeleton,
} from "@/components/ui";
import { ScreenErrorState } from "@/components/error-boundary";
import { qk } from "@/lib/query-keys";
import { fmtCurrency, fmtDate, fmtPct } from "@/lib/format";
import { COLORS } from "@/lib/theme";
import type { EarningsPeriod, RecentPayment } from "@/types";

const PERIODS: Array<{ key: EarningsPeriod; label: string }> = [
  { key: "month", label: "This Month" },
  { key: "quarter", label: "Quarter" },
  { key: "year", label: "Year" },
];

export default function EarningsScreen() {
  const router = useRouter();
  const [period, setPeriod] = useState<EarningsPeriod>("month");

  const {
    data: earnings,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: qk.earnings.byPeriod(period),
    queryFn: () => fetchEarnings(period),
  });

  const switchPeriod = (p: EarningsPeriod) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPeriod(p);
  };

  return (
    <View style={styles.container}>
      <HeaderBar title="Earnings" onBack={() => router.back()} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
      >
        {/* ── Period Toggle ──────────────────────────────── */}
        <View style={styles.periodRow}>
          {PERIODS.map((p) => (
            <Pressable
              key={p.key}
              onPress={() => switchPeriod(p.key)}
              style={[
                styles.periodBtn,
                period === p.key && styles.periodBtnActive,
              ]}
            >
              <Text
                style={[
                  styles.periodBtnText,
                  period === p.key && styles.periodBtnTextActive,
                ]}
              >
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {isError ? (
          <ScreenErrorState message="Couldn't load earnings" onRetry={() => refetch()} />
        ) : isLoading ? (
          <View style={styles.loadingState}>
            <Skeleton width="100%" height={120} radius={20} />
            <View style={{ height: 16 }} />
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Skeleton width="48%" height={80} radius={14} />
              <Skeleton width="48%" height={80} radius={14} />
            </View>
          </View>
        ) : (
          <>
            {/* ── Hero Card ──────────────────────────────── */}
            <FadeInView delay={0}>
              <View style={styles.heroCard}>
                <Text style={styles.heroLabel}>Total Earnings</Text>
                <Text style={styles.heroValue}>
                  {fmtCurrency(earnings?.totalEarnings ?? 0)}
                </Text>
                {earnings?.trend != null && (
                  <View style={styles.trendRow}>
                    <Text
                      style={[
                        styles.trendText,
                        {
                          color:
                            earnings.trend >= 0
                              ? COLORS.success
                              : COLORS.danger,
                        },
                      ]}
                    >
                      {earnings.trend >= 0 ? "↑" : "↓"}{" "}
                      {Math.abs(earnings.trend)}% vs last period
                    </Text>
                  </View>
                )}
              </View>
            </FadeInView>

            {/* ── Stats Grid ─────────────────────────────── */}
            <FadeInView delay={100}>
              <View style={styles.statsGrid}>
                <StatCard
                  label="PENDING"
                  value={fmtCurrency(earnings?.pendingPayouts ?? 0)}
                  color={COLORS.warning}
                />
                <StatCard
                  label="DEALS CLOSED"
                  value={String(earnings?.closedDeals ?? 0)}
                  color={COLORS.primary}
                />
              </View>
              <View style={styles.statsGrid}>
                <StatCard
                  label="ACTIVE LISTINGS"
                  value={String(earnings?.activeListings ?? 0)}
                  color={COLORS.success}
                />
                <StatCard
                  label="CLOSE RATE"
                  value={fmtPct(earnings?.closeRate ?? 0)}
                  color="#8B5CF6"
                />
              </View>
            </FadeInView>

            {/* ── Recent Payments ─────────────────────────── */}
            {(earnings?.recentPayments?.length ?? 0) > 0 && (
              <FadeInView delay={200}>
                <View style={styles.section}>
                  <SectionHeader label="Recent Payments" />
                  {earnings!.recentPayments.map(
                    (payment: RecentPayment, i: number) => (
                      <View key={payment.id || i} style={styles.paymentRow}>
                        <View style={styles.paymentIcon}>
                          <Text style={styles.paymentIconText}>💰</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.paymentProperty}>
                            {payment.property}
                          </Text>
                          <Text style={styles.paymentMeta}>
                            {payment.method || "Payment"}
                            {payment.invoiceNumber
                              ? ` · #${payment.invoiceNumber}`
                              : ""}
                          </Text>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text style={styles.paymentAmount}>
                            {fmtCurrency(payment.amount)}
                          </Text>
                          {payment.date && (
                            <Text style={styles.paymentDate}>
                              {fmtDate(payment.date)}
                            </Text>
                          )}
                        </View>
                      </View>
                    )
                  )}
                </View>
              </FadeInView>
            )}

            {/* Empty state for no earnings */}
            {!earnings?.totalEarnings &&
              !(earnings?.recentPayments?.length) && (
                <FadeInView delay={200}>
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyEmoji}>📊</Text>
                    <Text style={styles.emptyTitle}>No earnings yet</Text>
                    <Text style={styles.emptyDesc}>
                      Close deals and track commissions to see your earnings
                      here.
                    </Text>
                  </View>
                </FadeInView>
              )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  scroll: { flex: 1 },
  scrollContent: { padding: 20 },
  loadingState: { marginTop: 12 },

  // Period toggle
  periodRow: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  periodBtnActive: { backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  periodBtnText: { fontSize: 14, fontWeight: "600", color: "#64748B" },
  periodBtnTextActive: { color: "#0F172A" },

  // Hero
  heroCard: {
    backgroundColor: "#0F172A",
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    marginBottom: 16,
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.5)",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  heroValue: {
    fontSize: 36,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -1,
    marginTop: 4,
  },
  trendRow: { marginTop: 8 },
  trendText: { fontSize: 13, fontWeight: "600" },

  // Stats
  statsGrid: { flexDirection: "row", gap: 12, marginBottom: 12 },

  // Section
  section: { marginTop: 8 },

  // Payments
  paymentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  paymentIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#FEF3C7",
    justifyContent: "center",
    alignItems: "center",
  },
  paymentIconText: { fontSize: 18 },
  paymentProperty: { fontSize: 14, fontWeight: "600", color: "#0F172A" },
  paymentMeta: { fontSize: 12, color: "#94A3B8", marginTop: 1 },
  paymentAmount: { fontSize: 15, fontWeight: "700", color: "#0F172A" },
  paymentDate: { fontSize: 11, color: "#94A3B8", marginTop: 2 },

  // Empty
  emptyState: { alignItems: "center", paddingVertical: 48 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: "#0F172A", marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: "#64748B", textAlign: "center", lineHeight: 21 },
});
