import Header from "@/components/layout/header";

export default function PropertiesPage() {
  return (
    <>
      <Header title="Properties" subtitle="Manage your listings" />
      <div className="p-8">
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <p className="text-4xl mb-4">🏠</p>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">No properties yet</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto">Add your listings to track showings and link contacts.</p>
        </div>
      </div>
    </>
  );
}
