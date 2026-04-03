// ── Deep Linking Handler ─────────────────────────────────────
// Parses vettdre:// and https://app.vettdre.com URLs and maps
// them to internal Expo Router paths.
//
// Supported routes:
//   vettdre://scout?address=123+Main+St
//   vettdre://scout/profile?bbl=1234567890
//   vettdre://scout/map
//   vettdre://client/abc-123
//   vettdre://deal/submit
//   vettdre://earnings
//   https://app.vettdre.com/book/slug-123       → opens in browser
//   https://app.vettdre.com/sign/token-abc      → opens in browser
//   https://app.vettdre.com/submit-deal/token   → /deals/submit

import * as Linking from "expo-linking";
import { router } from "expo-router";

export interface ParsedLink {
  screen: string;
  params?: Record<string, string>;
}

/**
 * Parse an incoming URL into a screen path + params.
 * Returns null if the URL doesn't match any known route.
 */
export function parseDeepLink(url: string): ParsedLink | null {
  try {
    const parsed = Linking.parse(url);
    const path = parsed.path ?? "";
    const query = parsed.queryParams ?? {};

    // vettdre://scout?address=...
    if (path === "scout" && query.address) {
      return { screen: "/scout/search", params: { address: query.address as string } };
    }

    // vettdre://scout/profile?bbl=...
    if (path === "scout/profile" && query.bbl) {
      return { screen: "/scout/profile", params: { bbl: query.bbl as string } };
    }

    // vettdre://scout/map
    if (path === "scout/map") {
      return { screen: "/scout/map" };
    }

    // vettdre://client/:id
    if (path.startsWith("client/")) {
      const id = path.replace("client/", "");
      if (id) return { screen: `/clients/${id}` };
    }

    // vettdre://deal/submit
    if (path === "deal/submit" || path === "deals/submit") {
      return { screen: "/deals/submit" };
    }

    // vettdre://earnings
    if (path === "earnings") {
      return { screen: "/earnings" };
    }

    // vettdre://scanner
    if (path === "scanner") {
      return { screen: "/scanner" };
    }

    // Universal links: https://app.vettdre.com/book/:slug
    if (path.startsWith("book/")) {
      const slug = path.replace("book/", "");
      Linking.openURL(`https://app.vettdre.com/book/${slug}`).catch(() => {});
      return null;
    }

    // https://app.vettdre.com/sign/:token — open in browser
    if (path.startsWith("sign/")) {
      Linking.openURL(`https://app.vettdre.com/${path}`).catch(() => {});
      return null;
    }

    // https://app.vettdre.com/submit-deal/:token
    if (path.startsWith("submit-deal/")) {
      return { screen: "/deals/submit" };
    }

    return null;
  } catch {
    console.warn("[DeepLink] Failed to parse URL:", url);
    return null;
  }
}

/**
 * Handle an incoming deep link URL by navigating to the
 * appropriate screen. Call this from the root layout's
 * Linking listener.
 */
export function handleDeepLink(url: string): boolean {
  const result = parseDeepLink(url);
  if (!result) return false;

  try {
    router.push({
      pathname: result.screen,
      params: result.params,
    } as any);
    return true;
  } catch {
    console.warn("[DeepLink] Failed to navigate to:", result.screen);
    return false;
  }
}

/**
 * Subscribe to incoming deep links. Returns an unsubscribe function.
 */
export function subscribeToDeepLinks(): () => void {
  // Handle links that open the app
  const subscription = Linking.addEventListener("url", (event) => {
    handleDeepLink(event.url);
  });

  // Check if app was opened with a link (cold start)
  Linking.getInitialURL()
    .then((url) => {
      if (url) handleDeepLink(url);
    })
    .catch((err) => {
      console.warn("[DeepLink] Failed to get initial URL:", err);
    });

  return () => subscription.remove();
}
