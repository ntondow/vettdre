"use client";
import { useState, useEffect, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function SignUpPage() {
  return (
    <Suspense>
      <SignUpForm />
    </Suspense>
  );
}

function SignUpForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [magicSent, setMagicSent] = useState(false);
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect");
  const refCode = searchParams.get("ref");
  const prefillEmail = searchParams.get("email");
  const supabase = createClient();

  // Pre-fill email from invite link
  useEffect(() => {
    if (prefillEmail && !email) setEmail(prefillEmail);
  }, [prefillEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  // Store referral code in cookie (30-day expiry) so it survives OAuth/magic-link flow
  useEffect(() => {
    if (refCode) {
      document.cookie = `referral_code=${encodeURIComponent(refCode)};path=/;max-age=${30 * 24 * 60 * 60};samesite=lax`;
    }
  }, [refCode]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}/auth/callback${redirectTo ? `?next=${encodeURIComponent(redirectTo)}` : ""}` },
    });
    if (error) { setError(error.message); setLoading(false); } else { setSuccess(true); setLoading(false); }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback${redirectTo ? `?next=${encodeURIComponent(redirectTo)}` : ""}` },
    });
    if (error) { setError(error.message); setLoading(false); } else { setMagicSent(true); setLoading(false); }
  };

  if (success || magicSent) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-8">
        <div className="max-w-md w-full text-center space-y-4">
          <h2 className="text-2xl font-bold text-slate-900">Check your email</h2>
          <p className="text-slate-500">We sent a {magicSent ? "sign-in" : "confirmation"} link to <strong>{email}</strong>.</p>
          <p className="text-sm text-slate-400">Click the link in your email to get started.</p>
          <Link href={redirectTo ? `/login?redirect=${encodeURIComponent(redirectTo)}` : "/login"} className="inline-block mt-4 text-blue-600 font-medium text-sm">Back to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-8">
      <div className="w-full max-w-md space-y-8">
        {refCode && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
            You were invited! Sign up free and get your first month of Pro for free when you upgrade.
          </div>
        )}
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Vettd<span className="text-blue-600">RE</span></h1>
          <h2 className="mt-6 text-2xl font-bold text-slate-900">Create your account</h2>
          <p className="mt-1 text-sm text-slate-500">Start exploring NYC property intelligence</p>
        </div>

        {mode === "password" ? (
          <form onSubmit={handleSignUp} className="space-y-5">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-slate-700 mb-1.5">Full name</label>
              <input id="fullName" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Jane Smith" />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="you@company.com" />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Minimum 8 characters" />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors disabled:opacity-50">{loading ? "Creating account..." : "Create account"}</button>
          </form>
        ) : (
          <form onSubmit={handleMagicLink} className="space-y-5">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{error}</div>}
            <div>
              <label htmlFor="magic-email" className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
              <input id="magic-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="you@company.com" />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors disabled:opacity-50">{loading ? "Sending link..." : "Send magic link"}</button>
          </form>
        )}

        <div className="relative">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
          <div className="relative flex justify-center text-xs"><span className="bg-white px-2 text-slate-400">or</span></div>
        </div>

        <button
          type="button"
          onClick={() => { setMode(mode === "password" ? "magic" : "password"); setError(null); }}
          className="w-full border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium py-2.5 px-4 rounded-lg text-sm transition-colors"
        >
          {mode === "password" ? "Sign up with magic link" : "Sign up with password"}
        </button>

        <p className="text-center text-sm text-slate-500">Already have an account? <Link href={redirectTo ? `/login?redirect=${encodeURIComponent(redirectTo)}` : "/login"} className="text-blue-600 font-medium">Sign in</Link></p>
      </div>
    </div>
  );
}
