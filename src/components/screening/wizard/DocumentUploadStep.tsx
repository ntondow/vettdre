"use client";

import React, { useState, useCallback, useRef } from "react";
import { Loader2, Upload, X, AlertTriangle, ChevronRight } from "lucide-react";
import { DOCUMENT_TYPE_LABELS, ALLOWED_FILE_EXTENSIONS, MAX_FILE_SIZE_BYTES, MAX_FILES_PER_APPLICATION } from "@/lib/screening/constants";

interface UploadedFile {
  file: File;
  documentType: string;
  id: string;
}

interface Props {
  onComplete: (documents: Array<{ file: File; documentType: string }>) => void;
  saving: boolean;
  maxFiles?: number;
}

const DEFAULT_DOC_TYPE = "pay_stub";

export default function DocumentUploadStep({ onComplete, saving, maxFiles = MAX_FILES_PER_APPLICATION }: Props) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canAddMore = uploadedFiles.length < maxFiles;

  // Validate file
  const validateFile = (file: File): string | null => {
    if (!ALLOWED_FILE_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))) {
      return `Invalid file type. Accepted: PDF, JPG, PNG, HEIC`;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return `File is too large. Maximum 10 MB`;
    }
    return null;
  };

  // Process files
  const processFiles = useCallback(
    (files: FileList | File[]) => {
      setError(null);
      const filesArray = Array.from(files);

      // Check max files
      const spaceLeft = maxFiles - uploadedFiles.length;
      if (filesArray.length > spaceLeft) {
        setError(`You can only upload ${spaceLeft} more file${spaceLeft !== 1 ? "s" : ""}`);
        return;
      }

      const newUploads: UploadedFile[] = [];
      for (const file of filesArray) {
        const validation = validateFile(file);
        if (validation) {
          setError(validation);
          return;
        }
        newUploads.push({
          file,
          documentType: DEFAULT_DOC_TYPE,
          id: crypto.randomUUID(),
        });
      }

      setUploadedFiles((prev) => [...prev, ...newUploads]);
    },
    [uploadedFiles.length, maxFiles]
  );

  // Drag handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFiles(e.dataTransfer.files);
    }
  };

  // File input handler
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(e.target.files);
    }
  };

  // Update doc type
  const updateDocType = (id: string, docType: string) => {
    setUploadedFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, documentType: docType } : f))
    );
  };

  // Remove file
  const removeFile = (id: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  // Handle submit
  const handleSubmit = () => {
    if (uploadedFiles.length === 0) {
      setError("Please upload at least one document");
      return;
    }
    const documents = uploadedFiles.map(({ file, documentType }) => ({ file, documentType }));
    onComplete(documents);
  }

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h2 className="text-base sm:text-lg font-semibold text-slate-900 mb-2">Upload Documents</h2>
        <p className="text-sm text-slate-600">
          Provide documents that verify your income and identity.
        </p>
      </div>

      {/* Upload Area */}
      {canAddMore && (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`rounded-lg border-2 border-dashed transition-colors cursor-pointer ${
            dragActive
              ? "border-blue-500 bg-blue-50"
              : "border-slate-300 bg-slate-50 hover:border-slate-400"
          }`}
        >
          <div className="flex flex-col items-center justify-center gap-3 p-8 sm:p-12">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
              <Upload className="w-6 h-6 text-blue-600" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-900">Drag files here or click to browse</p>
              <p className="text-xs text-slate-500 mt-1">
                PDF, JPG, PNG, HEIC up to 10 MB each
              </p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors"
            >
              Browse Files
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ALLOWED_FILE_EXTENSIONS.join(",")}
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Uploaded Files List */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-700">
            {uploadedFiles.length} of {maxFiles} files uploaded
          </p>
          {uploadedFiles.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-slate-200 bg-white p-4 flex items-start gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-slate-900 truncate">{item.file.name}</div>
                <div className="text-xs text-slate-500 mt-1">{formatFileSize(item.file.size)}</div>

                {/* Document Type Selector */}
                <div className="mt-3">
                  <label className="block text-xs font-medium text-slate-600 mb-2">
                    Document Type
                  </label>
                  <select
                    value={item.documentType}
                    onChange={(e) => updateDocType(item.id, e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  >
                    {Object.entries(DOCUMENT_TYPE_LABELS).map(([type, label]) => (
                      <option key={type} value={type}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Remove Button */}
              <button
                onClick={() => removeFile(item.id)}
                className="text-slate-400 hover:text-slate-600 active:text-slate-900 transition-colors flex-shrink-0 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={uploadedFiles.length === 0 || saving}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:bg-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            Continue
            <ChevronRight className="w-4 h-4" />
          </>
        )}
      </button>
    </div>
  );
}
