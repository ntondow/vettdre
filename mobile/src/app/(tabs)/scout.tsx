// ── Scout Tab (Building Research) ─────────────────────────────
// Three input methods: camera, screenshot, URL paste.
// Quick search + recently viewed buildings.

import { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  Camera,
  Smartphone,
  Link,
  Search,
  Bookmark,
  ChevronRight,
  Map,
  Mic,
  Scan,
} from "lucide-react-native";
import { getAllSavedBuildings } from "@/lib/offline-cache";
import type { BuildingProfile } from "@/types";

export default function ScoutScreen() {
  const router = useRouter();
  const [savedBuildings, setSavedBuildings] = useState<
    Array<{ bbl: string; address: string; savedAt: string; profile: BuildingProfile }>
  >([]);

  // Refresh saved buildings when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      getAllSavedBuildings()
        .then(setSavedBuildings)
        .catch(() => {});
    }, [])
  );

  const go = (route: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(route);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Scout</Text>
      <Text style={styles.subtitle}>Research any NYC building instantly</Text>

      <Text style={styles.sectionLabel}>HOW DO YOU WANT TO START?</Text>

      {[
        {
          icon: Camera,
          label: "Photo a Building",
          desc: "Snap a photo — we'll identify it from GPS",
          bg: "#EFF6FF",
          route: "/scout/camera",
        },
        {
          icon: Smartphone,
          label: "Screenshot a Listing",
          desc: "StreetEasy, Zillow, any listing screenshot",
          bg: "#FFF7ED",
          route: "/scout/screenshot",
        },
        {
          icon: Link,
          label: "Paste a URL",
          desc: "Drop any listing link for instant intel",
          bg: "#F0FDF4",
          route: "/scout/url",
        },
      ].map((method) => (
        <Pressable
          key={method.label}
          onPress={() => go(method.route)}
          style={({ pressed }) => [styles.methodCard, pressed && styles.pressed]}
        >
          <View style={[styles.methodIcon, { backgroundColor: method.bg }]}>
            <method.icon size={24} color="#0F172A" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.methodLabel}>{method.label}</Text>
            <Text style={styles.methodDesc}>{method.desc}</Text>
          </View>
        </Pressable>
      ))}

      <Text style={[styles.sectionLabel, { marginTop: 24 }]}>OR SEARCH BY ADDRESS</Text>
      <Pressable
        onPress={() => go("/scout/search")}
        style={({ pressed }) => [styles.searchBar, pressed && styles.pressed]}
      >
        <Search size={16} color="#94A3B8" />
        <Text style={styles.searchPlaceholder}>425 W 52nd St, Manhattan...</Text>
      </Pressable>

      {/* Tools row */}
      <Text style={[styles.sectionLabel, { marginTop: 24 }]}>SCOUT TOOLS</Text>
      <View style={styles.toolsRow}>
        {[
          { icon: Map, label: "Map", route: "/scout/map", bg: "#EDE9FE" },
          { icon: Mic, label: "Voice Memo", route: "/scout/voice-memo", bg: "#FEF3C7" },
          { icon: Scan, label: "Scan Doc", route: "/scanner", bg: "#ECFDF5" },
        ].map((tool) => (
          <Pressable
            key={tool.label}
            onPress={() => go(tool.route)}
            style={({ pressed }) => [styles.toolCard, pressed && styles.pressed]}
          >
            <View style={[styles.toolIcon, { backgroundColor: tool.bg }]}>
              <tool.icon size={20} color="#0F172A" />
            </View>
            <Text style={styles.toolLabel}>{tool.label}</Text>
          </Pressable>
        ))}
      </View>

      {/* Saved Buildings */}
      {savedBuildings.length > 0 && (
        <>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 28 }}>
            <Text style={styles.sectionLabel}>
              SAVED BUILDINGS ({savedBuildings.length})
            </Text>
            <Pressable onPress={() => go("/scout/saved")}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: "#2563EB" }}>View All</Text>
            </Pressable>
          </View>
          {savedBuildings.slice(0, 5).map((b) => (
            <Pressable
              key={b.bbl}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push({
                  pathname: "/scout/profile",
                  params: { profileData: JSON.stringify({ pluto: b.profile, ...b.profile }) },
                });
              }}
              style={({ pressed }) => [styles.savedCard, pressed && styles.pressed]}
            >
              <Bookmark size={16} color="#2563EB" />
              <View style={{ flex: 1 }}>
                <Text style={styles.savedAddress} numberOfLines={1}>
                  {b.address}
                </Text>
                <Text style={styles.savedMeta}>
                  {b.profile.unitsTotal} units · {b.profile.yearBuilt || "?"}
                </Text>
              </View>
              <ChevronRight size={16} color="#CBD5E1" />
            </Pressable>
          ))}
        </>
      )}

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 20, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: "700", color: "#0F172A", letterSpacing: -0.5 },
  subtitle: { fontSize: 15, color: "#94A3B8", marginTop: 2, marginBottom: 28 },
  sectionLabel: {
    fontSize: 11, fontWeight: "600", color: "#94A3B8",
    letterSpacing: 1.2, marginBottom: 10,
  },
  methodCard: {
    flexDirection: "row", alignItems: "center", gap: 16,
    padding: 20, backgroundColor: "#F8FAFC",
    borderWidth: 1.5, borderColor: "#E2E8F0",
    borderRadius: 16, marginBottom: 12,
  },
  methodIcon: {
    width: 52, height: 52, borderRadius: 14,
    justifyContent: "center", alignItems: "center",
  },
  methodLabel: { fontSize: 16, fontWeight: "600", color: "#0F172A" },
  methodDesc: { fontSize: 13, color: "#64748B", marginTop: 2 },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 14, backgroundColor: "#F8FAFC",
    borderWidth: 1.5, borderColor: "#E2E8F0", borderRadius: 12,
  },
  searchPlaceholder: { fontSize: 15, color: "#94A3B8" },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },

  // Tools row
  toolsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 8,
  },
  toolCard: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    padding: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
  },
  toolIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  toolLabel: { fontSize: 11, fontWeight: "500", color: "#64748B" },

  // Saved buildings
  savedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    marginBottom: 8,
  },
  savedAddress: { fontSize: 14, fontWeight: "600", color: "#0F172A" },
  savedMeta: { fontSize: 12, color: "#94A3B8", marginTop: 1 },
});
