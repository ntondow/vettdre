"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  getConversationList,
  getConversation,
  sendSMS,
  getSmsTemplates,
  seedSmsTemplates,
  initiateCall,
} from "@/lib/twilio-actions";

function formatPhone(number: string) {
  if (number.startsWith("+1") && number.length === 12) {
    return `(${number.slice(2, 5)}) ${number.slice(5, 8)}-${number.slice(8)}`;
  }
  return number;
}

function timeAgo(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

interface Conversation {
  contactNumber: string;
  contactName: string | null;
  contactId: string | null;
  lastMessage: string;
  lastAt: string;
  direction: string;
}

interface Message {
  id: string;
  direction: string;
  from: string;
  to: string;
  body: string;
  status: string;
  createdAt: string;
  contact: { id: string; firstName: string; lastName: string } | null;
}

interface SmsTemplate {
  id: string;
  name: string;
  body: string;
  category: string | null;
}

export default function SmsView() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [hasPhone, setHasPhone] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const [newTo, setNewTo] = useState("");
  const [search, setSearch] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadConversations();
    seedSmsTemplates().then(() => getSmsTemplates().then(setTemplates));
  }, []);

  async function loadConversations() {
    setLoading(true);
    const data = await getConversationList();
    setConversations(data.conversations || []);
    setHasPhone(data.hasPhone || false);
    setPhoneNumber(data.phoneNumber || "");
    setLoading(false);
  }

  const loadMessages = useCallback(async (contactNumber: string) => {
    setLoadingMessages(true);
    setSelected(contactNumber);
    const data = await getConversation(contactNumber);
    setMessages(data.messages || []);
    setLoadingMessages(false);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  }, []);

  async function handleSend() {
    const to = selected || newTo;
    if (!to || !draft.trim()) return;
    setSending(true);
    const result = await sendSMS(to, draft.trim());
    if (result.error) {
      alert(result.error);
    } else {
      setDraft("");
      if (selected) {
        await loadMessages(selected);
      } else {
        setSelected(to);
        setShowNewMessage(false);
        await loadMessages(to);
        await loadConversations();
      }
    }
    setSending(false);
  }

  async function handleCall() {
    if (!selected) return;
    if (!confirm(`Call ${formatPhone(selected)}?`)) return;
    const result = await initiateCall(selected);
    if (result.error) alert(result.error);
  }

  const filtered = search
    ? conversations.filter(
        (c) =>
          c.contactNumber.includes(search) ||
          c.contactName?.toLowerCase().includes(search.toLowerCase()) ||
          c.lastMessage.toLowerCase().includes(search.toLowerCase()),
      )
    : conversations;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!hasPhone) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">📱</span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Set Up Phone & SMS</h2>
          <p className="text-sm text-slate-500 mb-6">
            Get a dedicated phone number to send and receive text messages with property owners and contacts.
          </p>
          <Link
            href="/settings/phone"
            className="inline-flex px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg transition-colors"
          >
            Go to Phone Settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-57px)] bg-white">
      {/* Left: Conversation List */}
      <div className={`w-full md:w-80 lg:w-96 border-r border-slate-200 flex flex-col ${selected ? "hidden md:flex" : "flex"}`}>
        {/* Header */}
        <div className="p-3 border-b border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-slate-900">SMS</h2>
            <button
              onClick={() => { setShowNewMessage(true); setSelected(null); setNewTo(""); setDraft(""); }}
              className="px-3 py-1 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700"
            >
              + New
            </button>
          </div>
          <input
            type="text"
            placeholder="Search conversations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-400">No conversations yet</p>
            </div>
          )}
          {filtered.map((conv) => (
            <button
              key={conv.contactNumber}
              onClick={() => { setShowNewMessage(false); loadMessages(conv.contactNumber); }}
              className={`w-full text-left p-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${
                selected === conv.contactNumber ? "bg-blue-50 border-l-2 border-l-blue-600" : ""
              }`}
            >
              <div className="flex items-center justify-between mb-0.5">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {conv.contactName || formatPhone(conv.contactNumber)}
                </p>
                <span className="text-[10px] text-slate-400 flex-shrink-0 ml-2">
                  {timeAgo(conv.lastAt)}
                </span>
              </div>
              <p className="text-xs text-slate-500 truncate">
                {conv.direction === "outbound" && <span className="text-slate-400">You: </span>}
                {conv.lastMessage}
              </p>
            </button>
          ))}
        </div>

        {/* Phone number footer */}
        <div className="p-3 border-t border-slate-100 bg-slate-50">
          <p className="text-[10px] text-slate-400 text-center">
            Your number: {formatPhone(phoneNumber)}
          </p>
        </div>
      </div>

      {/* Right: Thread or New Message */}
      <div className={`flex-1 flex flex-col ${!selected && !showNewMessage ? "hidden md:flex" : "flex"}`}>
        {!selected && !showNewMessage ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <span className="text-4xl">💬</span>
              <p className="text-sm text-slate-400 mt-2">Select a conversation or start a new one</p>
            </div>
          </div>
        ) : showNewMessage ? (
          /* New Message */
          <>
            <div className="p-3 border-b border-slate-200 flex items-center gap-2">
              <button
                onClick={() => { setShowNewMessage(false); setSelected(null); }}
                className="md:hidden text-sm text-blue-600"
              >
                Back
              </button>
              <span className="text-sm font-semibold text-slate-900">New Message</span>
            </div>
            <div className="p-3 border-b border-slate-100">
              <input
                type="tel"
                placeholder="Phone number (e.g. +12125551234)"
                value={newTo}
                onChange={(e) => setNewTo(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex-1" />
            {/* Compose bar */}
            <div className="p-3 border-t border-slate-200">
              {showTemplates && templates.length > 0 && (
                <div className="mb-2 p-2 bg-slate-50 rounded-lg border border-slate-200 max-h-40 overflow-y-auto">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { setDraft(t.body); setShowTemplates(false); }}
                      className="w-full text-left p-2 rounded hover:bg-white text-xs"
                    >
                      <span className="font-medium text-slate-700">{t.name}</span>
                      <span className="text-slate-400 ml-2 truncate">{t.body.slice(0, 60)}...</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowTemplates(!showTemplates)}
                  className="px-2 py-2 text-slate-400 hover:text-slate-600"
                  title="Templates"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </button>
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !draft.trim() || !newTo.trim()}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {sending ? "..." : "Send"}
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Conversation Thread */
          <>
            {/* Thread header */}
            <div className="p-3 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelected(null)}
                  className="md:hidden text-sm text-blue-600"
                >
                  Back
                </button>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {messages[0]?.contact
                      ? `${messages[0].contact.firstName} ${messages[0].contact.lastName}`
                      : formatPhone(selected!)}
                  </p>
                  <p className="text-[10px] text-slate-400">{formatPhone(selected!)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {messages[0]?.contact && (
                  <Link
                    href={`/contacts/${messages[0].contact.id}`}
                    className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                  >
                    View Contact
                  </Link>
                )}
                <button
                  onClick={handleCall}
                  className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                  title="Call"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingMessages ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-slate-400">No messages yet. Send the first one!</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[75%] px-3 py-2 rounded-2xl ${
                        msg.direction === "outbound"
                          ? "bg-blue-600 text-white rounded-br-md"
                          : "bg-slate-100 text-slate-900 rounded-bl-md"
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                      <p
                        className={`text-[10px] mt-1 ${
                          msg.direction === "outbound" ? "text-blue-200" : "text-slate-400"
                        }`}
                      >
                        {new Date(msg.createdAt).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                        {msg.direction === "outbound" && msg.status === "delivered" && " ✓✓"}
                        {msg.direction === "outbound" && msg.status === "sent" && " ✓"}
                        {msg.direction === "outbound" && msg.status === "failed" && " ✕"}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Compose */}
            <div className="p-3 border-t border-slate-200">
              {showTemplates && templates.length > 0 && (
                <div className="mb-2 p-2 bg-slate-50 rounded-lg border border-slate-200 max-h-40 overflow-y-auto">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { setDraft(t.body); setShowTemplates(false); }}
                      className="w-full text-left p-2 rounded hover:bg-white text-xs"
                    >
                      <span className="font-medium text-slate-700">{t.name}</span>
                      <span className="text-slate-400 ml-2 truncate">{t.body.slice(0, 60)}...</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowTemplates(!showTemplates)}
                  className="px-2 py-2 text-slate-400 hover:text-slate-600"
                  title="Templates"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </button>
                <input
                  type="text"
                  placeholder="Type a message..."
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !draft.trim()}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {sending ? "..." : "Send"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
