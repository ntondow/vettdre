// ============================================================
// Fannie Mae Loan Lookup API Client
// Determines if a property has a Fannie Mae-backed mortgage.
// Uses ROPC OAuth2 flow via fmsso-api.fanniemae.com
// Pure library (NOT "use server")
// ============================================================

// ============================================================
// Types
// ============================================================

export interface FannieLoanResult {
  isOwnedByFannieMae: boolean;
  address: string;
  lookupDate: string;
  servicerName?: string;
  propertyType?: string;
}

// ============================================================
// Configuration — env vars
// ============================================================

// Fannie Mae Developer Portal credentials
// FANNIE_CLIENT_ID — App ID / Client ID from Developer Portal
// FANNIE_CLIENT_SECRET — App password / Client Secret
// FANNIE_API_KEY — API Key from Developer Portal (optional, for Apigee gateway)

const TOKEN_ENDPOINT = "https://fmsso-api.fanniemae.com/as/token.oauth2";
const API_BASE = "https://api.fanniemae.com/v1";

function getCredentials(): { clientId: string; clientSecret: string; apiKey: string | null } | null {
  const clientId = process.env.FANNIE_CLIENT_ID;
  const clientSecret = process.env.FANNIE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, apiKey: process.env.FANNIE_API_KEY || null };
}

// ============================================================
// OAuth Token Cache
// Token expires in ~5 minutes per Fannie Mae docs.
// We cache until 60 seconds before expiry.
// ============================================================

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  const creds = getCredentials();
  if (!creds) return null;

  // Return cached token if still valid
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    // Try ROPC flow first (Fannie Mae uses grant_type=password with AppID/AppPassword)
    const body = new URLSearchParams({
      grant_type: "password",
      username: creds.clientId,
      password: creds.clientSecret,
    });

    let res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: controller.signal,
    });

    // Fallback: try client_credentials flow
    if (!res.ok && res.status !== 200) {
      const ccBody = new URLSearchParams({
        grant_type: "client_credentials",
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      });

      res = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: ccBody.toString(),
        signal: controller.signal,
      });
    }

    // Fallback: try Basic auth
    if (!res.ok && res.status !== 200) {
      const basicAuth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");

      res = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`,
        },
        body: "grant_type=client_credentials",
        signal: controller.signal,
      });
    }

    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.warn(`Fannie Mae OAuth failed (HTTP ${res.status}): ${errText.slice(0, 200)}`);
      return null;
    }

    const json = await res.json();
    const token = json.access_token;
    const expiresIn = json.expires_in || 300; // default 5 min

    if (!token) {
      console.warn("Fannie Mae OAuth: no access_token in response");
      return null;
    }

    // Cache until 60 seconds before expiry
    cachedToken = {
      token,
      expiresAt: Date.now() + (expiresIn - 60) * 1000,
    };

    return token;
  } catch (err) {
    console.warn("Fannie Mae OAuth error:", err);
    return null;
  }
}

// ============================================================
// LRU Cache — 500 entries, 7-day TTL
// ============================================================

const cache = new Map<string, { data: FannieLoanResult; ts: number }>();
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const CACHE_MAX = 500;

function getCached(key: string): FannieLoanResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key: string, data: FannieLoanResult) {
  if (cache.size >= CACHE_MAX) {
    let oldestKey: string | null = null;
    let oldestTs = Infinity;
    for (const [k, v] of cache) {
      if (v.ts < oldestTs) {
        oldestTs = v.ts;
        oldestKey = k;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { data, ts: Date.now() });
}

// ============================================================
// Loan Lookup — by structured address
// ============================================================

export async function lookupLoanByAddress(
  street: string,
  city: string,
  state: string,
  zip: string,
): Promise<FannieLoanResult | null> {
  if (!street || !city || !state) return null;

  const cacheKey = `fannie:${street}:${city}:${state}:${zip}`.toLowerCase();
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const token = await getAccessToken();
  if (!token) return null;

  const creds = getCredentials();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    // The exact endpoint path is not publicly documented.
    // Try the most likely paths in order.
    const endpoints = [
      `${API_BASE}/loan-lookup`,
      `${API_BASE}/loanlookup`,
      `${API_BASE}/loans/lookup`,
    ];

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    // Add API key header if available (Apigee gateway may require it)
    if (creds?.apiKey) {
      headers["x-api-key"] = creds.apiKey;
    }

    const requestBody = JSON.stringify({
      propertyStreetAddress: street,
      propertyCity: city,
      propertyState: state,
      propertyZipCode: zip.slice(0, 5),
    });

    let responseData: any = null;

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers,
          body: requestBody,
          signal: controller.signal,
        });

        if (res.ok) {
          responseData = await res.json();
          break;
        }

        // Also try GET with query params
        if (res.status === 405 || res.status === 404) {
          const params = new URLSearchParams({
            street,
            city,
            state,
            zip: zip.slice(0, 5),
          });
          const getRes = await fetch(`${endpoint}?${params}`, {
            headers: { ...headers, "Content-Type": "" },
            signal: controller.signal,
          });
          if (getRes.ok) {
            responseData = await getRes.json();
            break;
          }
        }
      } catch {
        // Try next endpoint
        continue;
      }
    }

    clearTimeout(timeout);

    if (!responseData) {
      return null;
    }

    // Parse response — the exact field names aren't publicly documented,
    // so we check several possible variants
    const isOwned =
      responseData.isOwnedByFannieMae ??
      responseData.owned ??
      responseData.fannieMaeOwned ??
      responseData.loanOwned ??
      (responseData.status === "FOUND" || responseData.result === "MATCH") ??
      false;

    const result: FannieLoanResult = {
      isOwnedByFannieMae: !!isOwned,
      address: `${street}, ${city}, ${state} ${zip}`,
      lookupDate: new Date().toISOString().slice(0, 10),
      servicerName: responseData.servicerName || responseData.servicer || undefined,
      propertyType: responseData.propertyType || undefined,
    };

    setCache(cacheKey, result);
    return result;
  } catch (err) {
    console.warn("Fannie Mae loan lookup error:", err);
    return null;
  }
}

// ============================================================
// Loan Lookup — by full address string (convenience)
// Parses "123 Main St, New York, NY 10001" into components
// ============================================================

export async function lookupLoan(address: string): Promise<FannieLoanResult | null> {
  if (!address) return null;

  // Parse address string into components
  // Expected formats:
  //   "123 Main St, New York, NY 10001"
  //   "123 Main St, Brooklyn, NY"
  const parts = address.split(",").map(s => s.trim());
  if (parts.length < 2) return null;

  const street = parts[0];

  // Last part may contain state + zip
  const lastPart = parts[parts.length - 1];
  const stateZipMatch = lastPart.match(/^\s*([A-Z]{2})\s*(\d{5})?/i);

  let city: string;
  let state: string;
  let zip: string;

  if (stateZipMatch) {
    state = stateZipMatch[1].toUpperCase();
    zip = stateZipMatch[2] || "";
    city = parts.length >= 3 ? parts[parts.length - 2] : "";
  } else {
    // Assume second part is city, default to NY
    city = parts[1];
    state = "NY";
    zip = "";
  }

  return lookupLoanByAddress(street, city, state, zip);
}

// ============================================================
// Test connection — validates OAuth credentials
// ============================================================

export async function testConnection(): Promise<{ success: boolean; message: string }> {
  const creds = getCredentials();
  if (!creds) {
    return { success: false, message: "FANNIE_CLIENT_ID or FANNIE_CLIENT_SECRET not set" };
  }

  const token = await getAccessToken();
  if (token) {
    return { success: true, message: "OAuth token obtained successfully" };
  }
  return { success: false, message: "Failed to obtain OAuth token — check credentials" };
}
