import { writeFileSync } from 'fs';

const VB = '0 0 400 300';
const G = (id) => `<ellipse cx="200" cy="272" rx="140" ry="12" fill="#e6e6e6"/>`;
const P = (x, y, accent = true) =>
  `<circle cx="${x}" cy="${y}" r="18" fill="#ffb8b8"/><path d="M${x - 22} ${y + 18}h44v54h-44z" fill="${accent ? '#6c63ff' : '#3f3d56'}"/><rect x="${x - 14}" y="${y + 72}" width="10" height="30" fill="#3f3d56"/><rect x="${x + 4}" y="${y + 72}" width="10" height="30" fill="#6c63ff"/>`;

const T = {
  person: (x = 200, y = 120, accent = true) =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}${P(x, y, accent)}</svg>`,
  personLaptop: (x = 240, y = 110) =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="80" y="140" width="140" height="10" rx="3" fill="#3f3d56"/><rect x="100" y="100" width="90" height="60" rx="4" fill="#6c63ff"/><rect x="108" y="108" width="74" height="40" rx="2" fill="#f2f2f2"/>${P(x, y)}</svg>`,
  personTablet: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="120" y="90" width="70" height="90" rx="6" fill="#3f3d56"/><rect x="128" y="98" width="54" height="70" rx="2" fill="#f2f2f2"/><rect x="140" y="170" width="30" height="4" rx="2" fill="#a0a0b8"/>${P(260, 115)}<line x1="238" y1="130" x2="190" y2="130" stroke="#ffb8b8" stroke-width="8" stroke-linecap="round"/></svg>`,
  personWave: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<circle cx="200" cy="120" r="20" fill="#ffb8b8"/><path d="M172 142h56v60h-56z" fill="#6c63ff"/><rect x="182" y="202" width="12" height="34" fill="#3f3d56"/><rect x="206" y="202" width="12" height="34" fill="#3f3d56"/><line x1="228" y1="150" x2="270" y2="100" stroke="#ffb8b8" stroke-width="10" stroke-linecap="round"/><path d="M270 100l14-8v20z" fill="#ffb8b8"/></svg>`,
  personThumbs: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<circle cx="200" cy="120" r="20" fill="#ffb8b8"/><path d="M172 142h56v60h-56z" fill="#6c63ff"/><rect x="182" y="202" width="12" height="34" fill="#3f3d56"/><rect x="206" y="202" width="12" height="34" fill="#3f3d56"/><rect x="140" y="130" width="16" height="30" rx="6" fill="#ffb8b8" transform="rotate(-30 148 145)"/><circle cx="148" cy="118" r="8" fill="#ffb8b8"/></svg>`,
  personConfused: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<circle cx="200" cy="120" r="20" fill="#ffb8b8"/><path d="M172 142h56v60h-56z" fill="#3f3d56"/><rect x="182" y="202" width="12" height="34" fill="#6c63ff"/><rect x="206" y="202" width="12" height="34" fill="#6c63ff"/><line x1="190" y1="115" x2="182" y2="108" stroke="#3f3d56" stroke-width="3"/><line x1="210" y1="115" x2="218" y2="108" stroke="#3f3d56" stroke-width="3"/><text x="280" y="90" font-size="36" fill="#6c63ff">?</text><circle cx="300" cy="60" r="14" fill="#e6e6e6"/><circle cx="320" cy="45" r="8" fill="#e6e6e6"/></svg>`,
  personReading: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="140" y="100" width="80" height="60" rx="4" fill="#f2f2f2" stroke="#6c63ff" stroke-width="2"/><rect x="152" y="112" width="56" height="6" rx="3" fill="#a0a0b8"/><rect x="152" y="126" width="40" height="6" rx="3" fill="#e6e6e6"/>${P(240, 115)}<line x1="238" y1="130" x2="220" y2="125" stroke="#ffb8b8" stroke-width="8" stroke-linecap="round"/></svg>`,
  personCall: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<circle cx="200" cy="115" r="20" fill="#ffb8b8"/><path d="M172 137h56v62h-56z" fill="#6c63ff"/><rect x="182" y="199" width="12" height="34" fill="#3f3d56"/><rect x="206" y="199" width="12" height="34" fill="#3f3d56"/><rect x="240" y="110" width="30" height="50" rx="8" fill="#3f3d56"/><rect x="246" y="118" width="18" height="30" rx="2" fill="#6c63ff"/><line x1="228" y1="130" x2="240" y2="130" stroke="#ffb8b8" stroke-width="8" stroke-linecap="round"/></svg>`,
  personJog: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<circle cx="220" cy="100" r="18" fill="#ffb8b8"/><path d="M196 120h48v40h-48z" fill="#6c63ff"/><line x1="196" y1="160" x2="180" y2="200" stroke="#3f3d56" stroke-width="8" stroke-linecap="round"/><line x1="244" y1="160" x2="270" y2="190" stroke="#3f3d56" stroke-width="8" stroke-linecap="round"/><line x1="210" y1="130" x2="190" y2="110" stroke="#ffb8b8" stroke-width="8" stroke-linecap="round"/><line x1="234" y1="130" x2="250" y2="105" stroke="#ffb8b8" stroke-width="8" stroke-linecap="round"/></svg>`,
  team3: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<circle cx="140" cy="110" r="16" fill="#ffb8b8"/><path d="M124 128h32v50h-32z" fill="#6c63ff"/><circle cx="200" cy="100" r="18" fill="#ffb8b8"/><path d="M180 120h40v58h-40z" fill="#3f3d56"/><circle cx="260" cy="110" r="16" fill="#ffb8b8"/><path d="M244 128h32v50h-32z" fill="#6c63ff"/><rect x="80" y="200" width="240" height="8" rx="4" fill="#a0a0b8"/></svg>`,
  bars: (rising = true) => {
    const h = rising ? [60, 90, 120, 160] : [160, 120, 90, 60];
    return `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<line x1="80" y1="60" x2="80" y2="240" stroke="#3f3d56" stroke-width="4"/><line x1="80" y1="240" x2="340" y2="240" stroke="#3f3d56" stroke-width="4"/><rect x="110" y="${240 - h[0]}" width="40" height="${h[0]}" fill="#e6e6e6"/><rect x="170" y="${240 - h[1]}" width="40" height="${h[1]}" fill="#a0a0b8"/><rect x="230" y="${240 - h[2]}" width="40" height="${h[2]}" fill="#e6e6e6"/><rect x="290" y="${240 - h[3]}" width="40" height="${h[3]}" fill="#6c63ff"/></svg>`;
  },
  lineChart: (up = true) => {
    const pts = up ? '90,200 150,170 210,140 270,100 330,70' : '90,80 150,110 210,150 270,170 330,200';
    return `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<line x1="70" y1="60" x2="70" y2="240" stroke="#3f3d56" stroke-width="4"/><line x1="70" y1="240" x2="340" y2="240" stroke="#3f3d56" stroke-width="4"/><polyline points="${pts}" fill="none" stroke="#6c63ff" stroke-width="4"/><circle cx="330" cy="${up ? 70 : 200}" r="8" fill="#6c63ff"/></svg>`;
  },
  donut: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<circle cx="200" cy="150" r="70" fill="#e6e6e6"/><path d="M200 80a70 70 0 0 1 60 105z" fill="#6c63ff"/><path d="M260 185a70 70 0 0 1-105-30z" fill="#a0a0b8"/><path d="M95 155a70 70 0 0 1 45-75z" fill="#f2f2f2"/><circle cx="200" cy="150" r="30" fill="#f2f2f2"/></svg>`,
  cloud: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<ellipse cx="200" cy="140" rx="90" ry="50" fill="#f2f2f2"/><ellipse cx="160" cy="150" rx="50" ry="40" fill="#e6e6e6"/><ellipse cx="250" cy="145" rx="55" ry="42" fill="#e6e6e6"/><path d="M200 100v-30M185 85l15-15 15 15" fill="none" stroke="#6c63ff" stroke-width="5" stroke-linecap="round"/><circle cx="120" cy="200" r="20" fill="#3f3d56"/><rect x="108" y="210" width="24" height="16" rx="3" fill="#6c63ff"/></svg>`,
  database: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<ellipse cx="200" cy="100" rx="70" ry="20" fill="#6c63ff"/><rect x="130" y="100" width="140" height="100" fill="#6c63ff"/><ellipse cx="200" cy="200" rx="70" ry="20" fill="#3f3d56"/><ellipse cx="200" cy="130" rx="70" ry="18" fill="none" stroke="#f2f2f2" stroke-width="2"/><ellipse cx="200" cy="165" rx="70" ry="18" fill="none" stroke="#f2f2f2" stroke-width="2"/></svg>`,
  lock: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="150" y="140" width="100" height="80" rx="8" fill="#6c63ff"/><circle cx="200" cy="175" r="14" fill="#f2f2f2"/><rect x="196" y="175" width="8" height="20" fill="#3f3d56"/><path d="M170 140v-30a30 30 0 0 1 60 0v30" fill="none" stroke="#3f3d56" stroke-width="10"/><rect x="280" y="180" width="50" height="16" rx="4" fill="#3f3d56"/><circle cx="310" cy="172" r="12" fill="#a0a0b8"/></svg>`,
  trophy: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<path d="M150 70h100v16a50 50 0 0 1-100 0z" fill="#6c63ff"/><rect x="185" y="136" width="30" height="30" fill="#3f3d56"/><path d="M160 166h80l-8 20h-64z" fill="#6c63ff"/><rect x="150" y="186" width="100" height="12" rx="4" fill="#3f3d56"/>${P(200, 210, false)}</svg>`,
  cart: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<path d="M100 100h200l-20 100H130z" fill="#f2f2f2" stroke="#3f3d56" stroke-width="3"/><circle cx="160" cy="220" r="14" fill="#3f3d56"/><circle cx="260" cy="220" r="14" fill="#3f3d56"/><rect x="120" y="80" width="40" height="30" rx="4" fill="#6c63ff"/><rect x="170" y="80" width="40" height="30" rx="4" fill="#a0a0b8"/><rect x="220" y="80" width="40" height="30" rx="4" fill="#6c63ff"/></svg>`,
  coffee: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="160" y="120" width="80" height="70" rx="8" fill="#f2f2f2" stroke="#3f3d56" stroke-width="2"/><rect x="170" y="130" width="60" height="40" rx="4" fill="#6c63ff"/><path d="M240 140h20a10 10 0 0 1 0 20h-20" fill="none" stroke="#3f3d56" stroke-width="4"/>${P(280, 130)}<g stroke="#a0a0b8" stroke-width="3" stroke-linecap="round"><line x1="180" y1="100" x2="185" y2="85"/><line x1="200" y1="95" x2="200" y2="78"/><line x1="220" y1="100" x2="215" y2="85"/></g></svg>`,
  ai: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<circle cx="200" cy="140" r="60" fill="#f2f2f2" stroke="#6c63ff" stroke-width="4"/><circle cx="170" cy="130" r="10" fill="#6c63ff"/><circle cx="230" cy="130" r="10" fill="#6c63ff"/><rect x="175" y="160" width="50" height="8" rx="4" fill="#a0a0b8"/><g stroke="#6c63ff" stroke-width="2"><line x1="200" y1="80" x2="200" y2="50"/><line x1="200" y1="200" x2="200" y2="230"/><line x1="140" y1="140" x2="110" y2="140"/><line x1="260" y1="140" x2="290" y2="140"/></g></svg>`,
  kanban: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="60" y="70" width="90" height="160" rx="6" fill="#f2f2f2"/><rect x="155" y="70" width="90" height="160" rx="6" fill="#f2f2f2"/><rect x="250" y="70" width="90" height="160" rx="6" fill="#f2f2f2"/><rect x="70" y="85" width="70" height="40" rx="4" fill="#6c63ff"/><rect x="70" y="135" width="70" height="40" rx="4" fill="#e6e6e6"/><rect x="165" y="85" width="70" height="40" rx="4" fill="#a0a0b8"/><rect x="260" y="85" width="70" height="40" rx="4" fill="#6c63ff"/></svg>`,
  nodes: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<g stroke="#a0a0b8" stroke-width="3"><line x1="200" y1="150" x2="100" y2="80"/><line x1="200" y1="150" x2="300" y2="80"/><line x1="200" y1="150" x2="100" y2="220"/><line x1="200" y1="150" x2="300" y2="220"/></g><circle cx="200" cy="150" r="24" fill="#6c63ff"/><circle cx="100" cy="80" r="14" fill="#3f3d56"/><circle cx="300" cy="80" r="14" fill="#3f3d56"/><circle cx="100" cy="220" r="14" fill="#3f3d56"/><circle cx="300" cy="220" r="14" fill="#6c63ff"/></svg>`,
  code: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<text x="200" y="160" text-anchor="middle" font-size="80" fill="#6c63ff" font-family="monospace">&lt;/&gt;</text><rect x="100" y="180" width="200" height="50" rx="6" fill="#f2f2f2" stroke="#3f3d56" stroke-width="2"/><rect x="115" y="195" width="80" height="6" rx="3" fill="#6c63ff"/><rect x="115" y="210" width="120" height="6" rx="3" fill="#a0a0b8"/></svg>`,
  generic: (shape = 'rect') => {
    const inner =
      shape === 'circle'
        ? `<circle cx="200" cy="140" r="60" fill="#f2f2f2" stroke="#6c63ff" stroke-width="4"/>`
        : `<rect x="110" y="80" width="180" height="120" rx="8" fill="#f2f2f2" stroke="#6c63ff" stroke-width="3"/><rect x="130" y="100" width="140" height="10" rx="4" fill="#6c63ff"/><rect x="130" y="120" width="100" height="10" rx="4" fill="#a0a0b8"/>`;
    return `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}${inner}</svg>`;
  },
};

const defs = [
  ['person-with-laptop-standing', 'Person with laptop standing', ['laptop', 'standing', 'work', 'mobile', 'office', 'tech', 'device', 'professional', 'remote', 'productivity'], 'personLaptop'],
  ['person-with-tablet', 'Person with tablet', ['tablet', 'device', 'screen', 'mobile', 'read', 'review', 'digital', 'touch', 'portable', 'work'], 'personTablet'],
  ['person-waving', 'Person waving', ['wave', 'hello', 'greet', 'welcome', 'friendly', 'hi', 'onboarding', 'meet', 'person', 'gesture'], 'personWave'],
  ['person-thumbs-up', 'Person thumbs up', ['thumbs', 'up', 'approve', 'like', 'positive', 'feedback', 'good', 'success', 'agree', 'ok'], 'personThumbs'],
  ['person-confused', 'Person confused', ['confused', 'puzzled', 'question', 'unclear', 'lost', 'help', 'stuck', 'wonder', 'uncertain', 'problem'], 'personConfused'],
  ['person-reading', 'Person reading', ['reading', 'book', 'document', 'learn', 'study', 'research', 'knowledge', 'article', 'focus', 'education'], 'personReading'],
  ['person-on-call', 'Person on call', ['call', 'phone', 'mobile', 'talk', 'conversation', 'contact', 'dial', 'communication', 'voice', 'meeting'], 'personCall'],
  ['person-jogging-break', 'Person jogging break', ['jog', 'run', 'exercise', 'break', 'fitness', 'wellness', 'health', 'active', 'outdoor', 'refresh'], 'personJog'],
  ['person-with-coffee', 'Person with coffee', ['coffee', 'break', 'cafe', 'drink', 'relax', 'morning', 'energy', 'caffeine', 'pause', 'office'], 'coffee'],
  ['person-at-whiteboard', 'Person at whiteboard', ['whiteboard', 'brainstorm', 'ideas', 'sketch', 'plan', 'teach', 'explain', 'board', 'strategy', 'team'], 'generic'],
  ['person-with-headphones', 'Person with headphones', ['headphones', 'music', 'focus', 'audio', 'listen', 'podcast', 'concentrate', 'quiet', 'work', 'media'], 'person'],
  ['person-typing-fast', 'Person typing fast', ['typing', 'keyboard', 'fast', 'productive', 'write', 'code', 'input', 'speed', 'work', 'busy'], 'personLaptop'],
  ['person-walking-meeting', 'Person walking meeting', ['walk', 'meeting', 'mobile', 'discuss', 'outdoor', 'pace', 'talk', 'collaborate', 'dynamic', 'standup'], 'person'],
  ['person-with-briefcase', 'Person with briefcase', ['briefcase', 'business', 'travel', 'professional', 'commute', 'executive', 'work', 'formal', 'career', 'job'], 'person'],
  ['person-meditating-break', 'Person meditating', ['meditate', 'calm', 'mindful', 'wellness', 'balance', 'peace', 'break', 'health', 'relax', 'zen'], 'person'],
  ['team-of-three', 'Team of three', ['team', 'three', 'group', 'people', 'collaboration', 'together', 'colleagues', 'crew', 'squad', 'partners'], 'team3'],
  ['team-brainstorm-board', 'Team brainstorm board', ['brainstorm', 'board', 'team', 'ideas', 'sticky', 'notes', 'creative', 'workshop', 'plan', 'collaborate'], 'kanban'],
  ['standup-meeting', 'Standup meeting', ['standup', 'meeting', 'agile', 'scrum', 'daily', 'sync', 'team', 'update', 'huddle', 'quick'], 'team3'],
  ['zoom-call-grid', 'Zoom call grid', ['zoom', 'video', 'call', 'grid', 'remote', 'virtual', 'conference', 'webcam', 'online', 'meeting'], 'generic'],
  ['team-celebrating-win', 'Team celebrating win', ['celebrate', 'team', 'win', 'success', 'victory', 'cheer', 'achievement', 'happy', 'milestone', 'party'], 'team3'],
  ['pair-programming', 'Pair programming', ['pair', 'programming', 'code', 'developer', 'collaborate', 'review', 'mentor', 'duo', 'tech', 'build'], 'personLaptop'],
  ['cross-functional-team', 'Cross functional team', ['cross', 'functional', 'team', 'diverse', 'departments', 'collaborate', 'multidisciplinary', 'skills', 'unite', 'project'], 'team3'],
  ['bar-chart-rising', 'Bar chart rising', ['bar', 'chart', 'rising', 'growth', 'increase', 'metrics', 'analytics', 'stats', 'up', 'performance'], () => T.bars(true)],
  ['line-chart-dip', 'Line chart dip', ['line', 'chart', 'dip', 'decline', 'trend', 'down', 'metrics', 'analytics', 'drop', 'performance'], () => T.lineChart(false)],
  ['stacked-bars', 'Stacked bars', ['stacked', 'bars', 'chart', 'segments', 'breakdown', 'composition', 'analytics', 'data', 'compare', 'layers'], 'bars'],
  ['donut-three-slice', 'Donut three slice', ['donut', 'pie', 'chart', 'segments', 'share', 'distribution', 'analytics', 'breakdown', 'ratio', 'data'], 'donut'],
  ['scatter-simple', 'Scatter plot simple', ['scatter', 'plot', 'points', 'data', 'correlation', 'analytics', 'distribution', 'chart', 'stats', 'research'], 'generic'],
  ['area-chart-growth', 'Area chart growth', ['area', 'chart', 'growth', 'filled', 'trend', 'analytics', 'metrics', 'increase', 'visual', 'data'], () => T.lineChart(true)],
  ['horizontal-bars', 'Horizontal bars', ['horizontal', 'bars', 'chart', 'ranking', 'compare', 'analytics', 'data', 'metrics', 'stats', 'report'], 'bars'],
  ['waterfall-chart', 'Waterfall chart', ['waterfall', 'chart', 'cascade', 'finance', 'breakdown', 'steps', 'analytics', 'flow', 'change', 'metrics'], 'bars'],
  ['heatmap-grid', 'Heatmap grid', ['heatmap', 'grid', 'matrix', 'density', 'analytics', 'data', 'visual', 'pattern', 'intensity', 'map'], 'kanban'],
  ['cloud-sync', 'Cloud sync', ['cloud', 'sync', 'upload', 'backup', 'storage', 'online', 'data', 'connect', 'remote', 'share'], 'cloud'],
  ['database-cylinder', 'Database cylinder', ['database', 'data', 'storage', 'sql', 'server', 'records', 'backend', 'persistence', 'cylinder', 'warehouse'], 'database'],
  ['api-nodes', 'API nodes', ['api', 'nodes', 'integration', 'connect', 'endpoints', 'network', 'system', 'microservice', 'graph', 'link'], 'nodes'],
  ['mobile-desktop', 'Mobile and desktop', ['mobile', 'desktop', 'responsive', 'devices', 'multi', 'platform', 'screen', 'adaptive', 'cross', 'ui'], 'generic'],
  ['code-brackets', 'Code brackets', ['code', 'brackets', 'developer', 'programming', 'syntax', 'software', 'dev', 'script', 'build', 'tech'], 'code'],
  ['server-rack', 'Server rack', ['server', 'rack', 'infrastructure', 'hosting', 'datacenter', 'hardware', 'backend', 'ops', 'compute', 'cloud'], 'generic'],
  ['git-branch', 'Git branch', ['git', 'branch', 'version', 'control', 'merge', 'code', 'devops', 'repository', 'workflow', 'source'], 'nodes'],
  ['ci-pipeline', 'CI pipeline', ['ci', 'pipeline', 'deploy', 'automation', 'build', 'devops', 'continuous', 'integration', 'workflow', 'release'], 'kanban'],
  ['microservices-blocks', 'Microservices blocks', ['microservices', 'blocks', 'architecture', 'services', 'distributed', 'system', 'modular', 'scale', 'cloud', 'api'], 'kanban'],
  ['cloud-upload', 'Cloud upload', ['cloud', 'upload', 'transfer', 'backup', 'sync', 'file', 'storage', 'send', 'online', 'data'], 'cloud'],
  ['lock-key', 'Lock and key', ['lock', 'key', 'security', 'access', 'protect', 'password', 'safe', 'secure', 'login', 'private'], 'lock'],
  ['fingerprint-scan', 'Fingerprint scan', ['fingerprint', 'biometric', 'scan', 'identity', 'auth', 'security', 'verify', 'access', 'login', 'unique'], 'generic'],
  ['firewall-wall', 'Firewall wall', ['firewall', 'security', 'network', 'protect', 'block', 'defense', 'filter', 'safe', 'perimeter', 'shield'], 'lock'],
  ['password-vault', 'Password vault', ['password', 'vault', 'secure', 'store', 'credentials', 'safe', 'manager', 'protect', 'secrets', 'login'], 'lock'],
  ['two-factor-auth', 'Two factor auth', ['two', 'factor', 'auth', '2fa', 'security', 'verify', 'login', 'otp', 'protect', 'account'], 'lock'],
  ['security-audit', 'Security audit', ['security', 'audit', 'review', 'compliance', 'check', 'inspect', 'risk', 'assess', 'verify', 'report'], 'lock'],
  ['encrypted-message', 'Encrypted message', ['encrypted', 'message', 'secure', 'privacy', 'cipher', 'protect', 'communication', 'safe', 'lock', 'email'], 'lock'],
  ['vpn-tunnel', 'VPN tunnel', ['vpn', 'tunnel', 'secure', 'network', 'remote', 'private', 'connect', 'encrypt', 'access', 'proxy'], 'nodes'],
  ['trophy-person', 'Trophy with person', ['trophy', 'person', 'win', 'award', 'success', 'achievement', 'champion', 'prize', 'celebrate', 'victory'], 'trophy'],
  ['medal-person', 'Medal with person', ['medal', 'person', 'award', 'honor', 'recognition', 'achievement', 'winner', 'badge', 'excellence', 'rank'], 'trophy'],
  ['high-five', 'High five', ['high', 'five', 'celebrate', 'team', 'success', 'gesture', 'cheer', 'partnership', 'win', 'together'], 'team3'],
  ['confetti-burst', 'Confetti burst', ['confetti', 'celebrate', 'party', 'success', 'festive', 'joy', 'milestone', 'launch', 'win', 'event'], 'generic'],
  ['podium-winner', 'Podium winner', ['podium', 'winner', 'first', 'place', 'rank', 'competition', 'success', 'award', 'top', 'champion'], 'trophy'],
  ['champagne-celebrate', 'Champagne celebrate', ['champagne', 'celebrate', 'toast', 'success', 'milestone', 'party', 'win', 'launch', 'cheers', 'event'], 'generic'],
  ['stars-rating', 'Stars rating', ['stars', 'rating', 'review', 'feedback', 'score', 'quality', 'rank', 'evaluate', 'praise', 'five'], 'generic'],
  ['shopping-cart', 'Shopping cart', ['shopping', 'cart', 'ecommerce', 'buy', 'store', 'retail', 'purchase', 'checkout', 'basket', 'shop'], 'cart'],
  ['package-delivery', 'Package delivery', ['package', 'delivery', 'shipping', 'box', 'parcel', 'logistics', 'ship', 'order', 'courier', 'arrive'], 'cart'],
  ['invoice-doc', 'Invoice document', ['invoice', 'document', 'billing', 'payment', 'receipt', 'finance', 'accounting', 'bill', 'paperwork', 'record'], 'generic'],
  ['credit-card-pay', 'Credit card payment', ['credit', 'card', 'payment', 'pay', 'checkout', 'finance', 'purchase', 'transaction', 'money', 'billing'], 'generic'],
  ['subscription-renew', 'Subscription renew', ['subscription', 'renew', 'recurring', 'billing', 'plan', 'membership', 'service', 'monthly', 'saas', 'auto'], 'generic'],
  ['refund-process', 'Refund process', ['refund', 'return', 'money', 'back', 'payment', 'reverse', 'customer', 'service', 'billing', 'process'], 'generic'],
  ['storefront-online', 'Online storefront', ['storefront', 'online', 'shop', 'ecommerce', 'store', 'retail', 'website', 'sell', 'market', 'digital'], 'cart'],
  ['coffee-break', 'Coffee break', ['coffee', 'break', 'pause', 'rest', 'cafe', 'relax', 'office', 'morning', 'energy', 'refresh'], 'coffee'],
  ['plant-desk', 'Plant on desk', ['plant', 'desk', 'office', 'green', 'decor', 'workspace', 'nature', 'calm', 'indoor', 'fresh'], 'generic'],
  ['window-city-view', 'Window city view', ['window', 'city', 'view', 'office', 'skyline', 'building', 'urban', 'workspace', 'panorama', 'downtown'], 'generic'],
  ['open-office-desks', 'Open office desks', ['open', 'office', 'desks', 'workspace', 'coworking', 'floor', 'layout', 'team', 'modern', 'shared'], 'kanban'],
  ['meeting-room-glass', 'Glass meeting room', ['meeting', 'room', 'glass', 'conference', 'boardroom', 'corporate', 'discussion', 'private', 'team', 'office'], 'generic'],
  ['printer-documents', 'Printer documents', ['printer', 'documents', 'print', 'paper', 'office', 'copy', 'output', 'hardware', 'report', 'stationery'], 'generic'],
  ['water-cooler-chat', 'Water cooler chat', ['water', 'cooler', 'chat', 'office', 'informal', 'talk', 'break', 'social', 'colleagues', 'gossip'], 'team3'],
  ['desk-organizer', 'Desk organizer', ['desk', 'organizer', 'tidy', 'office', 'supplies', 'order', 'workspace', 'storage', 'neat', 'productivity'], 'generic'],
  ['social-post-like', 'Social post like', ['social', 'post', 'like', 'engagement', 'media', 'heart', 'reaction', 'marketing', 'content', 'viral'], 'generic'],
  ['ad-campaign-boost', 'Ad campaign boost', ['ad', 'campaign', 'boost', 'marketing', 'promote', 'advertise', 'reach', 'growth', 'ads', 'performance'], 'generic'],
  ['newsletter-signup', 'Newsletter signup', ['newsletter', 'signup', 'email', 'subscribe', 'marketing', 'list', 'audience', 'optin', 'mail', 'campaign'], 'generic'],
  ['brand-awareness', 'Brand awareness', ['brand', 'awareness', 'marketing', 'recognition', 'identity', 'visibility', 'logo', 'reach', 'reputation', 'promote'], 'generic'],
  ['influencer-megaphone', 'Influencer megaphone', ['influencer', 'megaphone', 'marketing', 'voice', 'reach', 'social', 'promote', 'audience', 'creator', 'broadcast'], 'generic'],
  ['content-calendar', 'Content calendar', ['content', 'calendar', 'schedule', 'plan', 'editorial', 'marketing', 'posts', 'dates', 'organize', 'publish'], 'kanban'],
  ['seo-keywords', 'SEO keywords', ['seo', 'keywords', 'search', 'rank', 'google', 'marketing', 'traffic', 'optimize', 'web', 'discover'], 'generic'],
  ['conversion-funnel-person', 'Conversion funnel person', ['conversion', 'funnel', 'marketing', 'leads', 'sales', 'pipeline', 'customer', 'journey', 'optimize', 'growth'], 'generic'],
  ['budget-planning', 'Budget planning', ['budget', 'planning', 'finance', 'money', 'forecast', 'allocate', 'spend', 'plan', 'fiscal', 'cost'], 'bars'],
  ['profit-loss-chart', 'Profit loss chart', ['profit', 'loss', 'chart', 'finance', 'pnl', 'revenue', 'expense', 'accounting', 'report', 'metrics'], 'bars'],
  ['piggy-bank-savings', 'Piggy bank savings', ['piggy', 'bank', 'savings', 'money', 'finance', 'save', 'invest', 'fund', 'deposit', 'wealth'], 'generic'],
  ['coin-stack-growth', 'Coin stack growth', ['coin', 'stack', 'growth', 'money', 'finance', 'revenue', 'profit', 'savings', 'wealth', 'income'], 'bars'],
  ['expense-receipt', 'Expense receipt', ['expense', 'receipt', 'finance', 'billing', 'cost', 'accounting', 'record', 'reimburse', 'paper', 'track'], 'generic'],
  ['investment-portfolio', 'Investment portfolio', ['investment', 'portfolio', 'finance', 'stocks', 'assets', 'wealth', 'grow', 'market', 'fund', 'return'], 'bars'],
  ['cash-flow-stream', 'Cash flow stream', ['cash', 'flow', 'finance', 'money', 'stream', 'liquidity', 'income', 'revenue', 'funds', 'operating'], () => T.lineChart(true)],
  ['ergonomic-chair', 'Ergonomic chair', ['ergonomic', 'chair', 'office', 'comfort', 'health', 'posture', 'workspace', 'furniture', 'wellness', 'desk'], 'generic'],
  ['stretch-break', 'Stretch break', ['stretch', 'break', 'wellness', 'health', 'exercise', 'office', 'flexibility', 'body', 'refresh', 'active'], 'personJog'],
  ['healthy-snack', 'Healthy snack', ['healthy', 'snack', 'wellness', 'food', 'nutrition', 'office', 'energy', 'fruit', 'balance', 'diet'], 'generic'],
  ['work-life-balance', 'Work life balance', ['work', 'life', 'balance', 'wellness', 'harmony', 'scale', 'time', 'health', 'family', 'career'], 'generic'],
  ['standing-desk-setup', 'Standing desk setup', ['standing', 'desk', 'setup', 'ergonomic', 'office', 'health', 'workspace', 'adjustable', 'posture', 'modern'], 'generic'],
  ['welcome-handbook', 'Welcome handbook', ['welcome', 'handbook', 'onboarding', 'guide', 'new', 'hire', 'employee', 'intro', 'manual', 'start'], 'generic'],
  ['training-video', 'Training video', ['training', 'video', 'learn', 'course', 'education', 'tutorial', 'onboard', 'watch', 'lesson', 'skill'], 'generic'],
  ['quiz-checklist', 'Quiz checklist', ['quiz', 'checklist', 'test', 'assessment', 'learn', 'exam', 'questions', 'training', 'verify', 'knowledge'], 'kanban'],
  ['mentor-onboarding', 'Mentor onboarding', ['mentor', 'onboarding', 'guide', 'coach', 'new', 'hire', 'welcome', 'support', 'train', 'buddy'], 'team3'],
  ['knowledge-base', 'Knowledge base', ['knowledge', 'base', 'docs', 'wiki', 'help', 'articles', 'library', 'reference', 'support', 'information'], 'generic'],
  ['tutorial-steps', 'Tutorial steps', ['tutorial', 'steps', 'guide', 'howto', 'learn', 'walkthrough', 'instruction', 'onboard', 'training', 'process'], 'kanban'],
  ['ai-brain-circuit', 'AI brain circuit', ['ai', 'brain', 'circuit', 'machine', 'learning', 'neural', 'intelligence', 'tech', 'automation', 'smart'], 'ai'],
  ['robot-assistant', 'Robot assistant', ['robot', 'assistant', 'ai', 'automation', 'bot', 'help', 'tech', 'digital', 'agent', 'support'], 'ai'],
  ['data-pipeline', 'Data pipeline', ['data', 'pipeline', 'etl', 'flow', 'process', 'analytics', 'stream', 'transform', 'ingest', 'warehouse'], 'nodes'],
  ['dashboard-insights', 'Dashboard insights', ['dashboard', 'insights', 'analytics', 'metrics', 'kpi', 'report', 'monitor', 'data', 'visual', 'business'], 'bars'],
  ['predictive-model', 'Predictive model', ['predictive', 'model', 'forecast', 'ai', 'analytics', 'future', 'trend', 'ml', 'data', 'projection'], () => T.lineChart(true)],
  ['neural-network', 'Neural network', ['neural', 'network', 'ai', 'deep', 'learning', 'nodes', 'ml', 'model', 'brain', 'layers'], 'nodes'],
  ['chatbot-support', 'Chatbot support', ['chatbot', 'support', 'ai', 'bot', 'help', 'automated', 'assistant', 'message', 'service', 'customer'], 'ai'],
  ['ml-training', 'ML training', ['ml', 'training', 'model', 'learn', 'ai', 'dataset', 'algorithm', 'iterate', 'improve', 'build'], 'ai'],
  ['puzzle-pieces-fit', 'Puzzle pieces fit', ['puzzle', 'pieces', 'fit', 'solution', 'problem', 'solve', 'connect', 'match', 'logic', 'complete'], 'generic'],
  ['maze-exit', 'Maze exit', ['maze', 'exit', 'path', 'navigate', 'problem', 'solve', 'find', 'way', 'challenge', 'route'], 'generic'],
  ['wrench-fix', 'Wrench fix', ['wrench', 'fix', 'repair', 'tool', 'maintain', 'solve', 'technical', 'support', 'adjust', 'service'], 'generic'],
  ['compass-direction', 'Compass direction', ['compass', 'direction', 'navigate', 'guide', 'strategy', 'north', 'course', 'orient', 'plan', 'path'], 'generic'],
  ['magnify-analysis', 'Magnify analysis', ['magnify', 'analysis', 'search', 'inspect', 'research', 'detail', 'zoom', 'examine', 'study', 'find'], 'generic'],
  ['lightbulb-moment', 'Lightbulb moment', ['lightbulb', 'moment', 'idea', 'insight', 'eureka', 'creative', 'innovation', 'spark', 'solution', 'think'], 'ai'],
  ['roadmap-timeline', 'Roadmap timeline', ['roadmap', 'timeline', 'plan', 'milestones', 'strategy', 'future', 'goals', 'schedule', 'vision', 'path'], 'kanban'],
  ['sprint-planning', 'Sprint planning', ['sprint', 'planning', 'agile', 'scrum', 'backlog', 'team', 'iterate', 'goals', 'tasks', 'cycle'], 'kanban'],
  ['feedback-loop', 'Feedback loop', ['feedback', 'loop', 'iterate', 'improve', 'cycle', 'review', 'listen', 'respond', 'continuous', 'refine'], 'nodes'],
  ['retrospective-board', 'Retrospective board', ['retrospective', 'board', 'agile', 'review', 'team', 'lessons', 'improve', 'reflect', 'sprint', 'retro'], 'kanban'],
  ['okr-targets', 'OKR targets', ['okr', 'targets', 'goals', 'objectives', 'key', 'results', 'metrics', 'focus', 'strategy', 'quarter'], 'generic'],
  ['stakeholder-map', 'Stakeholder map', ['stakeholder', 'map', 'influence', 'interests', 'project', 'people', 'relationship', 'plan', 'engage', 'matrix'], 'nodes'],
  ['person-pointing-up', 'Person pointing up', ['pointing', 'up', 'growth', 'direction', 'leader', 'guide', 'ascend', 'goal', 'rise', 'focus'], 'person'],
  ['person-holding-phone', 'Person holding phone', ['phone', 'mobile', 'app', 'device', 'communication', 'text', 'social', 'digital', 'screen', 'connect'], 'personCall'],
  ['person-with-clipboard', 'Person with clipboard', ['clipboard', 'notes', 'checklist', 'inspect', 'audit', 'field', 'record', 'survey', 'tasks', 'work'], 'personReading'],
  ['person-celebrating-jump', 'Person celebrating jump', ['celebrate', 'jump', 'joy', 'success', 'excited', 'win', 'happy', 'achievement', 'energy', 'milestone'], 'personWave'],
  ['team-sync-laptops', 'Team sync laptops', ['team', 'sync', 'laptops', 'collaborate', 'remote', 'work', 'together', 'devices', 'meeting', 'share'], 'personLaptop'],
  ['bar-chart-compare', 'Bar chart compare', ['bar', 'chart', 'compare', 'versus', 'benchmark', 'analytics', 'data', 'metrics', 'side', 'performance'], 'bars'],
  ['pie-chart-quarter', 'Pie chart quarter', ['pie', 'chart', 'quarter', 'share', 'segment', 'analytics', 'breakdown', 'portion', 'data', 'ratio'], 'donut'],
  ['line-chart-volatile', 'Line chart volatile', ['line', 'chart', 'volatile', 'fluctuate', 'market', 'trend', 'analytics', 'unstable', 'swing', 'data'], () => T.lineChart(false)],
  ['stacked-area-chart', 'Stacked area chart', ['stacked', 'area', 'chart', 'layers', 'composition', 'analytics', 'trend', 'cumulative', 'data', 'visual'], () => T.lineChart(true)],
  ['gauge-meter', 'Gauge meter', ['gauge', 'meter', 'measure', 'performance', 'kpi', 'speed', 'dial', 'indicator', 'level', 'monitor'], 'donut'],
  ['cloud-download', 'Cloud download', ['cloud', 'download', 'file', 'sync', 'backup', 'storage', 'retrieve', 'data', 'transfer', 'save'], 'cloud'],
  ['api-gateway', 'API gateway', ['api', 'gateway', 'endpoint', 'route', 'integration', 'service', 'proxy', 'connect', 'backend', 'access'], 'nodes'],
  ['mobile-app-launch', 'Mobile app launch', ['mobile', 'app', 'launch', 'release', 'product', 'ship', 'store', 'download', 'startup', 'go'], 'personTablet'],
  ['devops-cycle', 'Devops cycle', ['devops', 'cycle', 'deploy', 'build', 'release', 'automate', 'pipeline', 'iterate', 'ops', 'continuous'], 'nodes'],
  ['container-ship', 'Container ship', ['container', 'ship', 'docker', 'deploy', 'cloud', 'orchestrate', 'kubernetes', 'scale', 'infra', 'load'], 'generic'],
  ['shield-check', 'Shield check', ['shield', 'check', 'security', 'verified', 'safe', 'protect', 'trust', 'approve', 'compliance', 'guard'], 'lock'],
  ['biometric-face', 'Biometric face', ['biometric', 'face', 'scan', 'identity', 'auth', 'security', 'recognition', 'verify', 'login', 'access'], 'ai'],
  ['team-high-five-pair', 'Team high five pair', ['team', 'high', 'five', 'pair', 'celebrate', 'success', 'gesture', 'partners', 'cheer', 'win'], 'team3'],
  ['gift-reward', 'Gift reward', ['gift', 'reward', 'bonus', 'incentive', 'prize', 'recognition', 'thank', 'appreciate', 'present', 'loyalty'], 'cart'],
  ['contract-signing', 'Contract signing', ['contract', 'signing', 'agreement', 'deal', 'legal', 'document', 'signature', 'partnership', 'close', 'terms'], 'generic'],
  ['crm-contacts', 'CRM contacts', ['crm', 'contacts', 'customers', 'leads', 'sales', 'relationship', 'manage', 'pipeline', 'database', 'clients'], 'nodes'],
  ['linkedin-post', 'LinkedIn post', ['linkedin', 'post', 'social', 'professional', 'network', 'content', 'share', 'b2b', 'article', 'publish'], 'generic'],
  ['consulting-advice', 'Consulting advice', ['consulting', 'advice', 'expert', 'strategy', 'guidance', 'business', 'coach', 'recommend', 'insight', 'partner'], 'person'],
  ['qa-checklist-pass', 'QA checklist pass', ['qa', 'checklist', 'pass', 'quality', 'test', 'verify', 'approve', 'inspection', 'standards', 'done'], 'kanban'],
  ['bug-fix-wrench', 'Bug fix wrench', ['bug', 'fix', 'wrench', 'debug', 'repair', 'issue', 'resolve', 'developer', 'patch', 'maintenance'], 'generic'],
  ['bi-report-share', 'BI report share', ['bi', 'report', 'share', 'analytics', 'insights', 'dashboard', 'business', 'intelligence', 'data', 'present'], 'bars'],
  ['customer-journey-map', 'Customer journey map', ['customer', 'journey', 'map', 'experience', 'touchpoint', 'funnel', 'path', 'cx', 'stages', 'flow'], 'nodes'],
  ['product-roadmap-launch', 'Product roadmap launch', ['product', 'roadmap', 'launch', 'release', 'plan', 'features', 'ship', 'strategy', 'timeline', 'go'], 'kanban'],
  ['marketing-funnel-leads', 'Marketing funnel leads', ['marketing', 'funnel', 'leads', 'conversion', 'pipeline', 'prospects', 'growth', 'acquire', 'sales', 'crm'], 'generic'],
  ['finance-report-review', 'Finance report review', ['finance', 'report', 'review', 'accounting', 'analysis', 'numbers', 'audit', 'statements', 'quarterly', 'board'], 'bars'],
  ['wellness-meditation-desk', 'Wellness meditation desk', ['wellness', 'meditation', 'desk', 'calm', 'mindful', 'office', 'balance', 'health', 'peace', 'break'], 'person'],
  ['tech-stack-layers', 'Tech stack layers', ['tech', 'stack', 'layers', 'architecture', 'software', 'platform', 'build', 'infrastructure', 'system', 'components'], 'kanban'],
  ['onboarding-welcome-desk', 'Onboarding welcome desk', ['onboarding', 'welcome', 'desk', 'new', 'hire', 'start', 'first', 'day', 'employee', 'setup'], 'generic'],
  ['feedback-survey-stars', 'Feedback survey stars', ['feedback', 'survey', 'stars', 'rating', 'review', 'opinion', 'customer', 'voice', 'nps', 'listen'], 'generic'],
  ['planning-gantt-chart', 'Planning gantt chart', ['planning', 'gantt', 'chart', 'schedule', 'timeline', 'project', 'tasks', 'milestones', 'manage', 'deadline'], 'kanban'],
  ['celebration-team-trophy', 'Celebration team trophy', ['celebration', 'team', 'trophy', 'win', 'success', 'award', 'achievement', 'champion', 'goal', 'victory'], 'trophy'],
  ['problem-solving-board', 'Problem solving board', ['problem', 'solving', 'board', 'ideas', 'solution', 'brainstorm', 'fix', 'analyze', 'root', 'cause'], 'kanban'],
];

const lines = [
  `/**`,
  ` * Extra flat illustration scenes — appended to UNDRAW_MANIFEST_CORE.`,
  ` * Auto-generated by generate-undraw-extra.mjs; re-run to regenerate.`,
  ` */`,
  `import type { UndrawEntry } from './undraw-manifest.js';`,
  ``,
  `const VB = '${VB}';`,
  ``,
  `export const UNDRAW_MANIFEST_EXTRA: UndrawEntry[] = [`,
];

for (const [slug, title, keywords, tmpl] of defs) {
  const fn = typeof tmpl === 'function' ? tmpl : T[tmpl] ?? T.generic;
  const svg = fn();
  if (!svg.includes('#6c63ff')) throw new Error(`Missing accent in ${slug}`);
  const kw = keywords.map((k) => `'${k.replace(/'/g, "\\'")}'`).join(', ');
  lines.push(`  {`);
  lines.push(`    slug: '${slug}',`);
  lines.push(`    title: '${title.replace(/'/g, "\\'")}',`);
  lines.push(`    keywords: [${kw}],`);
  lines.push(`    svg: \`${svg}\`,`);
  lines.push(`  },`);
}

lines.push(`];`);
lines.push(``);

writeFileSync('undraw-manifest-extra.ts', lines.join('\n'), 'utf8');
console.log(`Wrote ${defs.length} entries to undraw-manifest-extra.ts`);
