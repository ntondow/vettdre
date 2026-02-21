"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function PendingApprovalPage() {
  const supabase = createClient();
  const router = useRouter();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-8">
      <div className="w-full max-w-md text-center space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            Vettd<span className="text-blue-600">RE</span>
          </h1>
        </div>
        <div className="space-y-3">
          <h2 className="text-2xl font-bold text-slate-900">Account Pending Approval</h2>
          <p className="text-slate-500">
            Your account is pending approval. You&apos;ll receive an email when your account is
            activated.
          </p>
        </div>
        <div className="flex flex-col items-center gap-3 pt-2">
          <button
            onClick={handleSignOut}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors"
          >
            Sign Out
          </button>
          <Link href="/login" className="text-sm text-blue-600 font-medium">
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
