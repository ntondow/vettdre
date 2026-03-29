"use client";

import { useState, useEffect } from "react";
import { getNotificationPreferences, updateNotificationPref } from "../actions";

interface Prefs {
  newLeadEmail: boolean;
  newLeadPush: boolean;
  followUpEmail: boolean;
  followUpPush: boolean;
  newEmailPush: boolean;
  taskDueEmail: boolean;
  taskDuePush: boolean;
  taskOverdueEmail: boolean;
  weeklySummaryEmail: boolean;
}

const defaults: Prefs = {
  newLeadEmail: true,
  newLeadPush: true,
  followUpEmail: true,
  followUpPush: false,
  newEmailPush: true,
  taskDueEmail: true,
  taskDuePush: false,
  taskOverdueEmail: true,
  weeklySummaryEmail: true,
};

interface ToggleRow {
  label: string;
  description: string;
  emailField?: keyof Prefs;
  pushField?: keyof Prefs;
}

const groups: { title: string; rows: ToggleRow[] }[] = [
  {
    title: "Leads",
    rows: [
      {
        label: "New lead from email",
        description: "When a new lead is created from an incoming email",
        emailField: "newLeadEmail",
        pushField: "newLeadPush",
      },
      {
        label: "Lead follow-up reminder",
        description: "Reminders for scheduled lead follow-ups",
        emailField: "followUpEmail",
        pushField: "followUpPush",
      },
    ],
  },
  {
    title: "Email",
    rows: [
      {
        label: "New email received",
        description: "When a new email arrives in your synced inbox",
        pushField: "newEmailPush",
      },
    ],
  },
  {
    title: "Tasks",
    rows: [
      {
        label: "Task due today",
        description: "Daily reminder for tasks due today",
        emailField: "taskDueEmail",
        pushField: "taskDuePush",
      },
      {
        label: "Task overdue",
        description: "When a task passes its due date without completion",
        emailField: "taskOverdueEmail",
      },
    ],
  },
  {
    title: "Reports",
    rows: [
      {
        label: "Weekly summary report",
        description: "A weekly digest of your activity, pipeline, and leads",
        emailField: "weeklySummaryEmail",
      },
    ],
  },
];

function Toggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-9 h-5 rounded-full transition-colors ${value ? "bg-blue-600" : "bg-slate-200"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${value ? "translate-x-4" : ""}`}
      />
    </button>
  );
}

export default function NotificationsPage() {
  const [prefs, setPrefs] = useState<Prefs>(defaults);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getNotificationPreferences().then((data) => {
      if (data) {
        setPrefs({ ...defaults, ...data });
      }
      setLoading(false);
    });
  }, []);

  const handleToggle = async (field: keyof Prefs, value: boolean) => {
    setPrefs((prev) => ({ ...prev, [field]: value }));
    await updateNotificationPref(field, value);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-lg font-bold text-slate-900 mb-1">Notifications</h1>
      <p className="text-sm text-slate-500 mb-6">
        Choose how and when you want to be notified about activity in your
        account.
      </p>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        {/* Column headers */}
        <div className="flex items-center justify-end gap-8 mb-4 pr-1">
          <span className="text-xs font-medium text-slate-500 w-9 text-center">
            Email
          </span>
          <span className="text-xs font-medium text-slate-500 w-9 text-center">
            Push
          </span>
        </div>

        {groups.map((group, gi) => (
          <div key={group.title} className={gi > 0 ? "mt-6" : ""}>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              {group.title}
            </h3>

            <div>
              {group.rows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0"
                >
                  <div className="flex-1 min-w-0 mr-4">
                    <p className="text-sm font-medium text-slate-700">
                      {row.label}
                    </p>
                    <p className="text-xs text-slate-400">{row.description}</p>
                  </div>

                  <div className="flex items-center gap-8">
                    <div className="w-9 flex justify-center">
                      {row.emailField ? (
                        <Toggle
                          value={prefs[row.emailField]}
                          onChange={(v) => handleToggle(row.emailField!, v)}
                        />
                      ) : (
                        <span className="text-xs text-slate-300">--</span>
                      )}
                    </div>
                    <div className="w-9 flex justify-center">
                      {row.pushField ? (
                        <Toggle
                          value={prefs[row.pushField]}
                          onChange={(v) => handleToggle(row.pushField!, v)}
                        />
                      ) : (
                        <span className="text-xs text-slate-300">--</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Push notification permission note */}
      <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
        <p className="text-xs text-slate-500">
          Push notifications require browser permission
        </p>
        <button
          onClick={() => {
            if (typeof Notification !== "undefined") {
              Notification.requestPermission();
            }
          }}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 px-3 py-1.5 rounded-md border border-blue-200 bg-white hover:bg-blue-50 transition-colors"
        >
          Enable
        </button>
      </div>
    </div>
  );
}
