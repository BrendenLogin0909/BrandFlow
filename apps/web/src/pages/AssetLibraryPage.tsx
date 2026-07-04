export function AssetLibraryPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Asset library</h1>
      <p className="mt-1 text-sm text-slate-500">
        Logos, photos, icons, illustrations and documents — tagged, approval-gated, tenant-scoped.
        Unapproved assets never enter generated designs.
      </p>
      {/* Phase 2: upload dropzone, type/tag/approval filters, allowInPrompts toggle */}
      <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-12 text-center text-slate-400">
        Asset grid — implementation plan Phase 2
      </div>
    </div>
  );
}
