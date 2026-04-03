// ── Settings / Profile Screen ─────────────────────────────────
// Agent profile card, account settings, and sign-out.

import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Alert, Switch } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/lib/auth-context";
import { HeaderBar } from "@/components/ui";
import {
  isBiometricAvailable,
  isBiometricEnabled,
  setBiometricEnabled,
  biometricLabel,
} from "@/lib/biometric-lock";
import { resetOnboarding } from "@/components/onboarding-walkthrough";
import { Linking } from "react-native";
import {
  User,
  Building2,
  Bell,
  Shield,
  Fingerprint,
  HelpCircle,
  LogOut,
  ChevronRight,
  ExternalLink,
  RotateCcw,
  Users,
  DollarSign,
  FileText,
  Bookmark,
} from "lucide-react-native";

function agentInitials(name: string): string {
  const parts = name.trim().split(" ");
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function SettingsScreen() {
  const router = useRouter();
  const { user, org, agent, signOut } = useAuth();

  // Biometric state
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioLabel, setBioLabel] = useState("Biometrics");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const avail = await isBiometricAvailable();
        if (cancelled) return;
        setBioAvailable(avail);
        if (avail) {
          const [enabled, label] = await Promise.all([
            isBiometricEnabled(),
            biometricLabel(),
          ]);
          if (cancelled) return;
          setBioEnabled(enabled);
          setBioLabel(label);
        }
      } catch {
        // Biometric check failed — leave defaults (unavailable)
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleBiometric = async (on: boolean) => {
    try {
      await setBiometricEnabled(on);
      setBioEnabled(on);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      Alert.alert("Error", "Could not update biometric setting.");
    }
  };

  const displayName = user?.fullName || "Agent";
  const email = user?.email || "";
  const role = user?.role === "super_admin" ? "Super Admin" : user?.role === "admin" ? "Admin" : "Agent";
  const orgName = org?.name || "VettdRE";
  const license = agent?.licenseNumber || user?.licenseNumber || null;

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          await signOut();
          router.replace("/(auth)/login");
        },
      },
    ]);
  };

  const menuSections = [
    {
      title: "ACCOUNT",
      items: [
        {
          icon: User,
          label: "Edit Profile",
          subtitle: "Name, phone, license",
          onPress: () => router.push("/settings/edit-profile"),
          disabled: false,
        },
        {
          icon: Building2,
          label: "Brokerage",
          subtitle: orgName,
          onPress: () => Linking.openURL("https://app.vettdre.com/brokerage/dashboard"),
          disabled: false,
          external: true,
        },
        {
          icon: Bell,
          label: "Notifications",
          subtitle: "Manage on web dashboard",
          onPress: () => Linking.openURL("https://app.vettdre.com/settings/notifications"),
          disabled: false,
          external: true,
        },
      ],
    },
    {
      title: "QUICK ACCESS",
      items: [
        {
          icon: Users,
          label: "CRM Contacts",
          subtitle: "View and manage your contacts",
          onPress: () => router.push("/contacts"),
          disabled: false,
        },
        {
          icon: Bookmark,
          label: "Saved Buildings",
          subtitle: "Buildings you've saved from Scout",
          onPress: () => router.push("/scout/saved"),
          disabled: false,
        },
        {
          icon: DollarSign,
          label: "Earnings",
          subtitle: "Commission history and payouts",
          onPress: () => router.push("/earnings"),
          disabled: false,
        },
        {
          icon: FileText,
          label: "Submit a Deal",
          subtitle: "Log a new closed deal",
          onPress: () => router.push("/deals/submit"),
          disabled: false,
        },
      ],
    },
    {
      title: "SECURITY",
      items: [
        ...(bioAvailable
          ? [
              {
                icon: Fingerprint,
                label: bioLabel,
                subtitle: bioEnabled ? "Enabled — locks when backgrounded" : "Protect the app with biometrics",
                onPress: () => toggleBiometric(!bioEnabled),
                disabled: false,
                toggle: true,
                toggleValue: bioEnabled,
              },
            ]
          : []),
        {
          icon: Shield,
          label: "Privacy & Terms",
          subtitle: "Legal information",
          onPress: () => Linking.openURL("https://app.vettdre.com/privacy"),
          disabled: false,
          external: true,
        },
      ],
    },
    {
      title: "SUPPORT",
      items: [
        {
          icon: HelpCircle,
          label: "Help & Feedback",
          subtitle: "Get help or report an issue",
          onPress: () => Linking.openURL("mailto:support@vettdre.com?subject=VettdRE%20Mobile%20Feedback"),
          disabled: false,
          external: true,
        },
        {
          icon: RotateCcw,
          label: "Replay Walkthrough",
          subtitle: "Re-watch the onboarding intro",
          onPress: async () => {
            await resetOnboarding();
            Alert.alert("Done", "The onboarding walkthrough will show next time you open the app.");
          },
          disabled: false,
        },
      ],
    },
  ];

  return (
    <View style={styles.container}>
      <HeaderBar title="Settings" onBack={() => router.back()} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{agentInitials(displayName)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>{displayName}</Text>
            <Text style={styles.profileEmail}>{email}</Text>
            <View style={styles.roleBadge}>
              <Text style={styles.roleText}>{role}</Text>
            </View>
          </View>
        </View>

        {/* Agent Details */}
        <View style={styles.detailsCard}>
          <DetailRow label="Organization" value={orgName} />
          {license && <DetailRow label="License #" value={license} />}
          {agent && (
            <DetailRow
              label="Default Split"
              value={`${Number(agent.defaultSplitPct)}%`}
            />
          )}
          <DetailRow label="Plan" value={(user?.plan || "free").toUpperCase()} />
        </View>

        {/* Menu Sections */}
        {menuSections.map((section) => (
          <View key={section.title}>
            <Text style={styles.sectionLabel}>{section.title}</Text>
            <View style={styles.menuGroup}>
              {section.items.map((item, i) => (
                <Pressable
                  key={item.label}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    item.onPress();
                  }}
                  disabled={item.disabled}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.menuItem,
                    i < section.items.length - 1 && styles.menuItemBorder,
                    pressed && { backgroundColor: "#F8FAFC" },
                  ]}
                >
                  <item.icon size={20} color="#64748B" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuLabel}>{item.label}</Text>
                    {item.subtitle && (
                      <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                    )}
                  </View>
                  {"toggle" in item && (item as any).toggle ? (
                    <Switch
                      value={(item as any).toggleValue ?? false}
                      onValueChange={(val: boolean) => toggleBiometric(val)}
                      trackColor={{ false: "#E2E8F0", true: "#93C5FD" }}
                      thumbColor={(item as any).toggleValue ? "#2563EB" : "#fff"}
                    />
                  ) : item.disabled ? (
                    <Text style={styles.comingSoon}>Soon</Text>
                  ) : "external" in item && (item as any).external ? (
                    <ExternalLink size={14} color="#CBD5E1" />
                  ) : (
                    <ChevronRight size={16} color="#CBD5E1" />
                  )}
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        {/* Sign Out */}
        <Pressable
          onPress={handleSignOut}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.signOutBtn,
            pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
          ]}
        >
          <LogOut size={18} color="#EF4444" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>

        {/* Version */}
        <Text style={styles.version}>VettdRE Mobile v0.1.0</Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  scroll: { flex: 1 },
  scrollContent: { padding: 20 },

  // Profile
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 20,
    backgroundColor: "#F8FAFC",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#2563EB",
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: { color: "#fff", fontSize: 20, fontWeight: "700" },
  profileName: { fontSize: 18, fontWeight: "700", color: "#0F172A" },
  profileEmail: { fontSize: 13, color: "#64748B", marginTop: 2 },
  roleBadge: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: "#EFF6FF",
    borderRadius: 6,
  },
  roleText: { fontSize: 11, fontWeight: "600", color: "#2563EB" },

  // Details
  detailsCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 4,
    marginBottom: 24,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  detailLabel: { fontSize: 13, color: "#64748B" },
  detailValue: { fontSize: 13, fontWeight: "600", color: "#0F172A" },

  // Section
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#94A3B8",
    letterSpacing: 1.2,
    marginBottom: 8,
  },

  // Menu
  menuGroup: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    marginBottom: 24,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  menuLabel: { fontSize: 15, fontWeight: "500", color: "#0F172A" },
  menuSubtitle: { fontSize: 12, color: "#94A3B8", marginTop: 1 },
  comingSoon: {
    fontSize: 10,
    fontWeight: "600",
    color: "#94A3B8",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: "hidden",
  },

  // Sign Out
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
    backgroundColor: "#FEF2F2",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FECACA",
    marginBottom: 20,
  },
  signOutText: { fontSize: 15, fontWeight: "600", color: "#EF4444" },

  // Version
  version: {
    fontSize: 12,
    color: "#CBD5E1",
    textAlign: "center",
  },
});
