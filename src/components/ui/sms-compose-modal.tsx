"use client";

import { useState, useEffect } from "react";
import { sendSMS, getSmsTemplates } from "@/lib/twilio-actions";

interface SmsComposeModalProps {
  to: string;
  contactName?: string;
  address?: string;
  onClose: () => void;
  onSent?: () => void;
}

export default function SmsComposeModal({ to, contactName, address, onClose, onSent }: SmsComposeModalProps) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; name: string; body: string }[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  useEffect(() => {
    getSmsTemplates().then(setTemplates);
  }, []);

  function applyTemplate(template: string) {
    let filled = template;
    if (contactName) filled = filled.replace(/\{\{contact_name\}\}/g, contactName);
    if (address) filled = filled.replace(/\{\{address\}\}/g, address);
    filled = filled.replace(/\{\{user_name\}\}/g, "");
    filled = filled.replace(/\{\{company\}\}/g, "");
    setBody(filled);
    setShowTemplates(false);
  }

  async function handleSend() {
    if (!body.trim()) return;
    setSending(true);
    setError(null);
    const result = await sendSMS(to, body.trim());
    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
      onSent?.();
      setTimeout(onClose, 1500);
    }
    setSending(false);
  }

  const formatPhone = (n: string) => {
    if (n.startsWith("+1") && n.length === 12) return `(${n.slice(2, 5)}) ${n.slice(5, 8)}-${n.slice(8)}`;
    return n;
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Send SMS</h3>
            <p className="text-xs text-slate-500">
              To: {contactName ? `${contactName} (${formatPhone(to)})` : formatPhone(to)}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">×</button>
        </div>

        {/* Body */}
        <div className="p-4">
          {error && (
            <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{error}</div>
          )}
          {success && (
            <div className="mb-3 p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
              Message sent successfully!
            </div>
          )}

          {/* Templates */}
          {showTemplates && templates.length > 0 && (
            <div className="mb-3 p-2 bg-slate-50 rounded-lg border border-slate-200 max-h-32 overflow-y-auto">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t.body)}
                  className="w-full text-left p-2 rounded hover:bg-white text-xs"
                >
                  <span className="font-medium text-slate-700">{t.name}</span>
                  <span className="text-slate-400 ml-2">{t.body.slice(0, 50)}...</span>
                </button>
              ))}
            </div>
          )}

          <textarea
            rows={4}
            placeholder="Type your message..."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            autoFocus
          />
          <p className="text-[10px] text-slate-400 mt-1 text-right">{body.length}/160 chars</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-slate-100">
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            {showTemplates ? "Hide Templates" : "Use Template"}
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={sending || !body.trim() || success}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {sending ? "Sending..." : success ? "Sent!" : "Send SMS"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
