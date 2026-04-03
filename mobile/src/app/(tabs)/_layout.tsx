// ── Tab Navigation ────────────────────────────────────────────
// 5 tabs: Home, Scout, Pipeline, Clients, Alerts
// Uses native bottom tab bar with animated badge counts.
// Prefetches critical queries on auth + refetches stale data on tab focus.

import { Redirect, Tabs } from "expo-router";
import { useAuth } from "@/lib/auth-context";
import { ActivityIndicator, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef, useCallback } from "react";
import {
  Home,
  Search,
  BarChart3,
  Users,
  Bell,
} from "lucide-react-native";
import { AnimatedBadge } from "@/components/animated-badge";
import {
  fetchNotifications,
  fetchPipeline,
  fetchTodaySchedule,
  fetchEarnings,
  fetchCrmContacts,
  fetchRecentActivity,
} from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { COLORS } from "@/lib/theme";

export default function TabLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const prefetched = useRef(false);

  // ── Startup prefetch: warm the cache for key screens ────────
  useEffect(() => {
    if (!isAuthenticated || prefetched.current) return;
    prefetched.current = true;

    // Fire-and-forget — staleTime ensures we don't re-fetch if already cached
    queryClient.prefetchQuery({ queryKey: qk.pipeline.all, queryFn: fetchPipeline });
    queryClient.prefetchQuery({ queryKey: qk.schedule.today, queryFn: fetchTodaySchedule });
    queryClient.prefetchQuery({ queryKey: qk.earnings.byPeriod("month"), queryFn: () => fetchEarnings("month") });
    queryClient.prefetchQuery({ queryKey: qk.activity.recent, queryFn: () => fetchRecentActivity(15) });
    queryClient.prefetchQuery({ queryKey: qk.contacts.list({}), queryFn: () => fetchCrmContacts({ limit: 30 }) });
  }, [isAuthenticated, queryClient]);

  // Fetch unread notification count for the Alerts badge
  const { data: notifications } = useQuery({
    queryKey: qk.notifications.all,
    queryFn: fetchNotifications,
    enabled: isAuthenticated,
  });
  const unreadCount = notifications?.filter((n) => !n.read)?.length ?? 0;

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  // ── Tab focus refetching helper ─────────────────────────────
  // When a tab gains focus, invalidate stale queries so the user
  // always sees fresh data without a manual pull-to-refresh.
  const refetchOnFocus = useCallback(
    (keys: readonly (readonly string[])[]) => ({
      tabPress: () => {
        for (const key of keys) {
          queryClient.invalidateQueries({ queryKey: key, refetchType: "active" });
        }
      },
    }),
    [queryClient],
  );

  // Show nothing while checking auth (splash screen covers)
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#fff" }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#2563EB",
        tabBarInactiveTintColor: "#94A3B8",
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopColor: "#F1F5F9",
          borderTopWidth: 1,
          paddingTop: 8,
          paddingBottom: 4,
          height: 84,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          letterSpacing: 0.2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarAccessibilityLabel: "Home dashboard",
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} />,
        }}
        listeners={refetchOnFocus([qk.earnings.all, qk.schedule.today, qk.activity.recent])}
      />
      <Tabs.Screen
        name="scout"
        options={{
          title: "Scout",
          tabBarAccessibilityLabel: "Scout buildings",
          tabBarIcon: ({ color, size }) => <Search size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="pipeline"
        options={{
          title: "Pipeline",
          tabBarAccessibilityLabel: "Deal pipeline",
          tabBarIcon: ({ color, size }) => (
            <BarChart3 size={size} color={color} />
          ),
        }}
        listeners={refetchOnFocus([qk.pipeline.all])}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: "Clients",
          tabBarAccessibilityLabel: "Client onboarding",
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
        }}
        listeners={refetchOnFocus([qk.contacts.all])}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: "Alerts",
          tabBarAccessibilityLabel: `Notifications, ${unreadCount} unread`,
          tabBarIcon: ({ color, size }) => (
            <View>
              <Bell size={size} color={color} />
              <AnimatedBadge count={unreadCount} />
            </View>
          ),
        }}
        listeners={refetchOnFocus([qk.notifications.all])}
      />
    </Tabs>
  );
}
