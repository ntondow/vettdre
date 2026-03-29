/**
 * Reference data loader — fetches configurable lookup data from the database.
 * Falls back to null so callers can use hardcoded defaults.
 */

import { prisma } from "@/lib/prisma";

export async function getReferenceData<T = unknown>(
  category: string,
  key: string
): Promise<T | null> {
  try {
    // Check if the ReferenceData table exists and has the data
    // For now this is a stub — returns null so callers fall back to hardcoded defaults
    // TODO: Create ReferenceData model in Prisma schema and wire up
    return null;
  } catch {
    return null;
  }
}
