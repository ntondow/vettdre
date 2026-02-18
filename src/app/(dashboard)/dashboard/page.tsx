import { createClient } from "@/lib/supabase/server";
import Header from "@/components/layout/header";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const name = user?.user_metadata?.full_name?.split(" ")[0] || "there";

  return (
    <>
      <Header title={`Welcome, ${name}`} subtitle="Here's what's happening with your pipeline." />
      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Total Contacts", value: "0", icon: "👥" },
            { label: "Active Deals", value: "0", icon: "📋" },
            { label: "Pipeline Value", value: "$0", icon: "💰" },
            { label: "AI Lookups Left", value: "50", icon: "🧠" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">{stat.label}</p>
                <span className="text-2xl">{stat.icon}</span>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-8 bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-4xl mb-4">🚀</p>
          <h3 className="text-lg font-semibold text-slate-900">VettdRE is ready!</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">Your AI-native CRM is set up. Start by adding your first contact from the Contacts page.</p>
        </div>
      </div>
    </>
  );
}
