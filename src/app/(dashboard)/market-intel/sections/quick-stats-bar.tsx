import { fmtPrice } from "./format-utils";

interface Props {
  pluto: any;
}

export default function QuickStatsBar({ pluto }: Props) {
  const stats = [
    { label: "Units", value: pluto?.unitsRes || pluto?.unitsTot || "—" },
    {
      label: "Sq Ft",
      value:
        pluto?.bldgArea > 0
          ? pluto.bldgArea.toLocaleString()
          : "—",
    },
    { label: "Year Built", value: pluto?.yearBuilt || "—" },
    { label: "Stories", value: pluto?.numFloors || "—" },
    { label: "Assessed", value: pluto?.assessTotal > 0 ? fmtPrice(pluto.assessTotal) : "—" },
    { label: "Zoning", value: pluto?.zoneDist1 || "—" },
  ];

  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-2 bg-white rounded-xl border border-slate-200 p-3">
      {stats.map((s) =>
        pluto ? (
          <div key={s.label} className="text-center">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 font-medium">
              {s.label}
            </p>
            <p className="text-sm font-bold text-slate-900 mt-0.5">{s.value}</p>
          </div>
        ) : (
          <div key={s.label} className="text-center space-y-1">
            <div className="animate-shimmer rounded h-2.5 w-12 mx-auto" />
            <div className="animate-shimmer rounded h-4 w-16 mx-auto" />
          </div>
        ),
      )}
    </div>
  );
}
