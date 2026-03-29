"use client";

import { useState } from "react";
import MessagesView from "./messages-view";
import SmsView from "./sms-view";

interface MessagesTabsProps {
  gmailConnected: boolean;
  gmailEmail: string | null;
  templates: any[];
  initialUnreadCount: number;
  initialLabels: any[];
  followUpCount: number;
}

export default function MessagesTabs({
  gmailConnected,
  gmailEmail,
  templates,
  initialUnreadCount,
  initialLabels,
  followUpCount,
}: MessagesTabsProps) {
  const [mode, setMode] = useState<"email" | "sms">("email");

  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">
      {/* Mode toggle */}
      <div className="flex items-center gap-1 px-4 py-2 bg-slate-50 border-b border-slate-200">
        <button
          onClick={() => setMode("email")}
          className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
            mode === "email"
              ? "bg-white text-blue-600 shadow-sm border border-slate-200"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Email
        </button>
        <button
          onClick={() => setMode("sms")}
          className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-colors ${
            mode === "sms"
              ? "bg-white text-blue-600 shadow-sm border border-slate-200"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          SMS
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {mode === "email" ? (
          <MessagesView
            gmailConnected={gmailConnected}
            gmailEmail={gmailEmail}
            templates={templates}
            initialUnreadCount={initialUnreadCount}
            initialLabels={initialLabels}
            followUpCount={followUpCount}
          />
        ) : (
          <SmsView />
        )}
      </div>
    </div>
  );
}
