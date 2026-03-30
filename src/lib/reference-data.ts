// ============================================================
// Reference Data — Stub for ReferenceDataCatalog reads
// Returns null — callers use hardcoded fallbacks
// TODO: Implement when ReferenceDataCatalog model is added
// ============================================================

export async function getReferenceData<T>(
  _category: string,
  _key: string,
): Promise<T | null> {
  return null;
}
