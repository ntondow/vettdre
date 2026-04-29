import { redirect } from "next/navigation";

// /brokerage/reports has no content of its own — it's a router shim that
// redirects to the default sub-report. Preserve every query param across the
// redirect so super_admin's ?as_org= survives (B-012). Without this preserve,
// the redirect drops the override and pnl loads against the user's home org.
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      for (const item of v) qs.append(k, item);
    } else {
      qs.set(k, v);
    }
  }
  const query = qs.toString();
  redirect(`/brokerage/reports/pnl${query ? `?${query}` : ""}`);
}
