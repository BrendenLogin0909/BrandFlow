/**
 * Generates sample editable exports into examples/ at the repo root:
 * one SVG per page + one PPTX per recipe, using a demo brand.
 * Run: npm run samples -w packages/exporters
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BrandTokensSnapshot } from '@brandflow/design-schema';
import { RECIPES } from '@brandflow/layout-recipes';
import type { LayoutContext, LayoutRecipe, RecipeFill } from '@brandflow/layout-recipes';
import { exportAllPagesSvg } from '../src/svg.js';
import { exportPptx } from '../src/pptx.js';

const brand: BrandTokensSnapshot = {
  colours: {
    primary: '#1a3c8f',
    secondary: '#4a6fd4',
    accent: '#e8b23a',
    neutral: '#8a8f98',
    background: '#ffffff',
    text: '#101418',
  },
  fonts: { heading: 'Arial', body: 'Arial' }, // universally available for sample files
  logoAssetIds: [],
};

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${(n++).toString(16).padStart(12, '0')}`;

const DEMO_FILLS: Record<string, RecipeFill['slots']> = {
  'quote-card': {
    quote: { kind: 'text', text: 'The best brands are built one consistent post at a time.' },
    authorName: { kind: 'text', text: 'Alex Rivera' },
    authorTitle: { kind: 'text', text: 'CMO, Acme Robotics' },
  },
  'stat-card': {
    statValue: { kind: 'text', text: '73%' },
    statLabel: { kind: 'text', text: 'of B2B buyers check LinkedIn before a first meeting' },
    context: { kind: 'text', text: 'Source: 2026 B2B Buyer Behaviour Survey' },
  },
  'big-headline-icons': {
    headline: { kind: 'text', text: 'Stop posting. Start compounding.' },
    support: { kind: 'text', text: 'Three habits that turn LinkedIn activity into pipeline.' },
    icons: {
      kind: 'list',
      items: [
        { text: 'Consistency', iconName: 'calendar' },
        { text: 'Voice', iconName: 'mic' },
        { text: 'Proof', iconName: 'bar-chart' },
      ],
    },
  },
  'photo-hero-card': {
    photo: { kind: 'image', assetId: 'demo-photo-1' }, // placeholder rect until a library photo is attached
    headline: { kind: 'text', text: 'We just shipped the biggest release in our history' },
    kicker: { kind: 'text', text: 'Product update' },
    badge: { kind: 'text', text: 'NEW' },
  },
  'icon-grid-card': {
    headline: { kind: 'text', text: 'Everything a product launch touches' },
    items: {
      kind: 'list',
      items: [
        { text: 'Positioning', iconName: 'compass' },
        { text: 'Pricing', iconName: 'tag' },
        { text: 'Enablement', iconName: 'graduation-cap' },
        { text: 'Docs', iconName: 'book-open' },
        { text: 'Support', iconName: 'life-buoy' },
        { text: 'Analytics', iconName: 'bar-chart-3' },
      ],
    },
  },
  'numbered-list-carousel': {
    hook: { kind: 'text', text: '5 hidden costs of manual QA' },
    kicker: { kind: 'text', text: 'Engineering ROI' },
    items: {
      kind: 'list',
      items: [
        { title: 'Release delays', text: 'Every manual pass adds days to the cycle.' },
        { title: 'Escaped defects', text: 'Humans miss what scripts catch every time.' },
        { title: 'Team burnout', text: 'Repetitive testing drains your best engineers.' },
        { title: 'Opportunity cost', text: 'Hours spent clicking are hours not building.' },
        { title: 'Scaling walls', text: 'Manual coverage cannot grow with your product.' },
      ],
    },
    cta: { kind: 'text', text: 'Ready to automate? Follow for weekly QA insights.' },
  },
  'problem-insight-recommendation': {
    hook: { kind: 'text', text: 'Your content calendar is not the problem' },
    problemTitle: { kind: 'text', text: 'Posting without a point of view' },
    problem: { kind: 'text', text: 'Most company pages publish generic industry content nobody remembers.' },
    insightTitle: { kind: 'text', text: 'Audiences follow opinions, not logos' },
    insight: { kind: 'text', text: 'The accounts that grow take positions and defend them consistently.' },
    recommendationTitle: { kind: 'text', text: 'Pick three hills to stand on' },
    recommendation: { kind: 'text', text: 'Define three strong opinions and let every post reinforce one of them.' },
    cta: { kind: 'text', text: 'Save this framework for your next planning session.' },
  },
  'checklist-carousel': {
    hook: { kind: 'text', text: 'The pre-launch LinkedIn checklist' },
    items: {
      kind: 'list',
      items: [
        { title: 'Page basics done', text: 'Banner, tagline and about section aligned to the launch.' },
        { title: 'Team briefed', text: 'Everyone knows the launch post and when to engage.' },
        { title: 'Content queued', text: 'Announcement, follow-up and founder POV scheduled.' },
      ],
    },
    cta: { kind: 'text', text: 'Launching soon? Save this checklist.' },
  },
};

const outDir = join(import.meta.dirname, '..', '..', '..', 'examples');
mkdirSync(outDir, { recursive: true });

for (const recipe of RECIPES) {
  const slots = DEMO_FILLS[recipe.id];
  if (!slots) continue;
  const ctx: LayoutContext = {
    documentId: uuid(),
    brandProfileId: 'demo-brand',
    clientCompanyId: 'demo-client',
    brandTokens: brand,
    variant: recipe.variants[0]!.id,
    seed: 7,
    newId: uuid,
  };
  const doc = (recipe as LayoutRecipe).layout({ slots }, ctx);

  exportAllPagesSvg(doc).forEach((svg, i) => {
    writeFileSync(join(outDir, `${recipe.id}${doc.pages.length > 1 ? `-slide-${i + 1}` : ''}.svg`), svg);
  });
  const pptx = await exportPptx(doc);
  writeFileSync(join(outDir, `${recipe.id}.pptx`), pptx);
  console.log(`✓ ${recipe.id}: ${doc.pages.length} page(s) → SVG + PPTX`);
}
console.log(`\nSamples written to ${outDir}`);
