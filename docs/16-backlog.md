# BrandFlow — Backlog (do not lose these)

Items explicitly parked by the product owner — revisit before launch.

| # | Item | Origin | Notes |
|---|---|---|---|
| 1 | **Better crafting of image-look drafting** — the draft stage should describe how the visuals should LOOK (scene, metaphor, mood, composition hints) with much more craft, feeding the design stage | 2026-07-06 review | Extend `post_copy` with a visual-direction section; wire into freeform compose prompts |
| 2 | **Post-approval management** — delete / change date / edit an approved+planned post and keep integrations in sync | 2026-07-06 board spec | Change-date exists locally; rest lands with the publish integration |
| 3 | **Buffer / LinkedIn publish integration** — approved+dated posts flow to the scheduling platform (TBC which) | 2026-07-06 board spec | Buffer MCP/API or LinkedIn API; decide after pipeline stabilises |
| 4 | ✅ **DONE** — **Flat illustration pack** — 22 bundled recolourable flat scene illustrations (`apps/api/src/assets/undraw-manifest.ts`) via `searchUndraw`. Real unDraw art was un-fetchable (hashed/unstable CDN URLs), so these are original hand-authored scenes in the unDraw style — unencumbered, no attribution. Registry `undraw` relabelled "Flat illustrations". Real unDraw SVGs can be dropped into the same manifest later. | 2026-07-06 asset build | DiceBear figures already live (no key); this adds scene variety |
| 4b | **Photo API keys** — add free UNSPLASH_ACCESS_KEY / PEXELS_API_KEY / PIXABAY_API_KEY to light up real stock photos in search + compose auto-fill | 2026-07-06 | providers coded; just need keys |
| 4c | ✅ **DONE** — **Attribution surfacing on export** — `attributions` now an optional field on `InternalDesignDocument`; `resolveImages` attaches credits to the doc (persist through save/reopen/export); SVG + PPTX render a credits line; playground shows an "Asset credits" panel. | 2026-07-06 | composeFreeform returns attributions[] |
| 4d | **Asset upload + object storage** — customer logo/photo upload via multipart to MinIO/S3 (StoragePort); brand-kit logo then feeds logo-top-left motif | 2026-07-06 | search+save+library live; upload still stubbed |
| 4e | **Manual asset insert in playground** — drag a library/searched asset onto a design; compose auto-fill works, manual insert does not yet | 2026-07-06 | |
| 5 | **Icon bundle size** — lucide-static is imported wholesale into the web bundle; switch to per-icon dynamic loading or a server-side icon endpoint | Loop 1 of creativity work | Optimisation only |
| 6 | **Polotno editor mounting** — needs the free trial key (VITE_POLOTNO_KEY) from polotno.com/sdk/pricing | earlier session | In-app element-level editing |
| 7 | **Queue workers (BullMQ)** — long AI pipelines still run synchronously; move batch generation to the queue | architecture doc | Needed before multi-user load |
