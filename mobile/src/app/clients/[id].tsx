// ── Client Detail Screen ──────────────────────────────────────
// Shows onboarding status, document progress, timeline, and actions.
// Supports: resend, void, delete, archive, PDF share/download.

import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  RefreshControl,
  Alert,
  Linking,
  Share,
  ActionSheetIOS,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchClientDetail,
  resendInvite,
  voidOnboarding,
  deleteOnboarding,
  archiveOnboarding,
} from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { timeAgo } from "@/lib/format";
import {
  HeaderBar,
  StatusBadge,
  SectionHeader,
  FadeInView,
  Skeleton,
} from "@/components/ui";
import { COLORS, RADIUS, FONT, SPACING } from "@/lib/theme";

function clientInitials(first: string, last: string): string {
  return `${(first || "?")[0]}${(last || "?")[0]}`.toUpperCase();
}

export default function ClientDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [isResending, setIsResending] = useState(false);
  const [isActing, setIsActing] = useState(false);

  const {
    data: client,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: qk.clients.detail(id!),
    queryFn: () => fetchClientDetail(id!),
    enabled: !!id,
  });

  const handleResend = async () => {
    if (!id || isResending) return;
    setIsResending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await resendInvite(id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Sent", "Invite resent successfully.");
      refetch();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to resend.");
    } finally {
      setIsResending(false);
    }
  };

  const handleVoid = () => {
    Alert.alert(
      "Void Onboarding",
      "This will cancel the onboarding and prevent the client from signing. Are you sure?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Void",
          style: "destructive",
          onPress: async () => {
            setIsActing(true);
            try {
              await voidOnboarding(id!);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              queryClient.invalidateQueries({ queryKey: qk.clients.all });
              refetch();
            } catch (err: any) {
              Alert.alert("Error", err.message || "Failed to void.");
            } finally {
              setIsActing(false);
            }
          },
        },
      ]
    );
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Onboarding",
      "This will permanently delete this onboarding and all associated documents. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setIsActing(true);
            try {
              await deleteOnboarding(id!);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              queryClient.invalidateQueries({ queryKey: qk.clients.all });
              router.back();
            } catch (err: any) {
              Alert.alert("Error", err.message || "Failed to delete.");
              setIsActing(false);
            }
          },
        },
      ]
    );
  };

  const handleArchive = async () => {
    setIsActing(true);
    try {
      await archiveOnboarding(id!);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: qk.clients.all });
      refetch();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to archive.");
    } finally {
      setIsActing(false);
    }
  };

  const handleSharePdf = async (doc: any) => {
    if (!doc.pdfUrl) {
      Alert.alert("Unavailable", "This document hasn't been generated yet.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Share.share({
        url: doc.pdfUrl,
        message: `${doc.docType} — ${client?.clientFirstName} ${client?.clientLastName}`,
      });
    } catch {}
  };

  const handleCall = () => {
    if (client?.clientPhone) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Linking.openURL(`tel:${client.clientPhone}`);
    }
  };

  const handleEmail = () => {
    if (client?.clientEmail) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      Linking.openURL(`mailto:${client.clientEmail}`);
    }
  };

  const showActions = () => {
    if (!client) return;

    const options: string[] = [];
    const actions: (() => void)[] = [];

    const canVoid = ["draft", "pending", "partially_signed"].includes(client.status);
    const canArchive = ["completed", "voided", "expired"].includes(client.status);

    if (canVoid) {
      options.push("Void Onboarding");
      actions.push(handleVoid);
    }
    if (canArchive) {
      options.push("Archive");
      actions.push(handleArchive);
    }
    options.push("Delete");
    actions.push(handleDelete);
    options.push("Cancel");

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          destructiveButtonIndex: options.indexOf("Delete"),
          cancelButtonIndex: options.length - 1,
        },
        (idx) => {
          if (idx < actions.length) actions[idx]();
        }
      );
    } else {
      // Android: use Alert with buttons
      const buttons = actions.map((action, i) => ({
        text: options[i],
        onPress: action,
        style: options[i] === "Delete" ? ("destructive" as const) : ("default" as const),
      }));
      buttons.push({ text: "Cancel", onPress: () => {}, style: "cancel" as const });
      Alert.alert("Actions", undefined, buttons);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <HeaderBar title="Client" onBack={() => router.back()} />
        <View style={styles.loadingContent}>
          <Skeleton width="60%" height={20} />
          <View style={{ height: 12 }} />
          <Skeleton width="40%" height={14} />
          <View style={{ height: 24 }} />
          <Skeleton width="100%" height={80} radius={16} />
          <View style={{ height: 12 }} />
          <Skeleton width="100%" height={80} radius={16} />
        </View>
      </View>
    );
  }

  if (!client) {
    return (
      <View style={styles.container}>
        <HeaderBar title="Client" onBack={() => router.back()} />
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Client not found</Text>
        </View>
      </View>
    );
  }

  const docs = client.documents || [];
  const signedCount = docs.filter((d: any) => d.status === "signed").length;
  const totalDocs = docs.length;
  const progress = totalDocs > 0 ? signedCount / totalDocs : 0;
  const isCompleted = client.status === "completed";
  const isVoided = client.status === "voided";

  return (
    <View style={styles.container}>
      <HeaderBar
        title={`${client.clientFirstName} ${client.clientLastName}`}
        onBack={() => router.back()}
        right={
          <Pressable onPress={showActions} hitSlop={12} disabled={isActing}>
            <Text style={{ fontSize: 22 }}>···</Text>
          </Pressable>
        }
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} />
        }
      >
        {/* ── Client Card ─────────────────────────────────── */}
        <FadeInView delay={0}>
          <View style={styles.clientCard}>
            <View style={styles.avatarRow}>
              <View style={[styles.avatar, isVoided && { backgroundColor: COLORS.danger }]}>
                <Text style={styles.avatarText}>
                  {clientInitials(client.clientFirstName, client.clientLastName)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.clientName}>
                  {client.clientFirstName} {client.clientLastName}
                </Text>
                {client.clientEmail && (
                  <Text style={styles.clientEmail}>{client.clientEmail}</Text>
                )}
                {client.clientPhone && (
                  <Text style={styles.clientPhone}>{client.clientPhone}</Text>
                )}
              </View>
              <StatusBadge status={client.status} />
            </View>

            {client.propertyAddress && (
              <View style={styles.propertyRow}>
                <Text style={styles.propertyIcon}>🏢</Text>
                <Text style={styles.propertyText}>{client.propertyAddress}</Text>
              </View>
            )}

            {/* Client details when completed */}
            {isCompleted && (
              <View style={styles.detailsSection}>
                {client.dealType && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Deal Type</Text>
                    <Text style={styles.detailValue}>{client.dealType}</Text>
                  </View>
                )}
                {client.commissionPct && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Commission</Text>
                    <Text style={styles.detailValue}>{client.commissionPct}%</Text>
                  </View>
                )}
                {client.commissionFlat && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Flat Fee</Text>
                    <Text style={styles.detailValue}>${client.commissionFlat.toLocaleString()}</Text>
                  </View>
                )}
                {client.monthlyRent && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Monthly Rent</Text>
                    <Text style={styles.detailValue}>${client.monthlyRent.toLocaleString()}</Text>
                  </View>
                )}
                {client.exclusiveType && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Exclusive</Text>
                    <Text style={styles.detailValue}>{client.exclusiveType}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Quick actions */}
            <View style={styles.quickActions}>
              {client.clientPhone && (
                <Pressable
                  onPress={handleCall}
                  style={({ pressed }) => [styles.quickBtn, pressed && { opacity: 0.8 }]}
                >
                  <Text style={styles.quickBtnText}>📞 Call</Text>
                </Pressable>
              )}
              {client.clientEmail && (
                <Pressable
                  onPress={handleEmail}
                  style={({ pressed }) => [styles.quickBtn, pressed && { opacity: 0.8 }]}
                >
                  <Text style={styles.quickBtnText}>✉️ Email</Text>
                </Pressable>
              )}
              {!isCompleted && !isVoided && (
                <Pressable
                  onPress={handleResend}
                  disabled={isResending}
                  style={({ pressed }) => [
                    styles.quickBtn,
                    isResending && { opacity: 0.4 },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text style={styles.quickBtnText}>
                    {isResending ? "Sending..." : "🔄 Resend"}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </FadeInView>

        {/* ── Document Progress ────────────────────────────── */}
        <FadeInView delay={100}>
          <View style={styles.section}>
            <SectionHeader label="Documents" />
            <View style={styles.progressCard}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>
                  {signedCount} of {totalDocs} signed
                </Text>
                <Text style={styles.progressPct}>
                  {Math.round(progress * 100)}%
                </Text>
              </View>
              <View style={styles.progressBar}>
                <View
                  style={[styles.progressFill, { width: `${progress * 100}%` as any }]}
                />
              </View>
            </View>

            {docs.map((doc: any, i: number) => (
              <Pressable
                key={doc.id || i}
                onPress={() => doc.pdfUrl ? handleSharePdf(doc) : undefined}
                style={({ pressed }) => [
                  styles.docRow,
                  pressed && doc.pdfUrl && { backgroundColor: COLORS.bgTertiary },
                ]}
              >
                <View
                  style={[
                    styles.docIcon,
                    doc.status === "signed" && styles.docIconSigned,
                  ]}
                >
                  <Text style={styles.docIconText}>
                    {doc.status === "signed" ? "✓" : "📄"}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docTitle}>
                    {doc.title || doc.docType || `Document ${i + 1}`}
                  </Text>
                  {doc.signedAt && (
                    <Text style={styles.docDate}>
                      Signed {timeAgo(doc.signedAt)}
                    </Text>
                  )}
                </View>
                {doc.pdfUrl && doc.status === "signed" ? (
                  <View style={styles.pdfBadge}>
                    <Text style={styles.pdfBadgeText}>PDF ↗</Text>
                  </View>
                ) : (
                  <StatusBadge status={doc.status} size="xs" />
                )}
              </Pressable>
            ))}
          </View>
        </FadeInView>

        {/* ── Timeline ────────────────────────────────────── */}
        <FadeInView delay={200}>
          <View style={styles.section}>
            <SectionHeader label="Timeline" />
            {(client.auditLogs || []).length > 0
              ? (client.auditLogs || []).map((log: any, i: number) => (
                  <View key={log.id || i} style={styles.timelineRow}>
                    <View style={styles.timelineDot}>
                      <Text style={{ fontSize: 14 }}>
                        {log.action === "signed" ? "✍️" :
                         log.action === "voided" ? "⛔" :
                         log.action === "sent" || log.action === "resent" ? "📤" :
                         log.action === "created" ? "📝" :
                         log.action === "completed" ? "✅" :
                         log.action === "viewed" ? "👁" :
                         "📋"}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.timelineText}>
                        {log.action.charAt(0).toUpperCase() + log.action.slice(1).replace(/_/g, " ")}
                      </Text>
                      <Text style={styles.timelineTime}>
                        {timeAgo(log.createdAt)}
                      </Text>
                    </View>
                  </View>
                ))
              : [
                  client.completedAt && {
                    icon: "✅",
                    text: "All documents completed",
                    time: timeAgo(client.completedAt),
                  },
                  client.sentAt && {
                    icon: "📤",
                    text: `Invite sent via ${client.sentVia || "email"}`,
                    time: timeAgo(client.sentAt),
                  },
                  {
                    icon: "📝",
                    text: "Onboarding created",
                    time: timeAgo(client.createdAt),
                  },
                ]
                  .filter(Boolean)
                  .map((event: any, i) => (
                    <View key={i} style={styles.timelineRow}>
                      <View style={styles.timelineDot}>
                        <Text style={{ fontSize: 14 }}>{event.icon}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.timelineText}>{event.text}</Text>
                        <Text style={styles.timelineTime}>{event.time}</Text>
                      </View>
                    </View>
                  ))
            }
          </View>
        </FadeInView>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.xl },
  loadingContent: { padding: SPACING.xl },
  emptyState: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { fontSize: FONT.size.lg, color: COLORS.textMuted },

  // Client card
  clientCard: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: RADIUS.xxl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.xl,
  },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: COLORS.white, fontSize: 16, fontWeight: FONT.weight.bold },
  clientName: { fontSize: 17, fontWeight: FONT.weight.bold, color: COLORS.text },
  clientEmail: { fontSize: FONT.size.md, color: COLORS.textSecondary, marginTop: 1 },
  clientPhone: { fontSize: FONT.size.md, color: COLORS.textSecondary },
  propertyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  propertyIcon: { fontSize: 16 },
  propertyText: { fontSize: FONT.size.base, color: COLORS.textSecondary, fontWeight: FONT.weight.medium },

  // Details section (shown when completed)
  detailsSection: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 5,
  },
  detailLabel: { fontSize: FONT.size.md, color: COLORS.textSecondary, fontWeight: FONT.weight.medium },
  detailValue: { fontSize: FONT.size.md, color: COLORS.text, fontWeight: FONT.weight.semibold },

  quickActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  quickBtn: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickBtnText: { fontSize: FONT.size.md, fontWeight: FONT.weight.semibold, color: COLORS.text },

  // Section
  section: { marginBottom: SPACING.xl },

  // Progress
  progressCard: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  progressLabel: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold, color: COLORS.text },
  progressPct: { fontSize: FONT.size.base, fontWeight: FONT.weight.bold, color: COLORS.primary },
  progressBar: {
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: COLORS.primary,
    borderRadius: 3,
  },

  // Doc rows
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    borderRadius: RADIUS.sm,
  },
  docIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.bgTertiary,
    justifyContent: "center",
    alignItems: "center",
  },
  docIconSigned: { backgroundColor: COLORS.successBg },
  docIconText: { fontSize: 16 },
  docTitle: { fontSize: FONT.size.base, fontWeight: FONT.weight.semibold, color: COLORS.text },
  docDate: { fontSize: FONT.size.xs, color: COLORS.textMuted, marginTop: 1 },
  pdfBadge: {
    backgroundColor: COLORS.primaryLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.sm,
  },
  pdfBadgeText: {
    fontSize: FONT.size.xs,
    fontWeight: FONT.weight.bold,
    color: COLORS.primary,
  },

  // Timeline
  timelineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 16,
  },
  timelineDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.bgTertiary,
    justifyContent: "center",
    alignItems: "center",
  },
  timelineText: { fontSize: FONT.size.base, fontWeight: FONT.weight.medium, color: COLORS.text },
  timelineTime: { fontSize: FONT.size.xs, color: COLORS.textMuted, marginTop: 2 },
});
