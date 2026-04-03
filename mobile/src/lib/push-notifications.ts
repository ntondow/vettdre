// ── Push Notification Setup ──────────────────────────────────
// Registers for Expo push notifications and sends the token
// to the backend for storage. Used by auth-context on login.

import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { API_URL, getAuthHeaders } from "./api";

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request permissions and get the Expo push token.
 * Returns the token string or null if permissions denied / not a device.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Push notifications only work on physical devices
  if (!Device.isDevice) {
    if (__DEV__) console.log("[push] Not a physical device — skipping registration");
    return null;
  }

  // Check existing permission
  const { status: existingStatus } =
    await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request permission if not already granted
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    if (__DEV__) console.log("[push] Permission not granted");
    return null;
  }

  // Android needs a notification channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#2563EB",
    });
  }

  // Get Expo push token
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
    });
    return tokenData.data;
  } catch (err) {
    console.error("[push] Failed to get push token:", err);
    return null;
  }
}

/**
 * Send the push token to the backend for storage.
 */
export async function sendPushTokenToServer(
  expoPushToken: string
): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    if (!headers["Authorization"]) return;

    await fetch(`${API_URL}/api/mobile/push-token`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        token: expoPushToken,
        platform: Platform.OS,
      }),
    });
  } catch (err) {
    console.warn("[push] Failed to send token to server:", err);
  }
}

/**
 * Remove the push token from the backend on logout.
 */
export async function removePushTokenFromServer(): Promise<void> {
  try {
    const headers = await getAuthHeaders();
    if (!headers["Authorization"]) return;

    await fetch(`${API_URL}/api/mobile/push-token`, {
      method: "DELETE",
      headers,
      body: JSON.stringify({ platform: Platform.OS }),
    });
  } catch {
    // Best-effort — don't block logout if this fails
  }
}

/**
 * Combined: register + send to server. Call on app startup after auth.
 */
export async function setupPushNotifications(): Promise<void> {
  const token = await registerForPushNotifications();
  if (token) {
    await sendPushTokenToServer(token);
  }
}
