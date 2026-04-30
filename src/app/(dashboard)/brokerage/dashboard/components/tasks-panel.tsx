"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Clock, CheckSquare } from "lucide-react";
import { getTodaysTasksForManager } from "../actions";
import { PanelShell } from "./panel-shell";

type Task = {
  id: string;
  title: string;
  dueDate: string | null;
  transactionId: string;
  propertyAddress: string;
  stage: string;
  isPastDue: boolean;
};

const fmtDate = (d: string | null) => {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
};

export function TasksPanel({ asOrg }: { asOrg?: string }) {
  const overrideOpts = asOrg ? { overrideAsOrg: asOrg } : {};
  const overrideQs = asOrg ? `?as_org=${encodeURIComponent(asOrg)}` : "";
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await getTodaysTasksForManager(overrideOpts);
      if (!result) {
        setStatus("error");
        return;
      }
      setTasks(result.tasks);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asOrg, tick]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <PanelShell
      title="Today's tasks"
      status={status}
      onRetry={() => setTick((t) => t + 1)}
      testId="tasks-panel"
      trailingRight={
        tasks && tasks.length > 0 ? (
          <Link
            href={`/brokerage/transactions${overrideQs}`}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            View all →
          </Link>
        ) : null
      }
    >
      {!tasks || tasks.length === 0 ? (
        <div data-testid="tasks-panel-empty" className="text-center py-6">
          <CheckSquare className="h-8 w-8 text-slate-200 mx-auto mb-2" />
          <p className="text-sm text-slate-500 font-medium">
            No tasks due today.
          </p>
          <Link
            href={`/brokerage/transactions${overrideQs}`}
            className="inline-block mt-2 text-xs text-blue-600 hover:underline font-medium"
          >
            Check the pipeline →
          </Link>
        </div>
      ) : (
        <ul className="space-y-2.5" data-testid="tasks-panel-list">
          {tasks.map((task) => (
            <li key={task.id}>
              <Link
                href={`/brokerage/transactions/${task.transactionId}${overrideQs}`}
                className="flex items-start gap-2.5 p-2 -mx-2 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <CheckSquare className="h-4 w-4 text-slate-300 flex-shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-700 leading-snug">
                    {task.title}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">
                    {task.propertyAddress}
                  </p>
                </div>
                <span
                  className={`text-xs whitespace-nowrap flex items-center gap-0.5 ${
                    task.isPastDue ? "text-rose-500 font-medium" : "text-slate-400"
                  }`}
                >
                  {task.isPastDue && <Clock className="h-3 w-3" />}
                  {fmtDate(task.dueDate)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PanelShell>
  );
}
