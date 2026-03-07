"use client";

import ConditionSignal from "./condition-signal";
import ViolationsSummary from "../../sections/violations-summary";
import FeatureGate from "@/components/ui/feature-gate";
import { fmtDate } from "../../sections/format-utils";
import { useState } from "react";
import {
  SkeletonPulse,
  SkeletonSection,
  SkeletonTable,
} from "./skeleton-components";

interface TabConditionProps {
  data: any;
  intel: any;
  rpieRecords: any[];
  loading: boolean;
}

export default function TabCondition({
  data,
  intel,
  rpieRecords,
  loading,
}: TabConditionProps) {
  const [violationsCollapsed, setViolationsCollapsed] = useState(false);

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonSection title="Condition" />
        <SkeletonTable rows={5} cols={4} />
        <SkeletonSection title="Violations" />
        <SkeletonTable rows={6} cols={3} />
      </div>
    );
  }

  const violations = Array.isArray(data?.violations) ? data.violations : [];
  const complaints = Array.isArray(data?.complaints) ? data.complaints : [];
  const litigation = Array.isArray(data?.litigation) ? data.litigation : [];
  const ecbViolations = Array.isArray(data?.ecbViolations)
    ? data.ecbViolations
    : [];
  const permits = Array.isArray(data?.permits) ? data.permits : [];
  const vs = data?.violationSummary || {};
  const cs = data?.complaintSummary || {};
  const ecbSum = data?.ecbSummary || {};
  const litSum = data?.litigationSummary || {};

  const distressScore = intel?.distressScore ?? data?.distressScore ?? null;
  const distressSignals: string[] =
    intel?.distressSignals || data?.distressSignals || [];

  return (
    <div className="space-y-4">
      {/* 1. Overall Condition Signal — large version */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">🏗️</span>
          <h3 className="text-sm font-bold text-slate-900">
            Overall Building Condition
          </h3>
        </div>
        <ConditionSignal data={data} loading={false} />
      </div>

      {/* 2. Violations Summary (tabbed collapsible) */}
      <ViolationsSummary
        data={data}
        collapsed={violationsCollapsed}
        onToggle={() => setViolationsCollapsed((v) => !v)}
      />

      {/* 3. RPIE Non-Compliance Banner */}
      <FeatureGate feature="bp_rpie">
        {rpieRecords.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">📋</span>
              <h3 className="text-sm font-bold text-amber-900">
                RPIE Non-Compliance
              </h3>
              <span className="text-[10px] font-bold bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">
                {rpieRecords.length} YEAR
                {rpieRecords.length > 1 ? "S" : ""}
              </span>
            </div>
            <p className="text-xs text-amber-800 mb-3">
              This property has missing or non-compliant RPIE filings. The NYC
              Department of Finance requires annual Real Property Income &amp;
              Expense statements from owners of income-producing properties
              assessed at $40,000+.
            </p>
            <div className="flex flex-wrap gap-2">
              {rpieRecords.map((r: any, i: number) => (
                <span
                  key={i}
                  className="text-xs font-semibold bg-amber-100 border border-amber-300 text-amber-900 px-2.5 py-1 rounded-full"
                >
                  {r.year || r.rpie_year || r.filingYear || `Record ${i + 1}`}
                </span>
              ))}
            </div>
          </div>
        )}
      </FeatureGate>

      {/* 4. Distress Score */}
      <FeatureGate feature="bp_distress_score" blur>
        {distressScore !== null && (
          <DistressScoreCard
            score={distressScore}
            signals={distressSignals}
          />
        )}
      </FeatureGate>

      {/* 5. HPD Violations — Full List */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🚨</span>
          <h3 className="text-sm font-bold text-slate-900">HPD Violations</h3>
          {(vs.total ?? violations.length) > 0 && (
            <div className="flex items-center gap-1.5 ml-auto flex-wrap">
              <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                {vs.total ?? violations.length} total
              </span>
              {(vs.open || 0) > 0 && (
                <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                  {vs.open} open
                </span>
              )}
              {(vs.classC || 0) > 0 && (
                <span className="text-[10px] font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                  {vs.classC} Class C
                </span>
              )}
            </div>
          )}
        </div>

        {violations.length === 0 ? (
          <p className="text-sm text-slate-400">No HPD violations found.</p>
        ) : (
          <>
            {/* Summary pills */}
            <div className="flex items-center gap-3 mb-3 text-xs flex-wrap">
              <span className="bg-red-50 text-red-700 px-2.5 py-1 rounded font-medium">
                {vs.open || 0} Open
              </span>
              <span className="bg-orange-50 text-orange-700 px-2.5 py-1 rounded font-medium">
                {vs.classC || 0} Class C
              </span>
              <span className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded font-medium">
                {vs.classB || 0} Class B
              </span>
              <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded font-medium">
                {vs.classA || 0} Class A
              </span>
            </div>

            {/* Violation list */}
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {violations.slice(0, 30).map((v: any, i: number) => (
                <div
                  key={i}
                  className="border border-slate-200 rounded-lg p-3 text-sm"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={
                        "text-xs font-bold px-1.5 py-0.5 rounded " +
                        (v.class === "C"
                          ? "bg-orange-100 text-orange-800"
                          : v.class === "B"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-600")
                      }
                    >
                      Class {v.class || "?"}
                    </span>
                    <span
                      className={
                        "text-xs px-1.5 py-0.5 rounded " +
                        ((v.currentStatus || v.status || "")
                          .toUpperCase()
                          .includes("OPEN")
                          ? "bg-red-50 text-red-700"
                          : "bg-emerald-50 text-emerald-700")
                      }
                    >
                      {v.currentStatus || v.status || "Unknown"}
                    </span>
                    <span className="text-xs text-slate-400 ml-auto">
                      {fmtDate(v.inspectionDate || v.approvedDate)}
                    </span>
                  </div>
                  {(v.novDescription || v.description) && (
                    <p className="text-xs text-slate-600 mt-1.5 line-clamp-2">
                      {v.novDescription || v.description}
                    </p>
                  )}
                </div>
              ))}
              {violations.length > 30 && (
                <p className="text-xs text-slate-400 text-center pt-2">
                  Showing 30 of {violations.length} violations
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* 6. 311 Complaints */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">📞</span>
          <h3 className="text-sm font-bold text-slate-900">311 Complaints</h3>
          {(cs.total ?? complaints.length) > 0 && (
            <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full ml-auto">
              {cs.total ?? complaints.length} total
            </span>
          )}
        </div>

        {complaints.length === 0 ? (
          <p className="text-sm text-slate-400">No 311 complaints found.</p>
        ) : (
          <>
            {/* Top complaint type pills */}
            {cs.topTypes?.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-amber-700 font-semibold uppercase tracking-wider mb-2">
                  Top Types
                </p>
                <div className="flex flex-wrap gap-2">
                  {cs.topTypes.map((t: any, i: number) => (
                    <span
                      key={i}
                      className="text-xs bg-amber-50 border border-amber-200 text-amber-800 px-2.5 py-1 rounded-full font-medium"
                    >
                      {t.type} ({t.count})
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Complaint list */}
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {complaints.slice(0, 30).map((c: any, i: number) => (
                <div
                  key={i}
                  className="border border-slate-200 rounded-lg p-3 text-sm"
                >
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                        {c.type || c.majorCategory || "Unknown"}
                      </span>
                      {c.status && (
                        <span
                          className={
                            "text-xs px-1.5 py-0.5 rounded " +
                            ((c.status || "").toUpperCase().includes("OPEN")
                              ? "bg-red-50 text-red-700"
                              : "bg-emerald-50 text-emerald-700")
                          }
                        >
                          {c.status}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-400">
                      {fmtDate(c.receivedDate || c.statusDate)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    {c.minorCategory && (
                      <span className="text-xs text-slate-500">
                        {c.minorCategory}
                      </span>
                    )}
                    {c.apartment && (
                      <span className="text-xs text-slate-400">
                        Apt {c.apartment}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {complaints.length > 30 && (
                <p className="text-xs text-slate-400 text-center pt-2">
                  Showing 30 of {complaints.length} complaints
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* 7. HPD Litigation */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">⚖️</span>
          <h3 className="text-sm font-bold text-slate-900">HPD Litigation</h3>
          {(litSum.total ?? litigation.length) > 0 && (
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                {litSum.total ?? litigation.length} total
              </span>
              {(litSum.open || 0) > 0 && (
                <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                  {litSum.open} open
                </span>
              )}
            </div>
          )}
        </div>

        {litigation.length === 0 ? (
          <p className="text-sm text-slate-400">No HPD litigation found.</p>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {litigation.slice(0, 30).map((l: any, i: number) => (
              <div
                key={i}
                className="border border-slate-200 rounded-lg p-3 text-sm"
              >
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={
                        "text-xs font-bold px-1.5 py-0.5 rounded " +
                        ((l.caseStatus || "").toUpperCase() === "OPEN"
                          ? "bg-red-100 text-red-800"
                          : "bg-slate-100 text-slate-600")
                      }
                    >
                      {l.caseStatus || "Unknown"}
                    </span>
                    <span className="text-xs font-medium bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">
                      {l.caseType || "Litigation"}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">
                    {fmtDate(l.caseOpenDate || l.filingDate)}
                  </span>
                </div>
                {l.respondent && (
                  <p className="text-xs text-slate-600 mt-1.5">
                    <span className="text-slate-400">Respondent:</span>{" "}
                    {l.respondent}
                  </p>
                )}
                {l.findingOfHarassment === "YES" && (
                  <p className="text-xs text-red-600 font-semibold mt-1">
                    Finding of Harassment
                  </p>
                )}
                {l.penalty && Number(l.penalty) > 0 && (
                  <p className="text-xs text-red-600 mt-1">
                    Penalty: ${Number(l.penalty).toLocaleString()}
                  </p>
                )}
              </div>
            ))}
            {litigation.length > 30 && (
              <p className="text-xs text-slate-400 text-center pt-2">
                Showing 30 of {litigation.length} cases
              </p>
            )}
          </div>
        )}
      </div>

      {/* 8. ECB/OATH Violations */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🏢</span>
          <h3 className="text-sm font-bold text-slate-900">
            ECB/OATH Violations
          </h3>
          {(ecbSum.total ?? ecbViolations.length) > 0 && (
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                {ecbSum.total ?? ecbViolations.length} total
              </span>
              {(ecbSum.totalPenalty || 0) > 0 && (
                <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                  ${Math.round(ecbSum.totalPenalty).toLocaleString()} penalties
                </span>
              )}
            </div>
          )}
        </div>

        {ecbViolations.length === 0 ? (
          <p className="text-sm text-slate-400">
            No ECB/OATH violations found.
          </p>
        ) : (
          <>
            {/* Total penalty banner */}
            {(ecbSum.totalPenalty || 0) > 0 && (
              <div className="mb-3 bg-red-50 rounded-lg p-3 flex items-center justify-between">
                <span className="text-xs text-red-700 font-semibold">
                  Total Penalty Balance Due
                </span>
                <span className="text-base font-bold text-red-800">
                  ${Math.round(ecbSum.totalPenalty).toLocaleString()}
                </span>
              </div>
            )}

            {/* ECB violation list */}
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {ecbViolations.slice(0, 30).map((e: any, i: number) => (
                <div
                  key={i}
                  className="border border-slate-200 rounded-lg p-3 text-sm"
                >
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          "text-xs font-bold px-1.5 py-0.5 rounded " +
                          ((e.status || "").toUpperCase() === "ACTIVE" ||
                          (e.status || "").toUpperCase() === "DEFAULT"
                            ? "bg-red-100 text-red-800"
                            : "bg-emerald-100 text-emerald-800")
                        }
                      >
                        {e.status || "ACTIVE"}
                      </span>
                      {e.ecbNumber && (
                        <span className="text-xs text-slate-500">
                          #{e.ecbNumber}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-slate-400">
                      {fmtDate(e.issuedDate || e.violationDate)}
                    </span>
                  </div>
                  {(e.violationType || e.infraction) && (
                    <p className="text-xs text-slate-600 mt-1.5">
                      {e.violationType || e.infraction}
                    </p>
                  )}
                  <div className="flex gap-4 mt-1 text-xs text-slate-500">
                    {e.penaltyApplied > 0 && (
                      <span>
                        Imposed: $
                        {Math.round(e.penaltyApplied).toLocaleString()}
                      </span>
                    )}
                    {e.penaltyBalance > 0 && (
                      <span className="text-red-600 font-medium">
                        Balance: $
                        {Math.round(e.penaltyBalance).toLocaleString()}
                      </span>
                    )}
                    {e.penaltyAdjusted > 0 && (
                      <span>
                        Adjusted: $
                        {Math.round(e.penaltyAdjusted).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {ecbViolations.length > 30 && (
                <p className="text-xs text-slate-400 text-center pt-2">
                  Showing 30 of {ecbViolations.length} violations
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {/* 9. DOB Job Filings (Permits) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">📄</span>
          <h3 className="text-sm font-bold text-slate-900">
            DOB Job Filings (Permits)
          </h3>
          {permits.length > 0 && (
            <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full ml-auto">
              {permits.length} permit{permits.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {permits.length === 0 ? (
          <p className="text-sm text-slate-400">No DOB permits found.</p>
        ) : (
          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {permits.slice(0, 30).map((p: any, i: number) => (
              <div
                key={i}
                className="border border-slate-200 rounded-lg p-3 text-sm"
              >
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                      {p.workType || p.permitType || "Permit"}
                    </span>
                    {(p.jobNumber || p.job__) && (
                      <span className="text-xs text-slate-400">
                        Job #{p.jobNumber || p.job__}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400">
                    {fmtDate(
                      p.issuanceDate || p.filingDate || p.preFilingDate
                    )}
                  </span>
                </div>
                {(p.jobDescription || p.description) && (
                  <p className="text-xs text-slate-600 mt-1.5 line-clamp-2">
                    {p.jobDescription || p.description}
                  </p>
                )}
                <div className="flex gap-4 mt-1 text-xs text-slate-500 flex-wrap">
                  {p.estimatedJobCost && Number(p.estimatedJobCost) > 0 && (
                    <span>
                      Est. Cost: $
                      {Number(p.estimatedJobCost).toLocaleString()}
                    </span>
                  )}
                  {(p.ownerName || p.owner) && (
                    <span>Owner: {p.ownerName || p.owner}</span>
                  )}
                </div>
              </div>
            ))}
            {permits.length > 30 && (
              <p className="text-xs text-slate-400 text-center pt-2">
                Showing 30 of {permits.length} permits
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────── Distress Score Card ─────────────────── */

function DistressScoreCard({
  score,
  signals,
}: {
  score: number;
  signals: string[];
}) {
  const color =
    score >= 70
      ? { bg: "bg-red-50", border: "border-red-200", text: "text-red-800", badge: "bg-red-600" }
      : score >= 40
        ? { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", badge: "bg-amber-500" }
        : { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800", badge: "bg-emerald-500" };

  return (
    <div
      className={`${color.bg} ${color.border} border rounded-xl p-5`}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">🔥</span>
        <h3 className="text-sm font-bold text-slate-900">Distress Score</h3>
      </div>

      {/* Score display */}
      <div className="flex items-center gap-3 mb-3">
        <div
          className={`${color.badge} text-white text-xl font-bold w-14 h-14 rounded-xl flex items-center justify-center`}
        >
          {score}
        </div>
        <div>
          <p className={`text-sm font-semibold ${color.text}`}>
            {score >= 70
              ? "High Distress"
              : score >= 40
                ? "Moderate Distress"
                : "Low Distress"}
          </p>
          <p className="text-xs text-slate-500">out of 100</p>
        </div>
      </div>

      {/* Motivation indicator */}
      {score >= 40 && (
        <div className="bg-white/70 border border-amber-300 rounded-lg p-2.5 mb-3">
          <p className="text-xs font-semibold text-amber-800">
            High distress — owner may be motivated to sell
          </p>
        </div>
      )}

      {/* Distress signals */}
      {signals.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
            Distress Signals
          </p>
          <div className="space-y-1.5">
            {signals.map((signal, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-red-500 text-xs mt-0.5">&#9679;</span>
                <span className="text-xs text-slate-700">{signal}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
