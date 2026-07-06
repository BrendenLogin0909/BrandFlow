# BrandFlow — Backlog (do not lose these)

Items explicitly parked by the product owner — revisit before launch.

| # | Item | Origin | Notes |
|---|---|---|---|
| 1 | **Better crafting of image-look drafting** — the draft stage should describe how the visuals should LOOK (scene, metaphor, mood, composition hints) with much more craft, feeding the design stage | 2026-07-06 review | Extend `post_copy` with a visual-direction section; wire into freeform compose prompts |
| 2 | **Post-approval management** — delete / change date / edit an approved+planned post and keep integrations in sync | 2026-07-06 board spec | Change-date exists locally; rest lands with the publish integration |
| 3 | **Buffer / LinkedIn publish integration** — approved+dated posts flow to the scheduling platform (TBC which) | 2026-07-06 board spec | Buffer MCP/API or LinkedIn API; decide after pipeline stabilises |
| 4 | **Illustration asset packs** — flat character scenes (unDraw/Open Peeps-style, licence-vetted) selectable by AI and humans | recurring | Needed for full 29FORWARD look; AssetProviderPort |
| 5 | **Icon bundle size** — lucide-static is imported wholesale into the web bundle; switch to per-icon dynamic loading or a server-side icon endpoint | Loop 1 of creativity work | Optimisation only |
| 6 | **Polotno editor mounting** — needs the free trial key (VITE_POLOTNO_KEY) from polotno.com/sdk/pricing | earlier session | In-app element-level editing |
| 7 | **Queue workers (BullMQ)** — long AI pipelines still run synchronously; move batch generation to the queue | architecture doc | Needed before multi-user load |
