// ── CRM Contacts Screen ──────────────────────────────────────
// Full contact list with search, status/type filters, and drill-down.

import { useState, useCallback, useMemo, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  StyleSheet,
  RefreshControl,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { fetchCrmContacts, fetchCrmContactDetail, type CrmContact } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { timeAgo } from "@/lib/format";
import { HeaderBar } from "@/components/ui";
import { COLORS, SPACING, RADIUS, FONT, SHADOW } from "@/lib/theme";
import { ScreenErrorState } from "@/components/error-boundary";
import {
  Search,
  X,
  Phone,
  Mail,
  UserCheck,
  Briefcase,
  ChevronRight,
  Star,
  AlertCircle,
} from "lucide-react-native";

// ── Filters ──────────────────────────────────────────────────

type StatusFilter = "all" | "lead" | "active" | "client" | "past_client" | "archived";

const STATUS_FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "lead", label: "Leads" },
  { key: "active", label: "Active" },
  { key: "client", label: "Clients" },
  { key: "past_client", label: "Past" },
];

const STATUS_COLORS: Record<string, { text: string; bg: string }> = {
  lead: { text: "#2563EB", bg: "#EFF6FF" },
  active: { text: "#10B981", bg: "#F0FDF4" },
  client: { text: "#8B5CF6", bg: "#F5F3FF" },
  past_client: { text: "#64748B", bg: "#F8FAFC" },
  archived: { text: "#94A3B8", bg: "#F1F5F9" },
};

const TYPE_ICONS: Record<string, string> = {
  landlord: "🏢",
  buyer: "🏠",
  seller: "💰",
  renter: "🔑",
};

function initials(first: string, last: string): string {
  return `${(first || "?")[0]}${(last || "?")[0]}`.toUpperCase();
}

function scoreGrade(score: number | null): { letter: string; color: string } | null {
  if (score == null) return null;
  if (score >= 80) return { letter: "A", color: "#10B981" };
  if (score >= 60) return { letter: "B", color: "#3B82F6" };
  if (score >= 40) return { letter: "C", color: "#F59E0B" };
  if (score >= 20) return { letter: "D", color: "#F97316" };
  return { letter: "F", color: "#EF4444" };
}

// ── Main Screen ──────────────────────────────────────────────

export default function CrmContactsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const apiParams = useMemo(
    () => ({
      q: search || undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
      limit: 100,
    }),
    [search, statusFilter]
  );

  const {
    data,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: qk.contacts.list(apiParams),
    queryFn: () => fetchCrmContacts(apiParams),
  });

  const contacts = data?.contacts ?? [];
  const total = data?.total ?? 0;

  // Prefetch contact detail when row becomes visible → instant drill-down
  const prefetchContact = useCallback(
    (id: string) => {
      queryClient.prefetchQuery({
        queryKey: qk.contacts.detail(id),
        queryFn: () => fetchCrmContactDetail(id),
        staleTime: 2 * 60 * 1000, // 2 min
      });
    },
    [queryClient],
  );

  const renderContact = useCallback(
    ({ item }: { item: CrmContact }) => (
      <ContactRow
        contact={item}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/contacts/${item.id}`);
        }}
        onVisible={() => prefetchContact(item.id)}
      />
    ),
    [router, prefetchContact],
  );

  return (
    <View style={styles.container}>
      <HeaderBar title="Contacts" onBack={() => router.back()} />

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Search size={16} color={COLORS.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, email, phone..."
            placeholderTextColor={COLORS.textPlaceholder}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            accessibilityLabel="Search contacts"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
              <X size={16} color={COLORS.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Filter pills */}
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => {
          const active = statusFilter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setStatusFilter(f.key);
              }}
              style={[styles.filterPill, active && styles.filterPillActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Count */}
      <View style={styles.countRow}>
        <Text style={styles.countText}>
          {total} contact{total !== 1 ? "s" : ""}
        </Text>
      </View>

      {/* Contact list */}
      {isError ? (
        <ScreenErrorState message="Couldn't load contacts" onRetry={() => refetch()} />
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(item) => item.id}
          renderItem={renderContact}
          maxToRenderPerBatch={15}
          windowSize={7}
          initialNumToRender={12}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={COLORS.primary}
            />
          }
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            isLoading ? (
              <View>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <View key={i} style={[styles.skeleton, { height: 76, marginBottom: 8 }]} />
                ))}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={{ fontSize: 40, marginBottom: 12 }}>👥</Text>
                <Text style={styles.emptyTitle}>
                  {search ? "No matching contacts" : "No contacts yet"}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {search
                    ? "Try a different search term"
                    : "Contacts from your CRM will appear here"}
                </Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
}

// ── Contact Row ──────────────────────────────────────────────

function ContactRow({
  contact: c,
  onPress,
  onVisible,
}: {
  contact: CrmContact;
  onPress: () => void;
  onVisible?: () => void;
}) {
  // Fire prefetch once when this row first renders (visible in viewport)
  const prefetched = useRef(false);
  if (!prefetched.current && onVisible) {
    prefetched.current = true;
    onVisible();
  }

  const statusStyle = STATUS_COLORS[c.status] || STATUS_COLORS.lead;
  const grade = scoreGrade(c.score);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.contactCard, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`View ${c.name}`}
    >
      <View style={styles.contactHeader}>
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: statusStyle.bg }]}>
          <Text style={[styles.avatarText, { color: statusStyle.text }]}>
            {initials(c.firstName, c.lastName)}
          </Text>
        </View>

        {/* Name + meta */}
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={styles.contactName} numberOfLines={1}>
              {c.name}
            </Text>
            {grade && (
              <View style={[styles.gradeBadge, { backgroundColor: `${grade.color}20` }]}>
                <Text style={[styles.gradeText, { color: grade.color }]}>{grade.letter}</Text>
              </View>
            )}
          </View>
          <Text style={styles.contactMeta} numberOfLines={1}>
            {TYPE_ICONS[c.contactType] || "👤"}{" "}
            {c.contactType.charAt(0).toUpperCase() + c.contactType.slice(1)}
            {c.source ? ` · ${c.source}` : ""}
            {c.lastActivityAt ? ` · ${timeAgo(c.lastActivityAt)}` : ""}
          </Text>
        </View>

        <ChevronRight size={16} color={COLORS.textPlaceholder} />
      </View>

      {/* Tags + stats row */}
      <View style={styles.bottomRow}>
        {/* Status pill */}
        <View style={[styles.statusPill, { backgroundColor: statusStyle.bg }]}>
          <Text style={[styles.statusText, { color: statusStyle.text }]}>
            {c.status === "past_client" ? "Past Client" : c.status.charAt(0).toUpperCase() + c.status.slice(1)}
          </Text>
        </View>

        {/* Deal count */}
        {c.dealCount > 0 && (
          <View style={styles.miniStat}>
            <Briefcase size={11} color={COLORS.textMuted} />
            <Text style={styles.miniStatText}>{c.dealCount}</Text>
          </View>
        )}

        {/* Pending tasks */}
        {c.pendingTasks > 0 && (
          <View style={styles.miniStat}>
            <AlertCircle size={11} color={COLORS.warning} />
            <Text style={[styles.miniStatText, { color: COLORS.warning }]}>
              {c.pendingTasks} task{c.pendingTasks !== 1 ? "s" : ""}
            </Text>
          </View>
        )}

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* Quick actions */}
        {c.phone && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Linking.openURL(`tel:${c.phone}`);
            }}
            style={styles.quickAction}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Call ${c.name}`}
          >
            <Phone size={14} color={COLORS.success} />
          </Pressable>
        )}
        {c.email && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              Linking.openURL(`mailto:${c.email}`);
            }}
            style={styles.quickAction}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={`Email ${c.name}`}
          >
            <Mail size={14} color={COLORS.info} />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },

  // Search
  searchContainer: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    paddingHorizontal: SPACING.md,
    height: 42,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT.size.base,
    color: COLORS.text,
    padding: 0,
  },

  // Filters
  filterRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  filterPill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.bgTertiary,
  },
  filterPillActive: {
    backgroundColor: COLORS.primary,
  },
  filterPillText: {
    fontSize: FONT.size.sm,
    fontWeight: FONT.weight.medium,
    color: COLORS.textSecondary,
  },
  filterPillTextActive: {
    color: COLORS.white,
  },

  // Count
  countRow: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.sm,
  },
  countText: {
    fontSize: FONT.size.sm,
    color: COLORS.textMuted,
  },

  // List
  listContent: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: 40,
  },

  // Contact card
  contactCard: {
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: SPACING.lg,
    marginBottom: 8,
    ...SHADOW.sm,
  },
  contactHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.bold,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  contactName: {
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.semibold,
    color: COLORS.text,
    flexShrink: 1,
  },
  gradeBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  gradeText: {
    fontSize: FONT.size.xs,
    fontWeight: FONT.weight.bold,
  },
  contactMeta: {
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },

  // Bottom row
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusText: {
    fontSize: FONT.size.xs,
    fontWeight: FONT.weight.semibold,
  },
  miniStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  miniStatText: {
    fontSize: FONT.size.xs,
    color: COLORS.textMuted,
  },
  quickAction: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.bgSecondary,
    justifyContent: "center",
    alignItems: "center",
  },

  // Empty + skeleton
  emptyState: {
    padding: 40,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: FONT.size.xl,
    fontWeight: FONT.weight.semibold,
    color: COLORS.text,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: FONT.size.base,
    color: COLORS.textMuted,
    textAlign: "center",
  },
  skeleton: {
    backgroundColor: COLORS.bgTertiary,
    borderRadius: RADIUS.lg,
  },
});
