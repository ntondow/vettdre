// ── Pipeline Tab ──────────────────────────────────────────────
// Toggle between Buildings and Clients pipeline views.

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
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { fetchPipeline } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { ScreenErrorState } from "@/components/error-boundary";
import { ChevronRight } from "lucide-react-native";

export default function PipelineScreen() {
  const [tab, setTab] = useState<"buildings" | "clients">("buildings");
  const router = useRouter();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: qk.pipeline.all,
    queryFn: fetchPipeline,
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const stages = tab === "buildings" ? data?.buildingStages : data?.clientStages;
  const total = tab === "buildings" ? data?.totalBuildings : data?.totalClients;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />
      }
    >
      <Text style={styles.title}>Pipeline</Text>

      {/* Toggle */}
      <View style={styles.toggle}>
        <Pressable
          onPress={() => {
            setTab("buildings");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          style={[styles.toggleButton, tab === "buildings" && styles.toggleActive]}
        >
          <Text style={[styles.toggleText, tab === "buildings" && styles.toggleTextActive]}>
            🏢 Buildings ({data?.totalBuildings ?? 0})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setTab("clients");
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
          style={[styles.toggleButton, tab === "clients" && styles.toggleActive]}
        >
          <Text style={[styles.toggleText, tab === "clients" && styles.toggleTextActive]}>
            👤 Clients ({data?.totalClients ?? 0})
          </Text>
        </Pressable>
      </View>

      {/* Stage breakdown bar */}
      {stages && stages.length > 0 && (
        <View style={styles.breakdownBar}>
          {stages.map((s) => (
            <View
              key={s.key}
              style={[styles.breakdownSegment, { flex: s.count, backgroundColor: s.color }]}
            />
          ))}
        </View>
      )}

      {/* Stage cards */}
      {isError ? (
        <ScreenErrorState
          message="Couldn't load pipeline data"
          onRetry={() => refetch()}
        />
      ) : isLoading
        ? [1, 2, 3, 4].map((i) => (
            <View key={i} style={[styles.skeleton, { height: 60, marginBottom: 8 }]} />
          ))
        : (stages ?? []).map((stage) => (
            <Pressable
              key={stage.key}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({
                  pathname: "/pipeline/stage",
                  params: {
                    type: tab,
                    status: stage.key,
                    label: stage.label,
                    color: stage.color,
                  },
                });
              }}
              style={({ pressed }) => [styles.stageCard, pressed && styles.pressed]}
            >
              <View style={styles.stageRow}>
                <View style={[styles.stageDot, { backgroundColor: `${stage.color}25` }]}>
                  <View style={[styles.stageDotInner, { backgroundColor: stage.color }]} />
                </View>
                <View>
                  <Text style={styles.stageLabel}>{stage.label}</Text>
                  <Text style={styles.stageCount}>
                    {stage.count} {tab === "buildings" ? "building" : "client"}
                    {stage.count !== 1 ? "s" : ""}
                  </Text>
                </View>
              </View>
              <ChevronRight size={18} color="#CBD5E1" />
            </Pressable>
          ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: "700", color: "#0F172A", marginBottom: 12 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },

  toggle: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 3,
    marginBottom: 20,
  },
  toggleButton: { flex: 1, padding: 10, borderRadius: 10, alignItems: "center" },
  toggleActive: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  toggleText: { fontSize: 14, fontWeight: "600", color: "#94A3B8" },
  toggleTextActive: { color: "#0F172A" },

  breakdownBar: {
    flexDirection: "row",
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
    gap: 2,
    marginBottom: 20,
  },
  breakdownSegment: { borderRadius: 3 },

  stageCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#F1F5F9",
    borderRadius: 12,
    marginBottom: 8,
  },
  stageRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  stageDot: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  stageDotInner: { width: 12, height: 12, borderRadius: 6 },
  stageLabel: { fontSize: 15, fontWeight: "600", color: "#0F172A" },
  stageCount: { fontSize: 12, color: "#94A3B8" },

  skeleton: { backgroundColor: "#F1F5F9", borderRadius: 12 },
});
