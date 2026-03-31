"use client";

import React from "react";
import { useDealModeler } from "../../deal-modeler-context";
// PDF/DOCX generators loaded dynamically on demand to reduce bundle size
const loadLoiPdf = () => import("@/lib/loi-pdf");
const loadLoiDocx = () => import("@/lib/loi-docx");
import { generateLoiPlainText, getLoiCoverEmailSubject, getLoiCoverEmailHtml } from "@/lib/loi-template";
import { sendLoiEmail } from "../../../actions";

export function LoiModal() {
  const {
    showLoiModal, setShowLoiModal,
    loiData, setLoiData,
    loiSending, setLoiSending,
    loiMsg, setLoiMsg,
    linkedContact, savedId, contactId,
  } = useDealModeler();

  if (!showLoiModal || !loiData) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={() => setShowLoiModal(false)} />
      <div className="relative bg-[#0B0F19] border border-white/10 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col animate-[modal-in_0.2s_ease-out]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div>
            <h2 className="text-lg font-bold text-white">Generate Letter of Intent</h2>
            <p className="text-xs text-slate-500 mt-0.5">Review and customize before downloading or sending</p>
          </div>
          <button onClick={() => setShowLoiModal(false)} className="text-slate-500 hover:text-slate-300 text-2xl leading-none">&times;</button>
        </div>

        {/* Modal Body — two columns */}
        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          {/* Left: Editable form */}
          <div className="lg:w-1/2 overflow-y-auto p-6 space-y-4 border-r border-white/5">
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Property</h3>
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Property Address</label>
                <input value={loiData.propertyAddress} onChange={e => setLoiData({ ...loiData, propertyAddress: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              </div>
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">BBL</label>
                <input value={loiData.bbl} onChange={e => setLoiData({ ...loiData, bbl: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Seller</h3>
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Owner / Seller Name</label>
                <input value={loiData.ownerName} onChange={e => setLoiData({ ...loiData, ownerName: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              </div>
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Owner Address</label>
                <input value={loiData.ownerAddress || ""} onChange={e => setLoiData({ ...loiData, ownerAddress: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Offer Terms</h3>
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Offer Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                  <input type="number" value={loiData.offerPrice} onChange={e => setLoiData({ ...loiData, offerPrice: parseFloat(e.target.value) || 0 })}
                    className="w-full pl-7 pr-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Earnest Money %</label>
                  <input type="number" value={loiData.earnestMoneyPercent} onChange={e => setLoiData({ ...loiData, earnestMoneyPercent: parseFloat(e.target.value) || 0 })}
                    step="0.5" className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                </div>
                <div>
                  <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">DD Period (days)</label>
                  <input type="number" value={loiData.dueDiligenceDays} onChange={e => setLoiData({ ...loiData, dueDiligenceDays: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Financing (days)</label>
                  <input type="number" value={loiData.financingContingencyDays} onChange={e => setLoiData({ ...loiData, financingContingencyDays: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                </div>
                <div>
                  <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Closing (days)</label>
                  <input type="number" value={loiData.closingDays} onChange={e => setLoiData({ ...loiData, closingDays: parseInt(e.target.value) || 0 })}
                    className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Buyer</h3>
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Buyer Entity / Name</label>
                <input value={loiData.buyerEntity} onChange={e => setLoiData({ ...loiData, buyerEntity: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              </div>
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Buyer Address</label>
                <input value={loiData.buyerAddress || ""} onChange={e => setLoiData({ ...loiData, buyerAddress: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Broker Info</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Broker Name</label>
                  <input value={loiData.brokerName || ""} onChange={e => setLoiData({ ...loiData, brokerName: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                </div>
                <div>
                  <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Company</label>
                  <input value={loiData.brokerage || ""} onChange={e => setLoiData({ ...loiData, brokerage: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Email</label>
                  <input value={loiData.brokerEmail || ""} onChange={e => setLoiData({ ...loiData, brokerEmail: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                </div>
                <div>
                  <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">Phone</label>
                  <input value={loiData.brokerPhone || ""} onChange={e => setLoiData({ ...loiData, brokerPhone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-medium uppercase tracking-widest text-slate-500 mb-1">License #</label>
                <input value={loiData.brokerLicense || ""} onChange={e => setLoiData({ ...loiData, brokerLicense: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-800/40 border border-white/5 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              </div>
            </div>
          </div>

          {/* Right: Live text preview */}
          <div className="lg:w-1/2 overflow-y-auto p-6 bg-white/[0.02]">
            <div className="bg-white/[0.03] rounded-lg border border-white/5 p-6">
              <pre className="whitespace-pre-wrap text-xs text-slate-300 font-[inherit] leading-relaxed">
                {generateLoiPlainText(loiData)}
              </pre>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-white/5 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {loiMsg && (
              <span className={`text-sm ${loiMsg.startsWith("Error") || loiMsg.startsWith("Please") ? "text-red-400" : "text-green-400"}`}>{loiMsg}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => { const { generateLoiPdf } = await loadLoiPdf(); const pdf = generateLoiPdf(loiData); pdf.download(); }}
              className="px-4 py-2 border border-white/10 hover:bg-white/5 text-slate-300 text-sm font-medium rounded-lg transition-colors"
            >
              Download PDF
            </button>
            <button
              onClick={async () => { const { generateLoiDocx } = await loadLoiDocx(); await generateLoiDocx(loiData); }}
              className="px-4 py-2 border border-white/10 hover:bg-white/5 text-slate-300 text-sm font-medium rounded-lg transition-colors"
            >
              Download DOCX
            </button>
            <button
              onClick={async () => {
                if (!savedId) {
                  setLoiMsg("Please save the deal first before sending LOI.");
                  return;
                }
                const recipientEmail = linkedContact?.email;
                if (!recipientEmail) {
                  setLoiMsg("Please link a contact with an email address to send the LOI.");
                  return;
                }

                setLoiSending(true);
                setLoiMsg(null);
                try {
                  const { generateLoiPdf } = await loadLoiPdf();
                  const pdf = generateLoiPdf(loiData);
                  const pdfBase64 = pdf.base64();
                  const subject = getLoiCoverEmailSubject(loiData);
                  const bodyHtml = getLoiCoverEmailHtml(loiData);

                  await sendLoiEmail({
                    dealId: savedId,
                    recipientEmail,
                    recipientName: `${linkedContact.firstName} ${linkedContact.lastName}`.trim(),
                    subject,
                    bodyHtml,
                    pdfBase64,
                    propertyAddress: loiData.propertyAddress,
                    contactId: contactId || undefined,
                  });

                  setLoiMsg("LOI sent successfully!");
                } catch (err: any) {
                  setLoiMsg("Error: " + (err.message || "Failed to send"));
                } finally {
                  setLoiSending(false);
                }
              }}
              disabled={loiSending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {loiSending ? "Sending..." : "Send via Email"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
