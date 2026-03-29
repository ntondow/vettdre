"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Copy, Check, MessageSquare, Gift, UserPlus, CreditCard, Zap,
} from "lucide-react";
import { getReferralData } from "../actions";

export default function ReferralPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [friends, setFriends] = useState(0);
  const [upgraded, setUpgraded] = useState(0);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getReferralData().then((d) => {
      setCode(d.referralCode);
      setFriends(d.friendsReferred);
      setUpgraded(d.friendsUpgraded);
      setLoading(false);
    });
  }, []);

  const referralUrl = `https://app.vettdre.com/signup?ref=${code}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSmsShare = () => {
    const msg = encodeURIComponent(
      `Hey! I've been using VettdRE's AI Leasing Agent — it answers tenant inquiries and books showings 24/7. Sign up with my link and get your first month of Pro free when you upgrade: ${referralUrl}`,
    );
    window.open(`sms:?body=${msg}`, "_blank");
  };

  const creditsEarned = upgraded * 149;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={() => router.push("/leasing")} className="p-1.5 hover:bg-slate-100 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Refer & Earn</h1>
            <p className="text-sm text-slate-500">Give 1 month free, get 1 month free</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Referral Link Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <div className="flex items-center gap-2 text-blue-600">
            <Gift className="w-5 h-5" />
            <h2 className="font-semibold text-lg">Your Referral Link</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 font-mono truncate">
              {referralUrl}
            </div>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors shrink-0"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            onClick={handleSmsShare}
            className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-lg transition-colors w-full justify-center"
          >
            <MessageSquare className="w-4 h-4" />
            Share via SMS
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <div className="text-2xl font-bold text-slate-900">{friends}</div>
            <div className="text-xs text-slate-500 mt-1">Friends Referred</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <div className="text-2xl font-bold text-slate-900">{upgraded}</div>
            <div className="text-xs text-slate-500 mt-1">Upgraded to Pro</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <div className="text-2xl font-bold text-emerald-600">${creditsEarned}</div>
            <div className="text-xs text-slate-500 mt-1">Credits Earned</div>
          </div>
        </div>

        {/* How It Works */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
          <h2 className="font-semibold text-lg text-slate-900">How It Works</h2>
          <div className="space-y-4">
            {[
              { icon: UserPlus, title: "Share your link", desc: "Send your unique referral link to a friend or fellow landlord." },
              { icon: Zap, title: "Friend signs up free", desc: "They create an account and set up their AI Leasing Agent." },
              { icon: CreditCard, title: "Friend upgrades to Pro", desc: "When they upgrade, you both get 1 month free ($149 credit)." },
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-4">
                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center shrink-0">
                  <step.icon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="font-medium text-slate-900">{step.title}</div>
                  <div className="text-sm text-slate-500 mt-0.5">{step.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Fine Print */}
        <p className="text-xs text-slate-400 text-center px-4">
          Credit applied to your next invoice. Both accounts must be active. One credit per referred account.
        </p>
      </div>
    </div>
  );
}
