"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  FileText,
  Plus,
  Lock,
  Trash2,
  Loader2,
  AlertTriangle,
  CheckCircle,
  X,
  ArrowLeft,
  Upload,
  Layers,
} from "lucide-react";
import { getDocumentTemplates, createDocumentTemplate, deleteDocumentTemplate, updateDocumentTemplate } from "../vault-actions";

interface TemplateRow {
  id: string;
  name: string;
  description: string | null;
  category: string;
  templatePdfUrl: string;
  fields: unknown[];
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  createdAt: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function VaultPage() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadDesc, setUploadDesc] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const result = await getDocumentTemplates();
    if (result.success) {
      setTemplates((result.data ?? []) as unknown as TemplateRow[]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleUpload() {
    if (!uploadName.trim() || !uploadFile) return;
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("name", uploadName.trim());
    fd.append("description", uploadDesc.trim());
    fd.append("file", uploadFile);
    const result = await createDocumentTemplate(fd);
    setUploading(false);
    if (result.success) {
      setSuccess("Template uploaded");
      setShowUpload(false);
      setUploadName("");
      setUploadDesc("");
      setUploadFile(null);
      await load();
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(result.error ?? "Upload failed");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this template from the vault?")) return;
    setDeleting(id);
    const result = await deleteDocumentTemplate(id);
    if (result.success) {
      setSuccess("Template removed");
      await load();
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(result.error ?? "Failed to remove");
    }
    setDeleting(null);
  }

  return (
    <div className="min-h-dvh bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5">
          <Link href="/brokerage/client-onboarding" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-3">
            <ArrowLeft className="w-4 h-4" /> Client Onboarding
          </Link>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Layers className="w-5 h-5 text-slate-400" />
              <h1 className="text-xl font-semibold text-slate-900">Document Vault</h1>
            </div>
            <button
              onClick={() => setShowUpload(true)}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Upload Template
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {success && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">
            <CheckCircle className="w-4 h-4" /> {success}
            <button onClick={() => setSuccess(null)} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            <AlertTriangle className="w-4 h-4" /> {error}
            <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-lg border border-slate-200 py-16 flex justify-center">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
          </div>
        ) : templates.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 py-16 text-center">
            <Layers className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <h3 className="text-sm font-medium text-slate-900 mb-1">No templates yet</h3>
            <p className="text-sm text-slate-500 mb-4">Upload PDF templates for your agents to use during client onboarding.</p>
            <button onClick={() => setShowUpload(true)} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors">
              <Upload className="w-4 h-4" /> Upload Template
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((t) => (
              <div key={t.id} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-slate-400" />
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{t.name}</h3>
                      {t.description && <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>}
                    </div>
                  </div>
                  {t.isDefault && <Lock className="w-4 h-4 text-slate-300 flex-shrink-0" title="Default template" />}
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 mb-4">
                  <span className={`inline-flex px-2 py-0.5 rounded-full font-medium ${t.category === "standard" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                    {t.category === "standard" ? "Standard" : "Custom"}
                  </span>
                  <span>{Array.isArray(t.fields) ? t.fields.length : 0} fields</span>
                  <span>{fmtDate(t.createdAt)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/brokerage/client-onboarding/vault/${t.id}`}
                    className="flex-1 text-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    Edit Fields
                  </Link>
                  {!t.isDefault && (
                    <button
                      onClick={() => handleDelete(t.id)}
                      disabled={deleting === t.id}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {deleting === t.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6" style={{ animation: "modal-in 0.2s ease-out" }}>
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Upload Template</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Template Name *</label>
                <input type="text" value={uploadName} onChange={(e) => setUploadName(e.target.value)} placeholder="e.g., Pet Addendum" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <input type="text" value={uploadDesc} onChange={(e) => setUploadDesc(e.target.value)} placeholder="Optional description" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">PDF File *</label>
                {uploadFile ? (
                  <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-3">
                    <FileText className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-slate-700 truncate flex-1">{uploadFile.name}</span>
                    <button onClick={() => { setUploadFile(null); if (fileRef.current) fileRef.current.value = ""; }} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-lg p-4 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors">
                    <Upload className="w-4 h-4 text-slate-400" />
                    <span className="text-sm text-slate-500">Click to select PDF (max 10MB)</span>
                    <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} />
                  </label>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowUpload(false); setUploadName(""); setUploadDesc(""); setUploadFile(null); }} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800">Cancel</button>
              <button onClick={handleUpload} disabled={uploading || !uploadName.trim() || !uploadFile} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg px-4 py-2">
                {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
                Upload
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
