"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  AlertCircle,
  X,
  Ban,
  CheckCircle2,
  CalendarDays,
  Users2,
  StickyNote,
  DollarSign,
  FileText,
  Receipt,
  ExternalLink,
  Clock,
  Wallet,
  ArrowRightCircle,
  Circle,
  CreditCard,
  Send,
  Banknote,
  UserPlus,
  UserMinus,
  Users,
  Pencil,
  AlertTriangle,
} from "lucide-react";
import {
  getTransaction,
  updateTransaction,
  advanceStage,
  revertStage,
  cancelTransaction,
  toggleTask,
  addTask,
  deleteTask,
  getDealTimeline,
  recordAgentPayout,
  markCommissionReceived,
  addAgentToSplit,
  removeAgentFromSplit,
  recordAgentSplitPayout,
  updateTransactionAgentSplit,
} from "../actions";
import { getAgents } from "../../agents/actions";
import {
  STAGE_LABELS,
  STAGE_COLORS,
  TRANSACTION_TYPE_LABELS,
  TRANSACTION_TYPE_COLORS,
  getStagesForType,
} from "@/lib/transaction-templates";
import type {
  TransactionWithTasks,
  TransactionTaskRecord,
  TransactionStageType,
  BmsTransactionTypeAlias,
  TimelineEvent,
  PaymentMethodType,
  TransactionAgentRecord,
  TransactionAgentRole,
} from "@/lib/bms-types";
import {
  PAYMENT_METHOD_LABELS,
  TRANSACTION_AGENT_ROLE_LABELS,
  TRANSACTION_AGENT_ROLE_COLORS,
} from "@/lib/bms-types";

// ── Helpers ──────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(n);

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "\u2014";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "\u2014";
  }
};

function dateStatus(d: string | null | undefined): "past" | "soon" | "overdue" | "normal" {
  if (!d) return "normal";
  const date = new Date(d);
  const now = new Date();
  const diffDays = Math.ceil((date.getTime() - now.getTime()) / 86400000);
  if (diffDays < 0) return "overdue";
  if (diffDays < 7) return "soon";
  if (date < now) return "past";
  return "normal";
}

const DATE_STATUS_COLORS = {
  past: "text-slate-400",
  soon: "text-amber-600",
  overdue: "text-red-600 font-medium",
  normal: "text-slate-600",
};

// ── Component ────────────────────────────────────────────────

export default function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [tx, setTx] = useState<TransactionWithTasks | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [stageError, setStageError] = useState<{ message: string; tasks: string[] } | null>(null);

  // Cancel modal
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // Inline add task
  const [addingStage, setAddingStage] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskRequired, setNewTaskRequired] = useState(false);

  // Parties editing
  const [editParties, setEditParties] = useState(false);
  const [partyForm, setPartyForm] = useState({
    clientName: "",
    clientEmail: "",
    clientPhone: "",
    otherPartyName: "",
    otherPartyEmail: "",
    otherPartyPhone: "",
  });

  // Dates editing
  const [editDates, setEditDates] = useState(false);
  const [dateForm, setDateForm] = useState<Record<string, string>>({});

  // Notes
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState("");

  // Collapsed stages
  const [collapsedStages, setCollapsedStages] = useState<Set<string>>(new Set());

  // Timeline
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);

  // Agent payout form
  const [showPayoutForm, setShowPayoutForm] = useState(false);
  const [payoutForm, setPayoutForm] = useState({
    amount: "",
    method: "check" as string,
    reference: "",
    date: "",
  });
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutError, setPayoutError] = useState("");

  // Multi-agent splits
  type AgentOption = { id: string; firstName: string; lastName: string; email: string };
  const [orgAgents, setOrgAgents] = useState<AgentOption[]>([]);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [addAgentForm, setAddAgentForm] = useState({ agentId: "", role: "co_agent" as TransactionAgentRole, splitPct: "", notes: "" });
  const [addAgentLoading, setAddAgentLoading] = useState(false);
  const [agentPayoutTarget, setAgentPayoutTarget] = useState<TransactionAgentRecord | null>(null);
  const [agentPayoutForm, setAgentPayoutForm] = useState({ amount: "", method: "check", reference: "", date: "" });
  const [agentPayoutLoading, setAgentPayoutLoading] = useState(false);
  const [agentPayoutError, setAgentPayoutError] = useState("");

  // Edit split inline
  const [editSplitTargetId, setEditSplitTargetId] = useState<string | null>(null);
  const [editSplitForm, setEditSplitForm] = useState({ splitPct: "", payoutAmount: "", notes: "" });
  const [editSplitLoading, setEditSplitLoading] = useState(false);
  const [editSplitError, setEditSplitError] = useState("");
  // House split editing
  const [editHouseSplit, setEditHouseSplit] = useState(false);
  const [housePayoutValue, setHousePayoutValue] = useState("");
  const [housePayoutLoading, setHousePayoutLoading] = useState(false);

  // ── Load Data ─────────────────────────────────────────────

  async function loadData() {
    try {
      const data = await getTransaction(id);
      setTx(data);
      setNotesValue(data.notes || "");
    } catch (err) {
      console.error("Failed to load transaction:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    getAgents({ status: "active", limit: 100 })
      .then((res) => { if (res?.agents) setOrgAgents(res.agents as AgentOption[]); })
      .catch(() => {});
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ───────────────────────────────────────────────

  async function handleAdvance() {
    if (!tx) return;
    setActionLoading("advance");
    setStageError(null);
    try {
      const result = await advanceStage(tx.id);
      if (result.success) {
        await loadData();
      } else {
        setStageError({ message: result.error, tasks: result.incompleteTasks });
      }
    } catch (err) {
      setStageError({
        message: err instanceof Error ? err.message : "Failed to advance stage",
        tasks: [],
      });
    } finally {
      setActionLoading("");
    }
  }

  async function handleRevert() {
    if (!tx) return;
    setActionLoading("revert");
    setStageError(null);
    try {
      await revertStage(tx.id);
      await loadData();
    } catch (err) {
      setStageError({
        message: err instanceof Error ? err.message : "Failed to revert stage",
        tasks: [],
      });
    } finally {
      setActionLoading("");
    }
  }

  async function handleCancel() {
    if (!tx) return;
    setActionLoading("cancel");
    try {
      await cancelTransaction(tx.id, cancelReason || undefined);
      setShowCancel(false);
      setCancelReason("");
      await loadData();
    } catch (err) {
      console.error("Failed to cancel:", err);
    } finally {
      setActionLoading("");
    }
  }

  async function handleToggleTask(taskId: string) {
    if (!tx) return;
    // Optimistic update
    setTx({
      ...tx,
      tasks: tx.tasks.map((t) =>
        t.id === taskId ? { ...t, isCompleted: !t.isCompleted } : t,
      ),
    });
    try {
      await toggleTask(taskId);
    } catch {
      // Revert on error
      await loadData();
    }
  }

  async function handleAddTask() {
    if (!tx || !addingStage || !newTaskTitle.trim()) return;
    setActionLoading("addTask");
    try {
      await addTask(tx.id, {
        title: newTaskTitle.trim(),
        stage: addingStage as TransactionStageType,
        isRequired: newTaskRequired,
      });
      setNewTaskTitle("");
      setNewTaskRequired(false);
      setAddingStage(null);
      await loadData();
    } catch (err) {
      console.error("Failed to add task:", err);
    } finally {
      setActionLoading("");
    }
  }

  async function handleDeleteTask(taskId: string) {
    if (!tx) return;
    setTx({ ...tx, tasks: tx.tasks.filter((t) => t.id !== taskId) });
    try {
      await deleteTask(taskId);
    } catch {
      await loadData();
    }
  }

  async function handleSaveParties() {
    if (!tx) return;
    setActionLoading("parties");
    try {
      await updateTransaction(tx.id, partyForm);
      setEditParties(false);
      await loadData();
    } catch (err) {
      console.error("Failed to save parties:", err);
    } finally {
      setActionLoading("");
    }
  }

  async function handleSaveDates() {
    if (!tx) return;
    setActionLoading("dates");
    try {
      await updateTransaction(tx.id, dateForm);
      setEditDates(false);
      await loadData();
    } catch (err) {
      console.error("Failed to save dates:", err);
    } finally {
      setActionLoading("");
    }
  }

  async function handleSaveNotes() {
    if (!tx) return;
    setActionLoading("notes");
    try {
      await updateTransaction(tx.id, { notes: notesValue });
      setEditingNotes(false);
      await loadData();
    } catch (err) {
      console.error("Failed to save notes:", err);
    } finally {
      setActionLoading("");
    }
  }

  function openEditParties() {
    if (!tx) return;
    setPartyForm({
      clientName: tx.clientName || "",
      clientEmail: tx.clientEmail || "",
      clientPhone: tx.clientPhone || "",
      otherPartyName: tx.otherPartyName || "",
      otherPartyEmail: tx.otherPartyEmail || "",
      otherPartyPhone: tx.otherPartyPhone || "",
    });
    setEditParties(true);
  }

  function openEditDates() {
    if (!tx) return;
    const fields = tx.type === "rental"
      ? ["applicationDate", "approvalDate", "moveInDate", "leaseStartDate", "leaseEndDate"]
      : ["contractDate", "inspectionDate", "closingDate", "expirationDate"];
    const initial: Record<string, string> = {};
    for (const f of fields) {
      const v = (tx as any)[f] as string | null; // eslint-disable-line @typescript-eslint/no-explicit-any
      initial[f] = v ? new Date(v).toISOString().split("T")[0] : "";
    }
    setDateForm(initial);
    setEditDates(true);
  }

  async function loadTimeline() {
    setTimelineLoading(true);
    try {
      const events = await getDealTimeline(id);
      setTimeline(events);
    } catch (err) {
      console.error("Failed to load timeline:", err);
    } finally {
      setTimelineLoading(false);
    }
  }

  function handleToggleTimeline() {
    if (!showTimeline) {
      loadTimeline();
    }
    setShowTimeline(!showTimeline);
  }

  async function handleRecordPayout() {
    if (!tx) return;
    const amount = parseFloat(payoutForm.amount);
    if (!amount || amount <= 0) {
      setPayoutError("Enter a valid amount");
      return;
    }
    setPayoutLoading(true);
    setPayoutError("");
    try {
      await recordAgentPayout(tx.id, {
        amount,
        method: payoutForm.method,
        reference: payoutForm.reference || undefined,
        date: payoutForm.date || undefined,
      });
      setShowPayoutForm(false);
      setPayoutForm({ amount: "", method: "check", reference: "", date: "" });
      await loadData();
      if (showTimeline) loadTimeline();
    } catch (err) {
      setPayoutError(err instanceof Error ? err.message : "Failed to record payout");
    } finally {
      setPayoutLoading(false);
    }
  }

  async function handleMarkCommissionReceived() {
    if (!tx) return;
    setActionLoading("commission");
    try {
      await markCommissionReceived(tx.id);
      await loadData();
      if (showTimeline) loadTimeline();
    } catch (err) {
      console.error("Failed to mark commission received:", err);
    } finally {
      setActionLoading("");
    }
  }

  function openPayoutForm() {
    if (!tx) return;
    setPayoutForm({
      amount: tx.agentPayoutAmount ? String(tx.agentPayoutAmount) : tx.commissionAmount ? String(Math.round(tx.commissionAmount * (tx.agentSplitPct || 70) / 100)) : "",
      method: "check",
      reference: "",
      date: new Date().toISOString().split("T")[0],
    });
    setPayoutError("");
    setShowPayoutForm(true);
  }

  // ── Multi-Agent Handlers ─────────────────────────────────

  async function handleAddAgentToSplit() {
    if (!tx || !addAgentForm.agentId) return;
    setAddAgentLoading(true);
    try {
      await addAgentToSplit(tx.id, {
        agentId: addAgentForm.agentId,
        role: addAgentForm.role,
        splitPct: addAgentForm.splitPct ? Number(addAgentForm.splitPct) : undefined,
        notes: addAgentForm.notes || undefined,
      });
      setShowAddAgent(false);
      setAddAgentForm({ agentId: "", role: "co_agent", splitPct: "", notes: "" });
      await loadData();
    } catch (err) {
      console.error("Failed to add agent:", err);
    } finally {
      setAddAgentLoading(false);
    }
  }

  async function handleRemoveAgent(agentId: string) {
    if (!tx || !confirm("Remove this agent from the split?")) return;
    try {
      await removeAgentFromSplit(tx.id, agentId);
      await loadData();
    } catch (err) {
      console.error("Failed to remove agent:", err);
    }
  }

  function openAgentPayoutForm(agent: TransactionAgentRecord) {
    setAgentPayoutTarget(agent);
    setAgentPayoutForm({
      amount: agent.payoutAmount ? String(agent.payoutAmount) : agent.splitPct && tx?.commissionAmount
        ? String(Math.round(Number(tx.commissionAmount) * Number(agent.splitPct) / 100))
        : "",
      method: "check",
      reference: "",
      date: new Date().toISOString().split("T")[0],
    });
    setAgentPayoutError("");
  }

  async function handleRecordAgentPayout() {
    if (!tx || !agentPayoutTarget) return;
    const amount = parseFloat(agentPayoutForm.amount);
    if (!amount || amount <= 0) {
      setAgentPayoutError("Enter a valid amount");
      return;
    }
    setAgentPayoutLoading(true);
    setAgentPayoutError("");
    try {
      await recordAgentSplitPayout(tx.id, agentPayoutTarget.agentId, {
        amount,
        method: agentPayoutForm.method,
        reference: agentPayoutForm.reference || undefined,
        date: agentPayoutForm.date || undefined,
      });
      setAgentPayoutTarget(null);
      await loadData();
      if (showTimeline) loadTimeline();
    } catch (err) {
      setAgentPayoutError(err instanceof Error ? err.message : "Failed");
    } finally {
      setAgentPayoutLoading(false);
    }
  }

  // ── Edit Split Handlers ──────────────────────────────────

  function openEditSplit(a: TransactionAgentRecord) {
    const commission = tx?.commissionAmount ? Number(tx.commissionAmount) : 0;
    const payout = a.payoutAmount ? Number(a.payoutAmount) : (
      a.splitPct && commission ? Math.round(commission * Number(a.splitPct)) / 100 : 0
    );
    setEditSplitTargetId(a.id);
    setEditSplitForm({
      splitPct: a.splitPct != null ? String(Number(a.splitPct)) : "",
      payoutAmount: payout ? String(payout) : "",
      notes: a.notes || "",
    });
    setEditSplitError("");
    // Close any open payout form
    setAgentPayoutTarget(null);
  }

  function handleEditSplitChange(field: "splitPct" | "payoutAmount", value: string) {
    const commission = tx?.commissionAmount ? Number(tx.commissionAmount) : 0;
    if (field === "splitPct") {
      const pct = parseFloat(value);
      setEditSplitForm({
        ...editSplitForm,
        splitPct: value,
        payoutAmount: !isNaN(pct) && commission > 0 ? String(Math.round(commission * pct) / 100) : editSplitForm.payoutAmount,
      });
    } else {
      const amt = parseFloat(value);
      setEditSplitForm({
        ...editSplitForm,
        payoutAmount: value,
        splitPct: !isNaN(amt) && commission > 0 ? String(Math.round((amt / commission) * 10000) / 100) : editSplitForm.splitPct,
      });
    }
  }

  async function handleSaveEditSplit() {
    if (!tx || !editSplitTargetId) return;
    const pct = editSplitForm.splitPct ? parseFloat(editSplitForm.splitPct) : undefined;
    const amt = editSplitForm.payoutAmount ? parseFloat(editSplitForm.payoutAmount) : undefined;
    if (pct === undefined && amt === undefined) {
      setEditSplitError("Enter a split % or payout amount");
      return;
    }
    setEditSplitLoading(true);
    setEditSplitError("");
    try {
      // payoutAmount takes precedence if both filled
      await updateTransactionAgentSplit(editSplitTargetId, {
        ...(amt !== undefined ? { payoutAmount: amt } : pct !== undefined ? { splitPct: pct } : {}),
        notes: editSplitForm.notes || undefined,
      });
      setEditSplitTargetId(null);
      await loadData();
      if (showTimeline) loadTimeline();
    } catch (err) {
      setEditSplitError(err instanceof Error ? err.message : "Failed to update split");
    } finally {
      setEditSplitLoading(false);
    }
  }

  async function handleSaveHousePayout() {
    if (!tx) return;
    const amt = parseFloat(housePayoutValue);
    if (isNaN(amt)) return;
    setHousePayoutLoading(true);
    try {
      await updateTransaction(tx.id, { housePayoutAmount: amt });
      setEditHouseSplit(false);
      await loadData();
      if (showTimeline) loadTimeline();
    } catch (err) {
      console.error("Failed to update house payout:", err);
    } finally {
      setHousePayoutLoading(false);
    }
  }

  function toggleStageCollapse(stage: string) {
    setCollapsedStages((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  }

  // ── Derived ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-4 w-32 bg-slate-200 rounded" />
          <div className="h-8 w-64 bg-slate-200 rounded" />
          <div className="h-12 bg-slate-200 rounded-xl" />
          <div className="grid lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-24 bg-slate-200 rounded-xl" />
              ))}
            </div>
            <div className="lg:col-span-2 space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-32 bg-slate-200 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!tx) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-16 text-center">
        <p className="text-slate-500">Transaction not found</p>
        <Link href="/brokerage/transactions" className="text-blue-600 text-sm hover:underline mt-2 inline-block">
          Back to Transactions
        </Link>
      </div>
    );
  }

  const stages = getStagesForType(tx.type as BmsTransactionTypeAlias);
  const currentStageIndex = stages.indexOf(tx.stage as TransactionStageType);
  const isCancelled = tx.stage === "cancelled";
  const isClosed = tx.stage === "closed";
  const isTerminal = isCancelled || isClosed;

  // Checklist progress
  const totalTasks = tx.tasks.length;
  const completedTasks = tx.tasks.filter((t) => t.isCompleted).length;
  const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Group tasks by stage
  const tasksByStage: Record<string, TransactionTaskRecord[]> = {};
  for (const s of stages) {
    tasksByStage[s] = tx.tasks.filter((t) => t.stage === s);
  }

  // Date field config
  const rentalDateFields = [
    { key: "applicationDate", label: "Application Date" },
    { key: "approvalDate", label: "Approval Date" },
    { key: "moveInDate", label: "Move-In Date" },
    { key: "leaseStartDate", label: "Lease Start" },
    { key: "leaseEndDate", label: "Lease End" },
  ];
  const saleDateFields = [
    { key: "contractDate", label: "Contract Date" },
    { key: "inspectionDate", label: "Inspection Date" },
    { key: "closingDate", label: "Target Closing" },
    { key: "expirationDate", label: "Expiration Date" },
  ];
  const dateFields = tx.type === "rental" ? rentalDateFields : saleDateFields;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Back link */}
      <Link
        href="/brokerage/transactions"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Transactions
      </Link>

      {/* Terminal state banners */}
      {isCancelled && (
        <div className="flex items-center gap-3 px-4 py-3 mb-4 bg-red-50 border border-red-200 rounded-xl">
          <Ban className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-800">Transaction Cancelled</p>
            {tx.cancelReason && (
              <p className="text-xs text-red-600 mt-0.5">Reason: {tx.cancelReason}</p>
            )}
          </div>
        </div>
      )}
      {isClosed && (
        <div className="flex items-center gap-3 px-4 py-3 mb-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-emerald-800">Transaction Closed</p>
            {tx.actualCloseDate && (
              <p className="text-xs text-emerald-600 mt-0.5">Closed on {fmtDate(tx.actualCloseDate)}</p>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{tx.propertyAddress}</h1>
          {tx.propertyName && (
            <p className="text-sm text-slate-500 mt-0.5">{tx.propertyName}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${TRANSACTION_TYPE_COLORS[tx.type]}`}>
              {TRANSACTION_TYPE_LABELS[tx.type]}
            </span>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${STAGE_COLORS[tx.stage as TransactionStageType]}`}>
              {STAGE_LABELS[tx.stage as TransactionStageType]}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {!isTerminal && (
            <>
              <button
                onClick={handleAdvance}
                disabled={!!actionLoading}
                className="px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {actionLoading === "advance" ? "Advancing..." : "Advance Stage"}
              </button>
              {currentStageIndex > 0 && (
                <button
                  onClick={handleRevert}
                  disabled={!!actionLoading}
                  className="px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  {actionLoading === "revert" ? "Reverting..." : "Revert Stage"}
                </button>
              )}
              <button
                onClick={() => setShowCancel(true)}
                disabled={!!actionLoading}
                className="px-3 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
            </>
          )}
          {isClosed && currentStageIndex > 0 && (
            <button
              onClick={handleRevert}
              disabled={!!actionLoading}
              className="px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              {actionLoading === "revert" ? "Reverting..." : "Revert Stage"}
            </button>
          )}

          {/* Quick Actions */}
          {tx.commissionAmount && (
            <Link
              href={`/brokerage/invoices/new?address=${encodeURIComponent(tx.propertyAddress)}&value=${tx.transactionValue || ""}&commission=${tx.commissionAmount}&client=${encodeURIComponent(tx.clientName || "")}&agentId=${tx.agentId || ""}`}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-purple-700 bg-white border border-purple-200 rounded-lg hover:bg-purple-50 transition-colors"
            >
              <Receipt className="w-4 h-4" />
              Generate Invoice
            </Link>
          )}
          {tx.dealSubmission && (
            <Link
              href="/brokerage/deal-submissions"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View Submission
            </Link>
          )}
        </div>
      </div>

      {/* Stage error alert */}
      {stageError && (
        <div className="flex items-start gap-3 px-4 py-3 mb-6 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">{stageError.message}</p>
            {stageError.tasks.length > 0 && (
              <ul className="mt-1 text-xs text-amber-700 list-disc list-inside">
                {stageError.tasks.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            )}
          </div>
          <button onClick={() => setStageError(null)} className="ml-auto text-amber-400 hover:text-amber-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Stage Stepper */}
      {!isCancelled && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 overflow-x-auto">
          <div className="flex items-center min-w-max gap-1">
            {stages.map((stage, i) => {
              const isComplete = i < currentStageIndex || (isClosed && i <= currentStageIndex);
              const isCurrent = i === currentStageIndex && !isClosed;
              return (
                <div key={stage} className="flex items-center">
                  {i > 0 && (
                    <div
                      className={`w-8 h-0.5 ${
                        isComplete ? "bg-blue-500" : "bg-slate-200"
                      }`}
                    />
                  )}
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                        isComplete
                          ? "bg-blue-600 text-white"
                          : isCurrent
                            ? "border-2 border-blue-500 text-blue-600 bg-white"
                            : "border-2 border-slate-200 text-slate-400 bg-white"
                      }`}
                    >
                      {isComplete ? <Check className="w-3.5 h-3.5" /> : i + 1}
                    </div>
                    <span
                      className={`text-[10px] font-medium whitespace-nowrap ${
                        isComplete
                          ? "text-blue-600"
                          : isCurrent
                            ? "text-blue-600"
                            : "text-slate-400"
                      }`}
                    >
                      {STAGE_LABELS[stage]}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid lg:grid-cols-5 gap-6">
        {/* Left: Checklist */}
        <div className="lg:col-span-3 space-y-4">
          {/* Progress bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">
                {completedTasks} of {totalTasks} completed
              </span>
              <span className="text-xs text-slate-500">{progressPct}%</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* Tasks grouped by stage */}
          {stages.filter((s) => s !== "closed").map((stage) => {
            const tasks = tasksByStage[stage] || [];
            const isCurrent = stage === tx.stage;
            const isCollapsed = collapsedStages.has(stage) && !isCurrent;
            const stageComplete = tasks.length > 0 && tasks.every((t) => t.isCompleted);

            return (
              <div
                key={stage}
                className={`bg-white border rounded-xl overflow-hidden ${
                  isCurrent
                    ? "border-blue-300 shadow-sm"
                    : "border-slate-200"
                }`}
              >
                {/* Stage header */}
                <button
                  onClick={() => toggleStageCollapse(stage)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                    <span className={`text-sm font-medium ${isCurrent ? "text-blue-700" : "text-slate-700"}`}>
                      {STAGE_LABELS[stage]}
                    </span>
                    {isCurrent && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium bg-blue-100 text-blue-700 rounded-full">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {stageComplete && tasks.length > 0 && (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    )}
                    <span className="text-xs text-slate-400">
                      {tasks.filter((t) => t.isCompleted).length}/{tasks.length}
                    </span>
                  </div>
                </button>

                {/* Tasks */}
                {!isCollapsed && (
                  <div className="border-t border-slate-100">
                    {tasks.length === 0 && (
                      <p className="px-4 py-3 text-sm text-slate-400 italic">No tasks</p>
                    )}
                    {tasks.map((task) => (
                      <div
                        key={task.id}
                        className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-50 last:border-0 group hover:bg-slate-50"
                      >
                        <button
                          onClick={() => !isTerminal && handleToggleTask(task.id)}
                          disabled={isTerminal}
                          className={`w-6 h-6 md:w-5 md:h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                            task.isCompleted
                              ? "bg-blue-600 border-blue-600"
                              : "border-slate-300 hover:border-blue-400"
                          } ${isTerminal ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                        >
                          {task.isCompleted && <Check className="w-3.5 h-3.5 md:w-3 md:h-3 text-white" />}
                        </button>
                        <span
                          className={`flex-1 text-sm ${
                            task.isCompleted
                              ? "text-slate-400 line-through"
                              : "text-slate-700"
                          }`}
                        >
                          {task.title}
                        </span>
                        {task.isRequired && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium bg-red-50 text-red-600 rounded">
                            Required
                          </span>
                        )}
                        {task.dueDate && (
                          <span className={`text-xs ${DATE_STATUS_COLORS[dateStatus(task.dueDate)]}`}>
                            {fmtDate(task.dueDate)}
                          </span>
                        )}
                        {!isTerminal && (
                          <button
                            onClick={() => handleDeleteTask(task.id)}
                            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}

                    {/* Add task inline */}
                    {!isTerminal && addingStage === stage ? (
                      <div className="flex items-center gap-2 px-4 py-2.5 border-t border-slate-100">
                        <input
                          type="text"
                          value={newTaskTitle}
                          onChange={(e) => setNewTaskTitle(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
                          placeholder="Task title..."
                          autoFocus
                          className="flex-1 text-sm px-2 py-1 border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <label className="flex items-center gap-1 text-xs text-slate-500 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newTaskRequired}
                            onChange={(e) => setNewTaskRequired(e.target.checked)}
                            className="rounded border-slate-300"
                          />
                          Required
                        </label>
                        <button
                          onClick={handleAddTask}
                          disabled={actionLoading === "addTask"}
                          className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => { setAddingStage(null); setNewTaskTitle(""); setNewTaskRequired(false); }}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : !isTerminal ? (
                      <button
                        onClick={() => setAddingStage(stage)}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs text-slate-400 hover:text-blue-600 transition-colors border-t border-slate-100 w-full"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add task
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })}

          {/* Deal Timeline */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={handleToggleTimeline}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-700">Deal Timeline</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showTimeline ? "rotate-180" : ""}`} />
            </button>

            {showTimeline && (
              <div className="border-t border-slate-100 px-4 py-4">
                {timelineLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="flex gap-3 animate-pulse">
                        <div className="w-3 h-3 bg-slate-200 rounded-full mt-1" />
                        <div className="flex-1 space-y-1">
                          <div className="h-3 w-48 bg-slate-200 rounded" />
                          <div className="h-2 w-24 bg-slate-100 rounded" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : timeline.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">No timeline events yet</p>
                ) : (
                  <div className="relative">
                    {/* Vertical line */}
                    <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-slate-200" />

                    <div className="space-y-4">
                      {timeline.map((event) => (
                        <div key={event.id} className="relative flex gap-3">
                          {/* Dot */}
                          <div className={`relative z-10 w-4 h-4 rounded-full mt-0.5 flex-shrink-0 flex items-center justify-center ${
                            event.type === "stage_change" ? "bg-blue-500" :
                            event.type === "task_completed" ? "bg-emerald-500" :
                            event.type === "invoice_created" || event.type === "invoice_sent" ? "bg-purple-500" :
                            event.type === "payment_received" ? "bg-green-500" :
                            event.type === "agent_payout" ? "bg-teal-500" :
                            event.type === "deal_submitted" || event.type === "deal_approved" ? "bg-indigo-500" :
                            "bg-slate-400"
                          }`}>
                            {event.type === "stage_change" && <ArrowRightCircle className="w-2.5 h-2.5 text-white" />}
                            {event.type === "task_completed" && <Check className="w-2.5 h-2.5 text-white" />}
                            {(event.type === "invoice_created" || event.type === "invoice_sent") && <FileText className="w-2.5 h-2.5 text-white" />}
                            {event.type === "payment_received" && <DollarSign className="w-2.5 h-2.5 text-white" />}
                            {event.type === "agent_payout" && <Wallet className="w-2.5 h-2.5 text-white" />}
                            {(event.type === "deal_submitted" || event.type === "deal_approved") && <Send className="w-2.5 h-2.5 text-white" />}
                            {(event.type === "note" || event.type === "status_change") && <Circle className="w-2 h-2 text-white" />}
                          </div>
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-800">{event.title}</p>
                            {event.description && (
                              <p className="text-xs text-slate-500 mt-0.5">{event.description}</p>
                            )}
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[11px] text-slate-400">{fmtDate(event.timestamp)}</span>
                              {event.actor && (
                                <span className="text-[11px] text-slate-400">by {event.actor}</span>
                              )}
                              {event.amount != null && (
                                <span className="text-[11px] font-medium text-green-600">{fmt(event.amount)}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Sidebar */}
        <div className="lg:col-span-2 space-y-4">
          {/* Parties */}
          <div className="bg-white border border-slate-200 rounded-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Users2 className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-700">Parties</span>
              </div>
              {!isTerminal && !editParties && (
                <button
                  onClick={openEditParties}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  Edit
                </button>
              )}
            </div>
            <div className="px-4 py-3 space-y-3">
              {editParties ? (
                <>
                  <p className="text-xs font-medium text-slate-500 uppercase">
                    {tx.type === "rental" ? "Tenant" : "Buyer"}
                  </p>
                  <input
                    value={partyForm.clientName}
                    onChange={(e) => setPartyForm({ ...partyForm, clientName: e.target.value })}
                    placeholder="Name"
                    className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    value={partyForm.clientEmail}
                    onChange={(e) => setPartyForm({ ...partyForm, clientEmail: e.target.value })}
                    placeholder="Email"
                    className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    value={partyForm.clientPhone}
                    onChange={(e) => setPartyForm({ ...partyForm, clientPhone: e.target.value })}
                    placeholder="Phone"
                    className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs font-medium text-slate-500 uppercase mt-3">
                    {tx.type === "rental" ? "Landlord" : "Seller"}
                  </p>
                  <input
                    value={partyForm.otherPartyName}
                    onChange={(e) => setPartyForm({ ...partyForm, otherPartyName: e.target.value })}
                    placeholder="Name"
                    className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    value={partyForm.otherPartyEmail}
                    onChange={(e) => setPartyForm({ ...partyForm, otherPartyEmail: e.target.value })}
                    placeholder="Email"
                    className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    value={partyForm.otherPartyPhone}
                    onChange={(e) => setPartyForm({ ...partyForm, otherPartyPhone: e.target.value })}
                    placeholder="Phone"
                    className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={handleSaveParties}
                      disabled={actionLoading === "parties"}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {actionLoading === "parties" ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={() => setEditParties(false)}
                      className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase">
                      {tx.type === "rental" ? "Tenant" : "Buyer"}
                    </p>
                    <p className="text-sm text-slate-900 mt-0.5">{tx.clientName || "\u2014"}</p>
                    {tx.clientEmail && (
                      <p className="text-xs text-slate-500">{tx.clientEmail}</p>
                    )}
                    {tx.clientPhone && (
                      <p className="text-xs text-slate-500">{tx.clientPhone}</p>
                    )}
                  </div>
                  <div className="border-t border-slate-100 pt-3">
                    <p className="text-xs font-medium text-slate-500 uppercase">
                      {tx.type === "rental" ? "Landlord" : "Seller"}
                    </p>
                    <p className="text-sm text-slate-900 mt-0.5">{tx.otherPartyName || "\u2014"}</p>
                    {tx.otherPartyEmail && (
                      <p className="text-xs text-slate-500">{tx.otherPartyEmail}</p>
                    )}
                    {tx.otherPartyPhone && (
                      <p className="text-xs text-slate-500">{tx.otherPartyPhone}</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Key Dates */}
          <div className="bg-white border border-slate-200 rounded-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-700">Key Dates</span>
              </div>
              {!isTerminal && !editDates && (
                <button
                  onClick={openEditDates}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  Edit
                </button>
              )}
            </div>
            <div className="px-4 py-3 space-y-2">
              {editDates ? (
                <>
                  {dateFields.map((f) => (
                    <div key={f.key} className="flex items-center justify-between gap-2">
                      <label className="text-xs text-slate-600 flex-shrink-0">{f.label}</label>
                      <input
                        type="date"
                        value={dateForm[f.key] || ""}
                        onChange={(e) => setDateForm({ ...dateForm, [f.key]: e.target.value })}
                        className="px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ))}
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={handleSaveDates}
                      disabled={actionLoading === "dates"}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {actionLoading === "dates" ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={() => setEditDates(false)}
                      className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                dateFields.map((f) => {
                  const val = (tx as any)[f.key] as string | null; // eslint-disable-line @typescript-eslint/no-explicit-any
                  return (
                    <div key={f.key} className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">{f.label}</span>
                      <span className={`text-sm ${val ? DATE_STATUS_COLORS[dateStatus(val)] : "text-slate-400"}`}>
                        {fmtDate(val)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Deal Info */}
          <div className="bg-white border border-slate-200 rounded-xl">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
              <DollarSign className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-700">Deal Info</span>
            </div>
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Value</span>
                <span className="text-sm font-medium text-slate-900">
                  {tx.transactionValue ? fmt(tx.transactionValue) : "\u2014"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Commission</span>
                <span className="text-sm font-medium text-slate-900">
                  {tx.commissionAmount ? fmt(tx.commissionAmount) : "\u2014"}
                </span>
              </div>
              {tx.agentSplitPct != null && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Agent Split</span>
                  <span className="text-sm text-slate-600">{Number(tx.agentSplitPct).toFixed(0)}%</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Agent</span>
                {tx.agent ? (
                  <Link
                    href={`/brokerage/agents/${tx.agent.id}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    {tx.agent.firstName} {tx.agent.lastName}
                  </Link>
                ) : (
                  <span className="text-sm text-slate-400">{"\u2014"}</span>
                )}
              </div>
              {tx.invoice && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Invoice</span>
                  <span className="text-xs font-mono text-purple-600">
                    {tx.invoice.invoiceNumber}
                    <span className={`ml-1.5 px-1.5 py-0.5 text-[10px] font-medium rounded-full ${
                      tx.invoice.status === "paid" ? "bg-green-100 text-green-700" :
                      tx.invoice.status === "sent" ? "bg-blue-100 text-blue-700" :
                      "bg-slate-100 text-slate-600"
                    }`}>
                      {tx.invoice.status}
                    </span>
                  </span>
                </div>
              )}
              {tx.dealSubmission && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Submission</span>
                  <Link
                    href="/brokerage/deal-submissions"
                    className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                  >
                    <FileText className="w-3 h-3" />
                    View
                  </Link>
                </div>
              )}
              {tx.listing && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">Listing</span>
                  <Link
                    href={`/brokerage/listings/${tx.listing.id}`}
                    className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
                  >
                    {tx.listing.address}{tx.listing.unit ? ` #${tx.listing.unit}` : ""}
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Created</span>
                <span className="text-sm text-slate-600">{fmtDate(tx.createdAt)}</span>
              </div>
            </div>
          </div>

          {/* Agent Payout & Splits */}
          <div className="bg-white border border-slate-200 rounded-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-700">Agent Payout</span>
              </div>
              {(() => {
                const agents = tx.agents || [];
                const paidCount = agents.filter((a) => a.payoutStatus === "paid").length;
                if (agents.length > 1) {
                  return (
                    <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${
                      paidCount === agents.length ? "bg-green-100 text-green-700" :
                      paidCount > 0 ? "bg-amber-100 text-amber-700" :
                      "bg-slate-100 text-slate-500"
                    }`}>
                      {paidCount}/{agents.length} Paid
                    </span>
                  );
                }
                return tx.agentPayoutStatus === "paid" ? (
                  <span className="px-2 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 rounded-full">Paid</span>
                ) : tx.agentPayoutStatus === "processing" ? (
                  <span className="px-2 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 rounded-full">Processing</span>
                ) : (
                  <span className="px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-500 rounded-full">Pending</span>
                );
              })()}
            </div>
            <div className="px-4 py-3 space-y-3">
              {/* Commission summary */}
              <div className="space-y-2">
                {tx.commissionAmount != null && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Total Commission</span>
                    <span className="text-sm font-semibold text-slate-900">{fmt(tx.commissionAmount)}</span>
                  </div>
                )}
                {editHouseSplit ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">House Amount</span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                      <input
                        type="number"
                        step="0.01"
                        value={housePayoutValue}
                        onChange={(e) => setHousePayoutValue(e.target.value)}
                        className="w-full pl-5 pr-2 py-1 text-base sm:text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleSaveHousePayout} disabled={housePayoutLoading}
                        className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">
                        {housePayoutLoading ? "Saving..." : "Save"}
                      </button>
                      <button onClick={() => setEditHouseSplit(false)}
                        className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">House Amount</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-slate-600">{tx.housePayoutAmount != null ? fmt(tx.housePayoutAmount) : "\u2014"}</span>
                      {!isTerminal && (
                        <button
                          onClick={() => { setHousePayoutValue(tx.housePayoutAmount != null ? String(tx.housePayoutAmount) : ""); setEditHouseSplit(true); }}
                          className="text-slate-300 hover:text-blue-500 transition-colors"
                          title="Edit house amount"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {/* Splits sum warning */}
                {(() => {
                  const agents = tx.agents || [];
                  if (agents.length === 0) return null;
                  const totalSplit = agents.reduce((s, a) => s + (a.splitPct ? Number(a.splitPct) : 0), 0);
                  if (Math.abs(totalSplit - 100) < 0.01) return null;
                  return (
                    <div className="flex items-start gap-1.5 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] text-amber-700">
                        Agent splits total <strong>{totalSplit.toFixed(1)}%</strong> (not 100%). The house receives the remainder.
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* Split visualization bar */}
              {tx.agents && tx.agents.length > 0 && tx.commissionAmount && (
                <div>
                  <div className="flex h-3 rounded-full overflow-hidden bg-slate-100">
                    {tx.agents.map((a) => {
                      const pct = a.splitPct ? Number(a.splitPct) : 0;
                      if (pct <= 0) return null;
                      const colors = TRANSACTION_AGENT_ROLE_COLORS[a.role as TransactionAgentRole] || "bg-slate-200 text-slate-700";
                      const bgColor = colors.split(" ")[0].replace("bg-", "");
                      return (
                        <div
                          key={a.id}
                          className={`h-full ${
                            a.role === "primary" ? "bg-blue-500" :
                            a.role === "co_agent" ? "bg-teal-500" :
                            "bg-amber-500"
                          }`}
                          style={{ width: `${pct}%` }}
                          title={`${a.agent ? `${a.agent.firstName} ${a.agent.lastName}` : "Agent"}: ${pct}%`}
                        />
                      );
                    })}
                  </div>
                  <div className="flex gap-3 mt-1.5">
                    {tx.agents.map((a) => (
                      <div key={a.id} className="flex items-center gap-1">
                        <div className={`w-2 h-2 rounded-full ${
                          a.role === "primary" ? "bg-blue-500" :
                          a.role === "co_agent" ? "bg-teal-500" :
                          "bg-amber-500"
                        }`} />
                        <span className="text-[10px] text-slate-500">
                          {a.agent ? `${a.agent.firstName}` : "Agent"} {a.splitPct ? `${Number(a.splitPct)}%` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Per-agent payout cards */}
              {tx.agents && tx.agents.length > 0 ? (
                <div className="space-y-2 border-t border-slate-100 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600 flex items-center gap-1">
                      <Users className="w-3 h-3" /> Agent Splits
                    </span>
                  </div>
                  {tx.agents.map((a) => {
                    const agentName = a.agent ? `${a.agent.firstName} ${a.agent.lastName}` : "Agent";
                    const roleLabel = TRANSACTION_AGENT_ROLE_LABELS[a.role as TransactionAgentRole] || a.role;
                    const roleColor = TRANSACTION_AGENT_ROLE_COLORS[a.role as TransactionAgentRole] || "bg-slate-100 text-slate-700";
                    const isPaid = a.payoutStatus === "paid";
                    const payoutAmt = a.payoutAmount ? Number(a.payoutAmount) : (
                      a.splitPct && tx.commissionAmount ? Math.round(Number(tx.commissionAmount) * Number(a.splitPct) / 100) : null
                    );
                    const isEditing = editSplitTargetId === a.id;

                    return (
                      <div key={a.id} className="border border-slate-100 rounded-lg p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-sm font-medium text-slate-800 truncate">{agentName}</span>
                            <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${roleColor}`}>
                              {roleLabel}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {isPaid ? (
                              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 rounded-full">Paid</span>
                            ) : (
                              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-500 rounded-full">Pending</span>
                            )}
                            {!isEditing && (
                              <button
                                onClick={() => openEditSplit(a)}
                                className="text-slate-300 hover:text-blue-500 transition-colors"
                                title="Edit split"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                            {!isTerminal && a.role !== "primary" && (
                              <button
                                onClick={() => handleRemoveAgent(a.agentId)}
                                className="text-slate-300 hover:text-red-500 transition-colors"
                                title="Remove from split"
                              >
                                <UserMinus className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Inline edit split form */}
                        {isEditing ? (
                          <div className="space-y-2 pt-1 border-t border-slate-100 mt-1">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Split %</label>
                                <div className="relative">
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    max="100"
                                    value={editSplitForm.splitPct}
                                    onChange={(e) => handleEditSplitChange("splitPct", e.target.value)}
                                    className="w-full px-2 pr-6 py-1 text-base sm:text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                                </div>
                              </div>
                              <div>
                                <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Payout $</label>
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={editSplitForm.payoutAmount}
                                    onChange={(e) => handleEditSplitChange("payoutAmount", e.target.value)}
                                    className="w-full pl-5 pr-2 py-1 text-base sm:text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                </div>
                              </div>
                            </div>
                            <div>
                              <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Note</label>
                              <input
                                type="text"
                                value={editSplitForm.notes}
                                onChange={(e) => setEditSplitForm({ ...editSplitForm, notes: e.target.value })}
                                placeholder="Optional override reason"
                                className="w-full px-2 py-1 text-base sm:text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            {editSplitError && <p className="text-xs text-red-600">{editSplitError}</p>}
                            <div className="flex gap-2">
                              <button onClick={handleSaveEditSplit} disabled={editSplitLoading}
                                className="flex-1 px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50">
                                {editSplitLoading ? "Saving..." : "Save Split"}
                              </button>
                              <button onClick={() => setEditSplitTargetId(null)}
                                className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-3 text-xs text-slate-500">
                              {a.splitPct != null && <span>Split: {Number(a.splitPct)}%</span>}
                              {payoutAmt != null && <span className="font-medium text-slate-700">{fmt(payoutAmt)}</span>}
                              {a.payoutDate && <span>Paid {fmtDate(a.payoutDate)}</span>}
                            </div>
                            {a.notes && (
                              <p className="text-[11px] text-slate-400 italic">{a.notes}</p>
                            )}
                          </>
                        )}
                        {!isEditing && a.payoutMethod && (
                          <p className="text-[11px] text-slate-400">
                            {PAYMENT_METHOD_LABELS[a.payoutMethod] || a.payoutMethod}
                            {a.payoutReference ? ` · ${a.payoutReference}` : ""}
                          </p>
                        )}
                        {/* Per-agent payout form */}
                        {!isEditing && !isTerminal && !isPaid && agentPayoutTarget?.id === a.id && (
                          <div className="space-y-2 pt-1 border-t border-slate-100 mt-1">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Amount</label>
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                                  <input type="number" step="0.01" value={agentPayoutForm.amount}
                                    onChange={(e) => setAgentPayoutForm({ ...agentPayoutForm, amount: e.target.value })}
                                    className="w-full pl-5 pr-2 py-1 text-base sm:text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-teal-500" />
                                </div>
                              </div>
                              <div>
                                <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Method</label>
                                <select value={agentPayoutForm.method}
                                  onChange={(e) => setAgentPayoutForm({ ...agentPayoutForm, method: e.target.value })}
                                  className="w-full px-2 py-1 text-base sm:text-sm border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                                  {Object.entries(PAYMENT_METHOD_LABELS).map(([v, l]) => (
                                    <option key={v} value={v}>{l}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Reference</label>
                                <input type="text" value={agentPayoutForm.reference}
                                  onChange={(e) => setAgentPayoutForm({ ...agentPayoutForm, reference: e.target.value })}
                                  placeholder="Optional"
                                  className="w-full px-2 py-1 text-base sm:text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-teal-500" />
                              </div>
                              <div>
                                <label className="block text-[10px] font-medium text-slate-500 mb-0.5">Date</label>
                                <input type="date" value={agentPayoutForm.date}
                                  onChange={(e) => setAgentPayoutForm({ ...agentPayoutForm, date: e.target.value })}
                                  className="w-full px-2 py-1 text-base sm:text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-teal-500" />
                              </div>
                            </div>
                            {agentPayoutError && <p className="text-xs text-red-600">{agentPayoutError}</p>}
                            <div className="flex gap-2">
                              <button onClick={handleRecordAgentPayout} disabled={agentPayoutLoading}
                                className="flex-1 px-2 py-1 text-xs font-medium text-white bg-teal-600 rounded hover:bg-teal-700 disabled:opacity-50">
                                {agentPayoutLoading ? "Recording..." : "Record"}
                              </button>
                              <button onClick={() => setAgentPayoutTarget(null)}
                                className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                            </div>
                          </div>
                        )}
                        {!isEditing && !isTerminal && !isPaid && agentPayoutTarget?.id !== a.id && (
                          <button
                            onClick={() => openAgentPayoutForm(a)}
                            className="w-full flex items-center justify-center gap-1 px-2 py-1 text-[11px] font-medium text-teal-700 border border-teal-200 rounded hover:bg-teal-50 transition-colors mt-1"
                          >
                            <CreditCard className="w-3 h-3" />
                            Record Payout
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                // Legacy single-agent display when no TransactionAgent records
                <div className="space-y-2">
                  {tx.agentPayoutAmount != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Payout Amount</span>
                      <span className="text-sm font-semibold text-green-600">{fmt(tx.agentPayoutAmount)}</span>
                    </div>
                  )}
                  {tx.agentPayoutDate && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Paid On</span>
                      <span className="text-sm text-slate-600">{fmtDate(tx.agentPayoutDate)}</span>
                    </div>
                  )}
                  {tx.agentPayoutMethod && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Method</span>
                      <span className="text-sm text-slate-600">{PAYMENT_METHOD_LABELS[tx.agentPayoutMethod] || tx.agentPayoutMethod}</span>
                    </div>
                  )}
                  {tx.agentPayoutReference && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">Reference</span>
                      <span className="text-sm text-slate-600 font-mono">{tx.agentPayoutReference}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Lifecycle timestamps */}
              {(tx.commissionReceivedAt || tx.invoiceSentAt) && (
                <div className="border-t border-slate-100 pt-2 mt-2 space-y-1.5">
                  {tx.invoiceSentAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">Invoice Sent</span>
                      <span className="text-[11px] text-slate-500">{fmtDate(tx.invoiceSentAt)}</span>
                    </div>
                  )}
                  {tx.commissionReceivedAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">Commission Received</span>
                      <span className="text-[11px] text-slate-500">{fmtDate(tx.commissionReceivedAt)}</span>
                    </div>
                  )}
                  {tx.agentPaidAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">Agent Paid</span>
                      <span className="text-[11px] text-slate-500">{fmtDate(tx.agentPaidAt)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              {!isTerminal && (
                <div className="border-t border-slate-100 pt-3 mt-2 space-y-2">
                  {!tx.commissionReceivedAt && (
                    <button
                      onClick={handleMarkCommissionReceived}
                      disabled={!!actionLoading}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 disabled:opacity-50 transition-colors"
                    >
                      <Banknote className="w-3.5 h-3.5" />
                      {actionLoading === "commission" ? "Saving..." : "Mark Commission Received"}
                    </button>
                  )}
                  {/* Legacy single-agent payout (only if no TransactionAgent records) */}
                  {(!tx.agents || tx.agents.length === 0) && tx.agentPayoutStatus !== "paid" && !showPayoutForm && (
                    <button
                      onClick={openPayoutForm}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-50 transition-colors"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      Record Agent Payout
                    </button>
                  )}
                  {showPayoutForm && (
                    <div className="space-y-2 pt-1">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">Amount</label>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
                          <input type="number" step="0.01" value={payoutForm.amount}
                            onChange={(e) => setPayoutForm({ ...payoutForm, amount: e.target.value })}
                            className="w-full pl-5 pr-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-teal-500" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">Method</label>
                        <select value={payoutForm.method}
                          onChange={(e) => setPayoutForm({ ...payoutForm, method: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                          {Object.entries(PAYMENT_METHOD_LABELS).map(([val, label]) => (
                            <option key={val} value={val}>{label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">Reference #</label>
                        <input type="text" value={payoutForm.reference}
                          onChange={(e) => setPayoutForm({ ...payoutForm, reference: e.target.value })}
                          placeholder="Optional"
                          className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-teal-500" />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">Date</label>
                        <input type="date" value={payoutForm.date}
                          onChange={(e) => setPayoutForm({ ...payoutForm, date: e.target.value })}
                          className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-teal-500" />
                      </div>
                      {payoutError && <p className="text-xs text-red-600">{payoutError}</p>}
                      <div className="flex gap-2">
                        <button onClick={handleRecordPayout} disabled={payoutLoading}
                          className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-teal-600 rounded hover:bg-teal-700 disabled:opacity-50 transition-colors">
                          {payoutLoading ? "Recording..." : "Record Payout"}
                        </button>
                        <button onClick={() => setShowPayoutForm(false)}
                          className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                      </div>
                    </div>
                  )}
                  {/* Add Agent to Split button */}
                  <button
                    onClick={() => setShowAddAgent(true)}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Add Agent to Split
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Add Agent Modal */}
          {showAddAgent && (
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30">
              <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm sm:mx-4 animate-[slide-up_0.2s_ease-out] sm:animate-[modal-in_0.2s_ease-out]">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
                  <h3 className="text-base font-semibold text-slate-900">Add Agent to Split</h3>
                  <button onClick={() => setShowAddAgent(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="px-5 py-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Agent</label>
                    <select value={addAgentForm.agentId}
                      onChange={(e) => setAddAgentForm({ ...addAgentForm, agentId: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Select agent...</option>
                      {orgAgents
                        .filter((a) => !tx.agents?.some((ta) => ta.agentId === a.id))
                        .map((a) => (
                          <option key={a.id} value={a.id}>{a.firstName} {a.lastName}</option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
                    <select value={addAgentForm.role}
                      onChange={(e) => setAddAgentForm({ ...addAgentForm, role: e.target.value as TransactionAgentRole })}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {Object.entries(TRANSACTION_AGENT_ROLE_LABELS).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Split %</label>
                    <input type="number" min="0" max="100" step="0.5"
                      value={addAgentForm.splitPct}
                      onChange={(e) => setAddAgentForm({ ...addAgentForm, splitPct: e.target.value })}
                      placeholder="e.g. 30"
                      className="w-full px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <p className="text-[11px] text-slate-400 mt-1">Percentage of total commission for this agent</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                    <input type="text" value={addAgentForm.notes}
                      onChange={(e) => setAddAgentForm({ ...addAgentForm, notes: e.target.value })}
                      placeholder="Optional"
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div className="flex justify-end gap-3 px-5 py-4 border-t border-slate-200">
                  <button onClick={() => setShowAddAgent(false)}
                    className="px-4 py-2 text-sm font-medium text-slate-600 rounded-lg hover:bg-slate-100">
                    Cancel
                  </button>
                  <button onClick={handleAddAgentToSplit} disabled={addAgentLoading || !addAgentForm.agentId}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                    {addAgentLoading ? "Adding..." : "Add Agent"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="bg-white border border-slate-200 rounded-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <StickyNote className="w-4 h-4 text-slate-400" />
                <span className="text-sm font-medium text-slate-700">Notes</span>
              </div>
              {!isTerminal && !editingNotes && (
                <button
                  onClick={() => setEditingNotes(true)}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  Edit
                </button>
              )}
            </div>
            <div className="px-4 py-3">
              {editingNotes ? (
                <>
                  <textarea
                    value={notesValue}
                    onChange={(e) => setNotesValue(e.target.value)}
                    rows={4}
                    className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={handleSaveNotes}
                      disabled={actionLoading === "notes"}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {actionLoading === "notes" ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={() => {
                        setEditingNotes(false);
                        setNotesValue(tx.notes || "");
                      }}
                      className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-600 whitespace-pre-wrap">
                  {tx.notes || <span className="text-slate-400 italic">No notes</span>}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Sticky mobile advance button */}
      {!isTerminal && (
        <div className="fixed bottom-16 left-0 right-0 z-40 px-4 pb-safe md:hidden">
          <button
            onClick={handleAdvance}
            disabled={!!actionLoading}
            className="w-full flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-medium text-white bg-blue-600 rounded-xl shadow-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {actionLoading === "advance" ? "Advancing..." : "Advance Stage"}
          </button>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancel && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-sm sm:mx-4 animate-[slide-up_0.2s_ease-out] sm:animate-[modal-in_0.2s_ease-out]">
            <div className="px-6 py-5">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Cancel Transaction</h3>
              <p className="text-sm text-slate-500 mb-4">
                This will mark the transaction as cancelled. This cannot be undone.
              </p>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Reason for cancellation (optional)"
                rows={3}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              />
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200">
              <button
                onClick={() => { setShowCancel(false); setCancelReason(""); }}
                className="px-4 py-2 text-sm font-medium text-slate-600 rounded-lg hover:bg-slate-100"
              >
                Keep Open
              </button>
              <button
                onClick={handleCancel}
                disabled={actionLoading === "cancel"}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading === "cancel" ? "Cancelling..." : "Cancel Transaction"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
