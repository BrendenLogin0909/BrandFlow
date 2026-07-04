# BrandFlow — Editable Design Engine Comparison & Recommendation

**Version:** 1.0 · **Date:** 2026-07-04

---

## Requirements recap

The engine must support: programmatic design creation, editable layered objects, brand-controlled templates/recipes, JSON design documents, import/export of editable project files, PNG/PDF export, a usable embedded editor, commercially reasonable pricing, and **no per-end-customer subscription requirement**. Canva is excluded: its Apps/Connect APIs do not expose full programmatic scene construction or an embeddable white-label editor at the control level required.

## Candidates

### 1. Polotno SDK ✅ **Recommended**

- **Model:** React-based embeddable editor + `polotno-node` for server-side rendering. Whole design is a documented **scene JSON** (pages → children elements with type, position, size, fill, fontFamily, locked flags, custom fields).
- **Programmatic creation:** first-class — build scene JSON in code, load into store; every element addressable and mutable via store API.
- **Editability:** full Canva-style UX out of the box (move/resize/rotate/layer/group/lock/text edit/colour/font/image replace), customisable side panels and toolbars — we can hide off-brand fonts/colours and inject brand kits.
- **Export:** PNG/JPEG/PDF client-side and server-side (`polotno-node`); scene JSON is the editable project file.
- **Licensing/cost:** commercial licence per **application/domain** (flat annual fee, historically low-thousands USD/yr tier for SaaS embedding) — customers do **not** need their own subscriptions. Free dev/watermark tier for building.
- **Risks:** smaller vendor; mitigated by our internal schema (Polotno JSON is derived, not authoritative) + Konva fallback path (Polotno is built on Konva).

### 2. IMG.LY CreativeEditor SDK (CE.SDK)

- **Model:** polished embeddable editor, headless API, scene format, server rendering.
- **Strengths:** most polished UX, strong docs, enterprise support, video support later.
- **Weaknesses:** enterprise pricing (typically five figures/yr, usage-based tiers, sales-led); licence terms can meter creative exports/users — cost risk for a seat-heavy agency SaaS. Scene format less transparently documented than Polotno's plain JSON.
- **Verdict:** strong #2; revisit at scale or if Polotno support becomes a constraint. Our DesignEnginePort makes this a contained adapter swap.

### 3. Custom editor on Konva.js or Fabric.js

- **Strengths:** zero licence cost, total control, no vendor risk.
- **Weaknesses:** building a production Canva-grade editor (text editing with wrapping, snapping, grouping, undo/redo, image cropping, side panels, mobile) is realistically 6–12 engineer-months before it feels good — fatal to MVP timeline.
- **Verdict:** not for MVP. Kept as the escape hatch: our InternalDesignDocument maps cleanly onto Konva primitives, and Polotno itself is Konva-based, so an eventual migration is tractable.

### 4. Others assessed briefly

- **Fabric.js-based OSS editors** (e.g. various "canva-clone" projects): unmaintained/immature; same custom-build cost hidden inside.
- **tldraw:** whiteboard-oriented; wrong primitives for print-precise branded layouts; licence now requires paid "business" use flag.
- **Pixo / Filerobot / image editors:** raster-centric — fails the core "no static images" requirement.
- **Google Slides / PowerPoint APIs:** layered and editable but poor embed story, wrong canvas model, brand-control weak.

## Decision matrix

| Criterion (weight) | Polotno | IMG.LY | Custom Konva/Fabric |
|---|---|---|---|
| Programmatic scene creation (20%) | 5 | 4 | 5 |
| Embedded editor quality (20%) | 4 | 5 | 2 |
| JSON/project portability (15%) | 5 | 3 | 5 |
| PNG/PDF export incl. server-side (10%) | 5 | 5 | 3 |
| Licensing cost & model fit (15%) | 5 | 2 | 5 |
| Time-to-MVP (15%) | 5 | 4 | 1 |
| Vendor risk (5%) | 3 | 4 | 5 |
| **Weighted score** | **4.7** | **3.8** | **3.4** |

## Recommendation

**Polotno SDK** for the embedded editor and rendering, wrapped behind `DesignEnginePort`, with the **InternalDesignDocument** schema as the authoritative stored format ([09-design-generation-schema.md](09-design-generation-schema.md)). This gives Canva-grade editing now, flat predictable licensing, clean JSON, server-side export via `polotno-node`, and a credible exit path (IMG.LY adapter or custom Konva editor) without touching the AI pipeline, validation engine, or stored designs.

**Action items:** confirm current Polotno commercial licence tier and terms before launch; pin SDK version; build the adapter conversion tests early (round-trip Internal ⇄ Polotno JSON).
