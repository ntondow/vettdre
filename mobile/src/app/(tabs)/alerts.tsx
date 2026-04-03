// ── Alerts Tab ────────────────────────────────────────────────
// Notification feed: unread at top, older below.
// Derived from SigningAuditLog, Activity, ComplianceDocument, etc.

import { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { fetchNotifications, markNotificationsRead } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { timeAgo } from "@/lib/format";
import { ScreenErrorState } from "@/components/error-boundary";
import type { AppNotification } from "@/types";

const TYPE_ICONS: Record<string, string> = {
  client_signed: "✅",
  client_viewed: "👁",
  new_lead: "🔔",
  deal_approved: "🎉",
  deal_paid: "💰",
  compliance_expiry: "⚠️",
  stage_change: "📊",
  task_overdue: "🕐",
};

function getNotificationRoute(n: AppNotification): string | null {
  switch (n.entityType) {
    case "onboarding":
      return n.entityId ? `/clients/${n.entityId}` : null;
    case "contact":
      return n.entityId ? `/contacts/${n.entityId}` : null;
    case "deal_submission":
      return n.entityId ? `/clients/${n.entityId}` : null;
    case "invoice":
      return "/earnings";
    case "task":
      return null; // tasks are managed inline on the dashboard
    default:
      return null;
  }
}

export default function AlertsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: notifications, isLoading, isError, refetch } = useQuery({
    queryKey: qk.notifications.all,
    queryFn: fetchNotifications,
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const unread = (notifications ?? []).filter((n) => !n.read);
  const read = (notifications ?? []).filter((n) => n.read);

  const handleMarkAllRead = async () => {
    const ids = unread.map((n) => n.id);
    if (ids.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Optimistic: mark all as read in cache immediately
    queryClient.setQueryData(qk.notifications.all, (old: AppNotification[] | undefined) =>
      (old ?? []).map((n) => (ids.includes(n.id) ? { ...n, read: true } : n))
    );
    await markNotificationsRead(ids);
    refetch();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>Alerts</Text>
        {unread.length > 0 && (
          <Pressable onPress={handleMarkAllRead} style={styles.markReadButton}>
            <Text style={styles.markReadText}>Mark all read</Text>
          </Pressable>
        )}
      </View>

      {isError ? (
        <ScreenErrorState message="Couldn't load notifications" onRetry={() => refetch()} />
      ) : isLoading ? (
        [1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.skeleton, { height: 72, marginBottom: 8 }]} />
        ))
      ) : (
        <>
          {unread.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>TODAY</Text>
              {unread.map((n) => (
                <NotificationCard
                  key={n.id}
                  notification={n}
                  isUnread
                  onPress={() => {
                    const route = getNotificationRoute(n);
                    if (route) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push(route);
                    }
                  }}
                />
              ))}
            </>
          )}

          {read.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 8 }]}>EARLIER</Text>
              {read.map((n) => (
                <NotificationCard
                  key={n.id}
                  notification={n}
                  isUnread={false}
                  onPress={() => {
                    const route = getNotificationRoute(n);
                    if (route) {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      router.push(route);
                    }
                  }}
                />
              ))}
            </>
          )}

          {(notifications ?? []).length === 0 && (
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🔔</Text>
              <Text style={styles.emptyText}>No notifications yet</Text>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

function NotificationCard({
  notification: n,
  isUnread,
  onPress,
}: {
  notification: AppNotification;
  isUnread: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        isUnread && styles.cardUnread,
        pressed && onPress && { opacity: 0.85 },
      ]}
    >
      <Text style={styles.cardIcon}>{TYPE_ICONS[n.type] ?? "📌"}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.cardText, isUnread && { color: "#0F172A" }]}>
          {n.body}
        </Text>
        <Text style={styles.cardTime}>
          {timeAgo(n.timestamp)}
        </Text>
      </View>
      {isUnread && <View style={styles.unreadDot} />}
    </Pressable>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingTop: 60 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  title: { fontSize: 24, fontWeight: "700", color: "#0F172A" },
  markReadButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
  },
  markReadText: { fontSize: 13, fontWeight: "500", color: "#64748B" },

  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94A3B8",
    letterSpacing: 1.2,
    marginBottom: 10,
  },

  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#F1F5F9",
    borderRadius: 14,
    marginBottom: 8,
  },
  cardUnread: {
    backgroundColor: "#EFF6FF",
    borderColor: "#DBEAFE",
  },
  cardIcon: { fontSize: 20, marginTop: 1 },
  cardText: { fontSize: 14, fontWeight: "500", color: "#475569" },
  cardTime: { fontSize: 12, color: "#94A3B8", marginTop: 4 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2563EB",
    marginTop: 6,
  },

  emptyState: { padding: 40, alignItems: "center" },
  emptyText: { fontSize: 15, color: "#94A3B8" },

  skeleton: { backgroundColor: "#F1F5F9", borderRadius: 14 },
});
