"use client";

import { useState, useEffect } from "react";
import { getWorkingHours, saveWorkingHours } from "../actions";

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

interface DaySchedule {
  active: boolean;
  start: string;
  end: string;
}

type Schedule = Record<DayKey, DaySchedule>;

const DAYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];

const WEEKDAYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri"];

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Phoenix", label: "Arizona (Phoenix)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
];

function generateTimeOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let h = 6; h <= 22; h++) {
    for (let m = 0; m < 60; m += 30) {
      if (h === 22 && m > 0) break;
      const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const hour12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
      const ampm = h >= 12 ? "PM" : "AM";
      const label = `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
      options.push({ value, label });
    }
  }
  return options;
}

const TIME_OPTIONS = generateTimeOptions();

const DEFAULT_SCHEDULE: Schedule = {
  mon: { active: true, start: "09:00", end: "18:00" },
  tue: { active: true, start: "09:00", end: "18:00" },
  wed: { active: true, start: "09:00", end: "18:00" },
  thu: { active: true, start: "09:00", end: "18:00" },
  fri: { active: true, start: "09:00", end: "18:00" },
  sat: { active: true, start: "10:00", end: "15:00" },
  sun: { active: false, start: "09:00", end: "18:00" },
};

const DEFAULT_TIMEZONE = "America/New_York";

export default function WorkingHoursPage() {
  const [schedule, setSchedule] = useState<Schedule>(DEFAULT_SCHEDULE);
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await getWorkingHours();
        if (data) {
          if (data.timezone) setTimezone(data.timezone);
          if (data.schedule) setSchedule(data.schedule);
        }
      } catch {
        // use defaults on error
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function updateDay(day: DayKey, patch: Partial<DaySchedule>) {
    setSchedule((prev) => ({
      ...prev,
      [day]: { ...prev[day], ...patch },
    }));
    setSaved(false);
  }

  function copyToWeekdays() {
    const source = schedule.mon;
    setSchedule((prev) => {
      const next = { ...prev };
      for (const key of WEEKDAYS) {
        next[key] = { ...source };
      }
      return next;
    });
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    try {
      await saveWorkingHours({ timezone, schedule });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // silent fail
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-lg font-bold text-slate-900 mb-1">Working Hours</h1>
      <p className="text-sm text-slate-500 mb-6">
        Set your availability so leads and teammates know when you're reachable.
      </p>

      {/* Timezone */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-2">
          Timezone
        </label>
        <select
          value={timezone}
          onChange={(e) => {
            setTimezone(e.target.value);
            setSaved(false);
          }}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm w-full max-w-xs"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
        </select>
      </div>

      {/* Schedule Grid */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-slate-900">Weekly Schedule</h2>
          <button
            onClick={copyToWeekdays}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            Copy Monday to all weekdays
          </button>
        </div>

        <div className="space-y-3">
          {DAYS.map(({ key, label }) => {
            const day = schedule[key];
            return (
              <div
                key={key}
                className={`flex items-center gap-4 py-2 ${
                  !day.active ? "opacity-50" : ""
                }`}
              >
                {/* Day label */}
                <span className="text-sm font-medium text-slate-700 w-24">
                  {label}
                </span>

                {/* Toggle */}
                <button
                  onClick={() => updateDay(key, { active: !day.active })}
                  className={`relative w-9 h-5 rounded-full transition-colors ${
                    day.active ? "bg-blue-600" : "bg-slate-200"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      day.active ? "translate-x-4" : ""
                    }`}
                  />
                </button>

                {/* Start time */}
                <select
                  value={day.start}
                  onChange={(e) => updateDay(key, { start: e.target.value })}
                  disabled={!day.active}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-slate-50"
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>

                <span className="text-sm text-slate-400">to</span>

                {/* End time */}
                <select
                  value={day.end}
                  onChange={(e) => updateDay(key, { end: e.target.value })}
                  disabled={!day.active}
                  className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-slate-50"
                >
                  {TIME_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {saved && (
          <span className="text-sm text-emerald-600 font-medium">
            Changes saved
          </span>
        )}
      </div>
    </div>
  );
}
