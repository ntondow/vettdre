"use client";

import { useState, useEffect } from "react";
import { X, Building2, Users, AlertTriangle, Globe, Shield } from "lucide-react";
import { intelApi } from "@/lib/intel-api-client";
import type { IntelEntityResponse } from "@/lib/intel-api-types";

interface Props {
  entityId: string;
  onClose: () => void;
  onEntityClick?: (entityId: string) => void; // recursive navigation
}

export default function EntityDossierSlideOver({ entityId, onClose, onEntityClick }: Props) {
  const [data, setData] = useState<IntelEntityResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    intelApi.getEntity(entityId).then(d => { setData(d); setLoading(false); });
  }, [entityId]);

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-label="Entity Dossier">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-xl overflow-y-auto animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between z-10">
          <h2 className="text-sm font-semibold text-slate-900 truncate">
            {loading ? "Loading..." : data?.entity.canonicalName || "Entity"}
          </h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="p-4 space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : !data ? (
          <div className="p-6 text-center text-slate-400 text-sm">Entity not found</div>
        ) : (
          <div className="p-4 space-y-5">
            {/* Entity info */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Entity</h3>
              <p className="text-sm font-medium text-slate-900">{data.entity.canonicalName}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {data.entity.entityType}
                </span>
                {data.entity.dosId && (
                  <span className="text-[10px] text-slate-400">DOS #{data.entity.dosId}</span>
                )}
                {data.entity.isBank && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600">Bank</span>
                )}
              </div>
            </div>

            {/* Flags */}
            {(data.flags.offshore || data.flags.sanctioned || data.flags.inDistressPortfolio) && (
              <div className="flex flex-wrap gap-1.5">
                {data.flags.offshore && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                    <Globe size={10} /> Offshore Match (ICIJ)
                  </span>
                )}
                {data.flags.sanctioned && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">
                    <Shield size={10} /> OFAC Sanctioned
                  </span>
                )}
                {data.flags.inDistressPortfolio && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">
                    <AlertTriangle size={10} /> Distress Portfolio
                  </span>
                )}
              </div>
            )}

            {/* Holdings */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                <Building2 size={12} className="inline mr-1" />Holdings
              </h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-lg font-bold text-slate-900">{data.holdings.buildingsCount}</p>
                  <p className="text-[10px] text-slate-400">Buildings</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-900">{data.holdings.unitsCount}</p>
                  <p className="text-[10px] text-slate-400">Units</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-slate-900">
                    {data.holdings.totalAssessedValue > 0
                      ? `$${(data.holdings.totalAssessedValue / 1_000_000).toFixed(1)}M`
                      : "—"}
                  </p>
                  <p className="text-[10px] text-slate-400">Total Value</p>
                </div>
              </div>
              {data.holdings.neighborhoods.length > 0 && (
                <p className="text-[10px] text-slate-400 mt-1">
                  Neighborhoods: {data.holdings.neighborhoods.slice(0, 5).join(", ")}
                </p>
              )}
            </div>

            {/* Aliases */}
            {data.aliases.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Also Known As</h3>
                <div className="space-y-1">
                  {data.aliases.slice(0, 10).map((a, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-slate-700">{a.alias}</span>
                      <span className="text-[9px] text-slate-300">{a.source}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Related entities */}
            {data.relatedEntities.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  <Users size={12} className="inline mr-1" />Related Entities
                </h3>
                <div className="space-y-1.5">
                  {data.relatedEntities.slice(0, 15).map((re, i) => (
                    <button
                      key={i}
                      onClick={() => onEntityClick?.(re.entityId)}
                      className="w-full text-left flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-50 transition-colors"
                    >
                      <div>
                        <span className="text-xs text-blue-600 hover:text-blue-800">{re.name}</span>
                        <span className="ml-1.5 text-[9px] text-slate-400">{re.edgeType.replace(/_/g, " ")}</span>
                      </div>
                      <span className="text-[9px] font-mono text-slate-400">
                        {Math.round(re.confidence * 100)}%
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
