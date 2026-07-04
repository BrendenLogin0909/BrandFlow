export function DashboardPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-2 text-slate-600">
        Role-aware overview: packages awaiting review, upcoming calendar slots, recent exports.
      </p>
      <div className="mt-6 grid grid-cols-3 gap-4">
        {['In review', 'Needs changes', 'Approved this week'].map((label) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="text-sm text-slate-500">{label}</div>
            <div className="mt-1 text-3xl font-bold">—</div>
          </div>
        ))}
      </div>
    </div>
  );
}
