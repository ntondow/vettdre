"use client";

import { useState } from "react";
import { exportContacts, exportDeals, exportEmails } from "../actions";

function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface ExportCardProps {
  icon: string;
  title: string;
  desc: string;
  children?: React.ReactNode;
  onExport: () => Promise<void>;
  exporting: boolean;
}

function ExportCard({ icon, title, desc, children, onExport, exporting }: ExportCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-start gap-3 mb-4">
        <span className="text-xl">{icon}</span>
        <div>
          <p className="text-sm font-bold text-slate-900">{title}</p>
          <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
        </div>
      </div>
      {children}
      <button onClick={onExport} disabled={exporting}
        className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
        {exporting ? "Exporting..." : "Export CSV"}
      </button>
    </div>
  );
}

export default function ExportPage() {
  const [contactStatus, setContactStatus] = useState("");
  const [emailDateFrom, setEmailDateFrom] = useState("");
  const [emailDateTo, setEmailDateTo] = useState("");
  const [exporting, setExporting] = useState<string | null>(null);

  const doDownload = (result: { csv?: string; filename?: string; error?: string }) => {
    if (result.csv && result.filename) downloadCsv(result.csv, result.filename);
    else if (result.error) alert(result.error);
  };

  const handleExportContacts = async () => {
    setExporting("contacts");
    doDownload(await exportContacts(contactStatus ? { status: contactStatus } : undefined));
    setExporting(null);
  };

  const handleExportDeals = async () => {
    setExporting("deals");
    doDownload(await exportDeals());
    setExporting(null);
  };

  const handleExportEmails = async () => {
    setExporting("emails");
    const filters: any = {};
    if (emailDateFrom) filters.dateFrom = emailDateFrom;
    if (emailDateTo) filters.dateTo = emailDateTo;
    doDownload(await exportEmails(Object.keys(filters).length ? filters : undefined));
    setExporting(null);
  };

  const handleFullBackup = async () => {
    setExporting("full");
    const [c, d, e] = await Promise.all([exportContacts(), exportDeals(), exportEmails()]);
    doDownload(c); doDownload(d); doDownload(e);
    setExporting(null);
  };

  return (
    <div>
      <h1 className="text-lg font-bold text-slate-900 mb-1">Data Export</h1>
      <p className="text-sm text-slate-500 mb-6">Export your data as CSV files</p>

      <div className="space-y-4">
        <ExportCard icon="👥" title="Contacts Export" desc="All contacts with enrichment data"
          onExport={handleExportContacts} exporting={exporting === "contacts"}>
          <div>
            <label className="text-xs font-medium text-slate-500">Filter by status</label>
            <select value={contactStatus} onChange={e => setContactStatus(e.target.value)}
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="">All statuses</option>
              <option value="lead">Leads</option>
              <option value="active">Active</option>
              <option value="client">Clients</option>
              <option value="past_client">Past Clients</option>
            </select>
          </div>
        </ExportCard>

        <ExportCard icon="💰" title="Deals Export" desc="All deals with contact and stage info"
          onExport={handleExportDeals} exporting={exporting === "deals"} />

        <ExportCard icon="📧" title="Emails Export" desc="Email metadata (date, sender, subject, category)"
          onExport={handleExportEmails} exporting={exporting === "emails"}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-500">From</label>
              <input type="date" value={emailDateFrom} onChange={e => setEmailDateFrom(e.target.value)}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">To</label>
              <input type="date" value={emailDateTo} onChange={e => setEmailDateTo(e.target.value)}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        </ExportCard>

        {/* Full Backup */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-start gap-3 mb-4">
            <span className="text-xl">📦</span>
            <div>
              <p className="text-sm font-bold text-slate-900">Full Backup</p>
              <p className="text-xs text-slate-400 mt-0.5">Download all data as separate CSV files</p>
            </div>
          </div>
          <button onClick={handleFullBackup} disabled={exporting === "full"}
            className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors">
            {exporting === "full" ? "Exporting..." : "Download Full Backup"}
          </button>
        </div>
      </div>
    </div>
  );
}
