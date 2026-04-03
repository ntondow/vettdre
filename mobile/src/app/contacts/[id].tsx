// ── CRM Contact Detail Screen ─────────────────────────────────
// Full contact dossier: profile card, score, enrichment, deals,
// activity timeline, tasks, showings.

import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  RefreshControl,
  Linking,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { fetchCrmContactDetail, completeTask, type CrmContactDetail } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { timeAgo } from "@/lib/format";
import { HeaderBar, FadeInView, Skeleton, SectionHeader } from "@/components/ui";
import { COLORS, SPACING, RADIUS, FONT, SHADOW } from "@/lib/theme";
import { ScreenErrorState } from "@/components/error-boundary";
import {
  Phone,
  Mail,
  MapPin,
  Briefcase,
  Building2,
  CheckCircle2,
  Clock,
  Activity,
  Star,
  Linkedin,
  User,
  MessageSquare,
  Calendar,
  ChevronRight,
  ExternalLink,
} from "lucide-react-native";

// ── Helpers ──────────────────────────────────────────────────

function initials(first: string, last: string): string {
  return `${(first || "?")[0]}${(last || "?")[0]}`.toUpperCase();
}

function scoreColor(score: number): string {
  if (score >= 80) return "#10B981";
  if (score >= 60) return "#3B82F6";
  if (score >= 40) return "#F59E0B";
  if (score >= 20) return "#F97316";
  return "#EF4444";
}

function scoreLetter(score: number): string {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  if (score >= 20) return "D";
  return "F";
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
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "#EF4444",
  high: "#F97316",
  medium: "#F59E0B",
  low: "#94A3B8",
};

// ── Main Screen ──────────────────────────────────────────────

export default function ContactDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();

  const {
    data: contact,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: qk.contacts.detail(id!),
    queryFn: () => fetchCrmContactDetail(id!),
    enabled: !!id,
  });

  const completeMutation = useMutation({
    mutationFn: (taskId: string) => completeTask(taskId),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: qk.contacts.detail(id!) });
    },
  });

  if (isLoading) {
    return (
      <View style={styles.container}>
        <HeaderBar title="Contact" onBack={() => router.back()} />
        <View style={styles.loadingContent}>
          <Skeleton width="60%" height={22} />
          <View style={{ height: 12 }} />
          <Skeleton width="40%" height={16} />
          <View style={{ height: 24 }} />
          <Skeleton width="100%" height={120} radius={16} />
        </View>
      </View>
    );
  }

  if (isError || !contact) {
    return (
      <View style={styles.container}>
        <HeaderBar title="Contact" onBack={() => router.back()} />
        <ScreenErrorState
          message="Couldn't load contact"
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  const grade = contact.score
    ? { letter: scoreLetter(contact.score.total), color: scoreColor(contact.score.total) }
    : null;

  return (
    <View style={styles.container}>
      <HeaderBar
        title={contact.name}
        onBack={() => router.back()}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* ── Profile Card ──────────────────────────── */}
        <FadeInView delay={0}>
          <View style={styles.profileCard}>
            <View style={styles.profileHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {initials(contact.firstName, contact.lastName)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.profileName}>{contact.name}</Text>
                <Text style={styles.profileType}>
                  {contact.contactType.charAt(0).toUpperCase() + contact.contactType.slice(1)}
                  {contact.source ? ` · via ${contact.source}` : ""}
                </Text>
              </View>
              {grade && (
                <View style={[styles.scoreCircle, { borderColor: grade.color }]}>
                  <Text style={[styles.scoreText, { color: grade.color }]}>{grade.letter}</Text>
                  <Text style={[styles.scoreNumber, { color: grade.color }]}>
                    {contact.score!.total}
                  </Text>
                </View>
              )}
            </View>

            {/* Contact info rows */}
            {contact.email && (
              <Pressable
                style={styles.infoRow}
                onPress={() => Linking.openURL(`mailto:${contact.email}`)}
              >
                <Mail size={15} color={COLORS.info} />
                <Text style={styles.infoText}>{contact.email}</Text>
                <ExternalLink size={12} color={COLORS.textMuted} />
              </Pressable>
            )}
            {contact.phone && (
              <Pressable
                style={styles.infoRow}
                onPress={() => Linking.openURL(`tel:${contact.phone}`)}
              >
                <Phone size={15} color={COLORS.success} />
                <Text style={styles.infoText}>{contact.phone}</Text>
                <ExternalLink size={12} color={COLORS.textMuted} />
              </Pressable>
            )}
            {contact.address && (
              <View style={styles.infoRow}>
                <MapPin size={15} color={COLORS.textMuted} />
                <Text style={styles.infoText}>
                  {[contact.address, contact.city, contact.state, contact.zip]
                    .filter(Boolean)
                    .join(", ")}
                </Text>
              </View>
            )}

            {/* Tags */}
            {contact.tags.length > 0 && (
              <View style={styles.tagsRow}>
                {contact.tags.slice(0, 6).map((tag) => (
                  <View key={tag} style={styles.tag}>
                    <Text style={styles.tagText}>{tag}</Text>
                  </View>
                ))}
                {contact.tags.length > 6 && (
                  <Text style={styles.tagMore}>+{contact.tags.length - 6}</Text>
                )}
              </View>
            )}

            {/* Quick actions */}
            <View style={styles.quickActions}>
              {contact.phone && (
                <Pressable
                  style={styles.quickBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    Linking.openURL(`tel:${contact.phone}`);
                  }}
                >
                  <Phone size={16} color={COLORS.success} />
                  <Text style={[styles.quickBtnText, { color: COLORS.success }]}>Call</Text>
                </Pressable>
              )}
              {contact.phone && (
                <Pressable
                  style={styles.quickBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    Linking.openURL(`sms:${contact.phone}`);
                  }}
                >
                  <MessageSquare size={16} color={COLORS.info} />
                  <Text style={[styles.quickBtnText, { color: COLORS.info }]}>Text</Text>
                </Pressable>
              )}
              {contact.email && (
                <Pressable
                  style={styles.quickBtn}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    Linking.openURL(`mailto:${contact.email}`);
                  }}
                >
                  <Mail size={16} color="#8B5CF6" />
                  <Text style={[styles.quickBtnText, { color: "#8B5CF6" }]}>Email</Text>
                </Pressable>
              )}
            </View>
          </View>
        </FadeInView>

        {/* ── Enrichment ────────────────────────────── */}
        {contact.enrichment && (
          <FadeInView delay={80}>
            <View style={styles.section}>
              <SectionHeader label="Professional Info" />
              <View style={styles.enrichmentCard}>
                {contact.enrichment.jobTitle && (
                  <View style={styles.enrichRow}>
                    <Briefcase size={14} color={COLORS.textMuted} />
                    <Text style={styles.enrichText}>
                      {contact.enrichment.jobTitle}
                      {contact.enrichment.employer ? ` at ${contact.enrichment.employer}` : ""}
                    </Text>
                  </View>
                )}
                {contact.enrichment.linkedinUrl && (
                  <Pressable
                    style={styles.enrichRow}
                    onPress={() => Linking.openURL(contact.enrichment!.linkedinUrl!)}
                  >
                    <Linkedin size={14} color="#0A66C2" />
                    <Text style={[styles.enrichText, { color: "#0A66C2" }]}>LinkedIn Profile</Text>
                    <ExternalLink size={12} color="#0A66C2" />
                  </Pressable>
                )}
                {contact.enrichment.ownsProperty != null && (
                  <View style={styles.enrichRow}>
                    <Building2 size={14} color={COLORS.textMuted} />
                    <Text style={styles.enrichText}>
                      {contact.enrichment.ownsProperty ? "Property Owner" : "Non-Owner"}
                    </Text>
                  </View>
                )}
                <Text style={styles.enrichSource}>
                  Sources: {contact.enrichment.sources.join(", ") || "—"}
                </Text>
              </View>
            </View>
          </FadeInView>
        )}

        {/* ── Score Breakdown ────────────────────────── */}
        {contact.score && (
          <FadeInView delay={120}>
            <View style={styles.section}>
              <SectionHeader label="Lead Score" />
              <View style={styles.scoreCard}>
                <View style={styles.scoreBigRow}>
                  <Text style={[styles.scoreBig, { color: scoreColor(contact.score.total) }]}>
                    {contact.score.total}
                  </Text>
                  <Text style={styles.scoreLabel}>/ 100</Text>
                </View>
                {[
                  { label: "Financial", value: contact.score.financial },
                  { label: "Intent", value: contact.score.intent },
                  { label: "Engagement", value: contact.score.engagement },
                  { label: "Market Fit", value: contact.score.marketFit },
                ].map(
                  (s) =>
                    s.value != null && (
                      <View key={s.label} style={styles.scoreBarRow}>
                        <Text style={styles.scoreBarLabel}>{s.label}</Text>
                        <View style={styles.scoreBarTrack}>
                          <View
                            style={[
                              styles.scoreBarFill,
                              {
                                width: `${s.value}%`,
                                backgroundColor: scoreColor(s.value),
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.scoreBarValue}>{s.value}</Text>
                      </View>
                    )
                )}
              </View>
            </View>
          </FadeInView>
        )}

        {/* ── Deals ─────────────────────────────────── */}
        {contact.deals.length > 0 && (
          <FadeInView delay={160}>
            <View style={styles.section}>
              <SectionHeader label={`Deals (${contact.deals.length})`} />
              {contact.deals.map((deal) => (
                <View key={deal.id} style={styles.dealRow}>
                  <View style={styles.dealIcon}>
                    <Briefcase size={14} color={COLORS.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dealTitle}>
                      {deal.stage || "Unknown stage"}
                      {deal.pipeline ? ` · ${deal.pipeline}` : ""}
                    </Text>
                    <Text style={styles.dealMeta}>
                      {deal.value ? `$${deal.value.toLocaleString()}` : "—"}
                      {deal.winProbability ? ` · ${deal.winProbability}% prob` : ""}
                    </Text>
                  </View>
                  <Text style={styles.dealTime}>{timeAgo(deal.createdAt)}</Text>
                </View>
              ))}
            </View>
          </FadeInView>
        )}

        {/* ── Tasks ─────────────────────────────────── */}
        {contact.tasks.length > 0 && (
          <FadeInView delay={200}>
            <View style={styles.section}>
              <SectionHeader label={`Open Tasks (${contact.tasks.length})`} />
              {contact.tasks.map((task) => (
                <View key={task.id} style={styles.taskRow}>
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                      completeMutation.mutate(task.id);
                    }}
                    style={styles.taskCheck}
                    hitSlop={8}
                  >
                    <CheckCircle2 size={20} color={COLORS.textPlaceholder} />
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.taskTitle}>{task.title}</Text>
                    <Text style={styles.taskMeta}>
                      {task.type.replace("_", " ")}
                      {task.dueAt ? ` · Due ${timeAgo(task.dueAt)}` : ""}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.priorityDot,
                      { backgroundColor: PRIORITY_COLORS[task.priority] || COLORS.textMuted },
                    ]}
                  />
                </View>
              ))}
            </View>
          </FadeInView>
        )}

        {/* ── Showings ──────────────────────────────── */}
        {contact.showings.length > 0 && (
          <FadeInView delay={240}>
            <View style={styles.section}>
              <SectionHeader label={`Showings (${contact.showings.length})`} />
              {contact.showings.map((s) => (
                <View key={s.id} style={styles.showingRow}>
                  <Calendar size={14} color={COLORS.info} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.showingTitle}>
                      {s.propertyAddress || "Unknown property"}
                    </Text>
                    <Text style={styles.showingMeta}>
                      {new Date(s.scheduledAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {s.interestLevel ? ` · ${s.interestLevel}` : ""}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </FadeInView>
        )}

        {/* ── Activity Timeline ─────────────────────── */}
        {contact.activities.length > 0 && (
          <FadeInView delay={280}>
            <View style={styles.section}>
              <SectionHeader label="Recent Activity" />
              {contact.activities.slice(0, 10).map((a) => (
                <View key={a.id} style={styles.activityRow}>
                  <View style={styles.activityDot}>
                    <Text style={{ fontSize: 13 }}>
                      {ACTIVITY_ICONS[a.type] || "📌"}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activityTitle}>
                      {a.subject || a.type.replace("_", " ")}
                      {a.isAi ? " 🤖" : ""}
                    </Text>
                    {a.body && (
                      <Text style={styles.activityBody} numberOfLines={2}>
                        {a.body}
                      </Text>
                    )}
                    <Text style={styles.activityTime}>{timeAgo(a.createdAt)}</Text>
                  </View>
                </View>
              ))}
            </View>
          </FadeInView>
        )}

        {/* ── Notes ─────────────────────────────────── */}
        {contact.notes && (
          <FadeInView delay={320}>
            <View style={styles.section}>
              <SectionHeader label="Notes" />
              <View style={styles.notesCard}>
                <Text style={styles.notesText}>{contact.notes}</Text>
              </View>
            </View>
          </FadeInView>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.xl },
  loadingContent: { padding: SPACING.xl },

  // Profile card
  profileCard: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.xl,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    color: COLORS.white,
    fontSize: FONT.size.xxl,
    fontWeight: FONT.weight.bold,
  },
  profileName: {
    fontSize: FONT.size.xxl,
    fontWeight: FONT.weight.bold,
    color: COLORS.text,
  },
  profileType: {
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  scoreCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2.5,
    justifyContent: "center",
    alignItems: "center",
  },
  scoreText: {
    fontSize: FONT.size.xl,
    fontWeight: FONT.weight.bold,
  },
  scoreNumber: {
    fontSize: FONT.size.xs,
    fontWeight: FONT.weight.semibold,
    marginTop: -2,
  },

  // Info rows
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  infoText: {
    flex: 1,
    fontSize: FONT.size.base,
    color: COLORS.textSecondary,
  },

  // Tags
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  tag: {
    backgroundColor: COLORS.bgTertiary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagText: {
    fontSize: FONT.size.xs,
    color: COLORS.textSecondary,
    fontWeight: FONT.weight.medium,
  },
  tagMore: {
    fontSize: FONT.size.xs,
    color: COLORS.textMuted,
    alignSelf: "center",
  },

  // Quick actions
  quickActions: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  quickBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.md,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  quickBtnText: {
    fontSize: FONT.size.sm,
    fontWeight: FONT.weight.semibold,
  },

  // Section
  section: { marginBottom: SPACING.xl },

  // Enrichment
  enrichmentCard: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  enrichRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  enrichText: {
    flex: 1,
    fontSize: FONT.size.base,
    color: COLORS.text,
  },
  enrichSource: {
    fontSize: FONT.size.xs,
    color: COLORS.textMuted,
    marginTop: 4,
  },

  // Score card
  scoreCard: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  scoreBigRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    marginBottom: SPACING.md,
  },
  scoreBig: {
    fontSize: 36,
    fontWeight: FONT.weight.extrabold,
  },
  scoreLabel: {
    fontSize: FONT.size.lg,
    color: COLORS.textMuted,
  },
  scoreBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  scoreBarLabel: {
    width: 80,
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
  },
  scoreBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: COLORS.bgTertiary,
    borderRadius: 3,
    overflow: "hidden",
  },
  scoreBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  scoreBarValue: {
    width: 24,
    fontSize: FONT.size.sm,
    fontWeight: FONT.weight.semibold,
    color: COLORS.text,
    textAlign: "right",
  },

  // Deal rows
  dealRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  dealIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.primaryLight,
    justifyContent: "center",
    alignItems: "center",
  },
  dealTitle: {
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.semibold,
    color: COLORS.text,
  },
  dealMeta: {
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  dealTime: {
    fontSize: FONT.size.xs,
    color: COLORS.textMuted,
  },

  // Task rows
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  taskCheck: { padding: 2 },
  taskTitle: {
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.medium,
    color: COLORS.text,
  },
  taskMeta: {
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Showing rows
  showingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  showingTitle: {
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.medium,
    color: COLORS.text,
  },
  showingMeta: {
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
    marginTop: 1,
  },

  // Activity timeline
  activityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  activityDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.bgTertiary,
    justifyContent: "center",
    alignItems: "center",
  },
  activityTitle: {
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.medium,
    color: COLORS.text,
  },
  activityBody: {
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  activityTime: {
    fontSize: FONT.size.xs,
    color: COLORS.textMuted,
    marginTop: 3,
  },

  // Notes
  notesCard: {
    backgroundColor: COLORS.bgSecondary,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  notesText: {
    fontSize: FONT.size.base,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
});
