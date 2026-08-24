/**
 * Bundled unDraw-style illustration manifest.
 *
 * unDraw's per-illustration CDN URLs are hashed and unstable, so we do NOT
 * hotlink them — we bundle the SVG markup here and serve it locally (no
 * network at serve time). Every illustration carries unDraw's signature accent
 * colour `#6c63ff` LITERALLY so the adapter can find-replace it to a brand hue.
 *
 * Provenance note: these are clean, hand-authored flat scene illustrations in
 * the unDraw single-accent style (not copies of specific unDraw artworks). They
 * are original to this repo and therefore unencumbered — the `undraw` provider
 * spec (tier 1, no attribution) applies cleanly. Expanded (~55 scenes) for
 * 29FORWARD-style LinkedIn carousels: cartoon characters, charts, B2B metaphors.
 * Do NOT scrape real unDraw/Storyset into this pool (licence forbids competing
 * redistribution).
 *
 * Palette (matches the unDraw look):
 *   accent  #6c63ff  (recoloured at serve time)
 *   ink     #3f3d56  (dark neutral — figures, outlines)
 *   mid     #a0a0b8  (secondary)
 *   light   #e6e6e6 / #f2f2f2 (fills, ground)
 *   skin    #ffb8b8  (unDraw's stock skin tone)
 */

import { UNDRAW_MANIFEST_EXTRA } from './undraw-manifest-extra.js';
import { UNDRAW_MANIFEST_EXTRA2 } from './undraw-manifest-extra2.js';

export interface UndrawEntry {
  /** kebab-case id, used as providerId. */
  slug: string;
  title: string;
  keywords: string[];
  /** Full inline SVG markup. Keeps `#6c63ff` literal for recolouring. */
  svg: string;
}

// Compact helper: every SVG shares the same viewBox so results tile evenly.
const VB = '0 0 400 300';

export const UNDRAW_MANIFEST_CORE: UndrawEntry[] = [
  {
    slug: 'person-at-desk',
    title: 'Person at desk',
    keywords: ['work', 'desk', 'office', 'writing', 'focus', 'productivity', 'laptop', 'workspace'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="268" rx="150" ry="14" fill="#e6e6e6"/><rect x="90" y="180" width="220" height="14" rx="4" fill="#3f3d56"/><rect x="110" y="194" width="12" height="60" fill="#3f3d56"/><rect x="278" y="194" width="12" height="60" fill="#3f3d56"/><rect x="150" y="120" width="70" height="60" rx="4" fill="#6c63ff"/><rect x="158" y="128" width="54" height="38" rx="2" fill="#f2f2f2"/><rect x="170" y="176" width="30" height="10" fill="#3f3d56"/><circle cx="250" cy="130" r="18" fill="#ffb8b8"/><path d="M232 148h36v32h-36z" fill="#6c63ff"/><rect x="238" y="180" width="8" height="30" fill="#3f3d56"/><rect x="254" y="180" width="8" height="30" fill="#3f3d56"/></svg>`,
  },
  {
    slug: 'growth-chart',
    title: 'Growth chart',
    keywords: ['growth', 'chart', 'graph', 'analytics', 'increase', 'revenue', 'metrics', 'up', 'trend', 'stats'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="160" ry="12" fill="#e6e6e6"/><line x1="70" y1="60" x2="70" y2="240" stroke="#3f3d56" stroke-width="4"/><line x1="70" y1="240" x2="340" y2="240" stroke="#3f3d56" stroke-width="4"/><rect x="100" y="180" width="30" height="60" fill="#e6e6e6"/><rect x="150" y="150" width="30" height="90" fill="#a0a0b8"/><rect x="200" y="110" width="30" height="130" fill="#e6e6e6"/><rect x="250" y="70" width="30" height="170" fill="#6c63ff"/><polyline points="90,200 145,175 195,140 260,90 320,70" fill="none" stroke="#6c63ff" stroke-width="4"/><polygon points="320,70 310,74 316,84" fill="#6c63ff"/></svg>`,
  },
  {
    slug: 'teamwork',
    title: 'Teamwork',
    keywords: ['team', 'teamwork', 'people', 'collaboration', 'group', 'together', 'community', 'partners'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="268" rx="160" ry="14" fill="#e6e6e6"/><circle cx="140" cy="120" r="24" fill="#ffb8b8"/><path d="M112 148h56v70h-56z" fill="#6c63ff"/><rect x="120" y="218" width="14" height="34" fill="#3f3d56"/><rect x="146" y="218" width="14" height="34" fill="#3f3d56"/><circle cx="260" cy="120" r="24" fill="#ffb8b8"/><path d="M232 148h56v70h-56z" fill="#3f3d56"/><rect x="240" y="218" width="14" height="34" fill="#6c63ff"/><rect x="266" y="218" width="14" height="34" fill="#6c63ff"/><path d="M168 175h64v10h-64z" fill="#a0a0b8"/></svg>`,
  },
  {
    slug: 'target-goal',
    title: 'Target goal',
    keywords: ['target', 'goal', 'aim', 'objective', 'bullseye', 'focus', 'strategy', 'success', 'accuracy'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="150" ry="12" fill="#e6e6e6"/><circle cx="200" cy="150" r="90" fill="#e6e6e6"/><circle cx="200" cy="150" r="62" fill="#f2f2f2"/><circle cx="200" cy="150" r="62" fill="none" stroke="#a0a0b8" stroke-width="3"/><circle cx="200" cy="150" r="34" fill="#6c63ff"/><circle cx="200" cy="150" r="12" fill="#f2f2f2"/><line x1="300" y1="60" x2="205" y2="146" stroke="#3f3d56" stroke-width="5"/><polygon points="205,146 218,150 214,138" fill="#3f3d56"/><polygon points="300,60 288,62 296,72" fill="#6c63ff"/></svg>`,
  },
  {
    slug: 'bright-idea',
    title: 'Bright idea',
    keywords: ['idea', 'lightbulb', 'creativity', 'innovation', 'brainstorm', 'insight', 'inspiration', 'think'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="270" rx="120" ry="12" fill="#e6e6e6"/><path d="M200 60a58 58 0 0 1 34 105c-8 6-10 12-10 22h-48c0-10-2-16-10-22A58 58 0 0 1 200 60z" fill="#6c63ff"/><rect x="176" y="195" width="48" height="12" rx="3" fill="#3f3d56"/><rect x="180" y="211" width="40" height="10" rx="3" fill="#3f3d56"/><rect x="184" y="225" width="32" height="10" rx="3" fill="#3f3d56"/><g stroke="#6c63ff" stroke-width="4" stroke-linecap="round"><line x1="200" y1="30" x2="200" y2="46"/><line x1="120" y1="110" x2="104" y2="110"/><line x1="280" y1="110" x2="296" y2="110"/><line x1="140" y1="55" x2="128" y2="43"/><line x1="260" y1="55" x2="272" y2="43"/></g><path d="M186 120l14 20 14-30" fill="none" stroke="#f2f2f2" stroke-width="4"/></svg>`,
  },
  {
    slug: 'rocket-launch',
    title: 'Rocket launch',
    keywords: ['rocket', 'launch', 'startup', 'growth', 'boost', 'space', 'takeoff', 'fast', 'ship', 'go'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="130" ry="12" fill="#e6e6e6"/><path d="M200 40c34 30 44 78 30 132h-60c-14-54-4-102 30-132z" fill="#f2f2f2"/><path d="M200 40c34 30 44 78 30 132h-30V40z" fill="#e6e6e6"/><circle cx="200" cy="104" r="18" fill="#6c63ff"/><circle cx="200" cy="104" r="8" fill="#f2f2f2"/><path d="M170 150l-26 26 10 22 32-16z" fill="#6c63ff"/><path d="M230 150l26 26-10 22-32-16z" fill="#6c63ff"/><path d="M185 172h30l-6 40h-18z" fill="#3f3d56"/><path d="M192 212h16l-8 30z" fill="#6c63ff"/></svg>`,
  },
  {
    slug: 'chat-bubbles',
    title: 'Chat conversation',
    keywords: ['chat', 'message', 'conversation', 'talk', 'comments', 'communication', 'bubbles', 'reply', 'social'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="270" rx="140" ry="12" fill="#e6e6e6"/><path d="M70 80h150a18 18 0 0 1 18 18v56a18 18 0 0 1-18 18H120l-30 26v-26H70a18 18 0 0 1-18-18V98A18 18 0 0 1 70 80z" fill="#6c63ff"/><g fill="#f2f2f2"><circle cx="110" cy="126" r="7"/><circle cx="145" cy="126" r="7"/><circle cx="180" cy="126" r="7"/></g><path d="M330 130H210a16 16 0 0 0-16 16v46a16 16 0 0 0 16 16h84l26 22v-22h10a16 16 0 0 0 16-16v-46a16 16 0 0 0-16-16z" fill="#e6e6e6"/><g fill="#a0a0b8"><rect x="214" y="152" width="96" height="9" rx="4"/><rect x="214" y="170" width="70" height="9" rx="4"/></g></svg>`,
  },
  {
    slug: 'checklist',
    title: 'Checklist',
    keywords: ['checklist', 'list', 'tasks', 'todo', 'done', 'complete', 'plan', 'organize', 'steps', 'progress'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="130" ry="12" fill="#e6e6e6"/><rect x="120" y="50" width="160" height="200" rx="8" fill="#f2f2f2"/><rect x="120" y="50" width="160" height="200" rx="8" fill="none" stroke="#a0a0b8" stroke-width="2"/><rect x="170" y="40" width="60" height="20" rx="6" fill="#3f3d56"/><g><rect x="140" y="90" width="22" height="22" rx="4" fill="#6c63ff"/><path d="M145 101l5 6 8-11" fill="none" stroke="#f2f2f2" stroke-width="3"/><rect x="172" y="96" width="86" height="10" rx="4" fill="#a0a0b8"/></g><g><rect x="140" y="128" width="22" height="22" rx="4" fill="#6c63ff"/><path d="M145 139l5 6 8-11" fill="none" stroke="#f2f2f2" stroke-width="3"/><rect x="172" y="134" width="86" height="10" rx="4" fill="#a0a0b8"/></g><g><rect x="140" y="166" width="22" height="22" rx="4" fill="#e6e6e6" stroke="#a0a0b8" stroke-width="2"/><rect x="172" y="172" width="70" height="10" rx="4" fill="#e6e6e6"/></g><g><rect x="140" y="204" width="22" height="22" rx="4" fill="#e6e6e6" stroke="#a0a0b8" stroke-width="2"/><rect x="172" y="210" width="78" height="10" rx="4" fill="#e6e6e6"/></g></svg>`,
  },
  {
    slug: 'presentation',
    title: 'Presentation',
    keywords: ['presentation', 'pitch', 'slides', 'meeting', 'speaker', 'report', 'board', 'talk', 'business'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="150" ry="12" fill="#e6e6e6"/><rect x="90" y="50" width="170" height="120" rx="6" fill="#f2f2f2"/><rect x="90" y="50" width="170" height="120" rx="6" fill="none" stroke="#3f3d56" stroke-width="3"/><rect x="105" y="70" width="70" height="10" rx="4" fill="#a0a0b8"/><polyline points="110,150 130,120 150,135 180,95 220,110" fill="none" stroke="#6c63ff" stroke-width="4"/><line x1="175" y1="170" x2="175" y2="200" stroke="#3f3d56" stroke-width="4"/><circle cx="300" cy="110" r="18" fill="#ffb8b8"/><path d="M276 136h48v56h-48z" fill="#6c63ff"/><rect x="282" y="192" width="12" height="30" fill="#3f3d56"/><rect x="306" y="192" width="12" height="30" fill="#3f3d56"/><line x1="276" y1="150" x2="250" y2="130" stroke="#ffb8b8" stroke-width="8" stroke-linecap="round"/></svg>`,
  },
  {
    slug: 'mobile-app',
    title: 'Mobile app',
    keywords: ['mobile', 'app', 'phone', 'smartphone', 'device', 'responsive', 'ux', 'ui', 'screen'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="120" ry="12" fill="#e6e6e6"/><rect x="150" y="40" width="100" height="200" rx="16" fill="#3f3d56"/><rect x="158" y="56" width="84" height="160" rx="4" fill="#f2f2f2"/><rect x="184" y="46" width="32" height="6" rx="3" fill="#a0a0b8"/><circle cx="200" cy="226" r="8" fill="#a0a0b8"/><rect x="168" y="70" width="64" height="34" rx="4" fill="#6c63ff"/><g fill="#e6e6e6"><rect x="168" y="114" width="30" height="30" rx="4"/><rect x="202" y="114" width="30" height="30" rx="4"/><rect x="168" y="150" width="30" height="30" rx="4"/><rect x="202" y="150" width="30" height="30" rx="4"/></g><circle cx="183" cy="129" r="6" fill="#6c63ff"/></svg>`,
  },
  {
    slug: 'analytics-dashboard',
    title: 'Analytics dashboard',
    keywords: ['analytics', 'dashboard', 'data', 'metrics', 'report', 'stats', 'charts', 'kpi', 'insights', 'monitor'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="150" ry="12" fill="#e6e6e6"/><rect x="70" y="50" width="260" height="180" rx="8" fill="#f2f2f2"/><rect x="70" y="50" width="260" height="30" rx="8" fill="#3f3d56"/><g fill="#6c63ff"><circle cx="88" cy="65" r="5"/><circle cx="104" cy="65" r="5" fill="#a0a0b8"/><circle cx="120" cy="65" r="5" fill="#e6e6e6"/></g><circle cx="130" cy="150" r="42" fill="#e6e6e6"/><path d="M130 150V108a42 42 0 0 1 36 63z" fill="#6c63ff"/><path d="M130 150l36 21a42 42 0 0 1-70-8z" fill="#a0a0b8"/><g fill="#6c63ff"><rect x="210" y="150" width="18" height="50" rx="2"/><rect x="236" y="120" width="18" height="80" rx="2" fill="#a0a0b8"/><rect x="262" y="100" width="18" height="100" rx="2"/><rect x="288" y="140" width="18" height="60" rx="2" fill="#a0a0b8"/></g></svg>`,
  },
  {
    slug: 'email-campaign',
    title: 'Email campaign',
    keywords: ['email', 'mail', 'newsletter', 'campaign', 'send', 'message', 'inbox', 'marketing', 'outreach'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="270" rx="140" ry="12" fill="#e6e6e6"/><rect x="110" y="90" width="180" height="120" rx="8" fill="#f2f2f2"/><rect x="110" y="90" width="180" height="120" rx="8" fill="none" stroke="#3f3d56" stroke-width="3"/><path d="M110 96l90 66 90-66" fill="none" stroke="#6c63ff" stroke-width="4"/><path d="M110 204l64-52M290 204l-64-52" fill="none" stroke="#a0a0b8" stroke-width="3"/><circle cx="290" cy="90" r="20" fill="#6c63ff"/><path d="M282 90h16M290 82v16" stroke="#f2f2f2" stroke-width="3"/></svg>`,
  },
  {
    slug: 'handshake-deal',
    title: 'Handshake deal',
    keywords: ['deal', 'handshake', 'agreement', 'partnership', 'contract', 'trust', 'business', 'client', 'close'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="270" rx="150" ry="12" fill="#e6e6e6"/><path d="M60 150l70-20 40 30-24 20z" fill="#ffb8b8"/><path d="M340 150l-70-20-40 30 24 20z" fill="#ffb8b8"/><path d="M150 165l40 24a10 10 0 0 0 14-2l6-8" fill="none" stroke="#3f3d56" stroke-width="6" stroke-linecap="round"/><rect x="40" y="120" width="70" height="40" rx="6" fill="#6c63ff" transform="rotate(-12 75 140)"/><rect x="290" y="120" width="70" height="40" rx="6" fill="#3f3d56" transform="rotate(12 325 140)"/></svg>`,
  },
  {
    slug: 'search-discovery',
    title: 'Search discovery',
    keywords: ['search', 'find', 'discover', 'explore', 'seo', 'research', 'magnify', 'look', 'query'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="130" ry="12" fill="#e6e6e6"/><circle cx="180" cy="130" r="70" fill="none" stroke="#6c63ff" stroke-width="14"/><circle cx="180" cy="130" r="52" fill="#f2f2f2"/><line x1="230" y1="182" x2="290" y2="242" stroke="#3f3d56" stroke-width="18" stroke-linecap="round"/><g fill="#a0a0b8"><rect x="150" y="118" width="60" height="8" rx="4"/><rect x="150" y="134" width="44" height="8" rx="4"/></g></svg>`,
  },
  {
    slug: 'calendar-schedule',
    title: 'Calendar schedule',
    keywords: ['calendar', 'schedule', 'date', 'plan', 'event', 'deadline', 'time', 'appointment', 'booking'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="130" ry="12" fill="#e6e6e6"/><rect x="110" y="70" width="180" height="160" rx="10" fill="#f2f2f2"/><rect x="110" y="70" width="180" height="40" rx="10" fill="#6c63ff"/><rect x="140" y="56" width="12" height="30" rx="4" fill="#3f3d56"/><rect x="248" y="56" width="12" height="30" rx="4" fill="#3f3d56"/><g fill="#e6e6e6"><rect x="128" y="124" width="24" height="20" rx="3"/><rect x="164" y="124" width="24" height="20" rx="3"/><rect x="200" y="124" width="24" height="20" rx="3"/><rect x="236" y="124" width="24" height="20" rx="3"/><rect x="128" y="156" width="24" height="20" rx="3"/><rect x="164" y="156" width="24" height="20" rx="3"/><rect x="236" y="156" width="24" height="20" rx="3"/><rect x="128" y="188" width="24" height="20" rx="3"/><rect x="200" y="188" width="24" height="20" rx="3"/></g><rect x="200" y="156" width="24" height="20" rx="3" fill="#6c63ff"/></svg>`,
  },
  {
    slug: 'secure-shield',
    title: 'Security shield',
    keywords: ['security', 'shield', 'secure', 'protect', 'privacy', 'safe', 'trust', 'lock', 'guard', 'defense'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="110" ry="12" fill="#e6e6e6"/><path d="M200 50l80 28v66c0 52-34 80-80 96-46-16-80-44-80-96V78z" fill="#6c63ff"/><path d="M200 50l80 28v66c0 52-34 80-80 96z" fill="#3f3d56" opacity="0.15"/><path d="M168 148l22 24 44-52" fill="none" stroke="#f2f2f2" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    slug: 'content-writing',
    title: 'Content writing',
    keywords: ['writing', 'content', 'blog', 'article', 'copy', 'author', 'pen', 'document', 'draft', 'post'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="130" ry="12" fill="#e6e6e6"/><rect x="110" y="60" width="160" height="190" rx="6" fill="#f2f2f2"/><rect x="110" y="60" width="160" height="190" rx="6" fill="none" stroke="#a0a0b8" stroke-width="2"/><g fill="#a0a0b8"><rect x="130" y="90" width="120" height="9" rx="4"/><rect x="130" y="110" width="120" height="9" rx="4"/><rect x="130" y="130" width="90" height="9" rx="4"/><rect x="130" y="160" width="120" height="9" rx="4"/><rect x="130" y="180" width="70" height="9" rx="4"/></g><rect x="230" y="120" width="20" height="120" rx="4" fill="#6c63ff" transform="rotate(38 240 180)"/><polygon points="272,224 286,236 268,240" fill="#3f3d56" transform="rotate(38 240 180)"/></svg>`,
  },
  {
    slug: 'connected-network',
    title: 'Connected network',
    keywords: ['network', 'connection', 'nodes', 'link', 'graph', 'integration', 'system', 'connected', 'web', 'api'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="140" ry="12" fill="#e6e6e6"/><g stroke="#a0a0b8" stroke-width="3"><line x1="200" y1="150" x2="90" y2="80"/><line x1="200" y1="150" x2="310" y2="80"/><line x1="200" y1="150" x2="80" y2="210"/><line x1="200" y1="150" x2="320" y2="210"/><line x1="90" y1="80" x2="310" y2="80"/></g><circle cx="200" cy="150" r="26" fill="#6c63ff"/><circle cx="90" cy="80" r="16" fill="#3f3d56"/><circle cx="310" cy="80" r="16" fill="#3f3d56"/><circle cx="80" cy="210" r="16" fill="#3f3d56"/><circle cx="320" cy="210" r="16" fill="#3f3d56"/><circle cx="200" cy="150" r="10" fill="#f2f2f2"/></svg>`,
  },
  {
    slug: 'celebration-award',
    title: 'Celebration award',
    keywords: ['award', 'win', 'trophy', 'celebrate', 'success', 'achievement', 'winner', 'prize', 'reward', 'recognition'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="110" ry="12" fill="#e6e6e6"/><path d="M140 60h120v18a60 60 0 0 1-120 0z" fill="#6c63ff"/><path d="M140 68h-24a24 24 0 0 0 24 30zM260 68h24a24 24 0 0 1-24 30z" fill="none" stroke="#3f3d56" stroke-width="6"/><rect x="188" y="132" width="24" height="34" fill="#3f3d56"/><path d="M160 166h80l-10 22h-60z" fill="#6c63ff"/><rect x="150" y="188" width="100" height="14" rx="4" fill="#3f3d56"/><path d="M200 78l6 14 15 1-11 10 3 15-13-8-13 8 3-15-11-10 15-1z" fill="#f2f2f2"/></svg>`,
  },
  {
    slug: 'settings-gears',
    title: 'Settings gears',
    keywords: ['settings', 'gears', 'config', 'setup', 'process', 'automation', 'engine', 'system', 'mechanics', 'workflow'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="130" ry="12" fill="#e6e6e6"/><g fill="#6c63ff"><path d="M170 90l10 2 6-10 14 6-2 12 8 8 12-4 6 14-10 8 2 10 12 2v16l-12 2-4 10 8 10-10 12-12-6-8 6 2 12-16 2-4-12-10-2-8 10-12-10 6-12-6-8-12 2-4-16 12-6v-10l-12-6 6-14 12 2 6-10z"/></g><circle cx="180" cy="140" r="30" fill="#f2f2f2"/><circle cx="180" cy="140" r="14" fill="#3f3d56"/><g fill="#3f3d56"><path d="M262 176l8 2 4-8 10 5-2 9 6 6 9-3 4 10-8 6 2 8 9 1v11l-9 2-3 7 6 8-8 8-8-4-6 4 1 9-11 1-3-9-7-1-6 7-8-8 4-8-4-6-9 1-3-11 8-4v-7l-8-4 4-10 9 1 4-8z"/></g><circle cx="288" cy="200" r="20" fill="#f2f2f2"/><circle cx="288" cy="200" r="9" fill="#6c63ff"/></svg>`,
  },
  {
    slug: 'video-content',
    title: 'Video content',
    keywords: ['video', 'play', 'media', 'watch', 'stream', 'film', 'reel', 'content', 'youtube', 'clip'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="140" ry="12" fill="#e6e6e6"/><rect x="90" y="70" width="220" height="140" rx="10" fill="#3f3d56"/><rect x="104" y="84" width="192" height="112" rx="4" fill="#f2f2f2"/><circle cx="200" cy="140" r="34" fill="#6c63ff"/><polygon points="190,124 190,156 216,140" fill="#f2f2f2"/><rect x="150" y="216" width="100" height="10" rx="4" fill="#a0a0b8"/></svg>`,
  },
  {
    slug: 'audience-reach',
    title: 'Audience reach',
    keywords: ['audience', 'reach', 'megaphone', 'announce', 'broadcast', 'promotion', 'marketing', 'voice', 'shout', 'engagement'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="140" ry="12" fill="#e6e6e6"/><path d="M110 130l120-46v92z" fill="#6c63ff"/><rect x="80" y="118" width="34" height="24" rx="4" fill="#3f3d56"/><rect x="228" y="70" width="14" height="120" rx="6" fill="#3f3d56"/><rect x="150" y="176" width="26" height="40" rx="6" fill="#a0a0b8"/><g stroke="#6c63ff" stroke-width="5" stroke-linecap="round" fill="none"><path d="M266 100a40 40 0 0 1 0 60"/><path d="M286 84a68 68 0 0 1 0 92"/></g></svg>`,
  },
  {
    slug: 'qa-tester-bug',
    title: 'QA tester finding bug',
    keywords: ['qa', 'testing', 'bug', 'quality', 'defect', 'software', 'tester', 'debug', 'issue', 'inspection', 'verify', 'find'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="140" ry="12" fill="#e6e6e6"/><rect x="80" y="80" width="180" height="120" rx="8" fill="#f2f2f2"/><rect x="80" y="80" width="180" height="120" rx="8" fill="none" stroke="#3f3d56" stroke-width="2"/><rect x="100" y="100" width="140" height="10" rx="4" fill="#a0a0b8"/><rect x="100" y="120" width="100" height="10" rx="4" fill="#e6e6e6"/><circle cx="230" cy="160" r="22" fill="#6c63ff"/><path d="M220 150h20v6h-20zM218 162h24v4h-24z" fill="#f2f2f2"/><line x1="230" y1="138" x2="230" y2="128" stroke="#3f3d56" stroke-width="3"/><circle cx="230" cy="124" r="4" fill="#3f3d56"/><circle cx="300" cy="130" r="18" fill="#ffb8b8"/><path d="M278 152h44v50h-44z" fill="#6c63ff"/><rect x="286" y="202" width="10" height="28" fill="#3f3d56"/><rect x="304" y="202" width="10" height="28" fill="#3f3d56"/><line x1="278" y1="165" x2="260" y2="145" stroke="#ffb8b8" stroke-width="8" stroke-linecap="round"/></svg>`,
  },
  {
    slug: 'developer-coding',
    title: 'Developer coding',
    keywords: ['developer', 'coding', 'programmer', 'code', 'software', 'engineer', 'laptop', 'tech', 'build', 'dev', 'keyboard', 'screen'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="150" ry="12" fill="#e6e6e6"/><rect x="90" y="100" width="200" height="130" rx="8" fill="#3f3d56"/><rect x="100" y="110" width="180" height="100" rx="4" fill="#f2f2f2"/><g fill="#6c63ff"><rect x="112" y="122" width="40" height="6" rx="2"/><rect x="112" y="136" width="60" height="6" rx="2"/><rect x="112" y="150" width="50" height="6" rx="2"/><rect x="112" y="164" width="70" height="6" rx="2"/></g><rect x="130" y="230" width="120" height="8" rx="3" fill="#a0a0b8"/><circle cx="280" cy="120" r="20" fill="#ffb8b8"/><path d="M256 144h48v60h-48z" fill="#6c63ff"/><rect x="264" y="204" width="12" height="32" fill="#3f3d56"/><rect x="284" y="204" width="12" height="32" fill="#3f3d56"/></svg>`,
  },
  {
    slug: 'manager-pointing',
    title: 'Manager pointing',
    keywords: ['manager', 'leader', 'pointing', 'direction', 'leadership', 'boss', 'guide', 'strategy', 'supervisor', 'instruct', 'team lead'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="140" ry="12" fill="#e6e6e6"/><rect x="60" y="70" width="160" height="110" rx="6" fill="#f2f2f2"/><rect x="60" y="70" width="160" height="110" rx="6" fill="none" stroke="#3f3d56" stroke-width="2"/><rect x="80" y="90" width="80" height="8" rx="4" fill="#a0a0b8"/><rect x="80" y="108" width="120" height="8" rx="4" fill="#e6e6e6"/><rect x="80" y="126" width="90" height="8" rx="4" fill="#e6e6e6"/><rect x="80" y="150" width="50" height="20" rx="4" fill="#6c63ff"/><circle cx="280" cy="110" r="22" fill="#ffb8b8"/><path d="M254 136h52v64h-52z" fill="#3f3d56"/><rect x="262" y="200" width="14" height="36" fill="#6c63ff"/><rect x="284" y="200" width="14" height="36" fill="#6c63ff"/><line x1="254" y1="150" x2="220" y2="120" stroke="#ffb8b8" stroke-width="10" stroke-linecap="round"/><line x1="220" y1="120" x2="180" y2="115" stroke="#ffb8b8" stroke-width="8" stroke-linecap="round"/></svg>`,
  },
  {
    slug: 'team-huddle',
    title: 'Team huddle',
    keywords: ['team', 'huddle', 'meeting', 'standup', 'collaboration', 'group', 'circle', 'sync', 'together', 'discussion', 'agile', 'scrum'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="150" ry="12" fill="#e6e6e6"/><circle cx="200" cy="160" r="50" fill="none" stroke="#a0a0b8" stroke-width="2" stroke-dasharray="8 6"/><circle cx="200" cy="100" r="16" fill="#ffb8b8"/><path d="M184 118h32v50h-32z" fill="#6c63ff"/><rect x="190" y="168" width="10" height="28" fill="#3f3d56"/><rect x="200" y="168" width="10" height="28" fill="#3f3d56"/><circle cx="130" cy="150" r="14" fill="#ffb8b8"/><path d="M116 166h28v44h-28z" fill="#3f3d56"/><circle cx="270" cy="150" r="14" fill="#ffb8b8"/><path d="M256 166h28v44h-28z" fill="#6c63ff"/><circle cx="160" cy="200" r="14" fill="#ffb8b8"/><path d="M146 216h28v40h-28z" fill="#6c63ff"/><circle cx="240" cy="200" r="14" fill="#ffb8b8"/><path d="M226 216h28v40h-28z" fill="#3f3d56"/></svg>`,
  },
  {
    slug: 'person-thinking',
    title: 'Person thinking',
    keywords: ['thinking', 'thought', 'idea', 'ponder', 'reflect', 'consider', 'brainstorm', 'contemplate', 'decision', 'mind', 'question', 'wonder'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="120" ry="12" fill="#e6e6e6"/><circle cx="200" cy="130" r="24" fill="#ffb8b8"/><path d="M172 158h56v70h-56z" fill="#6c63ff"/><rect x="180" y="228" width="14" height="30" fill="#3f3d56"/><rect x="206" y="228" width="14" height="30" fill="#3f3d56"/><line x1="196" y1="120" x2="186" y2="108" stroke="#3f3d56" stroke-width="4" stroke-linecap="round"/><line x1="204" y1="120" x2="214" y2="108" stroke="#3f3d56" stroke-width="4" stroke-linecap="round"/><circle cx="260" cy="70" r="28" fill="#f2f2f2" stroke="#6c63ff" stroke-width="3"/><text x="260" y="78" text-anchor="middle" font-size="28" fill="#6c63ff">?</text><circle cx="290" cy="50" r="12" fill="#e6e6e6"/><circle cx="310" cy="35" r="8" fill="#e6e6e6"/></svg>`,
  },
  {
    slug: 'person-celebrating',
    title: 'Person celebrating',
    keywords: ['celebrate', 'celebration', 'success', 'happy', 'win', 'achievement', 'joy', 'excited', 'victory', 'cheer', 'milestone', 'accomplish'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="130" ry="12" fill="#e6e6e6"/><circle cx="200" cy="110" r="22" fill="#ffb8b8"/><path d="M172 136h56v60h-56z" fill="#6c63ff"/><line x1="172" y1="150" x2="140" y2="90" stroke="#ffb8b8" stroke-width="10" stroke-linecap="round"/><line x1="228" y1="150" x2="260" y2="90" stroke="#ffb8b8" stroke-width="10" stroke-linecap="round"/><rect x="182" y="196" width="12" height="40" fill="#3f3d56"/><rect x="206" y="196" width="12" height="40" fill="#3f3d56"/><g fill="#6c63ff"><rect x="100" y="60" width="8" height="16" rx="2" transform="rotate(20 104 68)"/><rect x="300" y="50" width="8" height="16" rx="2" transform="rotate(-30 304 58)"/><circle cx="120" cy="45" r="5"/><circle cx="290" cy="40" r="5"/><circle cx="310" cy="70" r="4"/></g></svg>`,
  },
  {
    slug: 'person-stressed',
    title: 'Person stressed',
    keywords: ['stressed', 'stress', 'overwhelmed', 'burnout', 'pressure', 'anxiety', 'tired', 'deadline', 'workload', 'exhausted', 'frustrated', 'busy'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="130" ry="12" fill="#e6e6e6"/><rect x="100" y="180" width="200" height="14" rx="4" fill="#3f3d56"/><rect x="120" y="100" width="50" height="80" rx="4" fill="#e6e6e6"/><rect x="180" y="80" width="50" height="100" rx="4" fill="#a0a0b8"/><rect x="240" y="90" width="50" height="90" rx="4" fill="#6c63ff"/><circle cx="200" cy="130" r="20" fill="#ffb8b8"/><path d="M176 152h48v50h-48z" fill="#3f3d56"/><rect x="184" y="202" width="10" height="28" fill="#6c63ff"/><rect x="206" y="202" width="10" height="28" fill="#6c63ff"/><line x1="190" y1="125" x2="182" y2="118" stroke="#3f3d56" stroke-width="3"/><line x1="210" y1="125" x2="218" y2="118" stroke="#3f3d56" stroke-width="3"/><path d="M188 138q12 6 24 0" fill="none" stroke="#3f3d56" stroke-width="2"/></svg>`,
  },
  {
    slug: 'person-presenting',
    title: 'Person presenting',
    keywords: ['presenting', 'presentation', 'speaker', 'pitch', 'talk', 'slides', 'audience', 'public speaking', 'webinar', 'demo', 'showcase', 'explain'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="150" ry="12" fill="#e6e6e6"/><rect x="50" y="60" width="140" height="100" rx="6" fill="#f2f2f2"/><rect x="50" y="60" width="140" height="100" rx="6" fill="none" stroke="#3f3d56" stroke-width="2"/><rect x="70" y="80" width="60" height="8" rx="4" fill="#a0a0b8"/><polyline points="70,130 90,110 110,120 140,90" fill="none" stroke="#6c63ff" stroke-width="3"/><line x1="120" y1="160" x2="120" y2="190" stroke="#3f3d56" stroke-width="4"/><circle cx="260" cy="110" r="20" fill="#ffb8b8"/><path d="M236 134h48v60h-48z" fill="#6c63ff"/><rect x="244" y="194" width="12" height="34" fill="#3f3d56"/><rect x="264" y="194" width="12" height="34" fill="#3f3d56"/><line x1="236" y1="148" x2="190" y2="120" stroke="#ffb8b8" stroke-width="8" stroke-linecap="round"/><circle cx="320" cy="200" r="10" fill="#a0a0b8"/><circle cx="340" cy="210" r="8" fill="#e6e6e6"/></svg>`,
  },
  {
    slug: 'two-people-debate',
    title: 'Two people debating',
    keywords: ['debate', 'discussion', 'argument', 'disagree', 'dialogue', 'opposing', 'conversation', 'conflict', 'negotiate', 'compare', 'views', 'exchange'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="150" ry="12" fill="#e6e6e6"/><circle cx="130" cy="110" r="20" fill="#ffb8b8"/><path d="M106 132h48v64h-48z" fill="#6c63ff"/><rect x="114" y="196" width="12" height="36" fill="#3f3d56"/><rect x="134" y="196" width="12" height="36" fill="#3f3d56"/><line x1="154" y1="145" x2="180" y2="155" stroke="#ffb8b8" stroke-width="8" stroke-linecap="round"/><circle cx="270" cy="110" r="20" fill="#ffb8b8"/><path d="M246 132h48v64h-48z" fill="#3f3d56"/><rect x="254" y="196" width="12" height="36" fill="#6c63ff"/><rect x="274" y="196" width="12" height="36" fill="#6c63ff"/><line x1="246" y1="145" x2="220" y2="155" stroke="#ffb8b8" stroke-width="8" stroke-linecap="round"/><path d="M175 80h50v36a25 25 0 0 1-50 0z" fill="#f2f2f2" stroke="#a0a0b8" stroke-width="2"/><text x="200" y="104" text-anchor="middle" font-size="20" fill="#6c63ff">vs</text></svg>`,
  },
  {
    slug: 'mentor-coaching',
    title: 'Mentor coaching',
    keywords: ['mentor', 'coaching', 'mentorship', 'guidance', 'teach', 'advice', 'support', 'develop', 'learn', 'growth', 'career', 'feedback'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="140" ry="12" fill="#e6e6e6"/><circle cx="160" cy="100" r="22" fill="#ffb8b8"/><path d="M134 124h52v70h-52z" fill="#3f3d56"/><rect x="142" y="194" width="12" height="38" fill="#6c63ff"/><rect x="166" y="194" width="12" height="38" fill="#6c63ff"/><circle cx="260" cy="120" r="18" fill="#ffb8b8"/><path d="M238 140h44v54h-44z" fill="#6c63ff"/><rect x="246" y="194" width="10" height="38" fill="#3f3d56"/><rect x="264" y="194" width="10" height="38" fill="#3f3d56"/><line x1="186" y1="140" x2="238" y2="155" stroke="#ffb8b8" stroke-width="8" stroke-linecap="round"/><rect x="200" y="70" width="80" height="50" rx="4" fill="#f2f2f2" stroke="#6c63ff" stroke-width="2"/><rect x="212" y="82" width="56" height="6" rx="3" fill="#a0a0b8"/><rect x="212" y="96" width="40" height="6" rx="3" fill="#e6e6e6"/></svg>`,
  },
  {
    slug: 'remote-worker',
    title: 'Remote worker',
    keywords: ['remote', 'work from home', 'wfh', 'hybrid', 'telecommute', 'home office', 'virtual', 'distributed', 'online', 'freelance', 'desk', 'laptop'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="140" ry="12" fill="#e6e6e6"/><rect x="70" y="140" width="180" height="12" rx="4" fill="#3f3d56"/><rect x="90" y="152" width="10" height="50" fill="#3f3d56"/><rect x="220" y="152" width="10" height="50" fill="#3f3d56"/><rect x="120" y="90" width="80" height="50" rx="4" fill="#6c63ff"/><rect x="128" y="98" width="64" height="34" rx="2" fill="#f2f2f2"/><circle cx="260" cy="110" r="18" fill="#ffb8b8"/><path d="M238 130h44v50h-44z" fill="#3f3d56"/><rect x="246" y="180" width="10" height="34" fill="#6c63ff"/><rect x="264" y="180" width="10" height="34" fill="#6c63ff"/><path d="M60 60h100v70h-100z" fill="#f2f2f2" stroke="#a0a0b8" stroke-width="2"/><rect x="72" y="72" width="30" height="40" rx="2" fill="#e6e6e6"/><rect x="110" y="80" width="40" height="6" rx="3" fill="#a0a0b8"/></svg>`,
  },
  {
    slug: 'customer-support',
    title: 'Customer support',
    keywords: ['support', 'customer', 'help', 'service', 'headset', 'call center', 'assist', 'care', 'ticket', 'resolve', 'agent', 'contact'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="130" ry="12" fill="#e6e6e6"/><circle cx="200" cy="120" r="22" fill="#ffb8b8"/><path d="M172 144h56v66h-56z" fill="#6c63ff"/><rect x="182" y="210" width="12" height="34" fill="#3f3d56"/><rect x="206" y="210" width="12" height="34" fill="#3f3d56"/><path d="M170 115a30 30 0 0 1 60 0v10h-60z" fill="#3f3d56"/><rect x="158" y="118" width="14" height="24" rx="6" fill="#3f3d56"/><rect x="228" y="118" width="14" height="24" rx="6" fill="#3f3d56"/><path d="M100 100h50a20 20 0 0 1 20 20v10H100z" fill="#f2f2f2" stroke="#6c63ff" stroke-width="2"/><rect x="110" y="115" width="30" height="6" rx="3" fill="#a0a0b8"/><rect x="110" y="128" width="20" height="6" rx="3" fill="#e6e6e6"/></svg>`,
  },
  {
    slug: 'data-analyst',
    title: 'Data analyst',
    keywords: ['data', 'analyst', 'analytics', 'insights', 'report', 'metrics', 'dashboard', 'spreadsheet', 'numbers', 'statistics', 'kpi', 'research'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="140" ry="12" fill="#e6e6e6"/><rect x="80" y="80" width="160" height="120" rx="8" fill="#f2f2f2"/><rect x="80" y="80" width="160" height="120" rx="8" fill="none" stroke="#3f3d56" stroke-width="2"/><g fill="#6c63ff"><rect x="100" y="150" width="20" height="40" rx="2"/><rect x="130" y="120" width="20" height="70" rx="2" fill="#a0a0b8"/><rect x="160" y="100" width="20" height="90" rx="2"/><rect x="190" y="130" width="20" height="60" rx="2" fill="#a0a0b8"/></g><circle cx="290" cy="120" r="18" fill="#ffb8b8"/><path d="M268 140h44v54h-44z" fill="#3f3d56"/><rect x="276" y="194" width="10" height="36" fill="#6c63ff"/><rect x="294" y="194" width="10" height="36" fill="#6c63ff"/><circle cx="130" cy="110" r="30" fill="#e6e6e6"/><path d="M130 110V86a30 30 0 0 1 26 45z" fill="#6c63ff"/></svg>`,
  },
  {
    slug: 'engineer-with-clipboard',
    title: 'Engineer with clipboard',
    keywords: ['engineer', 'clipboard', 'inspection', 'checklist', 'field', 'technical', 'site', 'audit', 'survey', 'notes', 'professional', 'worker'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="130" ry="12" fill="#e6e6e6"/><circle cx="200" cy="110" r="22" fill="#ffb8b8"/><path d="M172 134h56v68h-56z" fill="#6c63ff"/><rect x="180" y="202" width="12" height="36" fill="#3f3d56"/><rect x="206" y="202" width="12" height="36" fill="#3f3d56"/><rect x="240" y="100" width="60" height="80" rx="4" fill="#f2f2f2" stroke="#3f3d56" stroke-width="2"/><rect x="255" y="88" width="30" height="16" rx="4" fill="#3f3d56"/><g fill="#a0a0b8"><rect x="252" y="115" width="36" height="6" rx="3"/><rect x="252" y="130" width="36" height="6" rx="3"/><rect x="252" y="145" width="28" height="6" rx="3"/></g><rect x="252" y="160" width="22" height="14" rx="3" fill="#6c63ff"/><line x1="228" y1="150" x2="240" y2="140" stroke="#ffb8b8" stroke-width="8" stroke-linecap="round"/></svg>`,
  },
  {
    slug: 'person-climbing-stairs',
    title: 'Person climbing stairs',
    keywords: ['climbing', 'stairs', 'progress', 'steps', 'advance', 'career', 'growth', 'upward', 'journey', 'improve', 'level up', 'ascend'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="140" ry="12" fill="#e6e6e6"/><g fill="#e6e6e6" stroke="#a0a0b8" stroke-width="2"><rect x="80" y="220" width="60" height="30"/><rect x="140" y="180" width="60" height="70"/><rect x="200" y="140" width="60" height="110"/><rect x="260" y="100" width="60" height="150"/></g><rect x="260" y="100" width="60" height="20" fill="#6c63ff"/><circle cx="230" cy="120" r="16" fill="#ffb8b8"/><path d="M210 138h40v44h-40z" fill="#3f3d56"/><rect x="216" y="182" width="10" height="24" fill="#6c63ff"/><rect x="234" y="182" width="10" height="24" fill="#6c63ff"/><line x1="210" y1="155" x2="190" y2="175" stroke="#ffb8b8" stroke-width="8" stroke-linecap="round"/></svg>`,
  },
  {
    slug: 'person-holding-sign',
    title: 'Person holding sign',
    keywords: ['sign', 'announcement', 'message', 'banner', 'protest', 'promote', 'advertise', 'display', 'notice', 'board', 'holding', 'statement'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="130" ry="12" fill="#e6e6e6"/><circle cx="200" cy="150" r="20" fill="#ffb8b8"/><path d="M176 172h48v56h-48z" fill="#6c63ff"/><rect x="184" y="228" width="12" height="30" fill="#3f3d56"/><rect x="204" y="228" width="12" height="30" fill="#3f3d56"/><rect x="120" y="70" width="160" height="70" rx="6" fill="#f2f2f2" stroke="#6c63ff" stroke-width="3"/><rect x="140" y="90" width="120" height="10" rx="4" fill="#6c63ff"/><rect x="140" y="108" width="80" height="8" rx="4" fill="#a0a0b8"/><line x1="176" y1="172" x2="160" y2="140" stroke="#ffb8b8" stroke-width="8" stroke-linecap="round"/><line x1="224" y1="172" x2="240" y2="140" stroke="#ffb8b8" stroke-width="8" stroke-linecap="round"/></svg>`,
  },
  {
    slug: 'person-with-megaphone',
    title: 'Person with megaphone',
    keywords: ['megaphone', 'announce', 'broadcast', 'marketing', 'promotion', 'voice', 'loud', 'campaign', 'outreach', 'speaker', 'advocacy', 'spread'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="140" ry="12" fill="#e6e6e6"/><circle cx="160" cy="130" r="20" fill="#ffb8b8"/><path d="M136 152h48v60h-48z" fill="#3f3d56"/><rect x="144" y="212" width="12" height="34" fill="#6c63ff"/><rect x="164" y="212" width="12" height="34" fill="#6c63ff"/><path d="M184 155l80-30v60z" fill="#6c63ff"/><rect x="160" y="143" width="28" height="24" rx="4" fill="#3f3d56"/><g stroke="#6c63ff" stroke-width="4" stroke-linecap="round" fill="none"><path d="M280 110a30 30 0 0 1 0 50"/><path d="M300 95a50 50 0 0 1 0 80"/></g></svg>`,
  },
  {
    slug: 'diverse-team-row',
    title: 'Diverse team row',
    keywords: ['diverse', 'team', 'inclusion', 'people', 'group', 'workforce', 'colleagues', 'staff', 'employees', 'row', 'multicultural', 'together'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="160" ry="12" fill="#e6e6e6"/><circle cx="100" cy="110" r="16" fill="#ffb8b8"/><path d="M84 128h32v60h-32z" fill="#6c63ff"/><circle cx="150" cy="105" r="16" fill="#ffb8b8"/><path d="M134 123h32v65h-32z" fill="#3f3d56"/><circle cx="200" cy="100" r="18" fill="#ffb8b8"/><path d="M180 120h40v68h-40z" fill="#6c63ff"/><circle cx="250" cy="105" r="16" fill="#ffb8b8"/><path d="M234 123h32v65h-32z" fill="#3f3d56"/><circle cx="300" cy="110" r="16" fill="#ffb8b8"/><path d="M284 128h32v60h-32z" fill="#6c63ff"/><rect x="88" y="188" width="12" height="34" fill="#3f3d56"/><rect x="138" y="188" width="12" height="34" fill="#6c63ff"/><rect x="188" y="188" width="12" height="34" fill="#3f3d56"/><rect x="238" y="188" width="12" height="34" fill="#6c63ff"/><rect x="288" y="188" width="12" height="34" fill="#3f3d56"/></svg>`,
  },
  {
    slug: 'funnel-chart',
    title: 'Funnel chart',
    keywords: ['funnel', 'conversion', 'pipeline', 'sales', 'leads', 'stages', 'filter', 'marketing', 'prospect', 'drop-off', 'flow', 'chart'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="130" ry="12" fill="#e6e6e6"/><path d="M100 60h200l-30 60H130z" fill="#e6e6e6"/><path d="M130 120h140l-25 50H155z" fill="#a0a0b8"/><path d="M155 170h90l-20 50H175z" fill="#6c63ff"/><rect x="175" y="220" width="50" height="30" rx="4" fill="#3f3d56"/><text x="200" y="82" text-anchor="middle" font-size="12" fill="#3f3d56">100%</text><text x="200" y="148" text-anchor="middle" font-size="12" fill="#f2f2f2">40%</text><text x="200" y="200" text-anchor="middle" font-size="12" fill="#f2f2f2">10%</text></svg>`,
  },
  {
    slug: 'pie-split',
    title: 'Pie chart split',
    keywords: ['pie', 'chart', 'split', 'share', 'percentage', 'distribution', 'segment', 'proportion', 'breakdown', 'ratio', 'data', 'analytics'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="120" ry="12" fill="#e6e6e6"/><circle cx="200" cy="150" r="80" fill="#e6e6e6"/><path d="M200 70a80 80 0 0 1 69 40L200 150z" fill="#6c63ff"/><path d="M269 110a80 80 0 0 1-20 120L200 150z" fill="#a0a0b8"/><path d="M180 230a80 80 0 0 1-69-40L200 150z" fill="#3f3d56" opacity="0.3"/><line x1="200" y1="150" x2="260" y2="90" stroke="#f2f2f2" stroke-width="2"/><line x1="200" y1="150" x2="180" y2="230" stroke="#f2f2f2" stroke-width="2"/><text x="230" y="100" font-size="14" fill="#f2f2f2">45%</text><text x="160" y="210" font-size="14" fill="#3f3d56">30%</text><text x="120" y="130" font-size="14" fill="#3f3d56">25%</text></svg>`,
  },
  {
    slug: 'before-after-bars',
    title: 'Before after bars',
    keywords: ['before', 'after', 'comparison', 'bars', 'improvement', 'change', 'results', 'transformation', 'progress', 'benchmark', 'contrast', 'metrics'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="140" ry="12" fill="#e6e6e6"/><line x1="80" y1="80" x2="80" y2="240" stroke="#3f3d56" stroke-width="3"/><line x1="80" y1="240" x2="340" y2="240" stroke="#3f3d56" stroke-width="3"/><text x="130" y="70" text-anchor="middle" font-size="14" fill="#a0a0b8">Before</text><text x="280" y="70" text-anchor="middle" font-size="14" fill="#6c63ff">After</text><rect x="110" y="170" width="40" height="70" rx="3" fill="#a0a0b8"/><rect x="250" y="100" width="40" height="140" rx="3" fill="#6c63ff"/><rect x="160" y="190" width="40" height="50" rx="3" fill="#e6e6e6"/><rect x="300" y="130" width="40" height="110" rx="3" fill="#6c63ff" opacity="0.6"/><polyline points="170,210 230,140" fill="none" stroke="#6c63ff" stroke-width="3"/><polygon points="230,140 222,144 228,152" fill="#6c63ff"/></svg>`,
  },
  {
    slug: 'maturity-ladder',
    title: 'Maturity ladder',
    keywords: ['maturity', 'ladder', 'levels', 'stages', 'framework', 'capability', 'advancement', 'tiers', 'model', 'growth', 'scale', 'evolution'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="130" ry="12" fill="#e6e6e6"/><rect x="160" y="60" width="80" height="24" rx="4" fill="#6c63ff"/><rect x="150" y="100" width="100" height="24" rx="4" fill="#a0a0b8"/><rect x="140" y="140" width="120" height="24" rx="4" fill="#e6e6e6"/><rect x="130" y="180" width="140" height="24" rx="4" fill="#f2f2f2" stroke="#a0a0b8" stroke-width="2"/><text x="200" y="77" text-anchor="middle" font-size="11" fill="#f2f2f2">Level 4</text><text x="200" y="117" text-anchor="middle" font-size="11" fill="#f2f2f2">Level 3</text><text x="200" y="157" text-anchor="middle" font-size="11" fill="#3f3d56">Level 2</text><text x="200" y="197" text-anchor="middle" font-size="11" fill="#3f3d56">Level 1</text><line x1="120" y1="220" x2="280" y2="220" stroke="#3f3d56" stroke-width="2"/><polygon points="280,220 270,215 270,225" fill="#3f3d56"/></svg>`,
  },
  {
    slug: 'process-flow-3-steps',
    title: 'Process flow three steps',
    keywords: ['process', 'flow', 'steps', 'workflow', 'pipeline', 'sequence', 'stages', 'procedure', 'method', 'journey', 'path', 'diagram'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="150" ry="12" fill="#e6e6e6"/><rect x="50" y="120" width="80" height="60" rx="8" fill="#6c63ff"/><text x="90" y="155" text-anchor="middle" font-size="14" fill="#f2f2f2">1</text><line x1="130" y1="150" x2="160" y2="150" stroke="#3f3d56" stroke-width="3"/><polygon points="160,150 152,146 152,154" fill="#3f3d56"/><rect x="160" y="120" width="80" height="60" rx="8" fill="#a0a0b8"/><text x="200" y="155" text-anchor="middle" font-size="14" fill="#f2f2f2">2</text><line x1="240" y1="150" x2="270" y2="150" stroke="#3f3d56" stroke-width="3"/><polygon points="270,150 262,146 262,154" fill="#3f3d56"/><rect x="270" y="120" width="80" height="60" rx="8" fill="#e6e6e6" stroke="#6c63ff" stroke-width="2"/><text x="310" y="155" text-anchor="middle" font-size="14" fill="#3f3d56">3</text></svg>`,
  },
  {
    slug: 'warning-alert',
    title: 'Warning alert',
    keywords: ['warning', 'alert', 'caution', 'danger', 'risk', 'attention', 'notice', 'error', 'critical', 'issue', 'flag', 'important'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="120" ry="12" fill="#e6e6e6"/><path d="M200 50L340 240H60z" fill="#f2f2f2" stroke="#6c63ff" stroke-width="4"/><path d="M200 50L340 240H60z" fill="#6c63ff" opacity="0.15"/><line x1="200" y1="110" x2="200" y2="180" stroke="#6c63ff" stroke-width="8" stroke-linecap="round"/><circle cx="200" cy="205" r="8" fill="#6c63ff"/></svg>`,
  },
  {
    slug: 'root-cause-tree',
    title: 'Root cause tree',
    keywords: ['root cause', 'tree', 'analysis', 'why', 'problem', 'diagnosis', 'investigation', 'fishbone', 'breakdown', 'source', 'debug', 'trace'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="140" ry="12" fill="#e6e6e6"/><rect x="180" y="200" width="40" height="30" rx="4" fill="#6c63ff"/><line x1="200" y1="200" x2="200" y2="160" stroke="#3f3d56" stroke-width="3"/><line x1="200" y1="160" x2="120" y2="120" stroke="#3f3d56" stroke-width="3"/><line x1="200" y1="160" x2="280" y2="120" stroke="#3f3d56" stroke-width="3"/><rect x="90" y="90" width="60" height="30" rx="4" fill="#e6e6e6"/><rect x="250" y="90" width="60" height="30" rx="4" fill="#a0a0b8"/><line x1="120" y1="120" x2="80" y2="80" stroke="#a0a0b8" stroke-width="2"/><line x1="120" y1="120" x2="150" y2="70" stroke="#a0a0b8" stroke-width="2"/><line x1="280" y1="120" x2="250" y2="70" stroke="#a0a0b8" stroke-width="2"/><line x1="280" y1="120" x2="320" y2="80" stroke="#a0a0b8" stroke-width="2"/><circle cx="80" cy="72" r="10" fill="#6c63ff"/><circle cx="150" cy="62" r="10" fill="#e6e6e6"/><circle cx="250" cy="62" r="10" fill="#e6e6e6"/><circle cx="320" cy="72" r="10" fill="#6c63ff"/></svg>`,
  },
  {
    slug: 'kpi-gauge',
    title: 'KPI gauge',
    keywords: ['kpi', 'gauge', 'meter', 'performance', 'target', 'score', 'metric', 'dashboard', 'indicator', 'measure', 'speedometer', 'dial'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="120" ry="12" fill="#e6e6e6"/><path d="M80 200a120 120 0 0 1 240 0" fill="none" stroke="#e6e6e6" stroke-width="24" stroke-linecap="round"/><path d="M80 200a120 120 0 0 1 180-60" fill="none" stroke="#a0a0b8" stroke-width="24" stroke-linecap="round"/><path d="M80 200a120 120 0 0 1 120-104" fill="none" stroke="#6c63ff" stroke-width="24" stroke-linecap="round"/><circle cx="200" cy="200" r="12" fill="#3f3d56"/><line x1="200" y1="200" x2="270" y2="120" stroke="#6c63ff" stroke-width="4" stroke-linecap="round"/><text x="200" y="240" text-anchor="middle" font-size="22" fill="#6c63ff">87%</text></svg>`,
  },
  {
    slug: 'timeline-milestones',
    title: 'Timeline milestones',
    keywords: ['timeline', 'milestones', 'roadmap', 'schedule', 'phases', 'plan', 'history', 'events', 'journey', 'dates', 'progress', 'sequence'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="150" ry="12" fill="#e6e6e6"/><line x1="60" y1="160" x2="340" y2="160" stroke="#3f3d56" stroke-width="4"/><circle cx="80" cy="160" r="14" fill="#6c63ff"/><circle cx="160" cy="160" r="14" fill="#a0a0b8"/><circle cx="240" cy="160" r="14" fill="#6c63ff"/><circle cx="320" cy="160" r="14" fill="#e6e6e6" stroke="#6c63ff" stroke-width="3"/><rect x="60" y="100" width="40" height="30" rx="4" fill="#f2f2f2"/><rect x="140" y="190" width="40" height="30" rx="4" fill="#f2f2f2"/><rect x="220" y="100" width="40" height="30" rx="4" fill="#6c63ff"/><rect x="300" y="190" width="40" height="30" rx="4" fill="#f2f2f2" stroke="#a0a0b8" stroke-width="2"/><text x="80" y="120" text-anchor="middle" font-size="10" fill="#3f3d56">Q1</text><text x="160" y="215" text-anchor="middle" font-size="10" fill="#3f3d56">Q2</text><text x="240" y="120" text-anchor="middle" font-size="10" fill="#f2f2f2">Q3</text><text x="320" y="215" text-anchor="middle" font-size="10" fill="#3f3d56">Q4</text></svg>`,
  },
  {
    slug: 'comparison-scales',
    title: 'Comparison scales',
    keywords: ['scales', 'balance', 'compare', 'weigh', 'versus', 'choice', 'decision', 'trade-off', 'options', 'fair', 'justice', 'evaluate'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="130" ry="12" fill="#e6e6e6"/><line x1="200" y1="80" x2="200" y2="240" stroke="#3f3d56" stroke-width="4"/><line x1="100" y1="120" x2="300" y2="120" stroke="#3f3d56" stroke-width="4"/><path d="M100 120l-50 20h100z" fill="#6c63ff"/><path d="M300 120l-50 20h100z" fill="#a0a0b8"/><rect x="60" y="100" width="30" height="20" rx="3" fill="#f2f2f2"/><rect x="310" y="100" width="30" height="20" rx="3" fill="#f2f2f2"/><text x="75" y="95" text-anchor="middle" font-size="12" fill="#3f3d56">A</text><text x="325" y="95" text-anchor="middle" font-size="12" fill="#3f3d56">B</text><circle cx="200" cy="80" r="10" fill="#6c63ff"/></svg>`,
  },
  {
    slug: 'broken-chain-fix',
    title: 'Broken chain fix',
    keywords: ['chain', 'broken', 'fix', 'repair', 'link', 'connection', 'weakness', 'gap', 'resolve', 'strength', 'continuity', 'problem'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="130" ry="12" fill="#e6e6e6"/><g fill="none" stroke="#3f3d56" stroke-width="10"><path d="M80 150h50a20 20 0 0 1 0 40H80a20 20 0 0 1 0-40z"/><path d="M270 150h50a20 20 0 0 1 0 40h-50a20 20 0 0 1 0-40z"/></g><g fill="#6c63ff"><rect x="175" y="145" width="20" height="50" rx="4" transform="rotate(30 185 170)"/><rect x="205" y="145" width="20" height="50" rx="4" transform="rotate(-30 215 170)"/></g><line x1="140" y1="170" x2="175" y2="170" stroke="#a0a0b8" stroke-width="4" stroke-dasharray="6 4"/><line x1="225" y1="170" x2="270" y2="170" stroke="#a0a0b8" stroke-width="4" stroke-dasharray="6 4"/></svg>`,
  },
  {
    slug: 'lightbulb-team',
    title: 'Lightbulb team',
    keywords: ['lightbulb', 'team', 'idea', 'innovation', 'brainstorm', 'creativity', 'collaboration', 'insight', 'collective', 'think', 'bright', 'solution'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="140" ry="12" fill="#e6e6e6"/><path d="M200 40a50 50 0 0 1 30 90c-6 5-8 10-8 18h-44c0-8-2-13-8-18A50 50 0 0 1 200 40z" fill="#6c63ff"/><rect x="178" y="152" width="44" height="10" rx="3" fill="#3f3d56"/><circle cx="130" cy="200" r="14" fill="#ffb8b8"/><path d="M116 216h28v40h-28z" fill="#3f3d56"/><circle cx="200" cy="210" r="16" fill="#ffb8b8"/><path d="M182 228h36v28h-36z" fill="#6c63ff"/><circle cx="270" cy="200" r="14" fill="#ffb8b8"/><path d="M256 216h28v40h-28z" fill="#3f3d56"/></svg>`,
  },
  {
    slug: 'shield-with-person',
    title: 'Shield with person',
    keywords: ['shield', 'protection', 'security', 'person', 'safe', 'guard', 'privacy', 'trust', 'defense', 'insurance', 'care', 'safeguard'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="120" ry="12" fill="#e6e6e6"/><path d="M200 50l90 32v70c0 58-38 88-90 106-52-18-90-48-90-106V82z" fill="#6c63ff" opacity="0.3"/><path d="M200 70l70 24v54c0 44-28 68-70 82-42-14-70-38-70-82V94z" fill="#f2f2f2" stroke="#6c63ff" stroke-width="3"/><circle cx="200" cy="130" r="18" fill="#ffb8b8"/><path d="M178 150h44v50h-44z" fill="#3f3d56"/><rect x="186" y="200" width="10" height="24" fill="#6c63ff"/><rect x="204" y="200" width="10" height="24" fill="#6c63ff"/></svg>`,
  },
  {
    slug: 'rocket-with-person',
    title: 'Rocket with person',
    keywords: ['rocket', 'launch', 'person', 'startup', 'growth', 'ambition', 'takeoff', 'career', 'boost', 'accelerate', 'success', 'venture'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="130" ry="12" fill="#e6e6e6"/><path d="M200 30c30 26 38 68 26 114h-52c-12-46-4-88 26-114z" fill="#f2f2f2"/><circle cx="200" cy="88" r="16" fill="#6c63ff"/><path d="M172 120l-22 22 8 18 26-14z" fill="#6c63ff"/><path d="M228 120l22 22-8 18-26-14z" fill="#6c63ff"/><circle cx="200" cy="155" r="14" fill="#ffb8b8"/><path d="M186 170h28v36h-28z" fill="#3f3d56"/><path d="M188 206h24l-6 30h-12z" fill="#6c63ff"/><g stroke="#6c63ff" stroke-width="3" stroke-linecap="round"><line x1="120" y1="100" x2="100" y2="80"/><line x1="280" y1="100" x2="300" y2="80"/><line x1="130" y1="140" x2="110" y2="150"/></g></svg>`,
  },
  {
    slug: 'bridge-gap',
    title: 'Bridge the gap',
    keywords: ['bridge', 'gap', 'connect', 'span', 'link', 'overcome', 'transition', 'path', 'cross', 'solution', 'reach', 'unite'],
    svg: `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg"><ellipse cx="200" cy="272" rx="150" ry="12" fill="#e6e6e6"/><rect x="40" y="180" width="120" height="40" rx="4" fill="#e6e6e6"/><rect x="240" y="180" width="120" height="40" rx="4" fill="#e6e6e6"/><path d="M160 180c20-60 60-60 80 0" fill="none" stroke="#6c63ff" stroke-width="8"/><path d="M150 180h100v12h-100z" fill="#6c63ff"/><g fill="none" stroke="#3f3d56" stroke-width="3"><line x1="170" y1="192" x2="170" y2="210"/><line x1="200" y1="192" x2="200" y2="210"/><line x1="230" y1="192" x2="230" y2="210"/></g><text x="200" y="140" text-anchor="middle" font-size="14" fill="#a0a0b8">GAP</text><circle cx="80" cy="160" r="12" fill="#ffb8b8"/><circle cx="320" cy="160" r="12" fill="#ffb8b8"/></svg>`,
  },
];

export const UNDRAW_MANIFEST: UndrawEntry[] = [
  ...UNDRAW_MANIFEST_CORE,
  ...UNDRAW_MANIFEST_EXTRA,
  ...UNDRAW_MANIFEST_EXTRA2,
];
