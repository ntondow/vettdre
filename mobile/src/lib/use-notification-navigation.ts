// ── Notification Deep Link Handler ────────────────────────────
// Listens for notification taps (both foreground and background/killed)
// and navigates to the appropriate screen based on notification data.
//
// Notification payload shape (set server-side when sending push):
//   data: { screen: string, params?: Record<string, string> }
//
// Usage: call useNotificationNavigation() once in the root layout.

import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";
import * as Notifications from "expo-notifications";

type RouteMap = Record<string, string>;

// Maps notification data.screen → Expo Router path
const SCREEN_ROUTES: RouteMap = {
  // Client onboarding
  client_detail: "/clients/",
  // CRM contacts
  contact_detail: "/contacts/",
  // Pipeline
  pipeline: "/(tabs)/pipeline",
  // Deals
  deal_submit: "/deals/submit",
  // Earnings
  earnings: "/earnings",
  // Scout / building
  building: "/scout/profile",
  // Alerts
  alerts: "/(tabs)/alerts",
  // Dashboard
  dashboard: "/(tabs)",
};

export function useNotificationNavigation() {
  const router = useRouter();
  const lastNotificationResponse = Notifications.useLastNotificationResponse();

  // Handle notification taps when app is already open
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        handleNotificationTap(response, router);
      }
    );

    return () => subscription.remove();
  }, [router]);

  // Handle notification that launched the app from killed state
  useEffect(() => {
    if (lastNotificationResponse) {
      handleNotificationTap(lastNotificationResponse, router);
    }
  }, [lastNotificationResponse, router]);
}

function handleNotificationTap(
  response: Notifications.NotificationResponse,
  router: ReturnType<typeof useRouter>
) {
  const data = response.notification.request.content.data;
  if (!data || typeof data !== "object") return;

  const screen = data.screen as string | undefined;
  const entityId = data.entityId as string | undefined;

  if (!screen) {
    // Default: go to alerts
    router.push("/(tabs)/alerts");
    return;
  }

  const basePath = SCREEN_ROUTES[screen];
  if (!basePath) {
    router.push("/(tabs)/alerts");
    return;
  }

  // If the route needs an ID parameter (ends with /)
  if (basePath.endsWith("/") && entityId) {
    router.push(`${basePath}${entityId}` as any);
  } else {
    router.push(basePath as any);
  }
}
