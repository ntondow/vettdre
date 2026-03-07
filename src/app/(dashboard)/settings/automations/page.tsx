"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Zap,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  X,
  Activity,
  Clock,
  AlertCircle,
  BookOpen,
  History,
  Mail,
  Sparkles,
} from "lucide-react";
import {
  getAutomations,
  getAutomationStats,
  createAutomation,
  updateAutomation,
  toggleAutomationActive,
  deleteAutomation,
  applyRecipe,
} from "./actions";
import type { CreateAutomationInput, UpdateAutomationInput } from "./actions";
import RunHistoryPanel from "./run-history";
import {
  AUTOMATION_RECIPES,
  RECIPE_CATEGORY_LABELS,
  type RecipeCategory,
} from "@/lib/automation-recipes";
import {
  TRIGGER_LABELS,
  TRIGGER_COLORS,
  ACTION_LABELS,
  OPERATOR_LABELS,
  CONDITION_FIELDS,
  type ConditionOperator,
  type ConditionGroup,
  type ConditionRule,
  type AutomationAction,
  type AutomationSummary,
  type ActionDelay,
} from "@/lib/automation-types";
import type { AutomationTrigger } from "@prisma/client";

// ── Helpers ─────────────────────────────────────────────────

const TRIGGER_OPTIONS: { value: AutomationTrigger; label: string; desc: string }[] = [
  { value: "new_lead", label: "New Lead", desc: "When a new contact is created" },
  { value: "stage_change", label: "Stage Change", desc: "When a deal moves stages" },
  { value: "no_activity", label: "No Activity", desc: "When a contact has no activity for X days" },
  { value: "task_overdue", label: "Task Overdue", desc: "When a task passes its due date" },
  { value: "showing_completed", label: "Showing Completed", desc: "When a showing is booked" },
  { value: "email_received", label: "Email Received", desc: "When an inbound email arrives" },
  { value: "deal_won", label: "Deal Won", desc: "When a deal is closed successfully" },
  { value: "deal_lost", label: "Deal Lost", desc: "When a deal is cancelled" },
  { value: "score_change", label: "Score Change", desc: "When a contact's qualification score changes" },
  { value: "contact_enriched", label: "Contact Enriched", desc: "When contact enrichment completes" },
];

const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: "create_task", label: "Create Task" },
  { value: "update_contact_status", label: "Update Contact Status" },
  { value: "send_notification", label: "Send Notification" },
  { value: "send_email", label: "Send Email" },
  { value: "ai_generate_email", label: "AI Generate Email" },
  { value: "add_tag", label: "Add Tag" },
];

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Empty Action / Condition Factories ──────────────────────

function newConditionRule(): ConditionRule {
  return { field: "source", operator: "equals", value: "" };
}

function newConditionGroup(): ConditionGroup {
  return { rules: [newConditionRule()], logicalOp: "AND" };
}

function newAction(): AutomationAction {
  return { type: "create_task", title: "", priority: "medium" };
}

// ════════════════════════════════════════════════════════════
// Main Page
// ════════════════════════════════════════════════════════════

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<AutomationSummary[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, totalRuns: 0 });
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showRecipes, setShowRecipes] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, s] = await Promise.all([getAutomations(), getAutomationStats()]);
      setAutomations(list as unknown as AutomationSummary[]);
      setStats(s);
    } catch (err) {
      console.error("Failed to load automations:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // ── Toggle Active ───────────────────────────────────────
  async function handleToggle(id: string) {
    // Optimistic
    setAutomations((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isActive: !a.isActive } : a)),
    );
    const result = await toggleAutomationActive(id);
    if (!result.success) {
      load(); // revert
    } else {
      setStats((s) => ({
        ...s,
        active: s.active + (result.isActive ? 1 : -1),
      }));
    }
  }

  // ── Delete ──────────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!confirm("Delete this automation? This cannot be undone.")) return;
    const result = await deleteAutomation(id);
    if (result.success) {
      load();
    }
  }

  // ── Create ──────────────────────────────────────────────
  async function handleCreate(input: CreateAutomationInput) {
    const result = await createAutomation(input);
    if (result.success) {
      setShowCreate(false);
      load();
    }
    return result;
  }

  // ── Update ──────────────────────────────────────────────
  async function handleUpdate(id: string, input: UpdateAutomationInput) {
    const result = await updateAutomation(id, input);
    if (result.success) {
      load();
    }
    return result;
  }

  // ── Render ──────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 pb-20 md:pb-0">
      <div className="max-w-4xl mx-auto px-4 py-6 md:py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
              <Zap className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white">Automations</h1>
              <p className="text-sm text-slate-400">
                Automate actions when events occur in your CRM
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRecipes(true)}
              className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors border border-slate-700"
            >
              <BookOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Recipes</span>
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Create Automation</span>
              <span className="sm:hidden">New</span>
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "Total", value: stats.total, icon: Zap },
            { label: "Active", value: stats.active, icon: Activity },
            { label: "Total Runs", value: stats.totalRuns, icon: Clock },
          ].map((s) => (
            <div
              key={s.label}
              className="bg-slate-900 rounded-xl p-4 border border-slate-800"
            >
              <div className="flex items-center gap-2 mb-1">
                <s.icon className="h-4 w-4 text-slate-500" />
                <span className="text-xs text-slate-500">{s.label}</span>
              </div>
              <p className="text-lg font-semibold text-white">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Create Form */}
        {showCreate && (
          <div className="mb-6">
            <AutomationForm
              onSave={handleCreate}
              onCancel={() => setShowCreate(false)}
            />
          </div>
        )}

        {/* List */}
        {loading ? (
          <LoadingSkeleton />
        ) : automations.length === 0 && !showCreate ? (
          <EmptyState onCreateClick={() => setShowCreate(true)} />
        ) : (
          <div className="space-y-3">
            {automations.map((a) => (
              <AutomationRow
                key={a.id}
                automation={a}
                isExpanded={expandedId === a.id}
                onToggleExpand={() =>
                  setExpandedId(expandedId === a.id ? null : a.id)
                }
                onToggleActive={() => handleToggle(a.id)}
                onDelete={() => handleDelete(a.id)}
                onUpdate={(input) => handleUpdate(a.id, input)}
              />
            ))}
          </div>
        )}

        {/* Recipe Modal */}
        {showRecipes && (
          <RecipeModal
            onClose={() => setShowRecipes(false)}
            onApply={async (recipeId) => {
              const result = await applyRecipe(recipeId);
              if (result.success) {
                setShowRecipes(false);
                load();
              }
              return result;
            }}
          />
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// AutomationRow
// ════════════════════════════════════════════════════════════

function AutomationRow({
  automation,
  isExpanded,
  onToggleExpand,
  onToggleActive,
  onDelete,
  onUpdate,
}: {
  automation: AutomationSummary;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  onUpdate: (input: UpdateAutomationInput) => Promise<{ success: boolean; error?: string }>;
}) {
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 overflow-hidden">
      {/* Summary row */}
      <div className="flex items-center gap-3 p-4">
        {/* Left: name + trigger */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-medium text-white truncate">
              {automation.name}
            </h3>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${TRIGGER_COLORS[automation.triggerType] || "bg-slate-500/15 text-slate-400"}`}
            >
              {TRIGGER_LABELS[automation.triggerType] || automation.triggerType}
            </span>
          </div>
          {automation.description && (
            <p className="text-xs text-slate-500 truncate">
              {automation.description}
            </p>
          )}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
            <span>{automation.runsCount} runs</span>
            <span>·</span>
            <span>Last: {timeAgo(automation.lastRunAt)}</span>
            {automation.lastError && (
              <>
                <span>·</span>
                <span className="text-red-400 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Error
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right: toggle + expand + delete */}
        <div className="flex items-center gap-2">
          {/* Active toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleActive();
            }}
            className={`relative w-10 h-5 rounded-full transition-colors ${automation.isActive ? "bg-emerald-500" : "bg-slate-700"}`}
          >
            <div
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${automation.isActive ? "translate-x-5" : "translate-x-0.5"}`}
            />
          </button>

          <button
            onClick={onToggleExpand}
            className="p-1.5 text-slate-400 hover:text-white transition-colors"
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Expanded edit form + run history */}
      {isExpanded && (
        <div className="border-t border-slate-800 p-4">
          <AutomationEditForm
            automationId={automation.id}
            onSave={onUpdate}
          />
          <RunHistoryPanel automationId={automation.id} />
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// AutomationForm (Create)
// ════════════════════════════════════════════════════════════

function AutomationForm({
  onSave,
  onCancel,
}: {
  onSave: (input: CreateAutomationInput) => Promise<{ success: boolean; error?: string }>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState<AutomationTrigger>("new_lead");
  const [conditions, setConditions] = useState<ConditionGroup[]>([]);
  const [actions, setActions] = useState<AutomationAction[]>([newAction()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError("");
    const result = await onSave({
      name,
      description,
      triggerType,
      conditions,
      actions,
    });
    setSaving(false);
    if (!result.success && result.error) {
      setError(result.error);
    }
  }

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-white">New Automation</h3>
        <button onClick={onCancel} className="text-slate-400 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Name + Description */}
      <div className="space-y-3 mb-4">
        <input
          type="text"
          placeholder="Automation name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <input
          type="text"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Trigger Type */}
      <div className="mb-4">
        <label className="text-xs font-medium text-slate-400 mb-2 block">
          When this happens...
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {TRIGGER_OPTIONS.map((t) => (
            <button
              key={t.value}
              onClick={() => setTriggerType(t.value as AutomationTrigger)}
              className={`text-left p-3 rounded-lg border text-sm transition-colors ${
                triggerType === t.value
                  ? "border-blue-500 bg-blue-500/10 text-white"
                  : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600"
              }`}
            >
              <div className="font-medium">{t.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Conditions */}
      <ConditionsBuilder conditions={conditions} onChange={setConditions} />

      {/* Actions */}
      <ActionsBuilder actions={actions} onChange={setActions} />

      {/* Error + Save */}
      {error && (
        <p className="text-xs text-red-400 mb-3">{error}</p>
      )}
      <div className="flex items-center gap-2 mt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {saving ? "Creating..." : "Create Automation"}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// AutomationEditForm (inline edit when expanded)
// ════════════════════════════════════════════════════════════

function AutomationEditForm({
  automationId,
  onSave,
}: {
  automationId: string;
  onSave: (input: UpdateAutomationInput) => Promise<{ success: boolean; error?: string }>;
}) {
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState<AutomationTrigger>("new_lead");
  const [conditions, setConditions] = useState<ConditionGroup[]>([]);
  const [actions, setActions] = useState<AutomationAction[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadFull() {
      const { getAutomation } = await import("./actions");
      const result = await getAutomation(automationId);
      if (result.success && result.automation) {
        const a = result.automation;
        setName(a.name);
        setDescription(a.description || "");
        setTriggerType(a.triggerType);
        setConditions(
          Array.isArray(a.conditions) ? (a.conditions as unknown as ConditionGroup[]) : [],
        );
        setActions(
          Array.isArray(a.actions) ? (a.actions as unknown as AutomationAction[]) : [],
        );
      }
      setLoaded(true);
    }
    loadFull();
  }, [automationId]);

  async function handleSave() {
    setSaving(true);
    setError("");
    const result = await onSave({
      name,
      description,
      triggerType,
      conditions,
      actions,
    });
    setSaving(false);
    if (result.success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else if (result.error) {
      setError(result.error);
    }
  }

  if (!loaded) {
    return (
      <div className="text-sm text-slate-500 py-4 text-center">Loading...</div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Name + Desc */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          type="text"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <input
          type="text"
          placeholder="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Trigger */}
      <div>
        <label className="text-xs font-medium text-slate-400 mb-2 block">
          Trigger
        </label>
        <select
          value={triggerType}
          onChange={(e) => setTriggerType(e.target.value as AutomationTrigger)}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {TRIGGER_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* Conditions */}
      <ConditionsBuilder conditions={conditions} onChange={setConditions} />

      {/* Actions */}
      <ActionsBuilder actions={actions} onChange={setActions} />

      {/* Save */}
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        onClick={handleSave}
        disabled={saving}
        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
          saved
            ? "bg-emerald-600 text-white"
            : "bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white"
        }`}
      >
        {saved ? "Saved!" : saving ? "Saving..." : "Save Changes"}
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ConditionsBuilder
// ════════════════════════════════════════════════════════════

function ConditionsBuilder({
  conditions,
  onChange,
}: {
  conditions: ConditionGroup[];
  onChange: (c: ConditionGroup[]) => void;
}) {
  function addGroup() {
    onChange([...conditions, newConditionGroup()]);
  }

  function removeGroup(gi: number) {
    onChange(conditions.filter((_, i) => i !== gi));
  }

  function updateRule(gi: number, ri: number, patch: Partial<ConditionRule>) {
    const updated = conditions.map((g, i) => {
      if (i !== gi) return g;
      return {
        ...g,
        rules: g.rules.map((r, j) => (j === ri ? { ...r, ...patch } : r)),
      };
    });
    onChange(updated);
  }

  function addRule(gi: number) {
    const updated = conditions.map((g, i) => {
      if (i !== gi) return g;
      return { ...g, rules: [...g.rules, newConditionRule()] };
    });
    onChange(updated);
  }

  function removeRule(gi: number, ri: number) {
    const updated = conditions
      .map((g, i) => {
        if (i !== gi) return g;
        const newRules = g.rules.filter((_, j) => j !== ri);
        return { ...g, rules: newRules };
      })
      .filter((g) => g.rules.length > 0);
    onChange(updated);
  }

  function toggleLogicalOp(gi: number) {
    const updated = conditions.map((g, i) => {
      if (i !== gi) return g;
      return { ...g, logicalOp: g.logicalOp === "AND" ? "OR" as const : "AND" as const };
    });
    onChange(updated);
  }

  return (
    <div className="mb-4">
      <label className="text-xs font-medium text-slate-400 mb-2 block">
        Only if these conditions match... (optional)
      </label>

      {conditions.map((group, gi) => (
        <div
          key={gi}
          className="bg-slate-800/50 rounded-lg p-3 mb-2 border border-slate-700"
        >
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => toggleLogicalOp(gi)}
              className="text-[10px] px-2 py-0.5 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors"
            >
              Match {group.logicalOp === "AND" ? "ALL" : "ANY"}
            </button>
            <button
              onClick={() => removeGroup(gi)}
              className="text-slate-500 hover:text-red-400 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {group.rules.map((rule, ri) => (
            <div key={ri} className="flex items-center gap-2 mb-2">
              <select
                value={rule.field}
                onChange={(e) => updateRule(gi, ri, { field: e.target.value })}
                className="flex-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white focus:outline-none"
              >
                {CONDITION_FIELDS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>

              <select
                value={rule.operator}
                onChange={(e) =>
                  updateRule(gi, ri, {
                    operator: e.target.value as ConditionOperator,
                  })
                }
                className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white focus:outline-none"
              >
                {Object.entries(OPERATOR_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>

              {rule.operator !== "is_empty" && rule.operator !== "is_not_empty" && (
                <input
                  type="text"
                  value={String(rule.value ?? "")}
                  onChange={(e) => updateRule(gi, ri, { value: e.target.value })}
                  placeholder="value"
                  className="flex-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white placeholder-slate-600 focus:outline-none"
                />
              )}

              <button
                onClick={() => removeRule(gi, ri)}
                className="text-slate-500 hover:text-red-400 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}

          <button
            onClick={() => addRule(gi)}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            + Add condition
          </button>
        </div>
      ))}

      <button
        onClick={addGroup}
        className="text-xs text-slate-400 hover:text-white transition-colors"
      >
        + Add condition group
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// ActionsBuilder
// ════════════════════════════════════════════════════════════

function ActionsBuilder({
  actions,
  onChange,
}: {
  actions: AutomationAction[];
  onChange: (a: AutomationAction[]) => void;
}) {
  function updateAction(idx: number, patch: Partial<AutomationAction>) {
    onChange(
      actions.map((a, i) => (i === idx ? { ...a, ...patch } as AutomationAction : a)),
    );
  }

  function changeType(idx: number, newType: string) {
    const defaults: Record<string, AutomationAction> = {
      create_task: { type: "create_task", title: "", priority: "medium" },
      update_contact_status: { type: "update_contact_status", newStatus: "contacted" },
      send_notification: { type: "send_notification", title: "", body: "" },
      send_email: { type: "send_email", to: "{{email}}", subject: "", bodyHtml: "" },
      ai_generate_email: { type: "ai_generate_email", prompt: "", tone: "professional", sendAfterGeneration: false },
      add_tag: { type: "add_tag", tags: [] },
    };
    onChange(
      actions.map((a, i) => (i === idx ? defaults[newType] || a : a)),
    );
  }

  function removeAction(idx: number) {
    onChange(actions.filter((_, i) => i !== idx));
  }

  return (
    <div className="mb-4">
      <label className="text-xs font-medium text-slate-400 mb-2 block">
        Then do this...
      </label>

      {actions.map((action, idx) => (
        <div
          key={idx}
          className="bg-slate-800/50 rounded-lg p-3 mb-2 border border-slate-700"
        >
          <div className="flex items-center gap-2 mb-2">
            <select
              value={action.type}
              onChange={(e) => changeType(idx, e.target.value)}
              className="flex-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white focus:outline-none"
            >
              {ACTION_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              onClick={() => removeAction(idx)}
              className="text-slate-500 hover:text-red-400 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Action-specific config */}
          {action.type === "create_task" && (
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Task title (use {{contactName}}, {{source}}, etc.)"
                value={(action as { title?: string }).title || ""}
                onChange={(e) => updateAction(idx, { title: e.target.value } as Partial<AutomationAction>)}
                className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white placeholder-slate-600 focus:outline-none"
              />
              <select
                value={(action as { priority?: string }).priority || "medium"}
                onChange={(e) =>
                  updateAction(idx, { priority: e.target.value } as Partial<AutomationAction>)
                }
                className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white focus:outline-none"
              >
                <option value="low">Low priority</option>
                <option value="medium">Medium priority</option>
                <option value="high">High priority</option>
              </select>
            </div>
          )}

          {action.type === "update_contact_status" && (
            <select
              value={(action as { newStatus?: string }).newStatus || "contacted"}
              onChange={(e) =>
                updateAction(idx, { newStatus: e.target.value } as Partial<AutomationAction>)
              }
              className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white focus:outline-none"
            >
              <option value="lead">Lead</option>
              <option value="active">Active</option>
              <option value="client">Client</option>
              <option value="past_client">Past Client</option>
              <option value="archived">Archived</option>
            </select>
          )}

          {action.type === "send_notification" && (
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Notification title"
                value={(action as { title?: string }).title || ""}
                onChange={(e) => updateAction(idx, { title: e.target.value } as Partial<AutomationAction>)}
                className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white placeholder-slate-600 focus:outline-none"
              />
              <textarea
                placeholder="Notification body (use {{contactName}}, {{source}}, etc.)"
                value={(action as { body?: string }).body || ""}
                onChange={(e) => updateAction(idx, { body: e.target.value } as Partial<AutomationAction>)}
                rows={2}
                className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white placeholder-slate-600 focus:outline-none resize-none"
              />
            </div>
          )}

          {action.type === "send_email" && (
            <div className="space-y-2">
              <div className="flex items-center gap-1 mb-1">
                <Mail className="h-3 w-3 text-blue-400" />
                <span className="text-[10px] text-slate-500">Use {"{{email}}"} for contact&apos;s email</span>
              </div>
              <input
                type="text"
                placeholder="To (e.g. {{email}})"
                value={(action as { to?: string }).to || ""}
                onChange={(e) => updateAction(idx, { to: e.target.value } as Partial<AutomationAction>)}
                className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white placeholder-slate-600 focus:outline-none"
              />
              <input
                type="text"
                placeholder="Subject (use {{contactName}}, {{source}}, etc.)"
                value={(action as { subject?: string }).subject || ""}
                onChange={(e) => updateAction(idx, { subject: e.target.value } as Partial<AutomationAction>)}
                className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white placeholder-slate-600 focus:outline-none"
              />
              <textarea
                placeholder="Email body (HTML — use {{contactName}}, {{firstName}}, etc.)"
                value={(action as { bodyHtml?: string }).bodyHtml || ""}
                onChange={(e) => updateAction(idx, { bodyHtml: e.target.value } as Partial<AutomationAction>)}
                rows={3}
                className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white placeholder-slate-600 focus:outline-none resize-none"
              />
            </div>
          )}

          {action.type === "ai_generate_email" && (
            <div className="space-y-2">
              <div className="flex items-center gap-1 mb-1">
                <Sparkles className="h-3 w-3 text-purple-400" />
                <span className="text-[10px] text-slate-500">Claude AI will draft a personalized email</span>
              </div>
              <textarea
                placeholder="Instructions for AI (e.g. 'Write a follow-up email about the property showing')"
                value={(action as { prompt?: string }).prompt || ""}
                onChange={(e) => updateAction(idx, { prompt: e.target.value } as Partial<AutomationAction>)}
                rows={3}
                className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white placeholder-slate-600 focus:outline-none resize-none"
              />
              <div className="flex items-center gap-3">
                <select
                  value={(action as { tone?: string }).tone || "professional"}
                  onChange={(e) => updateAction(idx, { tone: e.target.value } as Partial<AutomationAction>)}
                  className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white focus:outline-none"
                >
                  <option value="professional">Professional tone</option>
                  <option value="friendly">Friendly tone</option>
                  <option value="urgent">Urgent tone</option>
                </select>
                <label className="flex items-center gap-1.5 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={(action as { sendAfterGeneration?: boolean }).sendAfterGeneration || false}
                    onChange={(e) => updateAction(idx, { sendAfterGeneration: e.target.checked } as Partial<AutomationAction>)}
                    className="rounded bg-slate-800 border-slate-600"
                  />
                  Auto-send (skip review)
                </label>
              </div>
            </div>
          )}

          {action.type === "add_tag" && (
            <input
              type="text"
              placeholder="Tags (comma-separated, e.g. vip, follow_up)"
              value={((action as { tags?: string[] }).tags || []).join(", ")}
              onChange={(e) =>
                updateAction(idx, {
                  tags: e.target.value
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
                } as Partial<AutomationAction>)
              }
              className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white placeholder-slate-600 focus:outline-none"
            />
          )}

          {/* Delay (available on all actions) */}
          <DelayConfig
            delay={(action as { delay?: ActionDelay }).delay}
            onChange={(delay) => updateAction(idx, { delay } as Partial<AutomationAction>)}
          />
        </div>
      ))}

      <button
        onClick={() => onChange([...actions, newAction()])}
        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
      >
        + Add action
      </button>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// DelayConfig
// ════════════════════════════════════════════════════════════

function DelayConfig({
  delay,
  onChange,
}: {
  delay?: ActionDelay;
  onChange: (delay?: ActionDelay) => void;
}) {
  const hasDelay = delay && delay.value > 0;

  return (
    <div className="mt-2 pt-2 border-t border-slate-700/50">
      <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
        <input
          type="checkbox"
          checked={!!hasDelay}
          onChange={(e) => {
            if (e.target.checked) {
              onChange({ value: 1, unit: "hours" });
            } else {
              onChange(undefined);
            }
          }}
          className="rounded bg-slate-800 border-slate-600"
        />
        <Clock className="h-3 w-3" />
        Add delay before this action
      </label>
      {hasDelay && (
        <div className="flex items-center gap-2 mt-2">
          <input
            type="number"
            min={1}
            value={delay.value}
            onChange={(e) => onChange({ ...delay, value: parseInt(e.target.value) || 1 })}
            className="w-16 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-white focus:outline-none"
          />
          <select
            value={delay.unit}
            onChange={(e) => onChange({ ...delay, unit: e.target.value as ActionDelay["unit"] })}
            className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-white focus:outline-none"
          >
            <option value="minutes">Minutes</option>
            <option value="hours">Hours</option>
            <option value="days">Days</option>
          </select>
          <span className="text-[10px] text-slate-500">before executing</span>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Recipe Modal
// ════════════════════════════════════════════════════════════

function RecipeModal({
  onClose,
  onApply,
}: {
  onClose: () => void;
  onApply: (recipeId: string) => Promise<{ success: boolean; error?: string }>;
}) {
  const [selectedCategory, setSelectedCategory] = useState<"all" | RecipeCategory>("all");
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState("");

  const filtered =
    selectedCategory === "all"
      ? AUTOMATION_RECIPES
      : AUTOMATION_RECIPES.filter((r) => r.category === selectedCategory);

  async function handleApply(recipeId: string) {
    setApplying(recipeId);
    setError("");
    const result = await onApply(recipeId);
    setApplying(null);
    if (!result.success && result.error) {
      setError(result.error);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-3xl max-h-[80vh] overflow-hidden animate-[modal-in_0.2s_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-amber-400" />
            <h3 className="text-white font-semibold">Automation Recipes</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex gap-1 px-5 pt-4 pb-2 overflow-x-auto">
          {(["all", "lead_management", "follow_up", "deal_pipeline", "engagement"] as const).map(
            (cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                  selectedCategory === cat
                    ? "bg-blue-600 text-white"
                    : "bg-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                {cat === "all" ? "All" : RECIPE_CATEGORY_LABELS[cat]}
              </button>
            ),
          )}
        </div>

        {/* Recipe Grid */}
        <div className="overflow-y-auto max-h-[55vh] p-5">
          {error && (
            <p className="text-xs text-red-400 mb-3">{error}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map((recipe) => (
              <div
                key={recipe.id}
                className="bg-slate-800 rounded-lg border border-slate-700 p-4 hover:border-slate-600 transition"
              >
                <div className="flex items-start justify-between mb-2">
                  <h4 className="text-sm font-medium text-white">{recipe.name}</h4>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      TRIGGER_COLORS[recipe.triggerType] || "bg-slate-500/15 text-slate-400"
                    }`}
                  >
                    {TRIGGER_LABELS[recipe.triggerType]}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mb-3">{recipe.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500">
                    {recipe.actions.length} action{recipe.actions.length !== 1 ? "s" : ""}
                  </span>
                  <button
                    onClick={() => handleApply(recipe.id)}
                    disabled={applying === recipe.id}
                    className="px-3 py-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white text-xs font-medium rounded transition-colors"
                  >
                    {applying === recipe.id ? "Applying..." : "Use This"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// Empty State + Loading
// ════════════════════════════════════════════════════════════

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-12 text-center">
      <Zap className="h-10 w-10 text-slate-600 mx-auto mb-4" />
      <h3 className="text-sm font-medium text-slate-300 mb-1">
        No automations yet
      </h3>
      <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
        Create your first automation to automatically take actions when events
        happen in your CRM — like creating tasks for new leads or updating
        contact statuses when deals change stages.
      </p>
      <button
        onClick={onCreateClick}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
      >
        <Plus className="h-4 w-4" />
        Create Automation
      </button>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-slate-900 rounded-xl border border-slate-800 p-4 animate-pulse"
        >
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="h-4 w-48 bg-slate-800 rounded mb-2" />
              <div className="h-3 w-32 bg-slate-800 rounded" />
            </div>
            <div className="h-5 w-10 bg-slate-800 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
