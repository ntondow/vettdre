// ── Root Layout ───────────────────────────────────────────────
// Wraps the entire app with auth provider, React Query,
// biometric gate, and first-launch onboarding.

import { useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/lib/auth-context";
import { ErrorBoundary } from "@/components/error-boundary";
import { NetworkBanner } from "@/components/network-banner";
import { BiometricGate } from "@/components/biometric-gate";
import {
  OnboardingWalkthrough,
  hasCompletedOnboarding,
} from "@/components/onboarding-walkthrough";
import { restoreQueryCache, persistQueryCache } from "@/lib/query-persistence";
import { startQueueProcessor } from "@/lib/offline-queue";
import { subscribeToDeepLinks } from "@/lib/deep-linking";
import { useNotificationNavigation } from "@/lib/use-notification-navigation";
import * as SplashScreen from "expo-splash-screen";

// Prevent splash screen from hiding until auth check completes
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes — data feels instant on re-visit
      gcTime: 30 * 60 * 1000, // 30 minutes — keep in memory even when unmounted
      retry: 2,
      refetchOnWindowFocus: false, // Not applicable on mobile but explicit
    },
  },
});

// Render-less component that sets up notification tap → navigation
function NotificationNavigator() {
  useNotificationNavigation();
  return null;
}

export default function RootLayout() {
  const appState = useRef(AppState.currentState);
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  // Check onboarding status on mount
  useEffect(() => {
    hasCompletedOnboarding().then((done) => {
      setShowOnboarding(!done);
      // If onboarding needs to show, hide splash here since Tabs won't mount
      if (!done) {
        SplashScreen.hideAsync();
      }
    });
  }, []);

  // Safety net: hide splash after 8 seconds no matter what
  // (prevents infinite splash if any async step hangs)
  useEffect(() => {
    const timeout = setTimeout(() => {
      SplashScreen.hideAsync();
    }, 8000);
    return () => clearTimeout(timeout);
  }, []);

  // Restore query cache on startup
  useEffect(() => {
    restoreQueryCache(queryClient).catch(() => {});
  }, []);

  // Start offline queue processor — retries queued POSTs when connectivity returns
  useEffect(() => {
    const unsubscribe = startQueueProcessor();
    return unsubscribe;
  }, []);

  // Subscribe to deep links (vettdre:// and universal links)
  useEffect(() => {
    const unsubscribe = subscribeToDeepLinks();
    return unsubscribe;
  }, []);

  // Persist query cache when app goes to background
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (
        appState.current === "active" &&
        (next === "background" || next === "inactive")
      ) {
        persistQueryCache(queryClient).catch(() => {});
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, []);

  // Show onboarding on first launch (before anything else)
  if (showOnboarding === true) {
    return (
      <OnboardingWalkthrough onComplete={() => setShowOnboarding(false)} />
    );
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BiometricGate>
          <StatusBar style="dark" />
          <NetworkBanner />
          <NotificationNavigator />
          <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />

          {/* Scout flow */}
          <Stack.Screen
            name="scout/camera"
            options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }}
          />
          <Stack.Screen
            name="scout/screenshot"
            options={{ presentation: "card", animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="scout/url"
            options={{ presentation: "card", animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="scout/search"
            options={{ presentation: "card", animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="scout/resolving"
            options={{ presentation: "transparentModal", animation: "fade" }}
          />
          <Stack.Screen
            name="scout/profile"
            options={{ presentation: "card", animation: "slide_from_right" }}
          />

          {/* CRM Contacts */}
          <Stack.Screen
            name="contacts/index"
            options={{ presentation: "card", animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="contacts/[id]"
            options={{ presentation: "card", animation: "slide_from_right" }}
          />

          {/* Client flow */}
          <Stack.Screen
            name="clients/invite"
            options={{ presentation: "card", animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="clients/[id]"
            options={{ presentation: "card", animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="clients/invite-sent"
            options={{ presentation: "transparentModal", animation: "fade" }}
          />

          {/* Map scout */}
          <Stack.Screen
            name="scout/map"
            options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }}
          />

          {/* Voice memos */}
          <Stack.Screen
            name="scout/voice-memo"
            options={{ presentation: "card", animation: "slide_from_right" }}
          />

          {/* Saved buildings */}
          <Stack.Screen
            name="scout/saved"
            options={{ presentation: "card", animation: "slide_from_right" }}
          />

          {/* Earnings detail */}
          <Stack.Screen
            name="earnings"
            options={{ presentation: "card", animation: "slide_from_right" }}
          />

          {/* Deal submission */}
          <Stack.Screen
            name="deals/submit"
            options={{ presentation: "card", animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="deals/submitted"
            options={{
              presentation: "transparentModal",
              animation: "fade",
              gestureEnabled: false,
            }}
          />

          {/* Document scanner */}
          <Stack.Screen
            name="scanner"
            options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }}
          />

          {/* Pipeline drill-down */}
          <Stack.Screen
            name="pipeline/stage"
            options={{ presentation: "card", animation: "slide_from_right" }}
          />

          {/* Settings */}
          <Stack.Screen
            name="settings"
            options={{ presentation: "card", animation: "slide_from_right" }}
          />
          <Stack.Screen
            name="settings/edit-profile"
            options={{ presentation: "card", animation: "slide_from_right" }}
          />
        </Stack>
          </BiometricGate>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
