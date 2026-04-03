// ── Pipeline Stage Detail ─────────────────────────────────────
// Shows all items within a specific pipeline stage.
// Reached by tapping a stage card on the Pipeline tab.
// Query params: type (buildings|clients), status, label, color

import { useCallback, useState } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  RefreshControl,
  Linking,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { fetchStageItems, type StageItem } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { HeaderBar } from "@/components/ui";
import { COLORS, SPACING, RADIUS, FONT, SHADOW } from "@/lib/theme";
import { ScreenErrorState } from "@/components/error-boundary";
import {
  Building2,
  User,
  Mail,
  Phone,
  MapPin,
  Bed,
  Bath,
  Maximize2,
  Calendar,
  FileCheck2,
  ChevronRight,
} from "lucide-react-native";

function fmtPrice(price: number | null | undefined, type?: string | null): string {
  if (!price) return "—";
  const formatted = price >= 1000
    ? `$${(price / 1000).toFixed(price >= 10000 ? 0 : 1)}K`
    : `$${price.toLocaleString()}`;
  if (type === "rent") return `${formatted}/mo`;
  return formatted;
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function initials(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function StageDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    type: "buildings" | "clients";
    status: string;
    label: string;
    color: string;
  }>();

  const type = params.type || "buildings";
  const status = params.status || "";
  const label = params.label || status;
  const color = params.color || COLORS.primary;

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: qk.pipeline.stage(type, status),
    queryFn: () => fetchStageItems(type, status),
    enabled: !!status,
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const renderItem = useCallback(
    ({ item }: { item: StageItem }) => {
      if (type === "buildings") {
        return <BuildingCard item={item} color={color} />;
      }
      return (
        <ClientCard
          item={item}
          color={color}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(`/clients/${item.id}`);
          }}
        />
      );
    },
    [type, color, router],
  );

  return (
    <View style={styles.container}>
      <HeaderBar
        title={label}
        onBack={() => router.back()}
      />

      {/* Stage header */}
      <View style={styles.stageHeader}>
        <View style={[styles.stageIndicator, { backgroundColor: color }]} />
        <Text style={styles.stageCount}>
          {total} {type === "buildings" ? "listing" : "client"}
          {total !== 1 ? "s" : ""}
        </Text>
      </View>

      {isError ? (
        <ScreenErrorState
          message="Couldn't load stage data"
          onRetry={() => refetch()}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
            />
          }
          contentContainerStyle={styles.scrollContent}
          ListEmptyComponent={
            isLoading ? (
              <View>
                {[1, 2, 3, 4, 5].map((i) => (
                  <View key={i} style={[styles.skeleton, { height: type === "buildings" ? 100 : 90, marginBottom: 10 }]} />
                ))}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>
                  No {type === "buildings" ? "listings" : "clients"} in this stage
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

// ── Building Card ────────────────────────────────────────────

function BuildingCard({ item, color }: { item: StageItem; color: string }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.iconCircle, { backgroundColor: `${color}15` }]}>
          <Building2 size={18} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {item.address}{item.unit ? ` #${item.unit}` : ""}
          </Text>
          <Text style={styles.cardSubtitle}>
            {(item.listingType || "rental").charAt(0).toUpperCase() +
              (item.listingType || "rental").slice(1)}
            {item.daysOnMarket != null ? ` · ${item.daysOnMarket}d on market` : ""}
          </Text>
        </View>
        {item.price != null && (
          <Text style={[styles.priceTag, { color }]}>
            {fmtPrice(item.price, item.priceType)}
          </Text>
        )}
      </View>

      {/* Details row */}
      <View style={styles.detailsRow}>
        {item.bedrooms && (
          <View style={styles.detailChip}>
            <Bed size={12} color={COLORS.textMuted} />
            <Text style={styles.detailText}>{item.bedrooms} BR</Text>
          </View>
        )}
        {item.bathrooms && (
          <View style={styles.detailChip}>
            <Bath size={12} color={COLORS.textMuted} />
            <Text style={styles.detailText}>{item.bathrooms} BA</Text>
          </View>
        )}
        {item.sqft && (
          <View style={styles.detailChip}>
            <Maximize2 size={12} color={COLORS.textMuted} />
            <Text style={styles.detailText}>{item.sqft.toLocaleString()} sqft</Text>
          </View>
        )}
        {item.availableDate && (
          <View style={styles.detailChip}>
            <Calendar size={12} color={COLORS.textMuted} />
            <Text style={styles.detailText}>{fmtDate(item.availableDate)}</Text>
          </View>
        )}
      </View>

      {/* Tenant info for leased/approved stages */}
      {item.tenantName && (
        <View style={styles.tenantRow}>
          <User size={13} color={COLORS.textSecondary} />
          <Text style={styles.tenantText}>{item.tenantName}</Text>
          {item.tenantEmail && (
            <Pressable
              onPress={() => Linking.openURL(`mailto:${item.tenantEmail}`)}
              hitSlop={8}
            >
              <Mail size={13} color={COLORS.info} />
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

// ── Client Card ──────────────────────────────────────────────

function ClientCard({
  item,
  color,
  onPress,
}: {
  item: StageItem;
  color: string;
  onPress: () => void;
}) {
  const displayName = item.name || "Unknown";
  const docSigned = item.docProgress?.signed ?? 0;
  const docTotal = item.docProgress?.total ?? 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(displayName)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.cardSubtitle} numberOfLines={1}>
            {item.email || "No email"}
          </Text>
        </View>
        <ChevronRight size={16} color={COLORS.textPlaceholder} />
      </View>

      {/* Meta row */}
      <View style={styles.detailsRow}>
        {item.dealType && (
          <View style={styles.detailChip}>
            <Text style={styles.detailText}>
              {item.dealType.charAt(0).toUpperCase() + item.dealType.slice(1)}
            </Text>
          </View>
        )}
        {item.propertyAddress && (
          <View style={[styles.detailChip, { flex: 1 }]}>
            <MapPin size={12} color={COLORS.textMuted} />
            <Text style={styles.detailText} numberOfLines={1}>
              {item.propertyAddress}
            </Text>
          </View>
        )}
      </View>

      {/* Doc progress */}
      {docTotal > 0 && (
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${(docSigned / docTotal) * 100}%`,
                  backgroundColor: item.allDocsSigned ? COLORS.success : color,
                },
              ]}
            />
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <FileCheck2 size={12} color={COLORS.textMuted} />
            <Text style={styles.progressText}>
              {docSigned}/{docTotal} docs
            </Text>
          </View>
        </View>
      )}

      {/* Contact actions */}
      {(item.phone || item.email) && (
        <View style={styles.contactRow}>
          {item.phone && (
            <Pressable
              style={styles.contactButton}
              onPress={(e) => {
                e.stopPropagation?.();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Linking.openURL(`tel:${item.phone}`);
              }}
              hitSlop={6}
            >
              <Phone size={13} color={COLORS.success} />
              <Text style={[styles.contactButtonText, { color: COLORS.success }]}>Call</Text>
            </Pressable>
          )}
          {item.email && (
            <Pressable
              style={styles.contactButton}
              onPress={(e) => {
                e.stopPropagation?.();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                Linking.openURL(`mailto:${item.email}`);
              }}
              hitSlop={6}
            >
              <Mail size={13} color={COLORS.info} />
              <Text style={[styles.contactButtonText, { color: COLORS.info }]}>Email</Text>
            </Pressable>
          )}
        </View>
      )}
    </Pressable>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scrollContent: { padding: SPACING.xl },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },

  stageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  stageIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  stageCount: {
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.medium,
    color: COLORS.textSecondary,
  },

  // Cards
  card: {
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    padding: SPACING.lg,
    marginBottom: 10,
    ...SHADOW.sm,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.md,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  cardTitle: {
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.semibold,
    color: COLORS.text,
  },
  cardSubtitle: {
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  priceTag: {
    fontSize: FONT.size.lg,
    fontWeight: FONT.weight.bold,
  },

  // Details row
  detailsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  detailChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.bgSecondary,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 6,
  },
  detailText: {
    fontSize: FONT.size.xs,
    color: COLORS.textSecondary,
  },

  // Tenant row
  tenantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  tenantText: {
    flex: 1,
    fontSize: FONT.size.sm,
    color: COLORS.textSecondary,
  },

  // Avatar (clients)
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.bgTertiary,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: FONT.size.base,
    fontWeight: FONT.weight.semibold,
    color: COLORS.textSecondary,
  },

  // Progress bar
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: SPACING.md,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: COLORS.bgTertiary,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  progressText: {
    fontSize: FONT.size.xs,
    color: COLORS.textMuted,
  },

  // Contact actions
  contactRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
  },
  contactButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: RADIUS.sm,
  },
  contactButtonText: {
    fontSize: FONT.size.sm,
    fontWeight: FONT.weight.medium,
  },

  // Empty + skeleton
  emptyState: {
    padding: 32,
    backgroundColor: COLORS.bgSecondary,
    borderRadius: RADIUS.lg,
    alignItems: "center",
  },
  emptyText: {
    fontSize: FONT.size.base,
    color: COLORS.textMuted,
    textAlign: "center",
  },
  skeleton: {
    backgroundColor: COLORS.bgTertiary,
    borderRadius: RADIUS.lg,
  },
});
