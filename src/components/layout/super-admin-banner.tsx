"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";

interface Props {
  // Org id → name map. Empty/undefined when the viewer is not super_admin —
  // the banner self-hides via the as_org check, so the map only matters when
  // an override is actually active.
  orgsById?: Record<string, string>;
  realOrgId?: string;
  realOrgName?: string;
}

export default function SuperAdminBanner({ orgsById, realOrgId, realOrgName }: Props) {
  const sp = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const asOrg = sp.get("as_org");

  // Self-hide for: no override param, no-op override (target = home), or when
  // a non-super_admin user lands on a URL with ?as_org=... (no orgsById passed).
  if (!asOrg) return null;
  if (realOrgId && asOrg === realOrgId) return null;
  if (!orgsById) return null;

  const viewingName = orgsById[asOrg] ?? "another organization";

  function handleExit() {
    const newParams = new URLSearchParams(sp.toString());
    newParams.delete("as_org");
    const qs = newParams.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    // Banner must stack above the fixed Sidebar (z-40) — without z-50, the
    // sidebar logo column covers the leftmost ~60px of the banner and clips
    // the "Super-admin override:" prefix (B-001).
    <div className="relative z-50 bg-amber-500 text-amber-950 text-sm font-medium shadow-sm border-b border-amber-600">
      <div className="px-4 md:px-6 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span aria-hidden className="flex-shrink-0 w-2 h-2 rounded-full bg-amber-900 animate-pulse" />
          <span className="truncate">
            <strong>Super-admin override:</strong> viewing as{" "}
            <strong className="font-semibold">{viewingName}</strong>
            {realOrgName ? (
              <span className="text-amber-900/80 ml-2">(home: {realOrgName})</span>
            ) : null}
          </span>
        </div>
        <button
          type="button"
          onClick={handleExit}
          className="flex-shrink-0 underline underline-offset-2 hover:text-amber-900 whitespace-nowrap"
        >
          Exit override
        </button>
      </div>
    </div>
  );
}
