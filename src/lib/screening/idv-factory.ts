/**
 * IDV Provider Factory
 *
 * Selects provider based on IDV_PROVIDER env var.
 * Automatic failover: Didit → Stripe Identity on 5xx / timeout.
 */

import type {
  IdvProviderClient,
  CreateSessionParams,
  CreateSessionResult,
  IdvProvider,
} from "./idv-provider";
import { diditProvider } from "./idv-didit";
import { stripeIdentityProvider } from "./idv-stripe";

function getProvider(name?: string): IdvProviderClient {
  switch (name?.toLowerCase()) {
    case "stripe":
      return stripeIdentityProvider;
    case "didit":
    default:
      return diditProvider;
  }
}

function getFallbackProvider(primary: IdvProvider): IdvProviderClient | null {
  if (primary === "didit") return stripeIdentityProvider;
  if (primary === "stripe") return diditProvider;
  return null;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    // 5xx server errors or timeouts
    if (/5\d{2}/.test(msg) || msg.includes("abort") || msg.includes("timeout")) {
      return true;
    }
  }
  return false;
}

/**
 * Get the configured primary IDV provider client.
 */
export function getIdvProvider(): IdvProviderClient {
  return getProvider(process.env.IDV_PROVIDER);
}

/**
 * Create an IDV session with automatic failover.
 * Tries the primary provider first; if it returns 5xx or times out,
 * automatically falls back to the secondary provider.
 */
export async function createIdvSessionWithFallback(
  params: CreateSessionParams,
): Promise<CreateSessionResult> {
  const primary = getProvider(process.env.IDV_PROVIDER);

  try {
    return await primary.createSession(params);
  } catch (error) {
    if (!isRetryableError(error)) throw error;

    const fallback = getFallbackProvider(primary.name);
    if (!fallback) throw error;

    console.warn(
      `[IDV Factory] ${primary.name} failed with retryable error, falling back to ${fallback.name}:`,
      error instanceof Error ? error.message : error,
    );

    return await fallback.createSession(params);
  }
}

/**
 * Fetch IDV result from the provider that created the session.
 */
export function getIdvProviderByName(name: string): IdvProviderClient {
  return getProvider(name);
}
