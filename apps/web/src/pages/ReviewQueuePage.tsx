export function ReviewQueuePage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Review queue</h1>
      <p className="mt-1 text-sm text-slate-500">
        Packages in review: side-by-side post text, visual previews, validation report and
        compliance notes; approve (Gate 3) or request changes with comments.
      </p>
      {/* Phase 3/4: review board with element-anchored comments */}
      <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-12 text-center text-slate-400">
        Review board — implementation plan Phases 3–4
      </div>
    </div>
  );
}
