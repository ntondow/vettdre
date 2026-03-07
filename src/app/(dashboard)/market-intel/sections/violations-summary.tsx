import { useState } from "react";
import { fmtDate } from "./format-utils";

interface Props {
  data: any;
  collapsed: boolean;
  onToggle: () => void;
}

type Tab = "violations" | "complaints" | "permits" | "litigation" | "ecb";

export default function ViolationsSummary({ data, collapsed, onToggle }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("violations");

  const violationCount = data?.violationSummary?.total || 0;
  const openViolations = data?.violationSummary?.open || 0;
  const classC = data?.violationSummary?.classC || 0;
  const complaintCount = data?.complaintSummary?.total || 0;
  const permitCount = data?.permits?.length || 0;
  const litigationCount = data?.litigationSummary?.total || 0;
  const litigationOpen = data?.litigationSummary?.open || 0;
  const ecbCount = data?.ecbSummary?.total || 0;
  const ecbPenalty = data?.ecbSummary?.totalPenalty || 0;

  const hasAnyData =
    violationCount > 0 ||
    complaintCount > 0 ||
    permitCount > 0 ||
    litigationCount > 0 ||
    ecbCount > 0;

  if (!hasAnyData) return null;

  const tabs: { key: Tab; label: string; count: number; color: string }[] = [
    {
      key: "violations",
      label: "HPD",
      count: violationCount,
      color: openViolations > 0 ? "text-red-600" : "text-slate-600",
    },
    {
      key: "complaints",
      label: "311",
      count: complaintCount,
      color: complaintCount > 5 ? "text-amber-600" : "text-slate-600",
    },
    {
      key: "permits",
      label: "Permits",
      count: permitCount,
      color: "text-slate-600",
    },
    {
      key: "litigation",
      label: "Litigation",
      count: litigationCount,
      color: litigationOpen > 0 ? "text-red-600" : "text-slate-600",
    },
    {
      key: "ecb",
      label: "ECB",
      count: ecbCount,
      color: ecbPenalty > 0 ? "text-red-600" : "text-slate-600",
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      {/* Header with badge counts */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-5 text-left cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">🏛️</span>
          <h3 className="text-sm font-bold text-slate-900">
            Violations & Compliance
          </h3>
          {/* Inline badge counts */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {openViolations > 0 && (
              <span className="text-[9px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                HPD: {openViolations} open{classC > 0 ? ` (${classC} C)` : ""}
              </span>
            )}
            {ecbPenalty > 0 && (
              <span className="text-[9px] font-bold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">
                ECB: {ecbCount} ($
                {Math.round(ecbPenalty).toLocaleString()})
              </span>
            )}
            {complaintCount > 0 && (
              <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                311: {complaintCount}
              </span>
            )}
            {permitCount > 0 && (
              <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                Permits: {permitCount}
              </span>
            )}
          </div>
        </div>
        <span
          className={
            "text-slate-400 text-xs transition-transform duration-200 " +
            (collapsed ? "" : "rotate-90")
          }
        >
          ▶
        </span>
      </button>

      {/* Collapsible body */}
      <div
        className={
          "grid transition-[grid-template-rows] duration-200 ease-out " +
          (collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]")
        }
      >
        <div className="overflow-hidden">
          <div className="px-5 pb-5">
            {/* Tab bar */}
            <div className="flex items-center gap-1 border-b border-slate-200 mb-4">
              {tabs
                .filter((t) => t.count > 0)
                .map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors ${
                      activeTab === t.key
                        ? "border-blue-600 text-blue-700"
                        : "border-transparent text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {t.label}{" "}
                    <span className={`font-bold ${t.color}`}>{t.count}</span>
                  </button>
                ))}
            </div>

            {/* Tab content */}
            {activeTab === "violations" && (
              <ViolationsTab data={data} />
            )}
            {activeTab === "complaints" && (
              <ComplaintsTab data={data} />
            )}
            {activeTab === "permits" && <PermitsTab data={data} />}
            {activeTab === "litigation" && (
              <LitigationTab data={data} />
            )}
            {activeTab === "ecb" && <EcbTab data={data} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function ViolationsTab({ data }: { data: any }) {
  if (!data?.violations?.length)
    return (
      <p className="text-sm text-slate-400">No HPD violations found.</p>
    );
  return (
    <>
      <div className="flex items-center gap-4 mb-3 text-xs">
        <span className="bg-red-50 text-red-700 px-2 py-1 rounded font-medium">
          {data.violationSummary.open} Open
        </span>
        <span className="bg-orange-50 text-orange-700 px-2 py-1 rounded font-medium">
          {data.violationSummary.classC} Class C
        </span>
        <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded font-medium">
          {data.violationSummary.classB} Class B
        </span>
        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded font-medium">
          {data.violationSummary.classA} Class A
        </span>
      </div>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {data.violations.slice(0, 15).map((v: any, i: number) => (
          <div
            key={i}
            className="border border-slate-200 rounded-lg p-3 text-sm"
          >
            <div className="flex items-center gap-2">
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
                Class {v.class}
              </span>
              <span
                className={
                  "text-xs px-1.5 py-0.5 rounded " +
                  (v.currentStatus?.includes("OPEN")
                    ? "bg-red-50 text-red-700"
                    : "bg-emerald-50 text-emerald-700")
                }
              >
                {v.currentStatus || v.status}
              </span>
              <span className="text-xs text-slate-400 ml-auto">
                {fmtDate(v.inspectionDate)}
              </span>
            </div>
            {v.novDescription && (
              <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                {v.novDescription}
              </p>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function ComplaintsTab({ data }: { data: any }) {
  if (!data?.complaints?.length)
    return <p className="text-sm text-slate-400">No complaints found.</p>;
  return (
    <>
      {data?.complaintSummary?.topTypes?.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-amber-700 font-semibold uppercase tracking-wider mb-2">
            Top Types
          </p>
          <div className="flex flex-wrap gap-2">
            {data.complaintSummary.topTypes.map((t: any, i: number) => (
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
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {data.complaints.slice(0, 15).map((c: any, i: number) => (
          <div
            key={i}
            className="border border-slate-200 rounded-lg p-3 text-sm"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                  {c.type || "Unknown"}
                </span>
                {c.minorCategory && (
                  <span className="text-xs text-slate-500">
                    {c.minorCategory}
                  </span>
                )}
              </div>
              <span className="text-xs text-slate-400">
                {fmtDate(c.receivedDate)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function PermitsTab({ data }: { data: any }) {
  if (!data?.permits?.length)
    return <p className="text-sm text-slate-400">No DOB permits found.</p>;
  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {data.permits.slice(0, 15).map((permit: any, i: number) => (
        <div
          key={i}
          className="border border-slate-200 rounded-lg p-3 text-sm"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                {permit.workType || permit.permitType || "Permit"}
              </span>
              {permit.jobNumber && (
                <span className="text-xs text-slate-400">
                  Job #{permit.jobNumber}
                </span>
              )}
            </div>
            <span className="text-xs text-slate-400">
              {fmtDate(permit.issuanceDate || permit.filingDate)}
            </span>
          </div>
          {permit.jobDescription && (
            <p className="text-xs text-slate-600 mt-1 line-clamp-2">
              {permit.jobDescription}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function LitigationTab({ data }: { data: any }) {
  if (!data?.litigation?.length)
    return (
      <p className="text-sm text-slate-400">No HPD litigation found.</p>
    );
  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {data.litigation.slice(0, 15).map((l: any, i: number) => (
        <div
          key={i}
          className="border border-slate-200 rounded-lg p-3 text-sm"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={
                  "text-xs font-bold px-1.5 py-0.5 rounded " +
                  (l.caseStatus === "OPEN" || l.caseStatus === "Open"
                    ? "bg-red-100 text-red-800"
                    : "bg-slate-100 text-slate-600")
                }
              >
                {l.caseStatus}
              </span>
              <span className="text-xs font-medium bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">
                {l.caseType}
              </span>
            </div>
            <span className="text-xs text-slate-400">
              {fmtDate(l.caseOpenDate)}
            </span>
          </div>
          {l.respondent && (
            <p className="text-xs text-slate-600 mt-1">
              Respondent: {l.respondent}
            </p>
          )}
          {l.findingOfHarassment === "YES" && (
            <p className="text-xs text-red-600 font-semibold mt-1">
              Finding of Harassment
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function EcbTab({ data }: { data: any }) {
  if (!data?.ecbViolations?.length)
    return (
      <p className="text-sm text-slate-400">No ECB violations found.</p>
    );
  return (
    <>
      {data.ecbSummary?.totalPenalty > 0 && (
        <div className="mb-3 bg-red-50 rounded-lg p-3 flex items-center justify-between">
          <span className="text-xs text-red-700 font-semibold">
            Total Penalty Balance Due
          </span>
          <span className="text-base font-bold text-red-800">
            ${Math.round(data.ecbSummary.totalPenalty).toLocaleString()}
          </span>
        </div>
      )}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {data.ecbViolations.slice(0, 15).map((e: any, i: number) => (
          <div
            key={i}
            className="border border-slate-200 rounded-lg p-3 text-sm"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={
                    "text-xs font-bold px-1.5 py-0.5 rounded " +
                    (e.status === "ACTIVE"
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
                {fmtDate(e.issuedDate)}
              </span>
            </div>
            {(e.violationType || e.infraction) && (
              <p className="text-xs text-slate-600 mt-1">
                {e.violationType || e.infraction}
              </p>
            )}
            <div className="flex gap-3 mt-1 text-xs text-slate-500">
              {e.penaltyBalance > 0 && (
                <span className="text-red-600 font-medium">
                  Balance: $
                  {Math.round(e.penaltyBalance).toLocaleString()}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
