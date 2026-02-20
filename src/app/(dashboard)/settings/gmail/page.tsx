"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getGmailAccount, disconnectGmail } from "../actions";

const fmtDate = (d: string | null) => d ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(d)) : "Never";

export default function GmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [account, setAccount] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  const gmailStatus = searchParams.get("gmail");
  const gmailError = searchParams.get("reason");

  useEffect(() => { getGmailAccount().then(a => { setAccount(a); setLoading(false); }); }, []);

  const handleDisconnect = async () => {
    if (!account) return;
    if (!confirm("Disconnect Gmail? Synced emails will be kept.")) return;
    setDisconnecting(true);
    await disconnectGmail(account.id);
    setAccount(null);
    setDisconnecting(false);
  };

  const tokenExpired = account?.tokenExpiry && new Date(account.tokenExpiry) < new Date();

  if (loading) return <div className="animate-pulse space-y-4"><div className="h-6 bg-slate-100 rounded w-48" /><div className="h-40 bg-slate-100 rounded" /></div>;

  return (
    <div>
      <h1 className="text-lg font-bold text-slate-900 mb-1">Gmail Connection</h1>
      <p className="text-sm text-slate-500 mb-6">Manage your Gmail integration for syncing emails</p>

      {/* Status banners */}
      {gmailStatus === "connected" && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700 font-medium">
          Gmail connected successfully! Go to <Link href="/messages" className="underline">Messages</Link> to sync.
        </div>
      )}
      {gmailStatus === "error" && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          Connection failed{gmailError ? `: ${gmailError}` : ""}. Please try again.
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        {account ? (
          <div className="space-y-5">
            {/* Status */}
            <div className="flex items-center gap-3">
              <span className={`w-3 h-3 rounded-full ${tokenExpired ? "bg-red-500" : "bg-emerald-500"}`} />
              <div>
                <p className="text-sm font-bold text-slate-900">{account.email}</p>
                <p className="text-xs text-slate-400">
                  {tokenExpired ? "Token expired — re-authenticate" : "Connected and active"}
                </p>
              </div>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-4 py-3 border-y border-slate-100">
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase mb-1">Last Synced</p>
                <p className="text-sm text-slate-700">{fmtDate(account.syncedAt)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase mb-1">Token Expiry</p>
                <p className={`text-sm ${tokenExpired ? "text-red-600 font-medium" : "text-slate-700"}`}>{fmtDate(account.tokenExpiry)}</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
              <Link href="/messages"
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                Go to Messages
              </Link>
              {tokenExpired && (
                <Link href="/api/auth/gmail"
                  className="px-4 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg hover:bg-amber-600 transition-colors">
                  Re-authenticate
                </Link>
              )}
              <button onClick={handleDisconnect} disabled={disconnecting}
                className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 text-sm font-medium rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors">
                {disconnecting ? "Disconnecting..." : "Disconnect"}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-2xl">📬</span>
            </div>
            <p className="text-sm font-semibold text-slate-700 mb-1">No Gmail account connected</p>
            <p className="text-xs text-slate-400 mb-4">Connect Gmail to sync emails, auto-create leads, and send messages.</p>
            <Link href="/api/auth/gmail"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors">
              Connect Gmail Account
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
