"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  getTemplates, createTemplate, updateTemplate, deleteTemplate,
  type TemplateData,
} from "../template-actions";

const CATEGORIES = [
  { value: "follow_up", label: "Follow Up", color: "bg-amber-100 text-amber-700" },
  { value: "showing", label: "Showing", color: "bg-indigo-100 text-indigo-700" },
  { value: "application", label: "Application", color: "bg-emerald-100 text-emerald-700" },
  { value: "welcome", label: "Welcome", color: "bg-blue-100 text-blue-700" },
  { value: "nurture", label: "Nurture", color: "bg-purple-100 text-purple-700" },
  { value: "cold_outreach", label: "Cold Outreach", color: "bg-slate-100 text-slate-600" },
  { value: "custom", label: "Custom", color: "bg-slate-100 text-slate-500" },
];

const VARIABLES = [
  { key: "first_name", label: "First Name" },
  { key: "last_name", label: "Last Name" },
  { key: "property_address", label: "Address" },
  { key: "price", label: "Price" },
  { key: "agent_name", label: "Agent Name" },
  { key: "agent_phone", label: "Agent Phone" },
  { key: "date", label: "Date" },
];

const SAMPLE_DATA: Record<string, string> = {
  first_name: "John",
  last_name: "Smith",
  property_address: "123 Main St, Apt 4B",
  price: "$3,200/mo",
  agent_name: "Sarah Johnson",
  agent_phone: "(212) 555-0123",
  date: "February 20, 2026",
};

function getCategoryStyle(cat: string | null) {
  return CATEGORIES.find(c => c.value === cat)?.color || "bg-slate-100 text-slate-500";
}

function getCategoryLabel(cat: string | null) {
  return CATEGORIES.find(c => c.value === cat)?.label || cat || "Uncategorized";
}

function replaceVars(text: string, data: Record<string, string> = SAMPLE_DATA): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || `{{${key}}}`);
}

const fmtDate = (d: string | null) => {
  if (!d) return "Never";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(d));
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editModal, setEditModal] = useState<TemplateData | "new" | null>(null);
  const [deleteModal, setDeleteModal] = useState<TemplateData | null>(null);

  const load = async () => {
    const data = await getTemplates();
    setTemplates(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = templates.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase()) ||
    (t.category || "").toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async () => {
    if (!deleteModal) return;
    await deleteTemplate(deleteModal.id);
    setDeleteModal(null);
    load();
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/messages" className="text-slate-400 hover:text-slate-600 text-sm">
              &larr; Messages
            </Link>
            <span className="text-slate-300">|</span>
            <h1 className="text-lg font-bold text-slate-900">Email Templates</h1>
            <span className="text-xs text-slate-400">{templates.length} templates</span>
          </div>
          <button onClick={() => setEditModal("new")}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
            + Create Template
          </button>
        </div>
        <div className="mt-3">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search templates..."
            className="w-full max-w-md px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {/* Template Grid */}
      <div className="p-6">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white rounded-lg border border-slate-200 p-5 animate-pulse">
                <div className="h-5 bg-slate-100 rounded w-1/2 mb-3" />
                <div className="h-3 bg-slate-100 rounded w-3/4 mb-2" />
                <div className="h-3 bg-slate-100 rounded w-full mb-2" />
                <div className="h-3 bg-slate-100 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-4xl mb-3">📝</p>
            <p className="text-sm font-semibold text-slate-700">
              {search ? "No templates match your search" : "Create your first template to speed up replies"}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {search ? "Try a different search term" : "Templates help you respond faster with pre-written messages"}
            </p>
            {!search && (
              <button onClick={() => setEditModal("new")}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">
                + Create Template
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filtered.map(t => (
              <div key={t.id} className="group bg-white rounded-lg border border-slate-200 p-5 hover:shadow-md hover:border-slate-300 transition-all">
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-slate-900 truncate">{t.name}</h3>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${getCategoryStyle(t.category)}`}>
                      {getCategoryLabel(t.category)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setEditModal(t)}
                      className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded font-medium">
                      Edit
                    </button>
                    <button onClick={() => setDeleteModal(t)}
                      className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded font-medium">
                      Delete
                    </button>
                  </div>
                </div>
                {t.subject && (
                  <p className="text-xs text-slate-600 font-medium mb-1 truncate">Subject: {t.subject}</p>
                )}
                <div className="text-xs text-slate-500 line-clamp-2 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: t.body.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "") }} />
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100">
                  <span className="text-[10px] text-slate-400">Used {t.timesUsed} time{t.timesUsed !== 1 ? "s" : ""}</span>
                  <span className="text-[10px] text-slate-400">Last used: {fmtDate(t.lastUsedAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit/Create Modal */}
      {editModal && (
        <TemplateEditModal
          template={editModal === "new" ? null : editModal}
          onClose={() => setEditModal(null)}
          onSaved={() => { setEditModal(null); load(); }}
        />
      )}

      {/* Delete Confirmation */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDeleteModal(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="p-5">
              <h3 className="text-sm font-bold text-slate-900 mb-2">Delete Template</h3>
              <p className="text-sm text-slate-600">
                Delete template &ldquo;{deleteModal.name}&rdquo;? This cannot be undone.
              </p>
            </div>
            <div className="p-4 border-t border-slate-200 flex justify-end gap-2">
              <button onClick={() => setDeleteModal(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg">
                Cancel
              </button>
              <button onClick={handleDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Template Edit/Create Modal
// ============================================================
function TemplateEditModal({
  template,
  onClose,
  onSaved,
}: {
  template: TemplateData | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(template?.name || "");
  const [category, setCategory] = useState(template?.category || "follow_up");
  const [subject, setSubject] = useState(template?.subject || "");
  const [body, setBody] = useState(template?.body || "");
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

  // Track which field was last focused for variable insertion
  const [lastFocused, setLastFocused] = useState<"subject" | "body">("body");

  const insertVariable = (varKey: string) => {
    const insertion = `{{${varKey}}}`;
    if (lastFocused === "subject" && subjectRef.current) {
      const input = subjectRef.current;
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const newValue = subject.slice(0, start) + insertion + subject.slice(end);
      setSubject(newValue);
      setTimeout(() => {
        input.focus();
        input.setSelectionRange(start + insertion.length, start + insertion.length);
      }, 0);
    } else if (bodyRef.current) {
      const textarea = bodyRef.current;
      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || 0;
      const newValue = body.slice(0, start) + insertion + body.slice(end);
      setBody(newValue);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + insertion.length, start + insertion.length);
      }, 0);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !body.trim()) return;
    setSaving(true);

    // Extract merge fields from body + subject
    const mergeFields: string[] = [];
    const re = /\{\{(\w+)\}\}/g;
    let match;
    const combined = subject + " " + body;
    while ((match = re.exec(combined)) !== null) {
      if (!mergeFields.includes(match[1])) mergeFields.push(match[1]);
    }

    if (template) {
      await updateTemplate(template.id, { name: name.trim(), subject, body, category, mergeFields });
    } else {
      await createTemplate({ name: name.trim(), subject, body, category, mergeFields });
    }
    setSaving(false);
    onSaved();
  };

  // Convert plain text body with <br> for display
  const previewHtml = replaceVars(body);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">
            {template ? "Edit Template" : "Create Template"}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-lg">&times;</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Name + Category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500">Template Name</label>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="e.g. Quick Follow Up"
                className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="text-xs font-medium text-slate-500">Subject Line</label>
            <input ref={subjectRef} value={subject} onChange={e => setSubject(e.target.value)}
              onFocus={() => setLastFocused("subject")}
              placeholder="e.g. Following up — {{property_address}}"
              className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Variable Chips */}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1.5 block">Insert Variables</label>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES.map(v => (
                <button key={v.key} onClick={() => insertVariable(v.key)}
                  className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 text-xs font-medium rounded-full border border-slate-200 hover:border-blue-300 transition-colors">
                  {`{{${v.key}}}`}
                </button>
              ))}
            </div>
          </div>

          {/* Body Editor / Preview Toggle */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-500">Body</label>
              <button onClick={() => setShowPreview(!showPreview)}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                {showPreview ? "Edit" : "Preview"}
              </button>
            </div>
            {showPreview ? (
              <div className="w-full px-4 py-3 border border-slate-200 rounded-lg text-sm text-slate-700 bg-slate-50 min-h-[200px] prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: previewHtml }} />
            ) : (
              <textarea ref={bodyRef} value={body} onChange={e => setBody(e.target.value)}
                onFocus={() => setLastFocused("body")}
                placeholder="Write your template body... Use <br> for line breaks."
                rows={10}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono" />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 flex items-center justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-50 rounded-lg font-medium">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !name.trim() || !body.trim()}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-lg disabled:opacity-50 transition-colors">
            {saving ? "Saving..." : template ? "Save Changes" : "Create Template"}
          </button>
        </div>
      </div>
    </div>
  );
}
