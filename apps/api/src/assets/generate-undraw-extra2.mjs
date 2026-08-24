import { writeFileSync } from 'fs';

const VB = '0 0 400 300';
const G = () => `<ellipse cx="200" cy="272" rx="140" ry="12" fill="#e6e6e6"/>`;
const P = (x, y, accent = true) =>
  `<circle cx="${x}" cy="${y}" r="18" fill="#ffb8b8"/><path d="M${x - 22} ${y + 18}h44v54h-44z" fill="${accent ? '#6c63ff' : '#3f3d56'}"/><rect x="${x - 14}" y="${y + 72}" width="10" height="30" fill="#3f3d56"/><rect x="${x + 4}" y="${y + 72}" width="10" height="30" fill="#6c63ff"/>`;

const T = {
  person: (x = 200, y = 120, accent = true) =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}${P(x, y, accent)}</svg>`,
  personLaptop: (x = 240, y = 110) =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="80" y="140" width="140" height="10" rx="3" fill="#3f3d56"/><rect x="100" y="100" width="90" height="60" rx="4" fill="#6c63ff"/><rect x="108" y="108" width="74" height="40" rx="2" fill="#f2f2f2"/>${P(x, y)}</svg>`,
  team3: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<circle cx="140" cy="110" r="16" fill="#ffb8b8"/><path d="M124 128h32v50h-32z" fill="#6c63ff"/><circle cx="200" cy="100" r="18" fill="#ffb8b8"/><path d="M180 120h40v58h-40z" fill="#3f3d56"/><circle cx="260" cy="110" r="16" fill="#ffb8b8"/><path d="M244 128h32v50h-32z" fill="#6c63ff"/><rect x="80" y="200" width="240" height="8" rx="4" fill="#a0a0b8"/></svg>`,
  kanban: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="60" y="70" width="90" height="160" rx="6" fill="#f2f2f2"/><rect x="155" y="70" width="90" height="160" rx="6" fill="#f2f2f2"/><rect x="250" y="70" width="90" height="160" rx="6" fill="#f2f2f2"/><rect x="70" y="85" width="70" height="40" rx="4" fill="#6c63ff"/><rect x="70" y="135" width="70" height="40" rx="4" fill="#e6e6e6"/><rect x="165" y="85" width="70" height="40" rx="4" fill="#a0a0b8"/><rect x="260" y="85" width="70" height="40" rx="4" fill="#6c63ff"/></svg>`,
  nodes: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<g stroke="#a0a0b8" stroke-width="3"><line x1="200" y1="150" x2="100" y2="80"/><line x1="200" y1="150" x2="300" y2="80"/><line x1="200" y1="150" x2="100" y2="220"/><line x1="200" y1="150" x2="300" y2="220"/></g><circle cx="200" cy="150" r="24" fill="#6c63ff"/><circle cx="100" cy="80" r="14" fill="#3f3d56"/><circle cx="300" cy="80" r="14" fill="#3f3d56"/><circle cx="100" cy="220" r="14" fill="#3f3d56"/><circle cx="300" cy="220" r="14" fill="#6c63ff"/></svg>`,
  ai: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<circle cx="200" cy="140" r="60" fill="#f2f2f2" stroke="#6c63ff" stroke-width="4"/><circle cx="170" cy="130" r="10" fill="#6c63ff"/><circle cx="230" cy="130" r="10" fill="#6c63ff"/><rect x="175" y="160" width="50" height="8" rx="4" fill="#a0a0b8"/><g stroke="#6c63ff" stroke-width="2"><line x1="200" y1="80" x2="200" y2="50"/><line x1="200" y1="200" x2="200" y2="230"/><line x1="140" y1="140" x2="110" y2="140"/><line x1="260" y1="140" x2="290" y2="140"/></g></svg>`,
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
  lock: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="150" y="140" width="100" height="80" rx="8" fill="#6c63ff"/><circle cx="200" cy="175" r="14" fill="#f2f2f2"/><rect x="196" y="175" width="8" height="20" fill="#3f3d56"/><path d="M170 140v-30a30 30 0 0 1 60 0v30" fill="none" stroke="#3f3d56" stroke-width="10"/></svg>`,
  generic: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="110" y="80" width="180" height="120" rx="8" fill="#f2f2f2" stroke="#6c63ff" stroke-width="3"/><rect x="130" y="100" width="140" height="10" rx="4" fill="#6c63ff"/><rect x="130" y="120" width="100" height="10" rx="4" fill="#a0a0b8"/></svg>`,
  dashboard: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="80" y="70" width="240" height="150" rx="8" fill="#f2f2f2" stroke="#3f3d56" stroke-width="2"/><rect x="95" y="85" width="70" height="50" rx="4" fill="#6c63ff"/><rect x="175" y="85" width="130" height="50" rx="4" fill="#e6e6e6"/><rect x="95" y="145" width="210" height="60" rx="4" fill="#e6e6e6"/><polyline points="110,185 150,165 190,175 230,140 280,120" fill="none" stroke="#6c63ff" stroke-width="3"/></svg>`,
  okrTree: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="170" y="60" width="60" height="30" rx="4" fill="#6c63ff"/><line x1="200" y1="90" x2="200" y2="110" stroke="#3f3d56" stroke-width="3"/><line x1="120" y1="110" x2="280" y2="110" stroke="#3f3d56" stroke-width="3"/><rect x="90" y="110" width="60" height="26" rx="4" fill="#a0a0b8"/><rect x="170" y="110" width="60" height="26" rx="4" fill="#e6e6e6"/><rect x="250" y="110" width="60" height="26" rx="4" fill="#a0a0b8"/><line x1="120" y1="136" x2="120" y2="155" stroke="#3f3d56" stroke-width="2"/><line x1="200" y1="136" x2="200" y2="155" stroke="#3f3d56" stroke-width="2"/><line x1="280" y1="136" x2="280" y2="155" stroke="#3f3d56" stroke-width="2"/><rect x="70" y="155" width="50" height="22" rx="3" fill="#6c63ff"/><rect x="175" y="155" width="50" height="22" rx="3" fill="#6c63ff"/><rect x="280" y="155" width="50" height="22" rx="3" fill="#6c63ff"/></svg>`,
  stickyWall: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="90" y="60" width="220" height="160" rx="6" fill="#f2f2f2" stroke="#3f3d56" stroke-width="2"/><rect x="110" y="80" width="50" height="40" rx="3" fill="#6c63ff" transform="rotate(-4 135 100)"/><rect x="170" y="75" width="50" height="40" rx="3" fill="#a0a0b8" transform="rotate(3 195 95)"/><rect x="230" y="85" width="50" height="40" rx="3" fill="#e6e6e6" transform="rotate(-2 255 105)"/><rect x="120" y="140" width="50" height="40" rx="3" fill="#e6e6e6"/><rect x="190" y="135" width="50" height="40" rx="3" fill="#6c63ff" transform="rotate(5 215 155)"/><rect x="250" y="145" width="50" height="40" rx="3" fill="#a0a0b8"/></svg>`,
  abTest: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="70" y="90" width="120" height="130" rx="8" fill="#f2f2f2" stroke="#6c63ff" stroke-width="3"/><rect x="210" y="90" width="120" height="130" rx="8" fill="#f2f2f2" stroke="#a0a0b8" stroke-width="3"/><text x="130" y="130" text-anchor="middle" font-size="28" fill="#6c63ff">A</text><text x="270" y="130" text-anchor="middle" font-size="28" fill="#a0a0b8">B</text><rect x="90" y="150" width="80" height="8" rx="4" fill="#6c63ff"/><rect x="230" y="150" width="80" height="8" rx="4" fill="#a0a0b8"/><rect x="90" y="170" width="60" height="8" rx="4" fill="#e6e6e6"/><rect x="230" y="170" width="90" height="8" rx="4" fill="#6c63ff"/></svg>`,
  funnel: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<path d="M100 70h200l-30 50H130z" fill="#6c63ff"/><path d="M130 120h140l-25 45H155z" fill="#a0a0b8"/><path d="M155 165h90l-20 40H175z" fill="#e6e6e6"/><rect x="185" y="205" width="30" height="25" rx="4" fill="#3f3d56"/></svg>`,
  pipeline: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<line x1="60" y1="150" x2="340" y2="150" stroke="#a0a0b8" stroke-width="4"/><circle cx="90" cy="150" r="20" fill="#6c63ff"/><circle cx="160" cy="150" r="20" fill="#a0a0b8"/><circle cx="240" cy="150" r="20" fill="#e6e6e6" stroke="#6c63ff" stroke-width="3"/><circle cx="310" cy="150" r="20" fill="#3f3d56"/><rect x="75" y="185" width="30" height="8" rx="4" fill="#6c63ff"/><rect x="145" y="185" width="30" height="8" rx="4" fill="#a0a0b8"/><rect x="225" y="185" width="30" height="8" rx="4" fill="#6c63ff"/><rect x="295" y="185" width="30" height="8" rx="4" fill="#3f3d56"/></svg>`,
  npsGauge: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<path d="M100 180a100 100 0 0 1 200 0" fill="none" stroke="#e6e6e6" stroke-width="20" stroke-linecap="round"/><path d="M100 180a100 100 0 0 1 140 0" fill="none" stroke="#6c63ff" stroke-width="20" stroke-linecap="round"/><text x="200" y="170" text-anchor="middle" font-size="36" fill="#6c63ff">72</text><text x="200" y="210" text-anchor="middle" font-size="14" fill="#a0a0b8">NPS</text></svg>`,
  churnDown: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<polyline points="90,90 150,120 210,150 270,180 330,210" fill="none" stroke="#6c63ff" stroke-width="4"/><polygon points="330,210 318,204 324,194" fill="#6c63ff"/><circle cx="90" cy="90" r="10" fill="#a0a0b8"/><circle cx="330" cy="210" r="10" fill="#6c63ff"/><text x="200" y="70" text-anchor="middle" font-size="14" fill="#3f3d56">CHURN</text></svg>`,
  retentionLoop: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<path d="M200 70a80 80 0 1 1-56 136" fill="none" stroke="#6c63ff" stroke-width="8"/><polygon points="144,206 130,220 148,218" fill="#6c63ff"/><circle cx="200" cy="150" r="30" fill="#f2f2f2" stroke="#6c63ff" stroke-width="3"/><text x="200" y="157" text-anchor="middle" font-size="14" fill="#6c63ff">%</text></svg>`,
  swot: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<line x1="200" y1="70" x2="200" y2="230" stroke="#3f3d56" stroke-width="2"/><line x1="100" y1="150" x2="300" y2="150" stroke="#3f3d56" stroke-width="2"/><rect x="110" y="80" width="80" height="60" rx="4" fill="#6c63ff"/><rect x="210" y="80" width="80" height="60" rx="4" fill="#a0a0b8"/><rect x="110" y="160" width="80" height="60" rx="4" fill="#e6e6e6"/><rect x="210" y="160" width="80" height="60" rx="4" fill="#f2f2f2" stroke="#6c63ff" stroke-width="2"/></svg>`,
  fishbone: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<line x1="80" y1="150" x2="320" y2="150" stroke="#3f3d56" stroke-width="4"/><polygon points="320,150 305,142 305,158" fill="#6c63ff"/><line x1="140" y1="150" x2="110" y2="100" stroke="#a0a0b8" stroke-width="3"/><line x1="180" y1="150" x2="160" y2="200" stroke="#a0a0b8" stroke-width="3"/><line x1="220" y1="150" x2="240" y2="100" stroke="#6c63ff" stroke-width="3"/><line x1="260" y1="150" x2="280" y2="200" stroke="#a0a0b8" stroke-width="3"/><circle cx="80" cy="150" r="16" fill="#6c63ff"/></svg>`,
  fiveWhys: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="160" y="60" width="80" height="28" rx="4" fill="#6c63ff"/><rect x="160" y="100" width="80" height="28" rx="4" fill="#a0a0b8"/><rect x="160" y="140" width="80" height="28" rx="4" fill="#e6e6e6"/><rect x="160" y="180" width="80" height="28" rx="4" fill="#a0a0b8"/><rect x="160" y="220" width="80" height="28" rx="4" fill="#6c63ff"/><text x="200" y="82" text-anchor="middle" font-size="12" fill="#f2f2f2">WHY</text></svg>`,
  raci: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="80" y="80" width="240" height="140" rx="6" fill="#f2f2f2" stroke="#3f3d56" stroke-width="2"/><line x1="80" y1="115" x2="320" y2="115" stroke="#3f3d56" stroke-width="1"/><line x1="80" y1="150" x2="320" y2="150" stroke="#3f3d56" stroke-width="1"/><line x1="80" y1="185" x2="320" y2="185" stroke="#3f3d56" stroke-width="1"/><line x1="140" y1="80" x2="140" y2="220" stroke="#3f3d56" stroke-width="1"/><line x1="200" y1="80" x2="200" y2="220" stroke="#3f3d56" stroke-width="1"/><line x1="260" y1="80" x2="260" y2="220" stroke="#3f3d56" stroke-width="1"/><circle cx="170" cy="132" r="10" fill="#6c63ff"/><circle cx="230" cy="167" r="10" fill="#6c63ff"/><circle cx="290" cy="132" r="10" fill="#a0a0b8"/></svg>`,
  palette: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<circle cx="200" cy="150" r="70" fill="#f2f2f2" stroke="#3f3d56" stroke-width="2"/><circle cx="170" cy="130" r="18" fill="#6c63ff"/><circle cx="230" cy="125" r="18" fill="#3f3d56"/><circle cx="210" cy="170" r="18" fill="#a0a0b8"/><circle cx="165" cy="175" r="18" fill="#ffb8b8"/><circle cx="200" cy="150" r="12" fill="#e6e6e6"/></svg>`,
  typography: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<text x="200" y="120" text-anchor="middle" font-size="48" fill="#6c63ff" font-family="serif">Aa</text><rect x="120" y="140" width="160" height="8" rx="4" fill="#3f3d56"/><rect x="140" y="160" width="120" height="6" rx="3" fill="#a0a0b8"/><rect x="130" y="178" width="140" height="6" rx="3" fill="#e6e6e6"/><rect x="150" y="196" width="100" height="6" rx="3" fill="#a0a0b8"/></svg>`,
  darkMode: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="130" y="110" width="140" height="70" rx="35" fill="#3f3d56"/><circle cx="220" cy="145" r="22" fill="#6c63ff"/><rect x="148" y="128" width="8" height="34" rx="4" fill="#a0a0b8"/></svg>`,
  mobileFirst: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="160" y="80" width="50" height="90" rx="8" fill="#6c63ff"/><rect x="168" y="90" width="34" height="60" rx="2" fill="#f2f2f2"/><rect x="230" y="100" width="90" height="60" rx="4" fill="#e6e6e6" stroke="#a0a0b8" stroke-width="2"/><rect x="240" y="112" width="70" height="36" rx="2" fill="#f2f2f2"/></svg>`,
  k8s: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<polygon points="200,70 260,110 260,170 200,210 140,170 140,110" fill="none" stroke="#6c63ff" stroke-width="4"/><circle cx="200" cy="140" r="20" fill="#6c63ff"/><circle cx="160" cy="110" r="10" fill="#3f3d56"/><circle cx="240" cy="110" r="10" fill="#3f3d56"/><circle cx="160" cy="170" r="10" fill="#3f3d56"/><circle cx="240" cy="170" r="10" fill="#3f3d56"/></svg>`,
  containers: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="100" y="100" width="80" height="60" rx="4" fill="#6c63ff"/><rect x="110" y="90" width="60" height="10" rx="2" fill="#3f3d56"/><rect x="160" y="120" width="80" height="60" rx="4" fill="#a0a0b8"/><rect x="170" y="110" width="60" height="10" rx="2" fill="#3f3d56"/><rect x="220" y="140" width="80" height="60" rx="4" fill="#e6e6e6" stroke="#6c63ff" stroke-width="2"/><rect x="230" y="130" width="60" height="10" rx="2" fill="#3f3d56"/></svg>`,
  cicd: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="60" y="130" width="60" height="40" rx="6" fill="#6c63ff"/><rect x="140" y="130" width="60" height="40" rx="6" fill="#a0a0b8"/><rect x="220" y="130" width="60" height="40" rx="6" fill="#e6e6e6" stroke="#6c63ff" stroke-width="2"/><rect x="300" y="130" width="40" height="40" rx="6" fill="#3f3d56"/><line x1="120" y1="150" x2="140" y2="150" stroke="#3f3d56" stroke-width="3"/><line x1="200" y1="150" x2="220" y2="150" stroke="#3f3d56" stroke-width="3"/><line x1="280" y1="150" x2="300" y2="150" stroke="#3f3d56" stroke-width="3"/><polygon points="130,150 122,145 122,155" fill="#3f3d56"/><polygon points="210,150 202,145 202,155" fill="#3f3d56"/><polygon points="290,150 282,145 282,155" fill="#3f3d56"/></svg>`,
  alertBell: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<path d="M200 70c-30 0-50 24-50 54v40l-20 20h140l-20-20v-40c0-30-20-54-50-54z" fill="#6c63ff"/><circle cx="200" cy="200" r="12" fill="#3f3d56"/><circle cx="240" cy="85" r="16" fill="#ffb8b8"/><text x="240" y="91" text-anchor="middle" font-size="14" fill="#f2f2f2">!</text></svg>`,
  postmortem: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="120" y="80" width="160" height="130" rx="8" fill="#f2f2f2" stroke="#6c63ff" stroke-width="2"/><rect x="140" y="100" width="120" height="8" rx="4" fill="#6c63ff"/><rect x="140" y="120" width="100" height="8" rx="4" fill="#a0a0b8"/><rect x="140" y="140" width="110" height="8" rx="4" fill="#e6e6e6"/><path d="M140 170h80M140 185h60" stroke="#3f3d56" stroke-width="2"/><circle cx="280" cy="100" r="14" fill="#ffb8b8"/></svg>`,
  handshakeRemote: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="70" y="100" width="100" height="70" rx="6" fill="#f2f2f2" stroke="#6c63ff" stroke-width="2"/>${P(120, 130)}<rect x="230" y="100" width="100" height="70" rx="6" fill="#f2f2f2" stroke="#a0a0b8" stroke-width="2"/>${P(280, 130, false)}<path d="M165 145h70" stroke="#6c63ff" stroke-width="6" stroke-linecap="round"/><line x1="70" y1="100" x2="330" y2="100" stroke="#a0a0b8" stroke-width="2" stroke-dasharray="8 6"/></svg>`,
  hybridOffice: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="60" y="90" width="130" height="100" rx="6" fill="#f2f2f2" stroke="#6c63ff" stroke-width="2"/><rect x="80" y="110" width="90" height="60" rx="4" fill="#e6e6e6"/>${P(125, 130)}<rect x="210" y="90" width="130" height="100" rx="6" fill="#f2f2f2" stroke="#3f3d56" stroke-width="2"/><rect x="230" y="110" width="40" height="30" rx="3" fill="#6c63ff"/><rect x="280" y="110" width="40" height="30" rx="3" fill="#a0a0b8"/><rect x="230" y="150" width="90" height="10" rx="3" fill="#3f3d56"/></svg>`,
  bikeCommute: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<circle cx="150" cy="200" r="30" fill="none" stroke="#3f3d56" stroke-width="6"/><circle cx="250" cy="200" r="30" fill="none" stroke="#3f3d56" stroke-width="6"/><line x1="150" y1="200" x2="200" y2="150" stroke="#3f3d56" stroke-width="5"/><line x1="200" y1="150" x2="250" y2="200" stroke="#3f3d56" stroke-width="5"/><line x1="200" y1="150" x2="210" y2="120" stroke="#3f3d56" stroke-width="4"/><circle cx="215" cy="105" r="14" fill="#ffb8b8"/><path d="M198 122h34v30h-34z" fill="#6c63ff"/></svg>`,
  lunchBreak: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="140" y="140" width="120" height="20" rx="4" fill="#3f3d56"/><ellipse cx="200" cy="140" rx="60" ry="20" fill="#f2f2f2" stroke="#6c63ff" stroke-width="2"/><circle cx="170" cy="135" r="12" fill="#6c63ff"/><circle cx="200" cy="130" r="10" fill="#a0a0b8"/><circle cx="230" cy="135" r="12" fill="#ffb8b8"/>${P(280, 120)}</svg>`,
  dualMonitors: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="70" y="90" width="100" height="70" rx="4" fill="#6c63ff"/><rect x="78" y="98" width="84" height="50" rx="2" fill="#f2f2f2"/><rect x="230" y="90" width="100" height="70" rx="4" fill="#6c63ff"/><rect x="238" y="98" width="84" height="50" rx="2" fill="#f2f2f2"/><rect x="120" y="160" width="160" height="10" rx="3" fill="#3f3d56"/><rect x="170" y="170" width="60" height="30" fill="#3f3d56"/>${P(200, 115)}</svg>`,
  whiteboardSketch: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="90" y="70" width="220" height="140" rx="8" fill="#f2f2f2" stroke="#6c63ff" stroke-width="3"/><path d="M120 110c30-20 60 20 90 0s60 20 90 0" fill="none" stroke="#6c63ff" stroke-width="3"/><circle cx="160" cy="160" r="20" fill="none" stroke="#a0a0b8" stroke-width="3"/><line x1="240" y1="150" x2="280" y2="180" stroke="#3f3d56" stroke-width="3"/>${P(320, 130)}</svg>`,
  podcastMic: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="185" y="80" width="30" height="50" rx="15" fill="#6c63ff"/><path d="M170 130a30 30 0 0 0 60 0" fill="none" stroke="#3f3d56" stroke-width="4"/><line x1="200" y1="160" x2="200" y2="190" stroke="#3f3d56" stroke-width="4"/><rect x="180" y="190" width="40" height="8" rx="4" fill="#3f3d56"/><g stroke="#6c63ff" stroke-width="2"><line x1="160" y1="100" x2="145" y2="85"/><line x1="240" y1="100" x2="255" y2="85"/></g>${P(280, 120)}</svg>`,
  voiceCall: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<circle cx="200" cy="130" r="40" fill="#f2f2f2" stroke="#6c63ff" stroke-width="3"/><path d="M185 120h30v30h-30z" fill="#6c63ff"/><rect x="192" y="128" width="16" height="20" rx="8" fill="#f2f2f2"/><g stroke="#6c63ff" stroke-width="3" stroke-linecap="round"><path d="M160 130c-10 0-18 8-18 18"/><path d="M240 130c10 0 18 8 18 18"/></g>${P(300, 130)}</svg>`,
  newsletterStack: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="130" y="100" width="140" height="100" rx="6" fill="#e6e6e6"/><rect x="120" y="90" width="140" height="100" rx="6" fill="#f2f2f2" stroke="#6c63ff" stroke-width="2"/><rect x="135" y="105" width="110" height="8" rx="4" fill="#6c63ff"/><rect x="135" y="125" width="90" height="6" rx="3" fill="#a0a0b8"/><rect x="135" y="140" width="100" height="6" rx="3" fill="#e6e6e6"/><rect x="135" y="155" width="70" height="6" rx="3" fill="#a0a0b8"/><path d="M135 175h80l-20 15h-60z" fill="#6c63ff"/></svg>`,
  socialGrid: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="90" y="80" width="55" height="55" rx="4" fill="#6c63ff"/><rect x="155" y="80" width="55" height="55" rx="4" fill="#a0a0b8"/><rect x="220" y="80" width="55" height="55" rx="4" fill="#e6e6e6"/><rect x="90" y="145" width="55" height="55" rx="4" fill="#e6e6e6"/><rect x="155" y="145" width="55" height="55" rx="4" fill="#6c63ff"/><rect x="220" y="145" width="55" height="55" rx="4" fill="#a0a0b8"/></svg>`,
  brandBook: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="130" y="70" width="140" height="170" rx="6" fill="#f2f2f2" stroke="#3f3d56" stroke-width="2"/><rect x="150" y="90" width="100" height="40" rx="4" fill="#6c63ff"/><circle cx="200" cy="160" r="25" fill="#a0a0b8"/><rect x="150" y="200" width="100" height="8" rx="4" fill="#e6e6e6"/><rect x="150" y="218" width="70" height="8" rx="4" fill="#3f3d56"/></svg>`,
  accessibility: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<circle cx="200" cy="110" r="50" fill="#f2f2f2" stroke="#6c63ff" stroke-width="4"/><circle cx="200" cy="95" r="12" fill="#6c63ff"/><path d="M170 115h60l-15 50h-30z" fill="#6c63ff"/><circle cx="200" cy="175" r="8" fill="#3f3d56"/><circle cx="185" cy="190" r="8" fill="#3f3d56"/><circle cx="215" cy="190" r="8" fill="#3f3d56"/></svg>`,
  investorPitch: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="100" y="140" width="200" height="12" rx="4" fill="#3f3d56"/><rect x="130" y="90" width="140" height="90" rx="4" fill="#f2f2f2" stroke="#6c63ff" stroke-width="2"/><polyline points="150,150 180,120 210,135 250,90" fill="none" stroke="#6c63ff" stroke-width="3"/>${P(280, 110)}</svg>`,
  burnoutRecovery: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="120" y="160" width="160" height="50" rx="8" fill="#f2f2f2" stroke="#a0a0b8" stroke-width="2"/><circle cx="200" cy="130" r="22" fill="#ffb8b8"/><path d="M172 154h56v20h-56z" fill="#3f3d56"/><path d="M160 120 Q200 90 240 120" fill="none" stroke="#6c63ff" stroke-width="3"/><text x="200" y="195" text-anchor="middle" font-size="12" fill="#6c63ff">REST</text></svg>`,
  commuteTrain: () =>
    `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<rect x="100" y="120" width="200" height="70" rx="10" fill="#6c63ff"/><rect x="120" y="135" width="40" height="30" rx="4" fill="#f2f2f2"/><rect x="180" y="135" width="40" height="30" rx="4" fill="#f2f2f2"/><rect x="240" y="135" width="40" height="30" rx="4" fill="#f2f2f2"/><circle cx="130" cy="200" r="12" fill="#3f3d56"/><circle cx="270" cy="200" r="12" fill="#3f3d56"/><line x1="80" y1="200" x2="320" y2="200" stroke="#a0a0b8" stroke-width="3"/></svg>`,
};

const defs = [
  ['ai-copilot-desk', 'AI copilot at desk', ['ai', 'copilot', 'assistant', 'automation', 'productivity', 'smart', 'help', 'agent', 'work', 'tech'], 'personLaptop'],
  ['analytics-widgets-board', 'Analytics widgets board', ['analytics', 'widgets', 'dashboard', 'metrics', 'kpi', 'monitor', 'data', 'visual', 'business', 'insights'], 'dashboard'],
  ['okr-tree-hierarchy', 'OKR tree hierarchy', ['okr', 'tree', 'hierarchy', 'goals', 'objectives', 'cascade', 'strategy', 'targets', 'align', 'results'], 'okrTree'],
  ['sprint-board-cards', 'Sprint board cards', ['sprint', 'board', 'cards', 'agile', 'scrum', 'tasks', 'backlog', 'planning', 'iterate', 'team'], 'kanban'],
  ['kanban-wip-limits', 'Kanban WIP limits', ['kanban', 'wip', 'limits', 'board', 'flow', 'agile', 'columns', 'tasks', 'process', 'lean'], 'kanban'],
  ['retro-sticky-notes', 'Retro sticky notes', ['retro', 'sticky', 'notes', 'retrospective', 'agile', 'team', 'reflect', 'improve', 'board', 'feedback'], 'stickyWall'],
  ['customer-journey-stages', 'Customer journey stages', ['customer', 'journey', 'stages', 'experience', 'touchpoint', 'cx', 'path', 'funnel', 'map', 'flow'], 'pipeline'],
  ['nps-score-gauge', 'NPS score gauge', ['nps', 'score', 'gauge', 'net', 'promoter', 'feedback', 'survey', 'loyalty', 'customer', 'metric'], 'npsGauge'],
  ['churn-rate-decline', 'Churn rate decline', ['churn', 'rate', 'decline', 'loss', 'customer', 'retention', 'down', 'metric', 'saas', 'cancel'], 'churnDown'],
  ['retention-loop-cycle', 'Retention loop cycle', ['retention', 'loop', 'cycle', 'loyalty', 'repeat', 'customer', 'keep', 'engage', 'renew', 'stick'], 'retentionLoop'],
  ['ab-test-split', 'A/B test split', ['ab', 'test', 'split', 'experiment', 'variant', 'compare', 'optimize', 'conversion', 'hypothesis', 'marketing'], 'abTest'],
  ['sales-pipeline-stages', 'Sales pipeline stages', ['sales', 'pipeline', 'stages', 'crm', 'leads', 'deals', 'prospect', 'close', 'funnel', 'revenue'], 'pipeline'],
  ['invoice-billing-stack', 'Invoice billing stack', ['invoice', 'billing', 'stack', 'payment', 'finance', 'accounting', 'receipt', 'bill', 'document', 'money'], 'generic'],
  ['contract-e-signature', 'Contract e-signature', ['contract', 'signature', 'esign', 'agreement', 'legal', 'document', 'deal', 'sign', 'close', 'terms'], 'generic'],
  ['onboarding-checklist-done', 'Onboarding checklist done', ['onboarding', 'checklist', 'done', 'tasks', 'welcome', 'new', 'hire', 'complete', 'setup', 'start'], 'kanban'],
  ['wiki-knowledge-articles', 'Wiki knowledge articles', ['wiki', 'knowledge', 'articles', 'docs', 'help', 'library', 'reference', 'base', 'information', 'support'], 'generic'],
  ['chatbot-conversation-ui', 'Chatbot conversation UI', ['chatbot', 'conversation', 'ui', 'bot', 'message', 'support', 'ai', 'automated', 'chat', 'help'], 'ai'],
  ['voice-call-headset', 'Voice call headset', ['voice', 'call', 'headset', 'phone', 'talk', 'audio', 'communication', 'support', 'contact', 'dial'], 'voiceCall'],
  ['podcast-microphone-studio', 'Podcast microphone studio', ['podcast', 'microphone', 'studio', 'audio', 'record', 'broadcast', 'media', 'voice', 'content', 'show'], 'podcastMic'],
  ['email-newsletter-stack', 'Email newsletter stack', ['email', 'newsletter', 'stack', 'subscribe', 'campaign', 'mail', 'audience', 'content', 'marketing', 'send'], 'newsletterStack'],
  ['seo-funnel-rank', 'SEO funnel rank', ['seo', 'funnel', 'rank', 'search', 'traffic', 'google', 'optimize', 'leads', 'marketing', 'discover'], 'funnel'],
  ['social-posts-grid', 'Social posts grid', ['social', 'posts', 'grid', 'content', 'media', 'marketing', 'feed', 'share', 'carousel', 'campaign'], 'socialGrid'],
  ['brand-book-guide', 'Brand book guide', ['brand', 'book', 'guide', 'identity', 'style', 'guidelines', 'logo', 'design', 'standards', 'manual'], 'brandBook'],
  ['colour-palette-swatches', 'Colour palette swatches', ['colour', 'palette', 'swatches', 'brand', 'design', 'hue', 'theme', 'visual', 'identity', 'colors'], 'palette'],
  ['typography-specimen', 'Typography specimen', ['typography', 'specimen', 'font', 'type', 'design', 'brand', 'text', 'style', 'letter', 'hierarchy'], 'typography'],
  ['accessibility-inclusive', 'Accessibility inclusive', ['accessibility', 'inclusive', 'a11y', 'universal', 'design', 'wheelchair', 'equal', 'access', 'wcag', 'inclusion'], 'accessibility'],
  ['dark-mode-toggle-ui', 'Dark mode toggle UI', ['dark', 'mode', 'toggle', 'ui', 'theme', 'switch', 'night', 'interface', 'design', 'preference'], 'darkMode'],
  ['mobile-first-layout', 'Mobile first layout', ['mobile', 'first', 'layout', 'responsive', 'design', 'phone', 'adaptive', 'screen', 'priority', 'ux'], 'mobileFirst'],
  ['microservices-mesh', 'Microservices mesh', ['microservices', 'mesh', 'architecture', 'distributed', 'services', 'api', 'scale', 'cloud', 'system', 'modular'], 'nodes'],
  ['kubernetes-orchestration', 'Kubernetes orchestration', ['kubernetes', 'orchestration', 'k8s', 'containers', 'cluster', 'deploy', 'cloud', 'infra', 'scale', 'devops'], 'k8s'],
  ['docker-containers-stack', 'Docker containers stack', ['docker', 'containers', 'stack', 'deploy', 'cloud', 'packaging', 'infra', 'ship', 'scale', 'devops'], 'containers'],
  ['cicd-deploy-pipeline', 'CI/CD deploy pipeline', ['cicd', 'deploy', 'pipeline', 'continuous', 'integration', 'delivery', 'automation', 'build', 'release', 'devops'], 'cicd'],
  ['monitoring-alert-bell', 'Monitoring alert bell', ['monitoring', 'alert', 'bell', 'notification', 'ops', 'incident', 'warning', 'status', 'uptime', 'observe'], 'alertBell'],
  ['incident-response-team', 'Incident response team', ['incident', 'response', 'team', 'ops', 'oncall', 'emergency', 'fix', 'outage', 'support', 'resolve'], 'team3'],
  ['postmortem-review-doc', 'Postmortem review doc', ['postmortem', 'review', 'doc', 'incident', 'lessons', 'blameless', 'report', 'ops', 'learn', 'improve'], 'postmortem'],
  ['root-cause-deep-dive', 'Root cause deep dive', ['root', 'cause', 'deep', 'dive', 'analysis', 'investigate', 'problem', 'fix', 'debug', 'why'], 'fishbone'],
  ['five-whys-ladder', 'Five whys ladder', ['five', 'whys', 'ladder', 'analysis', 'problem', 'investigate', 'iterate', 'cause', 'debug', 'learn'], 'fiveWhys'],
  ['fishbone-diagram-cause', 'Fishbone diagram cause', ['fishbone', 'diagram', 'cause', 'analysis', 'ishikawa', 'problem', 'quality', 'root', 'investigate', 'factor'], 'fishbone'],
  ['swot-matrix-grid', 'SWOT matrix grid', ['swot', 'matrix', 'grid', 'strategy', 'strength', 'weakness', 'opportunity', 'threat', 'plan', 'analysis'], 'swot'],
  ['okr-cascade-tree', 'OKR cascade tree', ['okr', 'cascade', 'tree', 'align', 'goals', 'objectives', 'company', 'team', 'strategy', 'hierarchy'], 'okrTree'],
  ['raci-matrix-table', 'RACI matrix table', ['raci', 'matrix', 'table', 'roles', 'responsible', 'accountable', 'project', 'governance', 'team', 'clarity'], 'raci'],
  ['stakeholder-influence-grid', 'Stakeholder influence grid', ['stakeholder', 'influence', 'grid', 'map', 'power', 'interest', 'engage', 'project', 'people', 'plan'], 'swot'],
  ['budget-pie-allocation', 'Budget pie allocation', ['budget', 'pie', 'allocation', 'finance', 'spend', 'plan', 'cost', 'breakdown', 'fund', 'allocate'], 'donut'],
  ['cashflow-waterfall-finance', 'Cashflow waterfall finance', ['cashflow', 'waterfall', 'finance', 'money', 'flow', 'revenue', 'expense', 'report', 'funds', 'liquidity'], () => T.bars(true)],
  ['investor-pitch-deck', 'Investor pitch deck', ['investor', 'pitch', 'deck', 'startup', 'funding', 'vc', 'presentation', 'raise', 'capital', 'slide'], 'investorPitch'],
  ['remote-handshake-deal', 'Remote handshake deal', ['remote', 'handshake', 'deal', 'partnership', 'virtual', 'agreement', 'close', 'trust', 'b2b', 'connect'], 'handshakeRemote'],
  ['hybrid-office-split', 'Hybrid office split', ['hybrid', 'office', 'split', 'remote', 'work', 'flexible', 'home', 'workplace', 'team', 'balance'], 'hybridOffice'],
  ['commute-train-transit', 'Commute train transit', ['commute', 'train', 'transit', 'travel', 'work', 'transport', 'daily', 'rail', 'journey', 'city'], 'commuteTrain'],
  ['bike-to-work-ride', 'Bike to work ride', ['bike', 'work', 'ride', 'commute', 'cycling', 'green', 'transport', 'active', 'health', 'eco'], 'bikeCommute'],
  ['lunch-break-cafe', 'Lunch break cafe', ['lunch', 'break', 'cafe', 'food', 'rest', 'meal', 'office', 'pause', 'wellness', 'social'], 'lunchBreak'],
  ['burnout-recovery-rest', 'Burnout recovery rest', ['burnout', 'recovery', 'rest', 'wellness', 'stress', 'health', 'balance', 'pause', 'mental', 'heal'], 'burnoutRecovery'],
  ['meditation-yoga-mat', 'Meditation yoga mat', ['meditation', 'yoga', 'mat', 'calm', 'mindful', 'wellness', 'peace', 'health', 'balance', 'relax'], 'person'],
  ['desk-stretch-exercise', 'Desk stretch exercise', ['desk', 'stretch', 'exercise', 'wellness', 'health', 'office', 'body', 'active', 'break', 'posture'], 'person'],
  ['standing-desk-person', 'Standing desk person', ['standing', 'desk', 'person', 'ergonomic', 'health', 'office', 'posture', 'workspace', 'active', 'modern'], 'personLaptop'],
  ['dual-monitors-setup', 'Dual monitors setup', ['dual', 'monitors', 'setup', 'workspace', 'screen', 'productivity', 'desk', 'tech', 'display', 'office'], 'dualMonitors'],
  ['whiteboard-sketching', 'Whiteboard sketching', ['whiteboard', 'sketching', 'draw', 'brainstorm', 'ideas', 'plan', 'visual', 'team', 'strategy', 'design'], 'whiteboardSketch'],
  ['sticky-notes-wall', 'Sticky notes wall', ['sticky', 'notes', 'wall', 'brainstorm', 'ideas', 'workshop', 'plan', 'creative', 'agile', 'collaborate'], 'stickyWall'],
  ['llm-prompt-chat', 'LLM prompt chat', ['llm', 'prompt', 'chat', 'ai', 'gpt', 'language', 'model', 'assistant', 'generate', 'text'], 'ai'],
  ['data-warehouse-lake', 'Data warehouse lake', ['data', 'warehouse', 'lake', 'storage', 'analytics', 'big', 'query', 'cloud', 'etl', 'platform'], 'generic'],
  ['real-time-metrics-live', 'Real time metrics live', ['realtime', 'metrics', 'live', 'monitor', 'dashboard', 'stream', 'analytics', 'kpi', 'pulse', 'data'], 'dashboard'],
  ['cohort-analysis-chart', 'Cohort analysis chart', ['cohort', 'analysis', 'chart', 'retention', 'users', 'segment', 'analytics', 'group', 'behavior', 'data'], () => T.bars(true)],
  ['funnel-conversion-rate', 'Funnel conversion rate', ['funnel', 'conversion', 'rate', 'marketing', 'leads', 'sales', 'optimize', 'growth', 'pipeline', 'metric'], 'funnel'],
  ['lead-scoring-stars', 'Lead scoring stars', ['lead', 'scoring', 'stars', 'sales', 'qualify', 'prospect', 'crm', 'rank', 'priority', 'pipeline'], 'generic'],
  ['account-expansion-grow', 'Account expansion grow', ['account', 'expansion', 'grow', 'upsell', 'revenue', 'customer', 'success', 'retain', 'saas', 'nrr'], () => T.lineChart(true)],
  ['customer-success-handshake', 'Customer success handshake', ['customer', 'success', 'handshake', 'support', 'relationship', 'saas', 'retain', 'trust', 'partner', 'help'], 'handshakeRemote'],
  ['sla-timer-clock', 'SLA timer clock', ['sla', 'timer', 'clock', 'service', 'level', 'agreement', 'support', 'deadline', 'response', 'uptime'], 'generic'],
  ['ticket-queue-support', 'Ticket queue support', ['ticket', 'queue', 'support', 'helpdesk', 'service', 'issues', 'backlog', 'customer', 'resolve', 'desk'], 'kanban'],
  ['escalation-ladder-steps', 'Escalation ladder steps', ['escalation', 'ladder', 'steps', 'support', 'priority', 'incident', 'urgent', 'tier', 'help', 'manage'], 'fiveWhys'],
  ['compliance-checklist-audit', 'Compliance checklist audit', ['compliance', 'checklist', 'audit', 'regulation', 'policy', 'standards', 'verify', 'governance', 'legal', 'cert'], 'kanban'],
  ['audit-trail-log', 'Audit trail log', ['audit', 'trail', 'log', 'history', 'record', 'compliance', 'track', 'security', 'events', 'trace'], 'generic'],
  ['disaster-recovery-plan', 'Disaster recovery plan', ['disaster', 'recovery', 'plan', 'backup', 'resilience', 'ops', 'continuity', 'failover', 'restore', 'risk'], 'cloud'],
  ['backup-restore-cloud', 'Backup restore cloud', ['backup', 'restore', 'cloud', 'data', 'recovery', 'sync', 'storage', 'protect', 'ops', 'save'], 'cloud'],
  ['load-balancer-nodes', 'Load balancer nodes', ['load', 'balancer', 'nodes', 'traffic', 'scale', 'infra', 'distribute', 'network', 'server', 'cloud'], 'nodes'],
  ['service-mesh-network', 'Service mesh network', ['service', 'mesh', 'network', 'microservices', 'connect', 'infra', 'cloud', 'api', 'traffic', 'orchestrate'], 'nodes'],
  ['observability-traces', 'Observability traces', ['observability', 'traces', 'monitor', 'logs', 'metrics', 'devops', 'debug', 'apm', 'telemetry', 'ops'], 'lineChart'],
  ['log-analytics-search', 'Log analytics search', ['log', 'analytics', 'search', 'monitor', 'debug', 'ops', 'query', 'data', 'trace', 'investigate'], 'generic'],
  ['uptime-status-page', 'Uptime status page', ['uptime', 'status', 'page', 'monitor', 'availability', 'health', 'ops', 'service', 'online', 'reliability'], 'dashboard'],
  ['feature-flag-toggle', 'Feature flag toggle', ['feature', 'flag', 'toggle', 'release', 'rollout', 'experiment', 'deploy', 'product', 'control', 'switch'], 'darkMode'],
  ['release-notes-doc', 'Release notes doc', ['release', 'notes', 'doc', 'changelog', 'ship', 'product', 'version', 'update', 'announce', 'launch'], 'generic'],
  ['user-persona-cards', 'User persona cards', ['user', 'persona', 'cards', 'research', 'ux', 'profile', 'customer', 'design', 'audience', 'segment'], 'kanban'],
  ['empathy-map-canvas', 'Empathy map canvas', ['empathy', 'map', 'canvas', 'ux', 'research', 'user', 'design', 'think', 'feel', 'customer'], 'swot'],
  ['value-proposition-canvas', 'Value proposition canvas', ['value', 'proposition', 'canvas', 'product', 'market', 'fit', 'strategy', 'customer', 'offer', 'business'], 'swot'],
  ['business-model-canvas', 'Business model canvas', ['business', 'model', 'canvas', 'strategy', 'startup', 'plan', 'framework', 'innovate', 'design', 'lean'], 'swot'],
  ['competitive-landscape-map', 'Competitive landscape map', ['competitive', 'landscape', 'map', 'market', 'analysis', 'rivals', 'strategy', 'position', 'research', 'compare'], 'swot'],
  ['market-research-survey', 'Market research survey', ['market', 'research', 'survey', 'study', 'data', 'insights', 'customer', 'poll', 'feedback', 'analysis'], 'generic'],
  ['pricing-tier-table', 'Pricing tier table', ['pricing', 'tier', 'table', 'plans', 'subscription', 'saas', 'package', 'compare', 'cost', 'offer'], 'raci'],
  ['roi-calculator-chart', 'ROI calculator chart', ['roi', 'calculator', 'chart', 'return', 'investment', 'finance', 'metric', 'value', 'profit', 'measure'], () => T.bars(true)],
  ['break-even-chart', 'Break even chart', ['break', 'even', 'chart', 'finance', 'cost', 'revenue', 'profit', 'startup', 'plan', 'threshold'], () => T.lineChart(true)],
  ['runway-burn-rate', 'Runway burn rate', ['runway', 'burn', 'rate', 'startup', 'finance', 'cash', 'fund', 'survive', 'months', 'capital'], () => T.lineChart(false)],
  ['venture-capital-handshake', 'Venture capital handshake', ['venture', 'capital', 'handshake', 'funding', 'investor', 'startup', 'deal', 'raise', 'vc', 'partner'], 'handshakeRemote'],
  ['seo-ranking-ladder', 'SEO ranking ladder', ['seo', 'ranking', 'ladder', 'search', 'google', 'traffic', 'growth', 'optimize', 'web', 'climb'], 'fiveWhys'],
  ['voice-ai-assistant', 'Voice AI assistant', ['voice', 'ai', 'assistant', 'speech', 'talk', 'bot', 'smart', 'audio', 'command', 'help'], 'voiceCall'],
  ['monitoring-dashboard-alerts', 'Monitoring dashboard alerts', ['monitoring', 'dashboard', 'alerts', 'ops', 'metrics', 'observe', 'status', 'incident', 'notify', 'system'], 'dashboard'],
  ['onboarding-progress-tracker', 'Onboarding progress tracker', ['onboarding', 'progress', 'tracker', 'steps', 'welcome', 'hire', 'complete', 'setup', 'journey', 'start'], 'pipeline'],
  ['customer-churn-winback', 'Customer churn winback', ['customer', 'churn', 'winback', 'retain', 'recover', 'loyalty', 'cancel', 'save', 'saas', 'success'], 'churnDown'],
  ['ab-experiment-results', 'A/B experiment results', ['ab', 'experiment', 'results', 'test', 'data', 'winner', 'optimize', 'conversion', 'metric', 'learn'], 'abTest'],
  ['incident-postmortem-team', 'Incident postmortem team', ['incident', 'postmortem', 'team', 'ops', 'review', 'learn', 'blameless', 'fix', 'outage', 'improve'], 'postmortem'],
];

// Add cloud template reference
T.cloud = () =>
  `<svg viewBox="${VB}" xmlns="http://www.w3.org/2000/svg">${G()}<ellipse cx="200" cy="140" rx="90" ry="50" fill="#f2f2f2"/><ellipse cx="160" cy="150" rx="50" ry="40" fill="#e6e6e6"/><ellipse cx="250" cy="145" rx="55" ry="42" fill="#e6e6e6"/><path d="M200 100v30M185 115l15 15 15-15" fill="none" stroke="#6c63ff" stroke-width="5" stroke-linecap="round"/></svg>`;

const lines = [
  `/**`,
  ` * Batch-2 flat illustration scenes — appended after UNDRAW_MANIFEST_EXTRA.`,
  ` * Auto-generated by generate-undraw-extra2.mjs; re-run to regenerate.`,
  ` */`,
  `import type { UndrawEntry } from './undraw-manifest.js';`,
  ``,
  `export const UNDRAW_MANIFEST_EXTRA2: UndrawEntry[] = [`,
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

writeFileSync('undraw-manifest-extra2.ts', lines.join('\n'), 'utf8');
console.log(`Wrote ${defs.length} entries to undraw-manifest-extra2.ts`);
