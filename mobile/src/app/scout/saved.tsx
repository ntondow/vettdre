// ── Saved Buildings Screen ────────────────────────────────────
// Full list of locally-saved building profiles from Scout.
// Offline-first via expo-sqlite, with swipe-to-delete.

import { useState, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  Alert,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import { HeaderBar, FadeInView } from "@/components/ui";
import {
  getAllSavedBuildings,
  removeSavedBuilding,
  clearAllCache,
} from "@/lib/offline-cache";
import { fmtDate } from "@/lib/format";
import {
  Bookmark,
  Trash2,
  Building2,
  AlertTriangle,
  ChevronRight,
} from "lucide-react-native";
import type { BuildingProfile } from "@/types";

interface SavedItem {
  bbl: string;
  address: string;
  savedAt: string;
  profile: BuildingProfile;
}

export default function SavedBuildingsScreen() {
  const router = useRouter();
  const [buildings, setBuildings] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      getAllSavedBuildings()
        .then(setBuildings)
        .catch(() => {})
        .finally(() => setLoading(false));
    }, [])
  );

  const handleDelete = (bbl: string, address: string) => {
    Alert.alert("Remove Building", `Remove ${address} from saved?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          await removeSavedBuilding(bbl);
          setBuildings((prev) => prev.filter((b) => b.bbl !== bbl));
        },
      },
    ]);
  };

  const handleClearAll = () => {
    if (buildings.length === 0) return;
    Alert.alert(
      "Clear All Saved Buildings",
      `Remove all ${buildings.length} saved buildings? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await clearAllCache();
            setBuildings([]);
          },
        },
      ]
    );
  };

  const openProfile = (item: SavedItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: "/scout/profile",
      params: {
        profileData: JSON.stringify({
          pluto: item.profile,
          ...item.profile,
        }),
      },
    });
  };

  const renderItem = ({ item, index }: { item: SavedItem; index: number }) => {
    const p = item.profile;
    const distressColor =
      p.distressScore >= 60
        ? "#EF4444"
        : p.distressScore >= 30
          ? "#F59E0B"
          : "#10B981";

    return (
      <FadeInView delay={index * 60}>
        <Pressable
          onPress={() => openProfile(item)}
          onLongPress={() => handleDelete(item.bbl, item.address)}
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        >
          <View style={styles.cardLeft}>
            <View style={styles.iconWrap}>
              <Building2 size={18} color="#2563EB" />
            </View>
          </View>

          <View style={styles.cardBody}>
            <Text style={styles.address} numberOfLines={1}>
              {item.address}
            </Text>
            <View style={styles.metaRow}>
              <Text style={styles.meta}>
                {p.unitsTotal ?? 0} units
              </Text>
              <View style={styles.dot} />
              <Text style={styles.meta}>
                Built {p.yearBuilt || "?"}
              </Text>
              <View style={styles.dot} />
              <Text style={styles.meta}>
                {p.numFloors || "?"} fl
              </Text>
            </View>
            <View style={styles.tagsRow}>
              {p.distressScore > 0 && (
                <View
                  style={[
                    styles.tag,
                    { backgroundColor: `${distressColor}15` },
                  ]}
                >
                  <AlertTriangle size={10} color={distressColor} />
                  <Text style={[styles.tagText, { color: distressColor }]}>
                    {p.distressScore}/100
                  </Text>
                </View>
              )}
              {p.rentStabilized && (
                <View style={[styles.tag, { backgroundColor: "#EFF6FF" }]}>
                  <Text style={[styles.tagText, { color: "#2563EB" }]}>
                    Rent Stabilized
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.savedDate}>Saved {fmtDate(item.savedAt)}</Text>
          </View>

          <ChevronRight size={16} color="#CBD5E1" />
        </Pressable>
      </FadeInView>
    );
  };

  return (
    <View style={styles.container}>
      <HeaderBar
        title={`Saved Buildings (${buildings.length})`}
        onBack={() => router.back()}
        right={
          buildings.length > 0 ? (
            <Pressable onPress={handleClearAll} hitSlop={12}>
              <Trash2 size={18} color="#EF4444" />
            </Pressable>
          ) : undefined
        }
      />

      {loading ? (
        <View style={styles.loadingContainer}>
          {[1, 2, 3, 4].map((i) => (
            <View
              key={i}
              style={[styles.skeleton, { height: 100, marginBottom: 10 }]}
            />
          ))}
        </View>
      ) : buildings.length === 0 ? (
        <View style={styles.emptyState}>
          <Bookmark size={48} color="#CBD5E1" />
          <Text style={styles.emptyTitle}>No saved buildings</Text>
          <Text style={styles.emptySubtitle}>
            Scout a building and tap "Save" to access it offline anytime
          </Text>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(tabs)/scout");
            }}
            style={styles.emptyButton}
          >
            <Text style={styles.emptyButtonText}>Start Scouting</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={buildings}
          renderItem={renderItem}
          keyExtractor={(item) => item.bbl}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  list: { padding: 16 },
  loadingContainer: { padding: 16 },
  skeleton: { backgroundColor: "#F1F5F9", borderRadius: 14 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },

  // Card
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#F1F5F9",
    borderRadius: 16,
    marginBottom: 10,
  },
  cardLeft: {},
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
  },
  cardBody: { flex: 1 },
  address: { fontSize: 15, fontWeight: "600", color: "#0F172A" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  meta: { fontSize: 12, color: "#64748B" },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: "#CBD5E1",
  },
  tagsRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagText: { fontSize: 10, fontWeight: "600" },
  savedDate: { fontSize: 11, color: "#CBD5E1", marginTop: 4 },

  // Empty
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 20,
  },
  emptyButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "#2563EB",
    borderRadius: 12,
  },
  emptyButtonText: { fontSize: 15, fontWeight: "600", color: "#fff" },
});
