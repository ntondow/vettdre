"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  Loader2,
  AlertTriangle,
  CheckCircle,
  X,
  GripVertical,
  Type,
  Calendar,
  PenTool,
  Hash,
  CheckSquare,
} from "lucide-react";
import { getDocumentTemplates, updateTemplateFields } from "../../vault-actions";
import type { TemplateFieldDefinition, TemplateFieldType } from "@/lib/onboarding-types";

// ── Types ────────────────────────────────────────────────────

interface TemplateData {
  id: string;
  name: string;
  templatePdfUrl: string;
  fields: TemplateFieldDefinition[];
  isDefault: boolean;
}

const FIELD_TYPE_ICONS: Record<TemplateFieldType, React.ReactNode> = {
  text: <Type className="w-3 h-3" />,
  date: <Calendar className="w-3 h-3" />,
  signature: <PenTool className="w-3 h-3" />,
  initials: <Hash className="w-3 h-3" />,
  checkbox: <CheckSquare className="w-3 h-3" />,
};

const FIELD_TYPE_LABELS: Record<TemplateFieldType, string> = {
  text: "Text",
  date: "Date",
  signature: "Signature",
  initials: "Initials",
  checkbox: "Checkbox",
};

const PREFILL_KEYS = [
  { value: "", label: "None" },
  { value: "clientName", label: "Client Name" },
  { value: "propertyAddress", label: "Property Address" },
  { value: "rent", label: "Monthly Rent" },
  { value: "commissionPct", label: "Commission %" },
  { value: "moveInDate", label: "Move-in Date" },
  { value: "agentName", label: "Agent Name" },
  { value: "brokerageName", label: "Brokerage Name" },
];

// ── Component ────────────────────────────────────────────────

export default function TemplateEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  const [template, setTemplate] = useState<TemplateData | null>(null);
  const [fields, setFields] = useState<TemplateFieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [addingFieldType, setAddingFieldType] = useState<TemplateFieldType | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    async function load() {
      const result = await getDocumentTemplates();
      if (result.success && Array.isArray(result.data)) {
        const found = result.data.find((t: Record<string, unknown>) => t.id === id) as unknown as TemplateData | undefined;
        if (found) {
          setTemplate(found);
          setFields(Array.isArray(found.fields) ? found.fields : []);
        } else {
          setError("Template not found");
        }
      }
      setLoading(false);
    }
    load();
  }, [id]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    const result = await updateTemplateFields(id, fields);
    setSaving(false);
    if (result.success) {
      setSuccess("Fields saved");
      setHasChanges(false);
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(result.error ?? "Failed to save");
    }
  }, [id, fields]);

  const addField = useCallback((type: TemplateFieldType) => {
    const newField: TemplateFieldDefinition = {
      id: crypto.randomUUID().replace(/-/g, "").slice(0, 12),
      label: `${FIELD_TYPE_LABELS[type]} Field`,
      type,
      page: 0,
      x: 25,
      y: 50,
      width: type === "signature" ? 30 : type === "checkbox" ? 4 : 20,
      height: type === "signature" ? 8 : type === "checkbox" ? 4 : 5,
      required: type === "signature",
    };
    setFields((prev) => [...prev, newField]);
    setSelectedFieldId(newField.id);
    setAddingFieldType(null);
    setHasChanges(true);
  }, []);

  const updateField = useCallback((fieldId: string, updates: Partial<TemplateFieldDefinition>) => {
    setFields((prev) => prev.map((f) => (f.id === fieldId ? { ...f, ...updates } : f)));
    setHasChanges(true);
  }, []);

  const removeField = useCallback((fieldId: string) => {
    setFields((prev) => prev.filter((f) => f.id !== fieldId));
    if (selectedFieldId === fieldId) setSelectedFieldId(null);
    setHasChanges(true);
  }, [selectedFieldId]);

  const handlePdfClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!addingFieldType) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const newField: TemplateFieldDefinition = {
      id: crypto.randomUUID().replace(/-/g, "").slice(0, 12),
      label: `${FIELD_TYPE_LABELS[addingFieldType]} Field`,
      type: addingFieldType,
      page: 0,
      x: Math.max(0, Math.min(x, 90)),
      y: Math.max(0, Math.min(y, 95)),
      width: addingFieldType === "signature" ? 30 : addingFieldType === "checkbox" ? 4 : 20,
      height: addingFieldType === "signature" ? 8 : addingFieldType === "checkbox" ? 4 : 5,
      required: addingFieldType === "signature",
    };
    setFields((prev) => [...prev, newField]);
    setSelectedFieldId(newField.id);
    setAddingFieldType(null);
    setHasChanges(true);
  }, [addingFieldType]);

  if (loading) {
    return <div className="min-h-dvh bg-slate-50 flex items-center justify-center"><Loader2 className="w-6 h-6 text-blue-600 animate-spin" /></div>;
  }

  if (!template) {
    return (
      <div className="min-h-dvh bg-slate-50 flex flex-col items-center justify-center">
        <AlertTriangle className="w-8 h-8 text-red-400 mb-3" />
        <p className="text-slate-600">{error || "Template not found"}</p>
        <button onClick={() => router.back()} className="mt-4 text-sm text-blue-600">Go back</button>
      </div>
    );
  }

  const selectedField = fields.find((f) => f.id === selectedFieldId);

  return (
    <div className="min-h-dvh bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push("/brokerage/client-onboarding/vault")} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-slate-900">{template.name}</h1>
              <p className="text-xs text-slate-500">{fields.length} field{fields.length !== 1 ? "s" : ""} defined</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {success && <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" />{success}</span>}
            {error && <span className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{error}</span>}
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Fields
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: PDF Preview with field overlays */}
        <div className="flex-1 overflow-auto p-6 bg-slate-100">
          <div
            ref={pdfContainerRef}
            className={`relative mx-auto bg-white shadow-lg rounded-sm ${addingFieldType ? "cursor-crosshair" : ""}`}
            style={{ width: "612px", minHeight: "792px" }}
            onClick={handlePdfClick}
          >
            {/* PDF embed */}
            <iframe
              src={`${template.templatePdfUrl}#toolbar=0&navpanes=0`}
              className="w-full border-0 pointer-events-none"
              style={{ height: "792px" }}
              title="Template PDF"
            />
            {/* Field overlays */}
            {fields.filter((f) => f.page === 0).map((field) => (
              <div
                key={field.id}
                onClick={(e) => { e.stopPropagation(); setSelectedFieldId(field.id); }}
                className={`absolute border-2 rounded-sm flex items-center justify-center text-[10px] font-medium cursor-pointer transition-colors ${
                  selectedFieldId === field.id
                    ? "border-blue-600 bg-blue-100/60 text-blue-700 z-10"
                    : "border-blue-400/50 bg-blue-50/40 text-blue-600 hover:border-blue-500"
                }`}
                style={{
                  left: `${field.x}%`,
                  top: `${field.y}%`,
                  width: `${field.width}%`,
                  height: `${field.height}%`,
                }}
              >
                <span className="truncate px-1">{field.label}</span>
              </div>
            ))}
            {/* Placement hint */}
            {addingFieldType && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-blue-600 text-white text-xs font-medium px-3 py-1.5 rounded-full shadow-lg">
                  Click to place {FIELD_TYPE_LABELS[addingFieldType]} field
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Field list + editor */}
        <div className="w-80 bg-white border-l border-slate-200 flex flex-col overflow-hidden flex-shrink-0">
          {/* Add field toolbar */}
          <div className="p-4 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Add Field</p>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(FIELD_TYPE_LABELS) as TemplateFieldType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setAddingFieldType(addingFieldType === type ? null : type)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    addingFieldType === type
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {FIELD_TYPE_ICONS[type]}
                  {FIELD_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          {/* Field list */}
          <div className="flex-1 overflow-auto">
            {fields.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">
                No fields yet. Click a field type above, then click on the PDF to place it.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {fields.map((field) => (
                  <button
                    key={field.id}
                    onClick={() => setSelectedFieldId(field.id === selectedFieldId ? null : field.id)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-2 transition-colors ${
                      selectedFieldId === field.id ? "bg-blue-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <span className="text-slate-400">{FIELD_TYPE_ICONS[field.type]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-700 truncate">{field.label}</div>
                      <div className="text-xs text-slate-400">{FIELD_TYPE_LABELS[field.type]} · Page {field.page + 1}</div>
                    </div>
                    {field.required && <span className="text-[10px] text-red-500 font-medium">REQ</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected field editor */}
          {selectedField && (
            <div className="border-t border-slate-200 p-4 space-y-3 bg-slate-50">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Edit Field</p>
                <button onClick={() => removeField(selectedField.id)} className="text-red-500 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Label</label>
                <input type="text" value={selectedField.label} onChange={(e) => updateField(selectedField.id, { label: e.target.value })} className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
                  <select value={selectedField.type} onChange={(e) => updateField(selectedField.id, { type: e.target.value as TemplateFieldType })} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {(Object.keys(FIELD_TYPE_LABELS) as TemplateFieldType[]).map((t) => (
                      <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Prefill</label>
                  <select value={selectedField.prefillKey || ""} onChange={(e) => updateField(selectedField.id, { prefillKey: e.target.value || undefined })} className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                    {PREFILL_KEYS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={selectedField.required} onChange={(e) => updateField(selectedField.id, { required: e.target.checked })} className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-xs text-slate-600">Required field</span>
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
