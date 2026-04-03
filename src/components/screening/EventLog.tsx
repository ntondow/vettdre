"use client";

interface EventItem {
  id: string;
  eventType: string;
  eventData: any;
  createdAt: string;
}

const EVENT_LABELS: Record<string, { label: string; icon: string }> = {
  created: { label: "Application created", icon: "📝" },
  invited: { label: "Invite sent", icon: "📧" },
  otp_sent: { label: "OTP sent", icon: "🔑" },
  step_completed: { label: "Wizard step completed", icon: "✅" },
  payment_succeeded: { label: "Payment received", icon: "💳" },
  pipeline_started: { label: "Processing started", icon: "⚙️" },
  credit_pull_complete: { label: "Credit report pulled", icon: "📊" },
  credit_pull_failed: { label: "Credit pull failed", icon: "⚠️" },
  plaid_sync_complete: { label: "Bank data synced", icon: "🏦" },
  plaid_sync_failed: { label: "Bank sync failed", icon: "⚠️" },
  document_analysis_complete: { label: "Documents analyzed", icon: "📄" },
  wellness_computed: { label: "Financial profile computed", icon: "📈" },
  risk_score_computed: { label: "Risk score computed", icon: "🎯" },
  pipeline_complete: { label: "Processing complete", icon: "✅" },
  pipeline_failed: { label: "Processing failed", icon: "❌" },
  decision_made: { label: "Decision made", icon: "⚖️" },
  withdrawn: { label: "Application withdrawn", icon: "🚫" },
  applicant_added: { label: "Applicant added", icon: "👤" },
  enhanced_downgraded: { label: "Downgraded to base", icon: "⬇️" },
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function EventLog({ events }: { events: EventItem[] }) {
  if (!events?.length) {
    return <p className="text-sm text-slate-400 py-4 text-center">No events yet</p>;
  }

  return (
    <div className="space-y-0">
      {events.map((event, i) => {
        const config = EVENT_LABELS[event.eventType] || { label: event.eventType, icon: "📋" };
        const isLast = i === events.length - 1;
        return (
          <div key={event.id || `event-${i}`} className="flex gap-3">
            {/* Timeline line */}
            <div className="flex flex-col items-center">
              <span className="text-base leading-none mt-0.5">{config.icon}</span>
              {!isLast && <div className="w-px flex-1 bg-slate-200 my-1" />}
            </div>
            {/* Content */}
            <div className="pb-4 flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-700">{config.label}</p>
              <p className="text-xs text-slate-400">{fmtDate(event.createdAt)}</p>
              {event.eventData && typeof event.eventData === "object" && Object.keys(event.eventData).length > 0 && (
                <div className="mt-1 text-xs text-slate-500">
                  {event.eventData.decidedBy && <span>by {event.eventData.decidedBy}</span>}
                  {event.eventData.decision && <span className="ml-1 capitalize font-medium">({event.eventData.decision})</span>}
                  {event.eventData.sentBy && <span>by {event.eventData.sentBy}</span>}
                  {event.eventData.score != null && <span>Score: {event.eventData.score}</span>}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
