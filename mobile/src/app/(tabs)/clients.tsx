// ── Clients Tab ───────────────────────────────────────────────
// Client registration hub: invite list, status cards, quick invite button.
// Includes search + status filter.

import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ScrollView,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { fetchClients } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { COLORS, SPACING, RADIUS, FONT } from "@/lib/theme";
import { getStatusStyle } from "@/lib/theme";
import { Plus, Search, X } from "lucide-react-native";
import { ScreenErrorState } from "@/components/error-boundary";
import type { ClientOnboarding, OnboardingStatus } from "@/types";

// Client-specific label overrides (onboarding context differs from generic status labels)
const CLIENT_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending: "Pending",
  partially_signed: "In Progress",
  completed: "Signed",
  voided: "Voided",
  expired: "Expired",
  // Legacy values in case data has old statuses
  sent: "Pending",
  viewed: "In Progress",
  cancelled: "Cancelled",
};

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "active", label: "In Progress" },
  { key: "completed", label: "Signed" },
  { key: "expired", label: "Expired" },
] as const;

type FilterKey = (typeof STATUS_FILTERS)[number]["key"];

function clientName(c: ClientOnboarding): string {
  return `${c.clientFirstName} ${c.clientLastName}`;
}

function clientInitials(c: ClientOnboarding): string {
  return `${(c.clientFirstName || "?")[0]}${(c.clientLastName || "?")[0]}`;
}

function matchesFilter(c: ClientOnboarding, filter: FilterKey): boolean {
  if (filter === "all") return true;
  if (filter === "pending")
    return ["draft", "pending"].includes(c.status);
  if (filter === "active")
    return c.status === "partially_signed";
  if (filter === "completed") return c.status === "completed";
  if (filter === "expired")
    return ["expired", "voided"].includes(c.status);
  return true;
}

export default function ClientsScreen() {
  const router = useRouter();
  const {
    data: clients,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: qk.clients.all,
    queryFn: fetchClients,
  });

  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  // Filtered + searched client list
  const filteredClients = useMemo(() => {
    const list = clients ?? [];
    const q = searchQuery.toLowerCase().trim();
    return list.filter((c) => {
      if (!matchesFilter(c, activeFilter)) return false;
      if (q) {
        const name = clientName(c).toLowerCase();
        const email = (c.clientEmail || "").toLowerCase();
        return name.includes(q) || email.includes(q);
      }
      return true;
    });
  }, [clients, searchQuery, activeFilter]);

  const completed = (clients ?? []).filter(
    (c) => c.status === "completed"
  ).length;
  const pending = (clients ?? []).filter(
    (c) =>
      c.status === "pending" || c.status === "draft"
  ).length;
  const expired = (clients ?? []).filter(
    (c) =>
      c.status === "expired" ||
      c.status === "voided"
  ).length;

  const renderClient = useCallback(
    ({ item: c }: { item: ClientOnboarding }) => (
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/clients/${c.id}`);
        }}
        style={({ pressed }) => [
          styles.clientCard,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.clientRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{clientInitials(c)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.clientName}>{clientName(c)}</Text>
            <Text style={styles.clientEmail}>{c.clientEmail}</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: `${getStatusStyle(c.status).color}18` },
            ]}
          >
            <Text
              style={[
                styles.statusText,
                { color: getStatusStyle(c.status).color },
              ]}
            >
              {CLIENT_STATUS_LABELS[c.status] || c.status}
            </Text>
          </View>
        </View>

        {/* Doc progress bar */}
        {c.documents && c.documents.length > 0 && (
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${(c.documents.filter((d) => d.status === "signed").length / c.documents.length) * 100}%`,
                    backgroundColor: c.allDocsSigned ? COLORS.success : COLORS.primary,
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {c.documents.filter((d) => d.status === "signed").length}/
              {c.documents.length} docs
            </Text>
          </View>
        )}
      </Pressable>
    ),
    [router],
  );

  const listHeader = useMemo(
    () => (
      <>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Clients</Text>
            <Text style={styles.subtitle}>
              {(clients ?? []).length} total · {completed} signed · {pending}{" "}
              pending
            </Text>
          </View>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push("/clients/invite");
            }}
            style={styles.inviteButton}
          >
            <Plus size={16} color="#fff" />
            <Text style={styles.inviteButtonText}>Invite</Text>
          </Pressable>
        </View>

        {/* Search bar */}
        <View style={styles.searchBar}>
          <Search size={16} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search clients..."
            placeholderTextColor={COLORS.textPlaceholder}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
              <X size={16} color={COLORS.textMuted} />
            </Pressable>
          )}
        </View>

        {/* Status filter pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterRow}
        >
          {STATUS_FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveFilter(f.key);
              }}
              style={[
                styles.filterPill,
                activeFilter === f.key && styles.filterPillActive,
              ]}
            >
              <Text
                style={[
                  styles.filterPillText,
                  activeFilter === f.key && styles.filterPillTextActive,
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Status summary */}
        <View style={styles.summaryRow}>
          {[
            { label: "Pending", count: pending, color: COLORS.warning, bg: COLORS.warningBg },
            { label: "Signed", count: completed, color: COLORS.success, bg: COLORS.successBg },
            { label: "Expired", count: expired, color: COLORS.textMuted, bg: COLORS.bgSecondary },
          ].map((s) => (
            <View
              key={s.label}
              style={[styles.summaryCard, { backgroundColor: s.bg }]}
            >
              <Text style={[styles.summaryCount, { color: s.color }]}>
                {s.count}
              </Text>
              <Text style={styles.summaryLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      </>
    ),
    [clients, completed, pending, expired, searchQuery, activeFilter, router, setSearchQuery, setActiveFilter],
  );

  return (
    <View style={styles.container}>
      {isError ? (
        <ScreenErrorState
          message="Couldn't load clients"
          onRetry={() => refetch()}
        />
      ) : (
        <FlatList
          data={filteredClients}
          keyExtractor={(item) => item.id}
          renderItem={renderClient}
          ListHeaderComponent={listHeader}
          maxToRenderPerBatch={12}
          windowSize={7}
          initialNumToRender={10}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            isLoading ? (
              <View>
                {[1, 2, 3].map((i) => (
                  <View key={i} style={[styles.skeleton, { height: 90, marginBottom: 10 }]} />
                ))}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>
                  {searchQuery || activeFilter !== "all"
                    ? "No clients match your filters"
                    : "No clients yet — invite your first one"}
                </Text>
              </View>
            )
          }
          ListFooterComponent={<View style={{ height: 40 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  listContent: { paddingHorizontal: SPACING.xl, paddingTop: 60, paddingBottom: 40 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT.size.title,
    fontWeight: FONT.weight.bold,
    color: COLORS.text,
  },
  subtitle: { fontSize: FONT.size.base, color: COLORS.textMuted, marginTop: 2 },
  inviteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 10,
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md,
  },
  inviteButtonText: {
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.semibold,
    color: COLORS.white,
  },

  // Search
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.md,
    height: 44,
    marginBottom: SPACING.md,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT.size.base,
    color: COLORS.text,
    paddingVertical: 0,
  },

  // Filter pills
  filterScroll: { marginBottom: SPACING.lg },
  filterRow: { gap: SPACING.sm },
  filterPill: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  filterPillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterPillText: {
    fontSize: FONT.size.sm,
    fontWeight: FONT.weight.medium,
    color: COLORS.textSecondary,
  },
  filterPillTextActive: {
    color: COLORS.white,
  },

  summaryRow: { flexDirection: "row", gap: 8, marginBottom: SPACING.xl },
  summaryCard: {
    flex: 1,
    padding: 14,
    borderRadius: RADIUS.lg,
    alignItems: "center",
  },
  summaryCount: { fontSize: FONT.size.title, fontWeight: FONT.weight.bold },
  summaryLabel: {
    fontSize: FONT.size.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  clientCard: {
    padding: SPACING.lg,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: RADIUS.lg,
    marginBottom: 10,
  },
  clientRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.bgTertiary,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: FONT.size.xl,
    fontWeight: FONT.weight.semibold,
    color: COLORS.textSecondary,
  },
  clientName: {
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.semibold,
    color: COLORS.text,
  },
  clientEmail: {
    fontSize: FONT.size.md,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  statusText: { fontSize: FONT.size.xs, fontWeight: FONT.weight.semibold },

  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: COLORS.bgTertiary,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 2 },
  progressText: { fontSize: FONT.size.xs, color: COLORS.textMuted },

  // Empty + skeleton
  emptyState: {
    padding: 32,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: RADIUS.lg,
    alignItems: "center",
  },
  emptyText: { fontSize: FONT.size.base, color: COLORS.textMuted, textAlign: "center" },
  skeleton: { backgroundColor: COLORS.bgTertiary, borderRadius: RADIUS.lg },
});
