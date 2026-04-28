"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getAllOrganizations, type OrgListEntry } from "./admin-actions";

export default function OrgSwitcher({ realOrgId }: { realOrgId: string }) {
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgListEntry[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAllOrganizations()
      .then(setOrgs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? orgs.filter(
          (o) =>
            o.name.toLowerCase().includes(q) ||
            o.slug.toLowerCase().includes(q) ||
            o.id.toLowerCase().includes(q),
        )
      : orgs;
    // Surface the user's home org first so "exit override" + "view as home"
    // are both one click away.
    return [...list].sort((a, b) => {
      if (a.id === realOrgId) return -1;
      if (b.id === realOrgId) return 1;
      return 0;
    });
  }, [orgs, query, realOrgId]);

  function viewAs(orgId: string) {
    if (orgId === realOrgId) {
      // No-op override: just clear and go home.
      router.push("/dashboard");
    } else {
      router.push(`/dashboard?as_org=${encodeURIComponent(orgId)}`);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">View as another organization</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Pick a tenant to load its dashboard. Actions you take while overridden are stamped in
            the audit log with your real identity.
          </p>
        </div>
      </div>

      <input
        type="search"
        placeholder="Filter by name, slug, or id…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
      />

      <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
        {loading ? (
          <div className="px-3 py-4 text-sm text-slate-500">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-4 text-sm text-slate-500">No organizations match.</div>
        ) : (
          filtered.map((org) => {
            const isHome = org.id === realOrgId;
            return (
              <button
                key={org.id}
                type="button"
                onClick={() => viewAs(org.id)}
                className="w-full text-left px-3 py-2.5 hover:bg-slate-50 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate flex items-center gap-2">
                    {org.name}
                    {isHome ? (
                      <span className="text-[10px] uppercase tracking-wide bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                        home
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {org.slug} · {org.userCount} user{org.userCount === 1 ? "" : "s"}
                  </div>
                </div>
                <span className="text-xs text-blue-600 flex-shrink-0">
                  {isHome ? "Open" : "View as →"}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
