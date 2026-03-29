"use client";

import { useState } from "react";

interface SlotData {
  id: string;
  startAt: string;
  endAt: string;
  duration: number;
}

interface BookingData {
  propertyAddress: string;
  unitNumber: string | null;
  agentName: string;
  agentBrokerage: string | null;
  slots: SlotData[];
}

const fmtTime = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date(iso));

function toLocalDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function BookingView({ data }: { data: BookingData }) {
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [booking, setBooking] = useState(false);
  const [confirmed, setConfirmed] = useState<{ time: string } | null>(null);

  // Group slots by date
  const grouped = new Map<string, SlotData[]>();
  for (const slot of data.slots) {
    const key = toLocalDate(slot.startAt);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(slot);
  }

  const selectedSlot = data.slots.find(s => s.id === selectedSlotId);

  const handleBook = async () => {
    if (!selectedSlotId || !name.trim() || !email.trim()) return;
    setBooking(true);
    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: selectedSlotId, name: name.trim(), email: email.trim(), phone, notes }),
      });
      const result = await res.json();
      if (result.success) {
        setConfirmed({ time: `${fmtDate(selectedSlot!.startAt)} at ${fmtTime(selectedSlot!.startAt)}` });
      } else {
        alert(result.error || "Booking failed. Please try again.");
      }
    } catch {
      alert("Something went wrong. Please try again.");
    }
    setBooking(false);
  };

  if (confirmed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">&#10003;</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Showing Confirmed!</h1>
          <p className="text-sm text-slate-600 mb-1">{data.propertyAddress}{data.unitNumber ? ` #${data.unitNumber}` : ""}</p>
          <p className="text-sm font-medium text-blue-600 mb-4">{confirmed.time}</p>
          <p className="text-xs text-slate-400">You'll receive a calendar invite from {data.agentName}.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6 text-white">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">🏠</span>
            <h1 className="text-lg font-bold">Showing</h1>
          </div>
          <p className="text-base font-semibold">{data.propertyAddress}{data.unitNumber ? ` #${data.unitNumber}` : ""}</p>
          <p className="text-sm text-white/80 mt-1">{data.agentName}{data.agentBrokerage ? ` · ${data.agentBrokerage}` : ""}</p>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <p className="text-sm font-bold text-slate-900 mb-3">Select a time:</p>
            <div className="space-y-4">
              {Array.from(grouped.entries()).map(([dateStr, slots]) => (
                <div key={dateStr}>
                  <p className="text-xs font-semibold text-slate-500 mb-2">{fmtDate(slots[0].startAt)}</p>
                  <div className="flex flex-wrap gap-2">
                    {slots.map(slot => (
                      <button key={slot.id} onClick={() => setSelectedSlotId(slot.id)}
                        className={`px-3 py-2 text-sm font-medium rounded-lg border transition-all ${
                          selectedSlotId === slot.id
                            ? "bg-purple-600 text-white border-purple-600 shadow-md"
                            : "border-slate-200 text-slate-700 hover:border-purple-300 hover:bg-purple-50"
                        }`}>
                        {fmtTime(slot.startAt)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {selectedSlot && (
            <>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <p className="text-sm font-medium text-purple-700">
                  Selected: {fmtTime(selectedSlot.startAt)} — {fmtTime(selectedSlot.endAt)}
                </p>
                <p className="text-xs text-purple-500">{selectedSlot.duration} minutes</p>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-bold text-slate-900">Your Info:</p>
                <div>
                  <label className="text-xs font-medium text-slate-500">Name *</label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Your full name"
                    className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500">Email *</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com"
                    className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500">Phone</label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(optional)"
                    className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500">Notes</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything you'd like to mention (optional)" rows={2}
                    className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" />
                </div>
              </div>

              <button onClick={handleBook} disabled={booking || !name.trim() || !email.trim()}
                className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-lg disabled:opacity-50 shadow-md transition-colors">
                {booking ? "Booking..." : "Confirm Booking"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
