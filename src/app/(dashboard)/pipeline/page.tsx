import Header from "@/components/layout/header";

const stages = ["New Lead", "Contacted", "Showing", "Offer", "Under Contract", "Closed"];

export default function PipelinePage() {
  return (
    <>
      <Header title="Pipeline" subtitle="Track your deals" />
      <div className="p-8">
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <div key={stage} className="flex-shrink-0 w-64 bg-white rounded-xl border border-slate-200">
              <div className="p-4 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700">{stage}</h3>
              </div>
              <div className="p-4 min-h-[300px] flex items-center justify-center">
                <p className="text-xs text-slate-400">No deals</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
