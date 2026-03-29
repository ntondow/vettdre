"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Users, Plus, Trash2, Save, Lock, Loader2,
  GripVertical, Clock, ChevronDown, ChevronUp,
} from "lucide-react";
import { getTeamConfig, saveTeamConfig } from "../../actions";

// ── Types ─────────────────────────────────────────────────────

interface TeamMember {
  agentId: string;
  name: string;
  escalationPhone: string;
  escalationEmail: string;
  availableHours?: string;
  active: boolean;
}

interface CadenceTouchPoint {
  delay: number;
  delayUnit: "hours" | "days";
  messageTemplate: string;
  condition?: string;
}

interface Cadence {
  id: string;
  name: string;
  active: boolean;
  touchPoints: CadenceTouchPoint[];
}

interface OrgAgent {
  id: string;
  name: string;
  email: string;
  phone: string | null;
}

// ── Pre-built Cadence Templates ──────────────────────────────

const CADENCE_PRESETS: { name: string; touchPoints: CadenceTouchPoint[] }[] = [
  {
    name: "Standard 3-Touch",
    touchPoints: [
      { delay: 24, delayUnit: "hours", messageTemplate: "Hi {{name}}! Following up on your inquiry about {{building}}. Still interested in taking a look?" },
      { delay: 3, delayUnit: "days", messageTemplate: "Hi {{name}}, just checking in — {{building}} is still available. Want to schedule a tour this week?" },
      { delay: 7, delayUnit: "days", messageTemplate: "No pressure at all! If you're still in the market, I'm here to help whenever you're ready. 🏠" },
    ],
  },
  {
    name: "Aggressive 5-Touch",
    touchPoints: [
      { delay: 4, delayUnit: "hours", messageTemplate: "Hey {{name}}! Just following up — I have a few time slots available today if you'd like to see {{building}}." },
      { delay: 24, delayUnit: "hours", messageTemplate: "Hi {{name}}, wanted to make sure you saw my last message about {{building}}. Happy to answer any questions!", condition: "if_no_reply" },
      { delay: 3, delayUnit: "days", messageTemplate: "Quick update — we've had a lot of interest in {{unit}} lately. Would you like to schedule a tour before it's gone?" },
      { delay: 5, delayUnit: "days", messageTemplate: "Hi {{name}}, I wanted to let you know that {{building}} still has availability. Can I help with anything?", condition: "if_showing_not_booked" },
      { delay: 10, delayUnit: "days", messageTemplate: "Last follow-up! If plans have changed, no worries. Feel free to reach out anytime. 🏠" },
    ],
  },
  {
    name: "Gentle 2-Touch",
    touchPoints: [
      { delay: 2, delayUnit: "days", messageTemplate: "Hi {{name}}, just a friendly follow-up about {{building}}. Let me know if you have any questions!" },
      { delay: 7, delayUnit: "days", messageTemplate: "Hi {{name}}, still here if you need anything! No rush at all.", condition: "if_no_reply" },
    ],
  },
];

const CONDITION_OPTIONS = [
  { value: "", label: "Always send" },
  { value: "if_no_reply", label: "Only if no reply" },
  { value: "if_showing_not_booked", label: "Only if showing not booked" },
];

// ── Component ────────────────────────────────────────────────

export default function TeamSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const configId = params.configId as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tier, setTier] = useState("free");
  const [propertyName, setPropertyName] = useState("");
  const [orgAgents, setOrgAgents] = useState<OrgAgent[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [cadences, setCadences] = useState<Cadence[]>([]);
  const [expandedCadence, setExpandedCadence] = useState<string | null>(null);

  const isTeam = tier === "team";

  useEffect(() => {
    (async () => {
      const res = await getTeamConfig(configId);
      if (res.config) {
        setTier(res.config.tier);
        setPropertyName(res.config.propertyName);
        setOrgAgents(res.config.orgAgents);
        setTeamMembers(res.config.teamMembers);
        setCadences(res.config.cadences);
      }
      setLoading(false);
    })();
  }, [configId]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    await saveTeamConfig(configId, { teamMembers, cadences });
    setSaving(false);
  }, [configId, teamMembers, cadences]);

  // ── Team Member Handlers ──────────────────────────────────

  const addTeamMember = useCallback(() => {
    setTeamMembers((prev) => [
      ...prev,
      { agentId: "", name: "", escalationPhone: "", escalationEmail: "", active: true },
    ]);
  }, []);

  const updateMember = useCallback((index: number, field: keyof TeamMember, value: any) => {
    setTeamMembers((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }, []);

  const selectAgent = useCallback((index: number, agentId: string) => {
    const agent = orgAgents.find((a) => a.id === agentId);
    if (!agent) return;
    setTeamMembers((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        agentId,
        name: agent.name,
        escalationEmail: agent.email,
        escalationPhone: agent.phone || next[index].escalationPhone,
      };
      return next;
    });
  }, [orgAgents]);

  const removeMember = useCallback((index: number) => {
    setTeamMembers((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Cadence Handlers ──────────────────────────────────────

  const addCadence = useCallback(() => {
    const id = `cadence_${Date.now()}`;
    setCadences((prev) => [
      ...prev,
      { id, name: "New Cadence", active: false, touchPoints: [{ delay: 24, delayUnit: "hours", messageTemplate: "Hi {{name}}! Following up about {{building}}." }] },
    ]);
    setExpandedCadence(id);
  }, []);

  const applyPreset = useCallback((presetIndex: number) => {
    const preset = CADENCE_PRESETS[presetIndex];
    const id = `cadence_${Date.now()}`;
    setCadences((prev) => [
      ...prev,
      { id, name: preset.name, active: false, touchPoints: [...preset.touchPoints] },
    ]);
    setExpandedCadence(id);
  }, []);

  const updateCadence = useCallback((id: string, field: keyof Cadence, value: any) => {
    setCadences((prev) => prev.map((c) => c.id === id ? { ...c, [field]: value } : c));
  }, []);

  const activateCadence = useCallback((id: string) => {
    // Only one cadence can be active at a time
    setCadences((prev) => prev.map((c) => ({ ...c, active: c.id === id ? !c.active : false })));
  }, []);

  const removeCadence = useCallback((id: string) => {
    setCadences((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const addTouchPoint = useCallback((cadenceId: string) => {
    setCadences((prev) => prev.map((c) => {
      if (c.id !== cadenceId) return c;
      return { ...c, touchPoints: [...c.touchPoints, { delay: 24, delayUnit: "hours" as const, messageTemplate: "" }] };
    }));
  }, []);

  const updateTouchPoint = useCallback((cadenceId: string, tpIndex: number, field: string, value: any) => {
    setCadences((prev) => prev.map((c) => {
      if (c.id !== cadenceId) return c;
      const tps = [...c.touchPoints];
      tps[tpIndex] = { ...tps[tpIndex], [field]: value };
      return { ...c, touchPoints: tps };
    }));
  }, []);

  const removeTouchPoint = useCallback((cadenceId: string, tpIndex: number) => {
    setCadences((prev) => prev.map((c) => {
      if (c.id !== cadenceId) return c;
      return { ...c, touchPoints: c.touchPoints.filter((_, i) => i !== tpIndex) };
    }));
  }, []);

  // ── Render ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/leasing")} className="p-2 rounded-lg hover:bg-slate-100">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Team Settings</h1>
            <p className="text-sm text-slate-500">{propertyName}</p>
          </div>
        </div>
        {isTeam && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save
          </button>
        )}
      </div>

      {/* Team Gate */}
      {!isTeam && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-8 text-center">
          <Lock className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-800">Team Tier Required</h2>
          <p className="text-sm text-slate-500 mt-1">
            Round-robin agent assignment and custom follow-up cadences are available on the Team plan.
          </p>
        </div>
      )}

      {isTeam && (
        <>
          {/* ── Team Members ────────────────────────────────── */}
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-slate-900">Escalation Team</h2>
              </div>
              <button
                onClick={addTeamMember}
                className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
              >
                <Plus className="w-4 h-4" /> Add Member
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              When a lead is escalated, the AI will notify the next agent in round-robin order via SMS and email.
            </p>

            {teamMembers.length === 0 && (
              <div className="text-center py-8 text-sm text-slate-400">
                No team members added yet. Add agents from your brokerage roster.
              </div>
            )}

            <div className="space-y-3">
              {teamMembers.map((member, i) => (
                <div key={i} className="flex items-start gap-3 p-4 bg-slate-50 rounded-lg border border-slate-100">
                  <GripVertical className="w-4 h-4 text-slate-300 mt-2.5 flex-shrink-0" />
                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Agent dropdown */}
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1 block">Agent</label>
                      <select
                        value={member.agentId}
                        onChange={(e) => selectAgent(i, e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                      >
                        <option value="">Select agent...</option>
                        {orgAgents.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                    </div>
                    {/* Phone */}
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1 block">Phone (SMS)</label>
                      <input
                        type="tel"
                        value={member.escalationPhone}
                        onChange={(e) => updateMember(i, "escalationPhone", e.target.value)}
                        placeholder="+1..."
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      />
                    </div>
                    {/* Email */}
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1 block">Email</label>
                      <input
                        type="email"
                        value={member.escalationEmail}
                        onChange={(e) => updateMember(i, "escalationEmail", e.target.value)}
                        placeholder="agent@..."
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                      />
                    </div>
                    {/* Active toggle */}
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={member.active}
                          onChange={(e) => updateMember(i, "active", e.target.checked)}
                          className="rounded border-slate-300"
                        />
                        <span className="text-sm text-slate-600">Active in rotation</span>
                      </label>
                    </div>
                  </div>
                  <button
                    onClick={() => removeMember(i)}
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded mt-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* ── Custom Cadences ──────────────────────────────── */}
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-violet-600" />
                <h2 className="text-lg font-semibold text-slate-900">Follow-Up Cadences</h2>
              </div>
              <div className="flex items-center gap-2">
                {/* Preset dropdown */}
                <select
                  onChange={(e) => { if (e.target.value) { applyPreset(parseInt(e.target.value)); e.target.value = ""; } }}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm bg-white text-slate-600"
                  defaultValue=""
                >
                  <option value="" disabled>Load preset...</option>
                  {CADENCE_PRESETS.map((p, i) => (
                    <option key={i} value={i}>{p.name}</option>
                  ))}
                </select>
                <button
                  onClick={addCadence}
                  className="flex items-center gap-1 text-sm text-violet-600 hover:text-violet-700"
                >
                  <Plus className="w-4 h-4" /> Custom
                </button>
              </div>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              Define automated follow-up sequences with custom timing, messages, and conditions.
              Only one cadence can be active at a time.
            </p>

            {cadences.length === 0 && (
              <div className="text-center py-8 text-sm text-slate-400">
                No cadences configured. Load a preset or create a custom one.
              </div>
            )}

            <div className="space-y-3">
              {cadences.map((cadence) => {
                const isExpanded = expandedCadence === cadence.id;
                return (
                  <div key={cadence.id} className={`border rounded-lg ${cadence.active ? "border-violet-300 bg-violet-50/30" : "border-slate-200 bg-slate-50"}`}>
                    {/* Cadence Header */}
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setExpandedCadence(isExpanded ? null : cadence.id)}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <input
                          type="text"
                          value={cadence.name}
                          onChange={(e) => updateCadence(cadence.id, "name", e.target.value)}
                          className="font-medium text-sm text-slate-800 bg-transparent border-none outline-none"
                        />
                        <span className="text-xs text-slate-400">{cadence.touchPoints.length} touch{cadence.touchPoints.length !== 1 ? "es" : ""}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => activateCadence(cadence.id)}
                          className={`px-3 py-1 rounded-full text-xs font-medium ${cadence.active ? "bg-violet-600 text-white" : "bg-slate-200 text-slate-600 hover:bg-slate-300"}`}
                        >
                          {cadence.active ? "Active" : "Activate"}
                        </button>
                        <button
                          onClick={() => removeCadence(cadence.id)}
                          className="p-1 text-red-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Touch Points (expanded) */}
                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-3 border-t border-slate-200 pt-3">
                        {cadence.touchPoints.map((tp, tpIdx) => (
                          <div key={tpIdx} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-slate-100">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center mt-0.5">
                              {tpIdx + 1}
                            </span>
                            <div className="flex-1 space-y-2">
                              {/* Delay + Condition row */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-slate-500">Send after</span>
                                <input
                                  type="number"
                                  min={1}
                                  value={tp.delay}
                                  onChange={(e) => updateTouchPoint(cadence.id, tpIdx, "delay", parseInt(e.target.value) || 1)}
                                  className="w-16 px-2 py-1 border border-slate-200 rounded text-sm text-center"
                                />
                                <select
                                  value={tp.delayUnit}
                                  onChange={(e) => updateTouchPoint(cadence.id, tpIdx, "delayUnit", e.target.value)}
                                  className="px-2 py-1 border border-slate-200 rounded text-sm bg-white"
                                >
                                  <option value="hours">hours</option>
                                  <option value="days">days</option>
                                </select>
                                <span className="text-xs text-slate-400 mx-1">|</span>
                                <select
                                  value={tp.condition || ""}
                                  onChange={(e) => updateTouchPoint(cadence.id, tpIdx, "condition", e.target.value || undefined)}
                                  className="px-2 py-1 border border-slate-200 rounded text-sm bg-white text-slate-600"
                                >
                                  {CONDITION_OPTIONS.map((c) => (
                                    <option key={c.value} value={c.value}>{c.label}</option>
                                  ))}
                                </select>
                              </div>
                              {/* Message template */}
                              <textarea
                                value={tp.messageTemplate}
                                onChange={(e) => updateTouchPoint(cadence.id, tpIdx, "messageTemplate", e.target.value)}
                                rows={2}
                                placeholder="Hi {{name}}, following up about {{building}}..."
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none"
                              />
                              <p className="text-[11px] text-slate-400">
                                Tokens: {"{{name}}"} {"{{building}}"} {"{{unit}}"} {"{{bedrooms}}"} {"{{price}}"}
                              </p>
                            </div>
                            <button
                              onClick={() => removeTouchPoint(cadence.id, tpIdx)}
                              disabled={cadence.touchPoints.length <= 1}
                              className="p-1 text-red-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => addTouchPoint(cadence.id)}
                          className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 mt-2"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Touch Point
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
