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
 * spec (tier 1, no attribution) applies cleanly. See the asset build backlog.
 *
 * Palette (matches the unDraw look):
 *   accent  #6c63ff  (recoloured at serve time)
 *   ink     #3f3d56  (dark neutral — figures, outlines)
 *   mid     #a0a0b8  (secondary)
 *   light   #e6e6e6 / #f2f2f2 (fills, ground)
 *   skin    #ffb8b8  (unDraw's stock skin tone)
 */

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

export const UNDRAW_MANIFEST: UndrawEntry[] = [
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
];
