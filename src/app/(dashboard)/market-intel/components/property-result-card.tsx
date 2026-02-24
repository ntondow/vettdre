"use client";

interface Badge {
  label: string;
  color: "red" | "purple" | "green" | "amber" | "blue";
}

interface PropertyResultCardProps {
  address: string;
  subtext: string; // e.g. "Upper East Side, Manhattan · ZIP 10022"
  units?: number;
  yearBuilt?: number;
  floors?: number;
  sqft?: number;
  assessedValue?: number;
  lastSalePrice?: number;
  lastSaleDate?: string;
  ownerName?: string;
  badges?: Badge[];
  onClick?: () => void;
  onProspect?: () => void;
  onModelDeal?: () => void;
  className?: string;
}

const BADGE_COLORS = {
  red: "bg-red-50 text-red-700",
  purple: "bg-purple-50 text-purple-700",
  green: "bg-green-50 text-green-700",
  amber: "bg-amber-50 text-amber-700",
  blue: "bg-blue-50 text-blue-700",
};

const fmtPrice = (n: number) =>
  n > 0 ? "$" + n.toLocaleString() : "—";
const fmtDate = (d: string | null | undefined) => {
  if (!d) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      year: "numeric",
    }).format(new Date(d));
  } catch {
    return d;
  }
};

export default function PropertyResultCard({
  address,
  subtext,
  units,
  yearBuilt,
  floors,
  sqft,
  assessedValue,
  lastSalePrice,
  lastSaleDate,
  ownerName,
  badges,
  onClick,
  onProspect,
  onModelDeal,
  className,
}: PropertyResultCardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:shadow-md transition-all ${
        onClick ? "cursor-pointer" : ""
      } ${className || ""}`}
    >
      {/* Top row: address + badges */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-bold text-slate-900 truncate">
            {address}
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">{subtext}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {units !== undefined && units > 0 && (
            <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
              {units} units
            </span>
          )}
          {badges?.map((b) => (
            <span
              key={b.label}
              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${BADGE_COLORS[b.color]}`}
            >
              {b.label}
            </span>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
        {yearBuilt !== undefined && yearBuilt > 0 && (
          <span>Built {yearBuilt}</span>
        )}
        {floors !== undefined && floors > 0 && <span>{floors} fl</span>}
        {sqft !== undefined && sqft > 0 && (
          <span>{sqft.toLocaleString()} sf</span>
        )}
        {assessedValue !== undefined && assessedValue > 0 && (
          <span className="font-semibold text-slate-700">
            Assessed: {fmtPrice(assessedValue)}
          </span>
        )}
      </div>

      {/* Sale info */}
      {lastSalePrice !== undefined && lastSalePrice > 0 && (
        <p className="text-xs text-slate-500 mt-1">
          Last Sale: {fmtPrice(lastSalePrice)}
          {lastSaleDate && ` (${fmtDate(lastSaleDate)})`}
        </p>
      )}

      {/* Owner */}
      {ownerName && (
        <p className="text-xs text-slate-400 mt-1 truncate">
          Owner: {ownerName}
        </p>
      )}

      {/* Quick actions */}
      {(onProspect || onModelDeal) && (
        <div className="flex items-center gap-2 mt-3 pt-2 border-t border-slate-100">
          {onClick && (
            <button className="text-xs text-blue-600 font-medium hover:text-blue-700">
              View Profile
            </button>
          )}
          {onProspect && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onProspect();
              }}
              className="text-xs text-slate-600 font-medium hover:text-slate-700 border border-slate-200 px-2 py-1 rounded"
            >
              + Prospect
            </button>
          )}
          {onModelDeal && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onModelDeal();
              }}
              className="text-xs text-slate-600 font-medium hover:text-slate-700 border border-slate-200 px-2 py-1 rounded"
            >
              Model Deal
            </button>
          )}
        </div>
      )}
    </div>
  );
}
