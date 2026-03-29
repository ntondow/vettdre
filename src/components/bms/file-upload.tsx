"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { uploadFile, getFilesForEntity, deleteFile, getSignedUrl } from "@/lib/bms-files";
import {
  Upload,
  FileText,
  Image,
  FileSpreadsheet,
  Trash2,
  Download,
  Loader2,
  X,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────

interface FileRecord {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  createdAt: string | Date;
}

interface Props {
  entityType: string;
  entityId: string;
  onUploadComplete?: () => void;
  maxFiles?: number;
  compact?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────

const ALLOWED_ACCEPT = ".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx";
const MAX_SIZE = 10 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type: string) {
  if (type.startsWith("image/")) return <Image className="h-4 w-4 text-blue-500" />;
  if (type.includes("spreadsheet") || type.includes("excel")) return <FileSpreadsheet className="h-4 w-4 text-green-600" />;
  return <FileText className="h-4 w-4 text-red-500" />;
}

// ── Component ────────────────────────────────────────────────

export default function FileUpload({
  entityType,
  entityId,
  onUploadComplete,
  maxFiles = 5,
  compact = false,
}: Props) {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Load files ─────────────────────────────────────────────

  const loadFiles = useCallback(async () => {
    try {
      const result = await getFilesForEntity(entityType, entityId);
      setFiles(result as FileRecord[]);
    } catch {
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // ── Upload handler ─────────────────────────────────────────

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setError(null);
    setSuccess(null);

    if (files.length >= maxFiles) {
      setError(`Maximum ${maxFiles} files allowed`);
      return;
    }

    const file = fileList[0];

    if (file.size > MAX_SIZE) {
      setError("File exceeds 10 MB limit");
      return;
    }

    setUploading(true);
    setUploadProgress(`Uploading ${file.name}...`);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await uploadFile(formData, entityType, entityId);

      if (result.error) {
        setError(result.error);
        return;
      }

      setSuccess(`${file.name} uploaded`);
      setTimeout(() => setSuccess(null), 3000);
      await loadFiles();
      onUploadComplete?.();
    } catch {
      setError("Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  // ── Delete handler ─────────────────────────────────────────

  async function handleDelete(attachmentId: string) {
    if (!confirm("Delete this file?")) return;
    setDeletingId(attachmentId);
    setError(null);

    try {
      const result = await deleteFile(attachmentId);
      if (!result.success) {
        setError(result.error || "Failed to delete");
        return;
      }
      await loadFiles();
    } catch {
      setError("Failed to delete file");
    } finally {
      setDeletingId(null);
    }
  }

  // ── Download handler ───────────────────────────────────────

  async function handleDownload(attachmentId: string, fileName: string) {
    setDownloadingId(attachmentId);

    try {
      const result = await getSignedUrl(attachmentId);
      if (result.error || !result.url) {
        setError(result.error || "Failed to get download URL");
        return;
      }
      const a = document.createElement("a");
      a.href = result.url;
      a.download = fileName;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      setError("Failed to download file");
    } finally {
      setDownloadingId(null);
    }
  }

  // ── Drag events ────────────────────────────────────────────

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }

  // ── Render ─────────────────────────────────────────────────

  const atLimit = files.length >= maxFiles;

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      {!atLimit && (
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => !uploading && inputRef.current?.click()}
          className={`
            relative border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors
            ${compact ? "px-3 py-3" : "px-4 py-6"}
            ${dragOver
              ? "border-blue-400 bg-blue-50/50"
              : "border-slate-300 hover:border-slate-400 hover:bg-slate-50/50"
            }
            ${uploading ? "pointer-events-none opacity-60" : ""}
          `}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_ACCEPT}
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
          />

          {uploading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
              <span className="text-sm text-slate-500">{uploadProgress}</span>
            </div>
          ) : (
            <>
              <Upload className={`mx-auto text-slate-300 ${compact ? "h-5 w-5 mb-1" : "h-6 w-6 mb-2"}`} />
              <p className={`text-slate-500 ${compact ? "text-xs" : "text-sm"}`}>
                {dragOver ? "Drop file here" : "Drop file here or click to browse"}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                PDF, JPG, PNG, DOC, XLS &middot; Max 10 MB
              </p>
            </>
          )}
        </div>
      )}

      {/* Status messages */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          <p className="text-sm text-green-700">{success}</p>
        </div>
      )}

      {/* File list */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-10 bg-slate-50 animate-pulse rounded-lg" />
          ))}
        </div>
      ) : files.length > 0 ? (
        <div className="space-y-1">
          {files.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              {fileIcon(f.fileType)}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-700 truncate">{f.fileName}</p>
                <p className="text-xs text-slate-400">{formatBytes(f.fileSize)}</p>
              </div>
              <button
                onClick={() => handleDownload(f.id, f.fileName)}
                disabled={downloadingId === f.id}
                className="p-1 text-slate-400 hover:text-blue-600 disabled:opacity-50 transition-colors"
                title="Download"
              >
                {downloadingId === f.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Download className="h-3.5 w-3.5" />
                }
              </button>
              <button
                onClick={() => handleDelete(f.id)}
                disabled={deletingId === f.id}
                className="p-1 text-slate-400 hover:text-red-500 disabled:opacity-50 transition-colors"
                title="Delete"
              >
                {deletingId === f.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Trash2 className="h-3.5 w-3.5" />
                }
              </button>
            </div>
          ))}
          {atLimit && (
            <p className="text-xs text-slate-400 text-center pt-1">
              Maximum {maxFiles} files reached
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
