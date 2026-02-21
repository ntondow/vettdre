import { createClient } from "@/lib/supabase/server";
import prisma from "@/lib/prisma";
import Header from "@/components/layout/header";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  const name = authUser?.user_metadata?.full_name?.split(" ")[0] || "there";

  // Fetch real stats
  let totalContacts = 0;
  let activeDeals = 0;
  let pipelineValue = 0;
  let aiLookupsLeft = 50;
  let recentActivity: { type: string; subject: string | null; occurredAt: Date; contactName: string }[] = [];
  let upcomingTasks: { id: string; title: string; priority: string; dueAt: Date | null; contactName: string }[] = [];

  if (authUser) {
    const user = await prisma.user.findUnique({
      where: { authProviderId: authUser.id },
      include: { organization: true },
    });

    if (user) {
      const orgId = user.orgId;

      const [contactCount, dealStats, orgData, activities, tasks] = await Promise.all([
        prisma.contact.count({ where: { orgId } }),
        prisma.deal.aggregate({
          where: { orgId, status: "open" },
          _count: true,
          _sum: { dealValue: true },
        }),
        prisma.organization.findUnique({
          where: { id: orgId },
          select: { aiLookupsUsed: true, aiLookupsLimit: true },
        }),
        prisma.activity.findMany({
          where: { orgId },
          orderBy: { occurredAt: "desc" },
          take: 5,
          include: { contact: { select: { firstName: true, lastName: true } } },
        }),
        prisma.task.findMany({
          where: { orgId, status: { not: "completed" } },
          orderBy: { dueAt: "asc" },
          take: 5,
          include: { contact: { select: { firstName: true, lastName: true } } },
        }),
      ]);

      totalContacts = contactCount;
      activeDeals = dealStats._count;
      pipelineValue = Number(dealStats._sum.dealValue || 0);
      aiLookupsLeft = Math.max(0, (orgData?.aiLookupsLimit || 50) - (orgData?.aiLookupsUsed || 0));

      recentActivity = activities.map(a => ({
        type: a.type,
        subject: a.subject,
        occurredAt: a.occurredAt,
        contactName: a.contact ? `${a.contact.firstName} ${a.contact.lastName}`.trim() : "",
      }));

      upcomingTasks = tasks.map(t => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        dueAt: t.dueAt,
        contactName: t.contact ? `${t.contact.firstName} ${t.contact.lastName}`.trim() : "",
      }));
    }
  }

  const fmtDate = (d: Date) => {
    try { return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d); }
    catch { return ""; }
  };

  const activityIcons: Record<string, string> = { email: "✉️", call: "📞", text: "💬", showing: "🏠", note: "📝", meeting: "🤝", document: "📄", system: "⚙️" };
  const priorityColors: Record<string, string> = { urgent: "text-red-600", high: "text-orange-600", medium: "text-amber-600", low: "text-slate-500" };

  const stats = [
    { label: "Total Contacts", value: totalContacts.toLocaleString(), icon: "👥" },
    { label: "Active Deals", value: activeDeals.toLocaleString(), icon: "📋" },
    { label: "Pipeline Value", value: "$" + pipelineValue.toLocaleString(), icon: "💰" },
    { label: "AI Lookups Left", value: aiLookupsLeft.toLocaleString(), icon: "🧠" },
  ];

  const hasActivity = recentActivity.length > 0 || upcomingTasks.length > 0;

  return (
    <>
      <Header title={`Welcome, ${name}`} subtitle="Here's what's happening with your pipeline." />
      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">{stat.label}</p>
                <span className="text-2xl">{stat.icon}</span>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
            </div>
          ))}
        </div>

        {hasActivity ? (
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Recent Activity */}
            {recentActivity.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-sm font-bold text-slate-900 mb-4">Recent Activity</h3>
                <div className="space-y-3">
                  {recentActivity.map((a, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="text-base mt-0.5">{activityIcons[a.type] || "📌"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-900 truncate">{a.subject || a.type}</p>
                        <p className="text-xs text-slate-400">{a.contactName ? a.contactName + " · " : ""}{fmtDate(a.occurredAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming Tasks */}
            {upcomingTasks.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <h3 className="text-sm font-bold text-slate-900 mb-4">Upcoming Tasks</h3>
                <div className="space-y-3">
                  {upcomingTasks.map((t) => (
                    <div key={t.id} className="flex items-start gap-3">
                      <span className={`text-xs font-bold mt-1 ${priorityColors[t.priority] || "text-slate-500"}`}>●</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-900 truncate">{t.title}</p>
                        <p className="text-xs text-slate-400">{t.contactName ? t.contactName + " · " : ""}{t.dueAt ? fmtDate(t.dueAt) : "No due date"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-8 bg-white rounded-xl border border-slate-200 p-8 text-center">
            <p className="text-4xl mb-4">🚀</p>
            <h3 className="text-lg font-semibold text-slate-900">Get started</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">Add contacts, close deals, and use Market Intel to find your next opportunity.</p>
          </div>
        )}
      </div>
    </>
  );
}
