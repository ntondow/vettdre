// ── Dashboard (Home Tab) ──────────────────────────────────────
// Agent command center: earnings snapshot, today's schedule,
// quick actions, recent activity.

import { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  RefreshControl,
  Linking,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/lib/auth-context";
import { fetchEarnings, fetchTodaySchedule, fetchRecentActivity, fetchNotifications, completeTask, snoozeTask } from "@/lib/api";
import type { ActivityItem } from "@/lib/api";
import type { AppNotification } from "@/types";
import { qk } from "@/lib/query-keys";
import { ScreenErrorState } from "@/components/error-boundary";
import { fmtCurrency, timeAgo } from "@/lib/format";
import { COLORS } from "@/lib/theme";
import {
  Search,
  UserPlus,
  Building2,
  Phone,
  MessageSquare,
  Bell,
  DollarSign,
  Users,
  CheckCircle2,
  Clock,
} from "lucide-react-native";
import { SkeletonEarningsCard, SkeletonScheduleItem } from "@/components/skeleton";

// ── Helpers ───────────────────────────────────────────────────

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const ACTIVITY_ICONS: Record<string, string> = {
  email: "📧",
  call: "📞",
  sms: "💬",
  meeting: "🤝",
  note: "📝",
  showing: "🏠",
  deal: "💰",
  system: "⚙️",
  task: "✅",
};

const EVENT_COLORS: Record<string, string> = {
  showing: COLORS.info,
  meeting: "#8B5CF6",
  follow_up: COLORS.warning,
  task: "#8B5CF6",
  call: COLORS.success,
  default: COLORS.textSecondary,
};

// ── Component ─────────────────────────────────────────────────

export default function DashboardScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, agent } = useAuth();
  const firstName = user?.fullName?.split(" ")[0] ?? "Agent";

  // Fetch earnings with React Query — cached for 5 min
  const {
    data: earnings,
    isLoading: earningsLoading,
    isError: earningsError,
    refetch: refetchEarnings,
  } = useQuery({
    queryKey: qk.earnings.byPeriod("month"),
    queryFn: () => fetchEarnings("month"),
  });

  // Fetch today's schedule
  const {
    data: schedule,
    isLoading: scheduleLoading,
    isError: scheduleError,
    refetch: refetchSchedule,
  } = useQuery({
    queryKey: qk.schedule.today,
    queryFn: fetchTodaySchedule,
  });

  // Fetch recent activity
  const {
    data: activityData,
    isLoading: activityLoading,
    isError: activityError,
    refetch: refetchActivity,
  } = useQuery({
    queryKey: qk.activity.recent,
    queryFn: () => fetchRecentActivity(8),
  });

  // Fetch notifications for unread badge count
  const { data: notifications } = useQuery({
    queryKey: qk.notifications.all,
    queryFn: fetchNotifications,
  });
  const unreadCount = useMemo(
    () => (notifications ?? []).filter((n: AppNotification) => !n.read).length,
    [notifications],
  );

  const [refreshing, setRefreshing] = useState(false);

  // Task mutations with optimistic updates — UI responds instantly
  const completeMutation = useMutation({
    mutationFn: (id: string) => completeTask(id),
    onMutate: async (id: string) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await queryClient.cancelQueries({ queryKey: qk.schedule.today });
      const prev = queryClient.getQueryData(qk.schedule.today);
      queryClient.setQueryData(qk.schedule.today, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          tasks: (old.tasks ?? []).filter((t: any) => t.id !== id),
        };
      });
      return { prev };
    },
    onError: (_err, _id, context) => {
      if (context?.prev) queryClient.setQueryData(qk.schedule.today, context.prev);
      Alert.alert("Error", "Could not complete task.");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.schedule.today }),
  });

  const snoozeMutation = useMutation({
    mutationFn: (id: string) => snoozeTask(id, 1),
    onMutate: async (id: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await queryClient.cancelQueries({ queryKey: qk.schedule.today });
      const prev = queryClient.getQueryData(qk.schedule.today);
      queryClient.setQueryData(qk.schedule.today, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          tasks: (old.tasks ?? []).filter((t: any) => t.id !== id),
        };
      });
      return { prev };
    },
    onError: (_err, _id, context) => {
      if (context?.prev) queryClient.setQueryData(qk.schedule.today, context.prev);
      Alert.alert("Error", "Could not snooze task.");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.schedule.today }),
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Promise.all([refetchEarnings(), refetchSchedule(), refetchActivity()]);
    setRefreshing(false);
  }, [refetchEarnings, refetchSchedule, refetchActivity]);

  const quickAction = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route);
  };

  // Merge events + tasks into sorted schedule (memoized to avoid re-compute on every render)
  const todayItems = useMemo(() => [
    ...(schedule?.events ?? []).map((e) => ({
      id: e.id,
      type: e.eventType,
      time: new Date(e.startAt).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }),
      title: e.title,
      color: EVENT_COLORS[e.eventType] ?? EVENT_COLORS.default,
      sortKey: new Date(e.startAt).getTime(),
      location: e.location || e.propertyAddress || null,
      contactPhone: null as string | null,
      isTask: false,
    })),
    ...(schedule?.tasks ?? [])
      .filter((t) => t.dueAt)
      .map((t) => ({
        id: t.id,
        type: t.type,
        time: new Date(t.dueAt!).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        }),
        title: t.title,
        color: EVENT_COLORS[t.type] ?? EVENT_COLORS.default,
        sortKey: new Date(t.dueAt!).getTime(),
        location: null as string | null,
        contactPhone: null as string | null,
        isTask: true,
      })),
  ].sort((a, b) => a.sortKey - b.sortKey), [schedule?.events, schedule?.tasks]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />
      }
    >
      {/* Greeting + notification bell */}
      <View style={styles.header}>
        <Pressable
          onPress={() => quickAction("/settings")}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
        >
          <Text style={styles.greeting}>{getGreeting()},</Text>
          <Text style={styles.name}>{firstName}</Text>
        </Pressable>
        <Pressable
          onPress={() => quickAction("/(tabs)/alerts")}
          style={styles.bellButton}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
        >
          <Bell size={20} color="#64748B" />
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/* Earnings hero card — tappable */}
      <Pressable
        onPress={() => quickAction("/earnings")}
        accessibilityRole="button"
        accessibilityLabel={`Earnings this month: ${fmtCurrency(earnings?.totalEarnings ?? 0)}`}
        style={({ pressed }) => [styles.earningsCard, pressed && styles.pressed]}
      >
        {earningsError ? (
          <View style={styles.inlineError}>
            <Text style={styles.inlineErrorText}>Couldn't load earnings</Text>
            <Pressable onPress={() => refetchEarnings()} style={styles.inlineRetry}>
              <Text style={styles.inlineRetryText}>Retry</Text>
            </Pressable>
          </View>
        ) : earningsLoading ? (
          <SkeletonEarningsCard />
        ) : (
          <>
            <View style={styles.earningsRow}>
              <View>
                <Text style={styles.earningsLabel}>This Month</Text>
                <Text style={styles.earningsAmount}>
                  {fmtCurrency(earnings?.totalEarnings ?? 0)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.earningsLabel}>Pending</Text>
                <Text style={styles.pendingAmount}>
                  {fmtCurrency(earnings?.pendingPayouts ?? 0)}
                </Text>
              </View>
            </View>
            <View style={styles.statsRow}>
              {[
                { label: "Deals", value: String(earnings?.closedDeals ?? 0) },
                { label: "Showings", value: String(todayItems.filter((i) => i.type === "showing").length) },
                { label: "Clients", value: String(earnings?.activeListings ?? 0) },
                { label: "Close Rate", value: earnings?.closeRate ? `${earnings.closeRate}%` : "—" },
              ].map((s) => (
                <View key={s.label} style={styles.statItem}>
                  <Text style={styles.statValue}>{s.value}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </Pressable>

      {/* Quick actions */}
      <View style={styles.quickActions}>
        {[
          { label: "Scout", icon: Search, route: "/(tabs)/scout" },
          { label: "Contacts", icon: Users, route: "/contacts" },
          { label: "Deal", icon: DollarSign, route: "/deals/submit" },
          { label: "Invite", icon: UserPlus, route: "/clients/invite" },
        ].map((action) => (
          <Pressable
            key={action.label}
            onPress={() => quickAction(action.route)}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}
          >
            <action.icon size={24} color="#64748B" />
            <Text style={styles.actionLabel}>{action.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Today's schedule */}
      <Text style={styles.sectionLabel}>TODAY'S SCHEDULE</Text>
      {scheduleError ? (
        <View style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>Couldn't load schedule</Text>
          <Pressable onPress={() => refetchSchedule()} style={styles.inlineRetry}>
            <Text style={styles.inlineRetryText}>Retry</Text>
          </Pressable>
        </View>
      ) : scheduleLoading ? (
        <View style={{ gap: 8 }}>
          {[1, 2, 3].map((i) => (
            <SkeletonScheduleItem key={i} />
          ))}
        </View>
      ) : todayItems.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Nothing scheduled today</Text>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          {todayItems.map((item) => (
            <View key={item.id} style={styles.scheduleItem}>
              <View style={[styles.scheduleBar, { backgroundColor: item.color }]} />
              <View style={styles.scheduleContent}>
                <Text style={styles.scheduleTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.scheduleTime}>{item.time}</Text>
                  {"location" in item && item.location && (
                    <Text style={styles.scheduleLocation} numberOfLines={1}>
                      · {item.location}
                    </Text>
                  )}
                </View>
              </View>
              {item.isTask ? (
                <View style={styles.scheduleActions}>
                  <Pressable
                    style={[styles.miniAction, styles.miniActionSuccess]}
                    onPress={() => completeMutation.mutate(item.id)}
                    disabled={completeMutation.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={`Complete task: ${item.title}`}
                  >
                    <CheckCircle2 size={15} color={COLORS.success} />
                  </Pressable>
                  <Pressable
                    style={styles.miniAction}
                    onPress={() => snoozeMutation.mutate(item.id)}
                    disabled={snoozeMutation.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={`Snooze task: ${item.title}`}
                  >
                    <Clock size={14} color={COLORS.warning} />
                  </Pressable>
                </View>
              ) : (item.type === "showing" || item.type === "meeting") ? (
                <View style={styles.scheduleActions}>
                  <Pressable
                    style={styles.miniAction}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      if (item.contactPhone) Linking.openURL(`sms:${item.contactPhone}`);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Send text message"
                  >
                    <MessageSquare size={14} color={COLORS.success} />
                  </Pressable>
                  <Pressable
                    style={styles.miniAction}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      if (item.contactPhone) Linking.openURL(`tel:${item.contactPhone}`);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Call contact"
                  >
                    <Phone size={14} color={COLORS.info} />
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      )}

      {/* Recent Activity */}
      <Text style={[styles.sectionLabel, { marginTop: 16 }]}>RECENT ACTIVITY</Text>
      {activityError ? (
        <View style={styles.inlineError}>
          <Text style={styles.inlineErrorText}>Couldn't load activity</Text>
          <Pressable onPress={() => refetchActivity()} style={styles.inlineRetry}>
            <Text style={styles.inlineRetryText}>Retry</Text>
          </Pressable>
        </View>
      ) : activityLoading ? (
        <View style={{ gap: 8 }}>
          {[1, 2, 3].map((i) => (
            <View key={i} style={[styles.activitySkeleton, { opacity: 1 - i * 0.2 }]} />
          ))}
        </View>
      ) : (activityData?.activities ?? []).length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No recent activity</Text>
        </View>
      ) : (
        <View style={{ gap: 6 }}>
          {(activityData?.activities ?? []).map((a: ActivityItem) => (
            <Pressable
              key={a.id}
              style={styles.activityRow}
              onPress={
                a.contactId
                  ? () => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push(`/contacts/${a.contactId}`);
                    }
                  : undefined
              }
            >
              <View style={styles.activityIcon}>
                <Text style={{ fontSize: 13 }}>
                  {ACTIVITY_ICONS[a.type] || "📌"}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.activityTitle} numberOfLines={1}>
                  {a.subject || a.type.replace("_", " ")}
                  {a.isAi ? " 🤖" : ""}
                </Text>
                {a.contactName && (
                  <Text style={styles.activityMeta} numberOfLines={1}>
                    {a.contactName}
                    {a.dealValue ? ` · $${a.dealValue.toLocaleString()}` : ""}
                  </Text>
                )}
              </View>
              <Text style={styles.activityTime}>
                {timeAgo(a.occurredAt)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Spacer for tab bar */}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

// (useState and Bell imported at top)

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FFFFFF" },
  content: { padding: 20, paddingTop: 60 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  greeting: { fontSize: 14, color: "#94A3B8" },
  name: { fontSize: 26, fontWeight: "700", color: "#0F172A", letterSpacing: -0.5 },
  bellButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    justifyContent: "center",
    alignItems: "center",
  },
  badge: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  badgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },

  // Earnings card
  earningsCard: {
    backgroundColor: "#0F172A",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
  },
  earningsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  earningsLabel: { fontSize: 12, color: "#94A3B8" },
  earningsAmount: {
    fontSize: 36,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: -1,
  },
  pendingAmount: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FBBF24",
    marginTop: 4,
  },
  statsRow: { flexDirection: "row", gap: 6, marginTop: 14 },
  statItem: {
    flex: 1,
    padding: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 10,
    alignItems: "center",
  },
  statValue: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  statLabel: { fontSize: 10, color: "#94A3B8", marginTop: 2 },

  // Quick actions
  quickActions: { flexDirection: "row", gap: 10, marginBottom: 24 },
  actionButton: {
    flex: 1,
    padding: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    alignItems: "center",
    gap: 6,
  },
  actionLabel: { fontSize: 11, fontWeight: "500", color: "#64748B" },

  // Section label
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94A3B8",
    letterSpacing: 1.2,
    marginBottom: 10,
  },

  // Schedule
  scheduleItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#F1F5F9",
    borderRadius: 12,
    gap: 12,
  },
  scheduleBar: { width: 4, height: 36, borderRadius: 2 },
  scheduleContent: { flex: 1 },
  scheduleTitle: { fontSize: 14, fontWeight: "500", color: "#0F172A" },
  scheduleTime: { fontSize: 12, color: "#94A3B8", marginTop: 2 },
  scheduleLocation: { fontSize: 12, color: "#CBD5E1", flex: 1 },
  scheduleActions: { flexDirection: "row", gap: 6 },
  miniAction: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
  },
  miniActionSuccess: {
    backgroundColor: COLORS.successBg,
  },

  // Empty state
  emptyState: {
    padding: 24,
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    alignItems: "center",
  },
  emptyText: { fontSize: 14, color: "#94A3B8" },

  // Activity feed
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#F1F5F9",
    borderRadius: 10,
  },
  activityIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
  },
  activityTitle: {
    fontSize: 13,
    fontWeight: "500",
    color: "#0F172A",
  },
  activityMeta: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 1,
  },
  activityTime: {
    fontSize: 10,
    color: "#CBD5E1",
  },
  activitySkeleton: {
    height: 48,
    backgroundColor: "#F1F5F9",
    borderRadius: 10,
  },

  // Inline error
  inlineError: {
    padding: 20,
    backgroundColor: "#FEF2F2",
    borderRadius: 14,
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  inlineErrorText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#DC2626",
  },
  inlineRetry: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  inlineRetryText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#DC2626",
  },
});
