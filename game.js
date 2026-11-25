/* COSMO PANG — 태양계 중력 블록 퍼즐 (스테이지 클리어 방식) */
(() => {
'use strict';

// ───────────────────────── 기본 상수 ─────────────────────────
const DEMO = true;                // 데모 버전: 크레딧 무제한. 정식 출시 때 false로 바꾸면 크레딧 차감이 켜짐
const COLS = 7, ROWS = 8, NT = 6;
const START_TIME = 60, DRAG_TIME = 4, MAX_CHARGE = 3, STAGE_BONUS_TIME = 15, PLAY_COST = 10, COMET_COST = 15;
const DAILY = [50, 60, 70, 80, 100, 120, 200];
const TYPES = [
  { k: 'earth',   col: '#4db2ff' },
  { k: 'mars',    col: '#ff5252' },
  { k: 'sun',     col: '#ffd23a' },
  { k: 'neptune', col: '#a66bff' },
  { k: 'uranus',  col: '#3df0a0' },
  { k: 'saturn',  col: '#ff5fb8' },
];
// 실제 공전 주기(일)와 J2000 평균 황경(도). w = 끌어당기는 힘(게임용), s = 그리는 반지름
const PLANETS = [
  { n: '수성', T: 87.97,    L0: 252.25, w: 2,   c: '#cfcfd6', c2: '#77778a', s: 6 },
  { n: '금성', T: 224.70,   L0: 181.98, w: 2.5, c: '#ffe2b0', c2: '#c98a3a', s: 7.5 },
  { n: '지구', T: 365.26,   L0: 100.46, w: 2.5, c: '#7cc8ff', c2: '#1d5fc4', s: 7.5 },
  { n: '화성', T: 686.98,   L0: 355.45, w: 2,   c: '#ff8a66', c2: '#a8321a', s: 6.5 },
  { n: '목성', T: 4332.59,  L0: 34.40,  w: 3,   c: '#ffd0a0', c2: '#b9703a', s: 11 },
  { n: '토성', T: 10759.22, L0: 49.94,  w: 2.5, c: '#fff0b0', c2: '#c9a04a', s: 9 },
];
const W_SUM = PLANETS.reduce((a, p) => a + p.w, 0);
const ORBIT_BASE = 30;            // 수성이 보드를 한 바퀴 도는 시간(초). 나머지는 실제 주기의 제곱근 비율로 느려짐
PLANETS.forEach(p => { p.sec = ORBIT_BASE * Math.sqrt(p.T / 87.97); });
const ALIGN_RATIO = 0.6;          // 한쪽에 전체 힘의 60% 이상 모이면 행성 정렬
const DIRS = { down: [0, 1, '▼'], up: [0, -1, '▲'], left: [-1, 0, '◀'], right: [1, 0, '▶'] };
const CALLS = [[3, '좋아요!'], [5, '멋져요!'], [8, '대단해!'], [11, '환상적!!'], [14, '우주급!!'], [18, '초신성!!!'], [23, '빅뱅!!!!']];

const $ = id => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const irnd = n => Math.floor(Math.random() * n);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const key = (r, c) => r * COLS + c;
const fmt = n => Math.round(n).toLocaleString('ko-KR');
const today = (d = new Date()) => d.toLocaleDateString('sv-SE');
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return today(d); };

// ───────────────────────── 저장 ─────────────────────────
const SAVE_KEY = 'cosmopang.v1';
const defaults = () => ({ credits: 50, best: 0, bestStage: 0, maxCombo: 0, games: 0, total: 0, streak: 0, lastClaim: '', sound: true, updatedAt: 0 });
let S = defaults();
const Store = {
  load() {
    try { const j = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (j) S = Object.assign(defaults(), j); } catch (e) { /* 저장소 사용 불가 → 메모리만 */ }
  },
  save() {
    S.updatedAt = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* 무시 */ }
    if (window.Cloud && Cloud.user) Cloud.save(S);
    refreshMeta();
  }
};

// ───────────────────────── 오디오 (WebAudio 합성) ─────────────────────────
const Snd = (() => {
  let ac = null, master = null, bgmTimer = null, bar = 0, noiseBuf = null;
  const PENTA = [0, 2, 4, 7, 9];
  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ac = new AC(); master = ac.createGain(); master.gain.value = S.sound ? 0.9 : 0; master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startBgm();
  }
  function tone(f, t0, dur, type = 'sine', vol = 0.2, f2 = null) {
    if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + t0;
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(t0, dur, f1, f2, vol = 0.25, q = 1) {
    if (!ac) return;
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain(), t = ac.currentTime + t0;
    s.buffer = noiseBuf; s.loop = true; fl.type = 'bandpass'; fl.Q.value = q;
    fl.frequency.setValueAtTime(f1, t); fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
  }
  const note = i => 392 * Math.pow(2, (PENTA[i % 5] + 12 * Math.floor(i / 5)) / 12);
  function startBgm() {
    const chords = [[220, 261.6, 329.6, 493.9], [174.6, 220, 261.6, 329.6], [130.8, 196, 246.9, 329.6], [196, 246.9, 293.7, 392]];
    const tick = () => {
      if (!ac || ac.state !== 'running') return;
      const ch = chords[bar++ % 4];
      ch.forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
        o.type = i ? 'sine' : 'triangle'; o.frequency.value = f / (i ? 1 : 2);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.028, t + 1.4); g.gain.linearRampToValueAtTime(0.0001, t + 4.3);
        o.connect(g); g.connect(master); o.start(t); o.stop(t + 4.4);
      });
      const n = G.feverT > 0 ? 16 : 8;
      for (let i = 0; i < n; i++) if (Math.random() < 0.7) tone(ch[irnd(4)] * (Math.random() < 0.5 ? 2 : 4), i * (4 / n), 0.9, 'sine', 0.022);
    };
    tick(); bgmTimer = setInterval(tick, 4000);
  }
  return {
    init,
    mute(on) { if (master) master.gain.value = on ? 0.9 : 0; },
    pop(combo) { const i = Math.min(combo - 1, 14); tone(note(i), 0, 0.22, 'triangle', 0.22); tone(note(i) * 2, 0.03, 0.16, 'sine', 0.1); if (combo >= 5) tone(note(i) * 1.5, 0.06, 0.2, 'sine', 0.08); },
    swap() { tone(520, 0, 0.07, 'sine', 0.1, 760); },
    bad() { tone(160, 0, 0.14, 'sawtooth', 0.08, 110); },
    whoosh() { noise(0, 0.5, 300, 2400, 0.14, 1.5); },
    boom() { noise(0, 0.45, 900, 70, 0.4, 0.7); tone(140, 0, 0.4, 'sine', 0.3, 40); },
    line() { noise(0, 0.3, 3000, 600, 0.2, 2); tone(880, 0, 0.25, 'sawtooth', 0.07, 220); },
    nova() { for (let i = 0; i < 10; i++) tone(note(i), i * 0.045, 0.35, 'triangle', 0.13); noise(0.1, 0.7, 500, 6000, 0.16, 1); },
    comet() { noise(0, 0.7, 5000, 500, 0.24, 3); for (let i = 0; i < 6; i++) tone(note(12 - i), i * 0.05, 0.3, 'sine', 0.07); },
    special() { tone(660, 0, 0.12, 'sine', 0.14); tone(990, 0.07, 0.12, 'sine', 0.14); tone(1320, 0.14, 0.25, 'sine', 0.14); },
    fever() { for (let i = 0; i < 8; i++) tone(note(i + 3), i * 0.06, 0.3, 'square', 0.05); },
    coin() { tone(988, 0, 0.09, 'square', 0.07); tone(1319, 0.08, 0.3, 'square', 0.07); },
    tick() { tone(1000, 0, 0.05, 'square', 0.05); },
    over() { [9, 7, 5, 2, 0].forEach((n, i) => tone(note(n), i * 0.13, 0.5, 'triangle', 0.14)); },
    grav() { noise(0, 0.6, 200, 1400, 0.12, 1.2); tone(90, 0, 0.5, 'sine', 0.16, 180); },
  };
})();
const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* 무시 */ } };

// ───────────────────────── 이미지 ─────────────────────────
const IMG = {};
function loadImages() {
  return Promise.all([...TYPES.map(t => t.k), 'mascot', 'blackhole', 'alien'].map(k => new Promise(res => {
    const im = new Image(); im.onload = im.onerror = res; im.src = `assets/${k}.png`; IMG[k] = im;
  })));
}
const glowCache = {};
function glow(col) {
  if (glowCache[col]) return glowCache[col];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, '#fff'); g.addColorStop(0.18, col); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.globalAlpha = 1; x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return glowCache[col] = c;
}

// ───────────────────────── 게임 상태 ─────────────────────────
const G = {
  state: 'home', grid: [], busy: false, stage: 1, cleared: 0, score: 0, shown: 0, combo: 0, comboT: 0, comboMax: 2.6, maxCombo: 0,
  time: START_TIME, fever: 0, feverT: 0, drag: null, idle: 0, hint: null, left: 0, ver: 0,
  grav: 'down', gravLock: 0, gravDirty: false, slosh: 0, align: false, side: { up: 0, right: 0, down: 0, left: 0 },
  orbitDays: 0, cometT: 15, cometQ: false, shake: 0, flash: 0, mascotJump: 0, lastTick: 0, earned: 0,
  dying: [], parts: [], rings: [], beams: [], texts: [], comets: [], callout: null,
};
let pid = 1, T = 0;
const L = { W: 0, H: 0, cs: 50, bx: 0, by: 0, bw: 0, bh: 0, m: 30, sy: 80, tx: 0, ty: 0, tw: 0, th: 0, dpr: 1 };
const cv = $('cv'), ctx = cv.getContext('2d');

function layout() {
  const app = $('app'), W = app.clientWidth, H = app.clientHeight;
  L.dpr = Math.min(2, window.devicePixelRatio || 1); L.W = W; L.H = H;
  cv.width = W * L.dpr; cv.height = H * L.dpr;
  const top = 52, strip = 62, bot = 96, m = L.m = Math.max(26, Math.min(36, W * 0.085));
  L.cs = Math.floor(Math.min((W - 2 * m - 4) / COLS, (H - top - strip - bot - 2 * m - 14) / ROWS));
  L.bw = L.cs * COLS; L.bh = L.cs * ROWS; L.bx = (W - L.bw) / 2;
  const free = Math.max(0, H - top - strip - bot - L.bh - 2 * m - 14);
  L.sy = top + strip / 2 + free * 0.15; L.by = top + strip + m + free * 0.45;
  L.tx = L.bx - m * 0.56; L.ty = L.by - m * 0.56; L.tw = L.bw + m * 1.12; L.th = L.bh + m * 1.12;
}
const cellX = c => L.bx + (c + 0.5) * L.cs, cellY = r => L.by + (r + 0.5) * L.cs;

// ───────────────────────── 보드 로직 ─────────────────────────
function mk(kind, t, r, c) { return { id: pid++, kind, t, fuse: 0, eat: 0, x: c, y: r, fx: c, fy: r, tx: c, ty: r, tt: 0, td: 0, ez: 0, land: false, squash: 0, gone: false }; }
function tween(p, x, y, dur, ez = 0, land = false) { p.fx = p.x; p.fy = p.y; p.tx = x; p.ty = y; p.tt = 0; p.td = dur; p.ez = ez; p.land = land; }
const at = (r, c) => (r >= 0 && r < ROWS && c >= 0 && c < COLS) ? G.grid[r][c] : null;
const NB = [[0, 1], [1, 0], [0, -1], [-1, 0]];

function stageSpec(n) {
  return { types: Math.min(NT, 4 + Math.floor(n / 3)), holes: n < 2 ? 0 : Math.min(3, Math.ceil(n / 2)), bombs: n < 2 ? 0 : Math.min(4, Math.floor(n / 2)), fuse: Math.max(10, 22 - n) };
}
function buildStage() {
  const sp = stageSpec(G.stage);
  G.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  const spots = []; for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) spots.push([r, c]);
  for (let i = spots.length - 1; i > 0; i--) { const j = irnd(i + 1); [spots[i], spots[j]] = [spots[j], spots[i]]; }
  for (let i = 0; i < sp.holes; i++) { const [r, c] = spots.pop(); const h = mk('hole', -1, r, c); h.eat = rnd(5, 8); G.grid[r][c] = h; }
  for (let i = 0; i < sp.bombs; i++) { const [r, c] = spots.pop(); const b = mk('bomb', -1, r, c); b.fuse = sp.fuse + i * 6; G.grid[r][c] = b; }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (G.grid[r][c]) continue;
    let t; do { t = irnd(sp.types); } while ((bt(r, c - 1) === t && bt(r, c - 2) === t) || (bt(r - 1, c) === t && bt(r - 2, c) === t));
    G.grid[r][c] = mk('b', t, r, c);
  }
  // 반대편 우주에서 날아 들어오는 등장 연출
  const [dx, dy] = DIRS[G.grav];
  G.grid.flat().forEach(p => {
    const d = dy ? (dy > 0 ? ROWS - 1 - p.ty : p.ty) : (dx > 0 ? COLS - 1 - p.tx : p.tx);
    p.x -= dx * (COLS + 2); p.y -= dy * (ROWS + 2); tween(p, p.tx, p.ty, 380 + d * 45 + irnd(60), 1, true);
  });
  G.time = G.stageTime = Math.max(36, START_TIME - (G.stage - 1) * 3); G.freeComet = 1; G.charges = 2; G.cometT = rnd(20, 30); G.hint = null; G.idle = 0; G.drag = null; G.pdrag = null; G.ver++;
  callout('STAGE ' + G.stage, '#3df0c8');
}
const remaining = () => G.grid.flat().filter(p => p && p.kind !== 'hole').length;
function typeCounts() { const n = Array(NT).fill(0); for (const row of G.grid) for (const p of row) if (p && p.kind === 'b') n[p.t]++; return n; }
const bt = (r, c) => { const p = at(r, c); return p && p.kind === 'b' ? p.t : -1; };
// 같은 행성이 한 줄로 3개 이상(그 행성이 2개만 남았으면 2개)이면 매치. 겹치는 줄은 한 묶음으로 합침
function findGroups() {
  const cnt = typeCounts(), need = t => cnt[t] <= 2 ? 2 : 3, runs = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS;) {
    const t = bt(r, c); let e = c + 1; if (t >= 0) while (e < COLS && bt(r, e) === t) e++;
    if (t >= 0 && e - c >= need(t)) { const cells = []; for (let i = c; i < e; i++) cells.push([r, i]); runs.push({ t, o: 'h', i: r, cells }); }
    c = e;
  }
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS;) {
    const t = bt(r, c); let e = r + 1; if (t >= 0) while (e < ROWS && bt(e, c) === t) e++;
    if (t >= 0 && e - r >= need(t)) { const cells = []; for (let i = r; i < e; i++) cells.push([i, c]); runs.push({ t, o: 'v', i: c, cells }); }
    r = e;
  }
  const groups = [];
  for (const run of runs) {
    const ks = run.cells.map(([r, c]) => key(r, c)), hit = groups.filter(g => g.t === run.t && ks.some(k => g.keys.has(k)));
    let g = hit[0]; if (!g) { g = { t: run.t, keys: new Set(), runs: [] }; groups.push(g); }
    for (const h of hit.slice(1)) { h.keys.forEach(k => g.keys.add(k)); g.runs.push(...h.runs); groups.splice(groups.indexOf(h), 1); }
    ks.forEach(k => g.keys.add(k)); g.runs.push(run);
  }
  return groups;
}
// 한 칸만 옮겨도 맞는 수 찾기 (힌트용)
// 중력 파도 중에는 줄이 아니어도 같은 행성 3개 이상이 붙어 뭉치면 터진다
function findClusters() {
  const cnt = typeCounts(), seen = new Set(), groups = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = bt(r, c); if (t < 0 || seen.has(key(r, c))) continue;
    const out = [[r, c]]; seen.add(key(r, c));
    for (let i = 0; i < out.length; i++) for (const [dr, dc] of NB) { const r2 = out[i][0] + dr, c2 = out[i][1] + dc; if (bt(r2, c2) === t && !seen.has(key(r2, c2))) { seen.add(key(r2, c2)); out.push([r2, c2]); } }
    if (out.length >= (cnt[t] <= 2 ? 2 : 3)) groups.push({ t, keys: new Set(out.map(([a, b]) => key(a, b))), runs: [{ t, o: 'h', i: r, cells: out.slice(0, Math.min(out.length, 3)) }] });
  }
  return groups;
}
function findHintMove() {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) for (const [dr, dc] of [[0, 1], [1, 0]]) {
    const a = at(r, c), b = at(r + dr, c + dc); if (!a || a.kind === 'hole' || (b && b.kind === 'hole') || r + dr >= ROWS || c + dc >= COLS) continue;
    G.grid[r][c] = b; G.grid[r + dr][c + dc] = a; const ok = findGroups().length > 0; G.grid[r][c] = a; G.grid[r + dr][c + dc] = b;
    if (ok) return [[r, c], [r + dr, c + dc]];
  }
  return null;
}
function lineOrder(dir) {
  const [dx, dy] = DIRS[dir], vertical = dy !== 0, len = vertical ? ROWS : COLS, sgn = vertical ? dy : dx;
  const order = []; for (let i = 0; i < len; i++) order.push(sgn > 0 ? len - 1 - i : i);
  return { vertical, lines: vertical ? COLS : ROWS, order };
}
function simCollapse(g, dir) {
  const { vertical, lines, order } = lineOrder(dir);
  for (let l = 0; l < lines; l++) {
    let w = 0;
    order.forEach((i, n) => {
      const v = vertical ? g[i][l] : g[l][i]; if (v === null) return;
      if (v === 'H') { w = n + 1; return; }
      if (n !== w) { if (vertical) { g[i][l] = null; g[order[w]][l] = v; } else { g[l][i] = null; g[l][order[w]] = v; } }
      w++;
    });
  }
}
// 중력 방향으로 블록이 쏠림 (새 블록 없음, 블랙홀은 제자리에서 벽 역할)
async function collapse() {
  const { vertical, lines, order } = lineOrder(G.grav); let maxD = 0;
  for (let l = 0; l < lines; l++) {
    let w = 0;
    order.forEach((i, n) => {
      const p = vertical ? G.grid[i][l] : G.grid[l][i]; if (!p) return;
      if (p.kind === 'hole') { w = n + 1; return; }
      if (n !== w) {
        const j = order[w];
        if (vertical) { G.grid[i][l] = null; G.grid[j][l] = p; tween(p, l, j, 120 + 45 * (n - w), 1, true); }
        else { G.grid[l][i] = null; G.grid[l][j] = p; tween(p, j, l, 120 + 45 * (n - w), 1, true); }
        maxD = Math.max(maxD, 120 + 45 * (n - w));
      }
      w++;
    });
  }
  G.ver++;
  if (maxD) await sleep(maxD + 30);
  return maxD > 0;
}
const mult = () => (G.waveMult || 1) * (1 + (Math.min(G.combo, 25) - 1) * 0.5) * (G.align ? 2 : 1) * (G.feverT > 0 ? 2 : 1);
function kill(r, c) {
  const p = G.grid[r][c]; if (!p) return null;
  G.grid[r][c] = null; G.dying.push({ p, t: 0 }); G.ver++;
  burst(cellX(c), cellY(r), p.kind === 'b' ? TYPES[p.t].col : p.kind === 'hole' ? '#c9a0ff' : '#b6ff3a', 7 + Math.min(8, G.combo));
  return p;
}
function addScore(pts, x, y, size = 20) {
  pts = Math.round(pts / 10) * 10; G.score += pts;
  G.texts.push({ x, y, s: '+' + fmt(pts), t: 0, size, col: G.feverT > 0 ? '#ffd23a' : '#fff' });
}
// 외계행성 제거: good=해체 성공, bad=시간 초과 폭발. 주변 블록은 건드리지 않음
function blast(r, c, good) {
  const b = kill(r, c); if (!b) return 0;
  G.rings.push({ x: cellX(c), y: cellY(r), t: 0, max: L.cs * 2.2, col: good ? '#b6ff3a' : '#ff5252' });
  Snd.boom(); G.shake = Math.min(18, G.shake + (good ? 5 : 11)); G.flash = good ? 0.2 : 0.4; buzz(40);
  return 1;
}
function timeBonus(sec, x, y) { G.time = Math.min(99, G.time + sec); G.texts.push({ x, y, s: `+${sec}초`, t: -0.15, size: 20, col: '#3df0c8' }); }
// 매치된 묶음을 하나씩 차례로 터뜨림 (묶음마다 콤보 +1)
async function popGroups(groups) {
  for (const g of groups) {
    const cells = [...g.keys].map(k => [Math.floor(k / COLS), k % COLS]).filter(([r, c]) => at(r, c));
    if (!cells.length) continue;
    bumpCombo(); G.chain++;
    const n = cells.length, bombs = new Set(); let sx = 0, sy = 0;
    for (const [a, b] of cells) {
      kill(a, b); sx += cellX(b); sy += cellY(a);
      for (const [dr, dc] of NB) { const q = at(a + dr, b + dc); if (q && q.kind === 'bomb') bombs.add(key(a + dr, b + dc)); }
    }
    addScore(n * (n - 1) * 15 * mult(), sx / n, sy / n, Math.min(36, 17 + G.combo * 1.3 + n));
    G.shake = Math.min(16, G.shake + 2 + n * 0.6 + G.combo * 0.4); Snd.pop(G.combo); buzz(12);
    G.rings.push({ x: sx / n, y: sy / n, t: 0, max: L.cs * (1 + n * 0.25), col: TYPES[g.t].col });
    if (G.feverT <= 0) { G.fever += n * 2.6; if (G.fever >= 100) startFever(); }
    for (const k of bombs) {
      const br = Math.floor(k / COLS), bc = k % COLS; if (!at(br, bc)) continue;
      blast(br, bc, true); addScore(300 * mult(), cellX(bc), cellY(br) - 14, 24); timeBonus(2, cellX(bc), cellY(br) + 16); callout('외계행성 해체!', '#b6ff3a');
    }
    // 큰 매치 보너스
    const longest = g.runs.reduce((a, b) => b.cells.length > a.cells.length ? b : a);
    const cross = g.runs.some(r => r.o === 'h') && g.runs.some(r => r.o === 'v');
    if (longest.cells.length >= 5) {          // 5개: 초신성 — 같은 행성 전부 소멸
      let got = 0; G.grid.forEach((row, r) => row.forEach((q, c) => { if (q && q.kind === 'b' && q.t === g.t) { kill(r, c); got++; } }));
      Snd.nova(); G.flash = 0.5; G.rings.push({ x: sx / n, y: sy / n, t: 0, max: L.cs * 6, col: '#fff' }); callout('초신성!', '#ffd23a');
      if (got) addScore(got * 60 * mult(), L.W / 2, L.by + L.bh / 2, 26); timeBonus(4, sx / n, sy / n + 22);
    } else if (cross) {                       // ㄱ/ㅗ 모양: 점수 3배 + 3초
      addScore(n * (n - 1) * 30 * mult(), sx / n, sy / n - 26, 24); timeBonus(3, sx / n, sy / n + 22);
      G.rings.push({ x: sx / n, y: sy / n, t: 0, max: L.cs * 2.8, col: '#ffb03a' }); Snd.special(); G.flash = 0.25; callout('행성 충돌!', '#ffb03a');
    } else if (longest.cells.length === 4) {  // 4개: 점수 2배 + 2초
      addScore(n * (n - 1) * 15 * mult(), sx / n, sy / n - 26, 22); timeBonus(2, sx / n, sy / n + 22); Snd.special();
    }
    await sleep(190);
  }
}
// 평소엔 무중력: 터져도 블록은 제자리에 떠 있다.
// wave=true(중력 파도)일 때만 전부 한쪽으로 쏟아지고, 부딪혀 맞은 줄이 연쇄로 터진다 (연쇄마다 배율 +1, +2초)
async function resolve(wave) {
  G.chain = 0; G.waveMult = 1;
  if (wave) {
    let k = 0; Snd.whoosh(); G.shake = Math.max(G.shake, 8); buzz(30);
    for (let guard = 0; guard < 40 && G.state === 'play'; guard++) {
      const moved = await collapse();
      if (moved) { G.shake = Math.max(G.shake, 6); Snd.boom(); }
      const g = findClusters(); if (!g.length) break;
      k++; G.waveMult = k + 1; G.maxWave = Math.max(G.maxWave || 0, k);
      callout(k === 1 ? '중력 파도!' : `중력 파도 ${k}연쇄 ×${k + 1}`, k >= 3 ? '#ffd23a' : '#9fe8ff'); G.mascotJump = 1; G.flash = Math.min(0.5, 0.12 * k);
      timeBonus(2, L.W / 2, L.by + L.bh * 0.6);
      await popGroups(g);
    }
    G.waveMult = 1;
    if (k >= 3 && G.charges < MAX_CHARGE) { G.charges++; G.texts.push({ x: L.W / 2, y: L.sy + 30, s: '중력 조종 +1', t: 0, size: 18, col: '#ffe08a' }); Snd.coin(); }
  }
  for (let guard = 0; guard < 60 && G.state === 'play'; guard++) {
    const g = findGroups();
    if (g.length) { await popGroups(g); continue; }
    const cnt = typeCounts(); let lone = false;
    G.grid.forEach((row, r) => row.forEach((p, c) => {      // 혼자 남은 행성은 스스로 사라짐
      if (p && p.kind === 'b' && cnt[p.t] === 1) { kill(r, c); addScore(100 * mult(), cellX(c), cellY(r), 18); lone = true; }
    }));
    if (!lone && !cnt.some(Boolean)) G.grid.forEach((row, r) => row.forEach((p, c) => { if (p && p.kind === 'bomb' && at(r, c)) { blast(r, c, true); addScore(300 * mult(), cellX(c), cellY(r), 22); lone = true; } }));
    if (lone) { Snd.special(); await sleep(220); continue; }
    break;
  }
  if (G.state === 'play' && remaining() === 0) await stageClear();
}
// ── 끌기: 블록 하나를 잡고 끌면 지나가는 블록과 자리가 바뀐다
function dragStart(r, c) {
  const p = at(r, c); if (G.state !== 'play' || G.busy || G.drag || !p || p.kind === 'hole') return false;
  G.drag = { p, r, c, t: DRAG_TIME, moved: false, px: cellX(c), py: cellY(r) }; G.hint = null; G.idle = 0; return true;
}
function dragTo(tr, tc) {
  const d = G.drag; if (!d) return;
  tr = Math.max(0, Math.min(ROWS - 1, tr)); tc = Math.max(0, Math.min(COLS - 1, tc));
  for (let guard = 0; guard < 16 && (d.r !== tr || d.c !== tc); guard++) {
    const dr = Math.sign(tr - d.r), dc = Math.sign(tc - d.c);
    const opts = Math.abs(tr - d.r) >= Math.abs(tc - d.c) ? [[dr, 0], [0, dc]] : [[0, dc], [dr, 0]];
    const step = opts.find(([a, b]) => (a || b) && !(at(d.r + a, d.c + b) && at(d.r + a, d.c + b).kind === 'hole'));
    if (!step) break;                               // 블랙홀은 지나갈 수 없음
    const nr = d.r + step[0], nc = d.c + step[1], q = at(nr, nc);
    G.grid[d.r][d.c] = q; if (q) tween(q, d.c, d.r, 90);
    G.grid[nr][nc] = d.p; d.p.tx = d.p.x = nc; d.p.ty = d.p.y = nr; d.p.td = 0; d.r = nr; d.c = nc; d.moved = true; G.ver++;
    Snd.swap();
  }
}
async function dragEnd() {
  const d = G.drag; if (!d) return; G.drag = null;
  d.p.x = (d.px - L.bx) / L.cs - 0.5; d.p.y = (d.py - L.by) / L.cs - 0.5; tween(d.p, d.c, d.r, 90);
  if (!d.moved) return;
  G.busy = true; await sleep(100); await resolve(false); G.busy = false;
}
// 혜성이 한 줄을 쓸어감 (블록·외계행성·블랙홀 모두 제거)
async function sweep(lines) {
  for (const [o, i] of lines) {
    if (o === 'h') G.comets.push({ x0: -60, y0: cellY(i) - 30, x1: L.W + 60, y1: cellY(i) + 30, t: 0 });
    else G.comets.push({ x0: cellX(i) + 40, y0: L.by - 90, x1: cellX(i) - 40, y1: L.by + L.bh + 90, t: 0 });
  }
  Snd.comet(); await sleep(330); G.flash = 0.3;
  let n = 0, sx = 0, sy = 0;
  for (const [o, i] of lines) for (let k = 0; k < (o === 'h' ? COLS : ROWS); k++) {
    const r = o === 'h' ? i : k, c = o === 'h' ? k : i, p = kill(r, c); if (!p) continue;
    n += p.kind === 'b' ? 1 : 8; sx += cellX(c); sy += cellY(r);
    if (o === 'h') G.beams.push({ x: L.bx, y: cellY(r) - L.cs * 0.3, w: L.bw, h: L.cs * 0.6, t: 0 }); else G.beams.push({ x: cellX(c) - L.cs * 0.3, y: L.by, w: L.cs * 0.6, h: L.bh, t: 0 });
  }
  if (n) { addScore(n * 30 * mult(), L.W / 2, L.by + L.bh / 2, 26); G.shake = Math.min(16, G.shake + 6); Snd.line(); }
  await sleep(170);
}
function fullestLine(o) {
  let best = 0, bi = 0; const len = o === 'h' ? ROWS : COLS;
  for (let i = 0; i < len; i++) { let n = 0; for (let k = 0; k < (o === 'h' ? COLS : ROWS); k++) { const p = o === 'h' ? G.grid[i][k] : G.grid[k][i]; if (p) n += p.kind === 'b' ? 1 : 2; } if (n > best) { best = n; bi = i; } }
  return [o, bi, best];
}
async function cometStrike(user) {
  if (G.state !== 'play') return;
  G.busy = true; bumpCombo();
  let lines;
  if (user) { lines = [fullestLine('h'), fullestLine('v')]; callout('혜성 소환!', '#9fe8ff'); }
  else {       // 랜덤 혜성: 블록이 있는 아무 줄
    const cand = []; for (let i = 0; i < ROWS; i++) if (G.grid[i].some(Boolean)) cand.push(['h', i]);
    for (let i = 0; i < COLS; i++) if (G.grid.some(row => row[i])) cand.push(['v', i]);
    lines = [cand[irnd(cand.length)]]; callout('혜성이다!', '#9fe8ff');
  }
  await sweep(lines); await resolve(false);
  G.cometT = rnd(20, 30); G.busy = false;
}
async function holeEat(r, c, h) {
  const [dx, dy] = DIRS[G.grav], pr = r - dy, pc = c - dx, p = at(pr, pc);
  if (!p || p.kind === 'hole') { h.eat = 1.5; return; }
  G.busy = true; h.eat = rnd(5, 8);
  G.grid[pr][pc] = null; p.gone = true; G.dying.push({ p, t: -0.22 }); tween(p, c, r, 220, 1); G.ver++;
  Snd.grav(); h.squash = 1; G.combo = 0;
  G.time = Math.max(0.5, G.time - 2); G.texts.push({ x: cellX(c), y: cellY(r) - L.cs * 0.5, s: '꿀꺽 −2초', t: 0, size: 19, col: '#ff8a8a' });
  await sleep(260); await resolve(false);
  G.busy = false;
}
async function bombExplode(r, c) {
  G.busy = true; blast(r, c, false);
  G.time = Math.max(0.5, G.time - 8); G.combo = 0; callout('외계행성 폭발! −8초', '#ff5252');
  await sleep(240); await resolve(false);
  G.busy = false;
}
async function stageClear() {
  const bonus = Math.ceil(G.time) * 20 * G.stage;
  G.cleared = G.stage; callout('STAGE CLEAR!', '#ffd23a'); Snd.fever(); G.flash = 0.6; G.mascotJump = 1; buzz(60);
  for (let i = 0; i < 5; i++) G.rings.push({ x: rnd(L.bx, L.bx + L.bw), y: rnd(L.by, L.by + L.bh), t: -i * 0.08, max: L.cs * 3, col: TYPES[i].col });
  for (let i = 0; i < 60; i++) burst(rnd(L.bx, L.bx + L.bw), rnd(L.by, L.by + L.bh), TYPES[irnd(NT)].col, 1);
  G.grid.forEach((row, r) => row.forEach((p, c) => { if (p) kill(r, c); }));
  G.score += bonus; G.texts.push({ x: L.W / 2, y: L.by + L.bh * 0.62, s: `남은 시간 보너스 +${fmt(bonus)}`, t: -0.3, size: 20, col: '#3df0c8' });
  await sleep(1300);
  G.stage++; buildStage(); await sleep(900);
}
function bumpCombo() {
  G.combo++; G.comboMax = G.comboT = Math.max(1.5, 3 - G.combo * 0.05); G.maxCombo = Math.max(G.maxCombo, G.combo);
  for (let i = CALLS.length - 1; i >= 0; i--) if (G.combo === CALLS[i][0]) { callout(CALLS[i][1], TYPES[i % NT].col); G.mascotJump = 1; break; }
}
function startFever() { G.fever = 100; G.feverT = 8; callout('FEVER ×2', '#ff5fb8'); Snd.fever(); G.flash = 0.5; G.mascotJump = 1; }
function callout(s, col = '#fff') { G.callout = { s, col, t: 0 }; }
function burst(x, y, col, n) {
  if (G.parts.length > 420) n = Math.min(n, 3);
  for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), v = rnd(60, 330); G.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: rnd(0.35, 0.8), size: rnd(6, 16), col }); }
}

// ───────────────────────── 게임 흐름 ─────────────────────────
function realOrbitDays() { return (Date.now() - Date.UTC(2000, 0, 1, 12)) / 86400000; }
function startGame() {
  if (!DEMO && S.credits < PLAY_COST) { toast('크레딧이 부족해요 — 내일 출석 보상을 받으세요 ✦'); return; }
  Snd.init();
  if (!DEMO) S.credits -= PLAY_COST;
  S.games++; Store.save();
  Object.assign(G, { state: 'play', busy: true, stage: 1, cleared: 0, score: 0, shown: 0, combo: 0, comboT: 0, maxCombo: 0, fever: 0, feverT: 0,
    drag: null, pdrag: null, maxWave: 0, waveMult: 1, usedPlanet: false, cometQ: false, shake: 0, earned: 0, orbitDays: realOrbitDays(), gravLock: 1.5, gravDirty: false,
    dying: [], parts: [], rings: [], beams: [], texts: [], comets: [], callout: null });
  PLANETS.forEach(p => { p.off = 0; }); updateGravity(0, true); buildStage();
  $('home').classList.add('hidden'); $('hud').classList.remove('hidden'); closeModal(); refreshMeta();
  setTimeout(() => { if (G.state === 'play') G.busy = false; }, 900);
}
async function failStage(why) {
  G.state = 'ending'; G.busy = true; G.drag = null; G.pdrag = null;
  callout('STAGE ' + G.stage + ' 실패', '#ff5252'); Snd.over(); G.shake = 10; await sleep(1500);
  const isBest = G.score > S.best;
  G.earned = Math.min(5, G.cleared);
  S.best = Math.max(S.best, G.score); S.bestStage = Math.max(S.bestStage || 0, G.cleared); S.maxCombo = Math.max(S.maxCombo, G.maxCombo); S.total += G.score; S.credits += G.earned;
  Store.save(); G.state = 'over'; G.busy = false;
  if (isBest) Snd.fever(); else Snd.coin();
  openModal(`
    ${isBest ? '<span class="badge">NEW RECORD</span>' : ''}
    <h2 style="margin-top:8px">STAGE ${G.stage} 실패</h2>
    <p>${why} · 블록 ${remaining()}개가 남았어요</p>
    <div class="big">${fmt(G.score)}</div>
    <div class="kv"><span>클리어한 스테이지</span><b>${G.cleared}</b></div>
    <div class="kv"><span>최고 점수 / 최고 스테이지</span><b>${fmt(S.best)} / ${S.bestStage}</b></div>
    <div class="kv"><span>최대 콤보 / 최대 파도 연쇄</span><b>${G.maxCombo} / ${G.maxWave || 0}</b></div>
    <div class="kv"><span>획득 크레딧 (클리어 1판당 1)</span><b><span class="star">✦</span> +${G.earned}</b></div>
    <div class="btnrow"><button class="btn" data-act="home">홈으로</button><button class="btn primary" style="font-size:16px;padding:12px;animation:none" data-act="replay">다시 하기 <em>${DEMO ? '무료' : '✦' + PLAY_COST}</em></button></div>
    ${window.Cloud && Cloud.user ? '' : '<p style="font-size:11px;opacity:.7;margin-top:12px">Google 로그인하면 기록이 저장되고 랭킹에 올라가요</p>'}`);
}
function goHome() { G.state = 'home'; $('hud').classList.add('hidden'); $('home').classList.remove('hidden'); closeModal(); refreshMeta(); maybeDaily(); }

// ───────────────────────── 업데이트 ─────────────────────────
// 행성은 보드 둘레 궤도를 돌고, 각 변에 있는 행성들의 힘을 더해 가장 센 변이 중력 방향이 된다
function trackPoint(u) {
  const { tx, ty, tw, th } = L; let s = u * 2 * (tw + th);
  if (s < tw) return [tx + s, ty, 'up']; s -= tw;
  if (s < th) return [tx + tw, ty + s, 'right']; s -= th;
  if (s < tw) return [tx + tw - s, ty + th, 'down']; s -= tw;
  return [tx, ty + th - s, 'left'];
}
function trackU(x, y) {      // 화면 좌표 → 궤도 위 위치(0~1)
  const { tx, ty, tw, th } = L, cx = Math.max(tx, Math.min(tx + tw, x)), cy = Math.max(ty, Math.min(ty + th, y));
  const d = [cy - ty, tx + tw - cx, ty + th - cy, cx - tx], k = d.indexOf(Math.min(...d));
  const s = k === 0 ? cx - tx : k === 1 ? tw + (cy - ty) : k === 2 ? tw + th + (tx + tw - cx) : 2 * tw + th + (ty + th - cy);
  return (s / (2 * (tw + th))) % 1;
}
function switchGravity(best, byPlayer) {
  G.grav = best; G.gravLock = 4; G.slosh = 1; G.gravDirty = true; Snd.grav(); G.shake = Math.max(G.shake, 5);
  const lead = PLANETS.filter(p => p.side === best).sort((a, b) => b.w - a.w)[0];
  G.texts.push({ x: L.W / 2, y: L.by + L.bh / 2, s: `${DIRS[best][2]} ${lead ? lead.n : ''} 쪽으로 중력 ${byPlayer ? '조종' : '전환'}`, t: 0, size: 21, col: byPlayer ? '#ffe08a' : '#9fe8ff' });
}
function updateGravity(dt, force) {
  G.orbitT = (G.orbitT || 0) + dt * (G.state === 'play' ? 1 : 0.4);
  const side = G.side = { up: 0, right: 0, down: 0, left: 0 };
  for (const p of PLANETS) {
    p.uNat = ((((p.L0 + 360 * G.orbitDays / p.T) / 360 + G.orbitT / p.sec + (p.off || 0)) % 1) + 1) % 1;
    p.u = G.pdrag && G.pdrag.p === p ? G.pdrag.u : p.uNat;
    [p.x, p.y, p.side] = trackPoint(p.u); side[p.side] += p.w;
  }
  let best = G.grav; for (const d in side) if (side[d] > side[best]) best = d;
  G.previewBest = best;
  const was = G.align; G.align = side[best] >= W_SUM * ALIGN_RATIO;
  if (G.align && !was && G.state === 'play' && !G.pdrag) { callout('행성 정렬 ×2', '#ffe08a'); Snd.special(); }
  G.gravLock -= dt;
  if (force) { G.grav = best; return; }
  if (best !== G.grav && side[best] >= side[G.grav] + 0.5 && G.gravLock <= 0 && G.state === 'play' && !G.pdrag) switchGravity(best, false);
}
// ── 행성 끌기: 행성을 다른 변으로 옮겨 중력을 직접 바꾼다 (스테이지당 횟수 제한)
function planetGrab(x, y) {
  if (G.state !== 'play' || G.busy || G.drag || G.pdrag || G.charges <= 0) return false;
  let best = null, bd = 30; for (const p of PLANETS) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p; } }
  if (!best) return false;
  G.pdrag = { p: best, u: best.u }; Snd.swap(); return true;
}
function planetRelease() {
  const d = G.pdrag; if (!d) return; G.pdrag = null;
  const old = d.p.off || 0; d.p.off = old + d.u - d.p.uNat; updateGravity(0);
  if (G.previewBest !== G.grav) { G.charges--; G.usedPlanet = true; switchGravity(G.previewBest, true); }
  else { d.p.off = old; updateGravity(0); toast('중력이 바뀔 만큼 옮겨야 해요 (변의 숫자가 가장 커지게)'); }
}
function update(dt) {
  T += dt; updateGravity(dt);
  for (const row of G.grid) for (const p of row) if (p) stepPiece(p, dt);
  for (const d of G.dying) { stepPiece(d.p, dt); d.t += dt; }
  G.dying = G.dying.filter(d => d.t < 0.2);
  const [gx, gy] = DIRS[G.grav];
  for (const p of G.parts) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx = p.vx * 0.94 + gx * 420 * dt; p.vy = p.vy * 0.94 + gy * 420 * dt; }
  G.parts = G.parts.filter(p => p.life < p.max);
  G.rings = G.rings.filter(r => (r.t += dt) < 0.5); G.beams = G.beams.filter(b => (b.t += dt) < 0.32);
  G.texts = G.texts.filter(t => (t.t += dt) < 0.9); G.comets = G.comets.filter(c => (c.t += dt) < 0.7);
  if (G.callout && (G.callout.t += dt) > 1.1) G.callout = null;
  G.shake *= Math.pow(0.002, dt); G.flash = Math.max(0, G.flash - dt * 1.6); G.slosh = Math.max(0, G.slosh - dt * 1.4); G.mascotJump = Math.max(0, G.mascotJump - dt * 1.6);
  G.shown += (G.score - G.shown) * Math.min(1, dt * 10);
  for (const c of G.comets) if (Math.random() < 0.9) { const k = Math.min(1, c.t / 0.4); G.parts.push({ x: c.x0 + (c.x1 - c.x0) * k, y: c.y0 + (c.y1 - c.y0) * k, vx: rnd(-60, 60), vy: rnd(-60, 60), life: 0, max: rnd(0.3, 0.7), size: rnd(8, 22), col: Math.random() < 0.5 ? '#9fe8ff' : '#ffffff' }); }
  $('hudScore').textContent = fmt(G.shown);
  if (G.state !== 'play') return;
  G.time -= dt; G.left = remaining();
  if (G.feverT > 0) { G.feverT -= dt; G.fever = Math.max(0, G.feverT / 8 * 100); }
  let act = null;
  G.grid.forEach((row, r) => row.forEach((p, c) => {
    if (!p) return;
    if (p.kind === 'bomb' && (p.fuse -= dt) <= 0 && !act) act = () => bombExplode(r, c);
    if (p.kind === 'hole' && (p.eat -= dt) <= 0 && !act) act = () => holeEat(r, c, p);
  }));
  if (G.drag && G.drag.moved && (G.drag.t -= dt) <= 0) dragEnd();     // 끌기 제한 시간
  if (!G.busy && !G.drag && !G.pdrag) {
    G.comboT -= dt; if (G.comboT <= 0) G.combo = 0;
    if (G.time <= 0) { failStage('시간 초과'); return; }
    if (G.gravDirty) { G.gravDirty = false; G.busy = true; resolve(true).then(() => { G.busy = false; }); }
    else if (act) act();
    else if (G.cometQ) { G.cometQ = false; cometStrike(true); }
    else if ((G.cometT -= dt) <= 0 && G.left > 0) cometStrike(false);
    else {
      G.idle += dt;
      if (G.idle > 5 && !G.hint) { const m = findHintMove(); G.hint = new Set(m ? m.map(([r, c]) => G.grid[r][c] && G.grid[r][c].id) : []); }
    }
  }
  if (G.time <= 5 && G.time > 0 && Math.ceil(G.time) !== G.lastTick) { G.lastTick = Math.ceil(G.time); Snd.tick(); }
  const tb = $('timeFill').parentNode; $('timeFill').style.width = Math.max(0, Math.min(100, G.time / (G.stageTime || START_TIME) * 100)) + '%';
  $('timeText').textContent = Math.max(0, Math.ceil(G.time)); tb.classList.toggle('low', G.time <= 10);
  $('feverFill').style.width = Math.min(100, G.fever) + '%'; $('feverFill').parentNode.classList.toggle('on', G.feverT > 0);
  $('feverText').textContent = G.feverT > 0 ? 'FEVER ×2' : 'FEVER';
  $('cometCost').textContent = DEMO ? '무제한' : G.freeComet > 0 ? '무료 1회' : '✦' + COMET_COST;
}
function stepPiece(p, dt) {
  if (p.td > 0) {
    p.tt += dt * 1000; const k = Math.min(1, p.tt / p.td), e = p.ez ? k * k : 1 - (1 - k) * (1 - k);
    p.x = p.fx + (p.tx - p.fx) * e; p.y = p.fy + (p.ty - p.fy) * e;
    if (k >= 1) { p.td = 0; p.x = p.tx; p.y = p.ty; if (p.land) p.squash = 1; }
  }
  if (p.squash > 0) p.squash = Math.max(0, p.squash - dt * 5);
}

// ───────────────────────── 렌더링 ─────────────────────────
const stars = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), s: rnd(0.6, 1.8), p: rnd(0, 6.28), v: rnd(0.6, 2.2) }));
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function drawGlow(x, y, size, col, a = 1) { ctx.globalAlpha = a; ctx.drawImage(glow(col), x - size / 2, y - size / 2, size, size); ctx.globalAlpha = 1; }

function draw() {
  ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0); ctx.clearRect(0, 0, L.W, L.H);
  ctx.fillStyle = '#fff';
  for (const s of stars) { ctx.globalAlpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(T * s.v + s.p)); ctx.fillRect(s.x * L.W, s.y * L.H, s.s, s.s); }
  ctx.globalAlpha = 1;
  if (G.state === 'home') return;
  if (G.feverT > 0) { ctx.fillStyle = `hsla(${(T * 120) % 360},90%,60%,0.10)`; ctx.fillRect(0, 0, L.W, L.H); }
  drawStrip();
  ctx.save();
  if (G.shake > 0.3) ctx.translate(rnd(-1, 1) * G.shake, rnd(-1, 1) * G.shake);
  drawBoard();
  ctx.restore();
  drawOrbit();
  drawFx();
}
function drawStrip() {
  const y = L.sy, im = IMG.mascot;
  if (im && im.width) {
    const s = 62, j = Math.sin(G.mascotJump * Math.PI) * 12;
    ctx.save(); ctx.translate(L.W * 0.14, y + Math.sin(T * 1.7) * 3 - j); ctx.rotate(Math.sin(T * 1.1) * 0.06 + G.mascotJump * 0.25); ctx.drawImage(im, -s / 2, -s / 2, s, s); ctx.restore();
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '900 22px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('STAGE ' + G.stage, L.W / 2, y - 9);
  ctx.font = '700 12px sans-serif'; ctx.fillStyle = '#b9a8ff'; ctx.fillText(`남은 블록 ${G.left}`, L.W / 2 - 46, y + 13);
  ctx.fillStyle = G.charges > 0 ? '#ffe08a' : '#7d72a8'; ctx.fillText('중력 조종 ' + '◆'.repeat(Math.max(0, G.charges)) + '◇'.repeat(Math.max(0, MAX_CHARGE - G.charges)), L.W / 2 + 46, y + 13);
  if (G.stage === 1 && !G.usedPlanet && G.state === 'play' && G.time < 52) { ctx.globalAlpha = 0.6 + 0.4 * Math.sin(T * 5); ctx.fillStyle = '#ffe08a'; ctx.fillText('☝ 궤도의 행성을 끌어 옮기면 중력 파도!', L.W / 2, y + 31); ctx.globalAlpha = 1; }
  if (G.combo >= 2) {
    const x = L.W * 0.86, k = Math.max(0, G.comboT / G.comboMax), R = 24;
    ctx.lineWidth = 4.5; ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.beginPath(); ctx.arc(x, y, R, 0, 6.2832); ctx.stroke();
    ctx.strokeStyle = `hsl(${(G.combo * 28) % 360},95%,65%)`; ctx.beginPath(); ctx.arc(x, y, R, -1.5708, -1.5708 + 6.2832 * k); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '900 21px sans-serif'; ctx.fillText(G.combo, x, y - 3);
    ctx.font = '800 8px sans-serif'; ctx.fillStyle = '#ffd23a'; ctx.fillText('COMBO', x, y + 13);
  }
}
// 보드 둘레 궤도 + 행성 + 변마다 끌어당기는 힘
function drawOrbit() {
  const { tx, ty, tw, th, bx, by, bw, bh, m } = L;
  ctx.save();
  ctx.setLineDash([3, 6]); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(200,180,255,0.35)'; rr(tx, ty, tw, th, 14); ctx.stroke(); ctx.setLineDash([]);
  // 변마다 힘의 크기만큼 빛나는 띠와 숫자
  const mid = { up: [bx + bw / 2, by - 3], down: [bx + bw / 2, by + bh + 3], left: [bx - 3, by + bh / 2], right: [bx + bw + 3, by + bh / 2] };
  for (const d in G.side) {
    const v = G.side[d], on = d === (G.pdrag ? G.previewBest : G.grav), [x, y] = mid[d], col = on ? (G.align ? '255,214,90' : '120,225,255') : '190,170,255';
    const a = on ? 0.55 + 0.25 * Math.sin(T * 5) : 0.08 + 0.3 * v / W_SUM, t = on ? 5 : 3;
    ctx.fillStyle = `rgba(${col},${a})`;
    if (d === 'up' || d === 'down') { rr(bx + 8, y - t / 2, bw - 16, t, t / 2); ctx.fill(); } else { rr(x - t / 2, by + 8, t, bh - 16, t / 2); ctx.fill(); }
    if (v > 0) {
      const w = on ? 44 : 30, h = on ? 20 : 16;
      rr(x - w / 2, y - h / 2, w, h, h / 2); ctx.fillStyle = on ? `rgb(${col})` : 'rgba(26,16,64,0.92)'; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = `rgba(${col},0.8)`; ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `800 ${on ? 12 : 10}px sans-serif`; ctx.fillStyle = on ? '#14082e' : '#d9ccff';
      ctx.fillText((on ? DIRS[d][2] + ' ' : '') + v, x, y + 1);
    }
  }
  for (const p of PLANETS) {
    const held = G.pdrag && G.pdrag.p === p, on = p.side === (G.pdrag ? G.previewBest : G.grav), r = p.s * (held ? 1.5 : on ? 1.12 + 0.06 * Math.sin(T * 6) : 1);
    if (G.charges > 0 && G.state === 'play' && !G.pdrag) { ctx.strokeStyle = 'rgba(255,224,138,0.75)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.lineDashOffset = -T * 14; ctx.beginPath(); ctx.arc(p.x, p.y, r + 5, 0, 6.2832); ctx.stroke(); ctx.setLineDash([]); }
    ctx.globalCompositeOperation = 'lighter'; drawGlow(p.x, p.y, r * (on ? 6.5 : 4), p.c, on ? 0.75 : 0.4); ctx.globalCompositeOperation = 'source-over';
    if (on) {     // 끌어당기는 쪽 행성: 보드를 향한 인력선
      const cx = Math.max(bx, Math.min(bx + bw, p.x)), cy = Math.max(by, Math.min(by + bh, p.y)), ph = (T * 1.6) % 1;
      ctx.strokeStyle = p.c; ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { const k = (i + ph) / 3; ctx.globalAlpha = 0.7 * (1 - k); ctx.beginPath(); ctx.arc(p.x, p.y, r + 4 + k * m * 0.9, 0, 6.2832); ctx.stroke(); }
      ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(cx, cy); ctx.stroke(); ctx.globalAlpha = 1;
    }
    const g = ctx.createRadialGradient(p.x - r * 0.35, p.y - r * 0.35, r * 0.1, p.x, p.y, r); g.addColorStop(0, '#fff'); g.addColorStop(0.35, p.c); g.addColorStop(1, p.c2);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.2832); ctx.fill();
    if (p.n === '토성') { ctx.strokeStyle = '#fff2c0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(p.x, p.y, r * 1.75, r * 0.5, -0.4, 0, 6.2832); ctx.stroke(); }
    if (p.n === '목성') { ctx.strokeStyle = 'rgba(150,80,40,0.55)'; ctx.lineWidth = 1.5; for (const o of [-0.3, 0.25]) { ctx.beginPath(); ctx.moveTo(p.x - r * 0.9, p.y + r * o); ctx.lineTo(p.x + r * 0.9, p.y + r * o); ctx.stroke(); } }
    ctx.font = '700 9px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,6,34,0.9)';
    const ly = p.side === 'up' ? p.y - r - 7 : p.y + r + 7;
    ctx.strokeText(p.n, p.x, ly); ctx.fillStyle = on ? '#fff' : '#cfc4f5'; ctx.fillText(p.n, p.x, ly);
  }
  ctx.restore();
}
function drawBoard() {
  const { bx, by, bw, bh, cs } = L, pad = 5;
  rr(bx - pad, by - pad, bw + pad * 2, bh + pad * 2, 16); ctx.fillStyle = 'rgba(10,6,34,0.62)'; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = G.feverT > 0 ? `hsl(${(T * 240) % 360},95%,65%)` : 'rgba(190,160,255,0.4)'; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if ((r + c) % 2) { rr(bx + c * cs + 2, by + r * cs + 2, cs - 4, cs - 4, 9); ctx.fill(); }
  const [dx, dy] = DIRS[G.grav], gcol = G.align ? '255,214,90' : '120,225,255';
  ctx.save(); rr(bx - pad, by - pad, bw + pad * 2, bh + pad * 2, 16); ctx.clip();
  // 중력 쪽으로 기우는 빛 + 흘러가는 먼지
  const ex = dx > 0 ? bx + bw : dx < 0 ? bx : bx + bw / 2, ey = dy > 0 ? by + bh : dy < 0 ? by : by + bh / 2;
  const gr = ctx.createLinearGradient(ex - dx * cs * 2.2, ey - dy * cs * 2.2, ex, ey);
  gr.addColorStop(0, `rgba(${gcol},0)`); gr.addColorStop(1, `rgba(${gcol},${0.26 + 0.1 * Math.sin(T * 4)})`);
  ctx.fillStyle = gr; ctx.fillRect(bx - pad, by - pad, bw + pad * 2, bh + pad * 2);
  ctx.strokeStyle = `rgba(${gcol},0.5)`; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const k = (T * (0.35 + (i % 5) * 0.07) + i * 0.137) % 1, o = ((i * 0.618) % 1);
    const x = dy ? bx + o * bw : (dx > 0 ? bx + k * bw : bx + bw - k * bw), y = dy ? (dy > 0 ? by + k * bh : by + bh - k * bh) : by + o * bh;
    ctx.globalAlpha = 0.15 + 0.5 * k; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx * (6 + k * 16), y + dy * (6 + k * 16)); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const sl = Math.sin(G.slosh * 9) * G.slosh * cs * 0.16;
  const held = G.drag && G.drag.p;
  for (const row of G.grid) for (const p of row) if (p && p !== held) drawPiece(p, dx * sl, dy * sl);
  for (const d of G.dying) { const k = Math.max(0, d.t) / 0.2; drawPiece(d.p, 0, 0, d.p.gone ? 1 - k * 0.8 : 1 + k * 0.5, d.p.gone ? 1 - k * 0.5 : 1 - k); }
  if (held) {
    const d = G.drag, hx = (d.px - bx) / cs - 0.5 - held.x, hy = (d.py - by) / cs - 0.5 - held.y;
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; rr(bx + d.c * cs + 3, by + d.r * cs + 3, cs - 6, cs - 6, 10); ctx.fill();
    ctx.globalCompositeOperation = 'lighter'; drawGlow(d.px, d.py, cs * 2.1, held.kind === 'b' ? TYPES[held.t].col : '#b6ff3a', 0.55); ctx.globalCompositeOperation = 'source-over';
    drawPiece(held, hx * cs, hy * cs - cs * 0.18, 1.28);
    if (d.moved) {       // 끌기 남은 시간 고리
      ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.strokeStyle = d.t < 1.5 ? '#ff5252' : '#ffffff';
      ctx.beginPath(); ctx.arc(d.px, d.py - cs * 0.18, cs * 0.74, -1.5708, -1.5708 + 6.2832 * Math.max(0, d.t / DRAG_TIME)); ctx.stroke();
    }
  }
  ctx.restore();
}
function drawPiece(p, ox = 0, oy = 0, sc = 1, alpha = 1) {
  const cs = L.cs, fixed = p.kind === 'hole';
  const x = L.bx + (p.x + 0.5) * cs + (fixed ? 0 : ox + Math.sin(T * 1.3 + p.id * 2.1) * cs * 0.022), y = L.by + (p.y + 0.5) * cs + (fixed ? 0 : oy + Math.cos(T * 1.6 + p.id) * cs * 0.028);
  let s = cs * 0.92 * sc * (1 + Math.sin(p.squash * Math.PI) * 0.14);
  if (G.hint && G.hint.has(p.id)) s *= 1 + 0.1 * Math.sin(T * 10);
  ctx.save(); ctx.translate(x, y); ctx.globalAlpha = alpha;
  if (p.kind === 'hole') {
    const hungry = p.eat < 1.5 ? 1 + 0.12 * Math.sin(T * 18) : 1;
    ctx.globalCompositeOperation = 'lighter'; drawGlow(0, 0, s * 1.7 * hungry, '#a66bff', alpha * 0.6); ctx.globalCompositeOperation = 'source-over';
    ctx.rotate(T * 1.4); const im = IMG.blackhole, z = s * 1.08 * hungry;
    if (im && im.width) ctx.drawImage(im, -z / 2, -z / 2, z, z); else { ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(0, 0, s * 0.4, 0, 6.2832); ctx.fill(); }
    ctx.restore(); return;
  }
  if (p.kind === 'bomb') {
    const hot = p.fuse < 6;
    if (hot) { ctx.globalCompositeOperation = 'lighter'; drawGlow(0, 0, s * 1.8, '#ff3a3a', alpha * (0.5 + 0.4 * Math.sin(T * 14))); ctx.globalCompositeOperation = 'source-over'; }
    ctx.rotate(Math.sin(T * (hot ? 22 : 3) + p.id) * (hot ? 0.12 : 0.05)); const im = IMG.alien;
    if (im && im.width) ctx.drawImage(im, -s / 2, -s / 2, s, s); else { ctx.fillStyle = '#7dff3a'; ctx.beginPath(); ctx.arc(0, 0, s * 0.4, 0, 6.2832); ctx.fill(); }
    ctx.rotate(0); ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0); ctx.globalAlpha = alpha;
    const bxp = x + cs * 0.26, byp = y + cs * 0.27, R = cs * 0.2;
    ctx.fillStyle = hot ? '#ff3a3a' : 'rgba(16,8,40,0.92)'; ctx.beginPath(); ctx.arc(bxp, byp, R, 0, 6.2832); ctx.fill();
    ctx.strokeStyle = '#b6ff3a'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `900 ${R * 1.25}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(Math.max(0, Math.ceil(p.fuse)), bxp, byp + 1);
    ctx.restore(); return;
  }
  ctx.rotate(Math.sin(T * 0.9 + p.id * 1.7) * 0.07);
  const im = IMG[TYPES[p.t].k];
  if (im && im.width) ctx.drawImage(im, -s / 2, -s / 2, s, s); else { ctx.fillStyle = TYPES[p.t].col; ctx.beginPath(); ctx.arc(0, 0, s * 0.4, 0, 6.2832); ctx.fill(); }
  ctx.restore();
}
function drawFx() {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const b of G.beams) { const k = b.t / 0.32; ctx.globalAlpha = 1 - k; ctx.fillStyle = '#fff'; const g = (1 - k) * 0.5 + 0.5; if (b.w > b.h) ctx.fillRect(b.x, b.y + b.h * (1 - g) / 2, b.w, b.h * g); else ctx.fillRect(b.x + b.w * (1 - g) / 2, b.y, b.w * g, b.h); }
  for (const p of G.parts) { const k = 1 - p.life / p.max; drawGlow(p.x, p.y, p.size * (0.4 + k), p.col, k); }
  for (const c of G.comets) { const k = Math.min(1, c.t / 0.4); if (k < 1) drawGlow(c.x0 + (c.x1 - c.x0) * k, c.y0 + (c.y1 - c.y0) * k, 90, '#9fe8ff'); }
  ctx.globalAlpha = 1;
  for (const r of G.rings) { if (r.t < 0) continue; const k = r.t / 0.5; ctx.globalAlpha = 1 - k; ctx.strokeStyle = r.col; ctx.lineWidth = 6 * (1 - k) + 1; ctx.beginPath(); ctx.arc(r.x, r.y, r.max * (1 - (1 - k) * (1 - k)), 0, 6.2832); ctx.stroke(); }
  ctx.restore();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const t of G.texts) {
    if (t.t < 0) continue;
    const k = t.t / 0.9; ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3; ctx.font = `900 ${t.size * (k < 0.12 ? 0.6 + k * 3.4 : 1)}px sans-serif`;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,8,50,0.85)'; ctx.strokeText(t.s, t.x, t.y - k * 36); ctx.fillStyle = t.col; ctx.fillText(t.s, t.x, t.y - k * 36);
  }
  if (G.callout) {
    const c = G.callout, k = c.t / 1.1, sc = k < 0.15 ? 0.3 + (k / 0.15) * 0.95 : k < 0.25 ? 1.25 - (k - 0.15) * 2.5 : 1;
    ctx.globalAlpha = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
    ctx.save(); ctx.translate(L.W / 2, L.by + L.bh * 0.42); ctx.rotate(-0.06); ctx.scale(sc, sc);
    ctx.font = `900 ${Math.min(50, L.W / (c.s.length * 0.72 + 1.5))}px sans-serif`; ctx.lineWidth = 9; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(16,6,48,0.92)'; ctx.strokeText(c.s, 0, 0); ctx.lineWidth = 3; ctx.strokeStyle = c.col; ctx.strokeText(c.s, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillText(c.s, 0, 0); ctx.restore();
  }
  ctx.globalAlpha = 1;
  if (G.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${G.flash * 0.5})`; ctx.fillRect(0, 0, L.W, L.H); }
}

// ───────────────────────── 입력 (끌어서 옮기기) ─────────────────────────
function pointerCell(e) {
  const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
  return [Math.floor((y - L.by) / L.cs), Math.floor((x - L.bx) / L.cs), x, y];
}
cv.addEventListener('pointerdown', e => {
  Snd.init(); if (G.state !== 'play') return;
  const [r, c, x, y] = pointerCell(e);
  const inBoard = r >= 0 && r < ROWS && c >= 0 && c < COLS;
  if (!inBoard && planetGrab(x, y)) { try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ } return; }
  if (inBoard && dragStart(r, c)) { G.drag.px = x; G.drag.py = y; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ } }
});
cv.addEventListener('pointermove', e => {
  if (G.pdrag) { const [, , x, y] = pointerCell(e); G.pdrag.u = trackU(x, y); return; }
  if (!G.drag) return;
  const [r, c, x, y] = pointerCell(e);
  G.drag.px = Math.max(L.bx + 4, Math.min(L.bx + L.bw - 4, x)); G.drag.py = Math.max(L.by + 4, Math.min(L.by + L.bh - 4, y));
  dragTo(r, c);
});
window.addEventListener('pointerup', () => { planetRelease(); dragEnd(); });
window.addEventListener('pointercancel', () => { planetRelease(); dragEnd(); });

// ───────────────────────── 메타 UI ─────────────────────────
let toastTimer = 0;
function toast(s) { const t = $('toast'); t.textContent = s; t.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2400); }
function openModal(html) { $('sheet').innerHTML = html; $('modal').classList.remove('hidden'); }
function closeModal() { $('modal').classList.add('hidden'); }
function refreshMeta() {
  $('homeCredits').textContent = $('hudCredits').textContent = DEMO ? '∞' : fmt(S.credits);
  $('homeBest').textContent = fmt(S.best); $('homeCombo').textContent = S.bestStage || 0;
  $('homeLevel').textContent = 'Lv.' + (Math.floor(Math.sqrt(S.total / 50000)) + 1);
  $('dailyDot').classList.toggle('hidden', S.lastClaim === today());
  $('btnSound').style.opacity = S.sound ? 1 : 0.4;
  const u = window.Cloud && Cloud.user;
  $('loginLabel').textContent = u ? `${u.name} · 로그아웃` : 'Google 계정으로 로그인';
  $('saveNote').textContent = u ? '클라우드에 자동 저장 중 ☁' : '게스트 모드 · 이 기기에만 저장됩니다';
}
function dailyInfo() {
  const can = S.lastClaim !== today();
  const next = S.lastClaim === yesterday() ? S.streak + 1 : 1;
  return { can, streak: can ? next : S.streak, idx: ((can ? next : S.streak) - 1 + 7) % 7 };
}
function showDaily() {
  const d = dailyInfo();
  const tiles = DAILY.map((v, i) => `<div class="day ${i < d.idx || (!d.can && i === d.idx) ? 'done' : ''} ${d.can && i === d.idx ? 'today' : ''}">${i + 1}일차<b>✦${v}</b></div>`).join('');
  openModal(`<h2>출석 보상</h2><p>매일 접속하면 크레딧을 드려요.<br>연속 출석할수록 보상이 커지고, 하루라도 빠지면 1일차부터 다시 시작해요.</p>
    <div class="days">${tiles}</div>
    ${d.can ? `<button class="btn primary" style="animation:none" data-act="claim">오늘 보상 받기 ✦${DAILY[d.idx]}</button>`
            : `<p><b>오늘 보상 수령 완료</b> · 연속 ${S.streak}일째<br>다음 보상까지 <b id="cd"></b></p><button class="btn" data-act="close" style="width:100%">닫기</button>`}`);
  tickCountdown();
}
function tickCountdown() {
  const el = $('cd'); if (!el) return;
  const n = new Date(), m = new Date(n); m.setHours(24, 0, 0, 0); const s = Math.floor((m - n) / 1000);
  el.textContent = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(v => String(v).padStart(2, '0')).join(':');
  setTimeout(tickCountdown, 1000);
}
function claimDaily() {
  const d = dailyInfo(); if (!d.can) return;
  S.streak = d.streak; S.lastClaim = today(); S.credits += DAILY[d.idx]; Store.save();
  Snd.init(); Snd.coin(); toast(`✦${DAILY[d.idx]} 크레딧 획득! 연속 ${S.streak}일째`); showDaily();
}
function maybeDaily() { if (G.state === 'home' && S.lastClaim !== today() && $('modal').classList.contains('hidden')) showDaily(); }
function showHelp() {
  openModal(`<h2>게임 방법</h2><div class="help"><ul>
    <li><b>블록을 잡고 끌어요.</b> 끌고 지나가는 블록들과 자리가 바뀝니다(${DRAG_TIME}초 제한). 손을 떼면 같은 행성이 한 줄로 3개 이상 맞은 곳이 터져요.</li>
    <li><b>평소엔 무중력.</b> 터져도 나머지 블록은 그 자리에 떠 있습니다. 새 블록도 생기지 않아요.</li>
    <li><b>★ 중력 파도</b> — 궤도를 도는 <b>행성을 손가락으로 끌어 다른 변으로 옮기면</b> 중력이 바뀌고, 모든 블록이 그쪽으로 쏟아집니다. 파도 중에는 줄이 아니어도 <b>같은 행성 3개 이상이 붙어 뭉치면</b> 터지고, <b>연쇄마다 점수 ×2, ×3, ×4… 그리고 +2초.</b> 빈칸을 만들어 판을 짜둔 뒤 한 번에 쏟는 게 핵심이에요.</li>
    <li>중력 조종은 판마다 ◆◆ 2번. 파도 3연쇄 이상이면 ◆ 하나를 돌려받습니다. 행성이 돌다가 저절로 중력이 바뀌기도 해요.</li>
    <li>변마다 적힌 숫자가 그쪽 행성들의 힘이고, <b>가장 큰 변</b>이 중력 방향입니다. 큰 행성일수록 힘이 세요.</li>
    <li>제한 시간(1판 ${START_TIME}초, 판마다 3초씩 줄어 최소 36초) 안에 전부 없애면 다음 스테이지, 못 없애면 <b>실패</b>. 한 행성이 2개만 남으면 2개만 붙여도 터지고, 1개만 남으면 스스로 사라져요.</li>
    <li><b>4개</b> = 2배 +2초 · <b>ㄱ/ㅗ 모양</b> = 3배 +3초 · <b>5개</b> = 초신성(같은 행성 전부 소멸) +4초.</li>
    <li><b>블랙홀</b> — 끌 수도 지나갈 수도 없는 벽. 중력 방향에서 바로 옆에 붙은 블록을 삼키고 <b>−2초</b>.</li>
    <li><b>외계행성</b> — 0이 되면 폭발 <b>−8초</b>. 바로 옆에서 매치를 터뜨리면 해체 +2초.</li>
    <li><b>혜성</b> — 가끔 한 줄을 쓸어줍니다. ☄ 버튼은 판마다 1회 무료.</li></ul></div>
    <button class="btn" data-act="close" style="width:100%">확인</button>`);
}
async function showRank() {
  if (!(window.Cloud && Cloud.ready)) { openModal(`<h2>랭킹</h2><p>랭킹은 Google 로그인(Firebase) 설정 후 이용할 수 있어요.</p><button class="btn" data-act="close" style="width:100%">닫기</button>`); return; }
  openModal('<h2>랭킹</h2><p>불러오는 중…</p>');
  try {
    const rows = await Cloud.board(), me = Cloud.user && Cloud.user.uid;
    const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
    openModal(`<h2>랭킹 TOP 20</h2><div class="rank">${rows.map((r, i) => `<div class="${r.uid === me ? 'me' : ''}"><i>${i + 1}</i><span>${esc(r.name || '탐험가')}</span><b>${fmt(r.best)}</b></div>`).join('') || '<p>아직 기록이 없어요. 첫 번째 주인공이 되어보세요!</p>'}</div>
      <button class="btn" data-act="close" style="width:100%;margin-top:12px">닫기</button>`);
  } catch (e) { openModal(`<h2>랭킹</h2><p>랭킹을 불러오지 못했어요.<br>잠시 후 다시 시도해주세요.</p><button class="btn" data-act="close" style="width:100%">닫기</button>`); }
}
async function login() {
  if (window.Cloud && Cloud.user) { await Cloud.signOut(); toast('로그아웃했어요'); return; }
  if (!(window.Cloud && Cloud.ready)) {
    openModal(`<h2>Google 로그인</h2><p>아직 Firebase 설정이 연결되지 않았어요.<br><code>firebase-config.js</code>에 프로젝트 키를 넣으면 바로 켜집니다.<br>(설정 방법은 README 참고)</p><p>지금은 게스트 모드로 이 기기에 저장돼요.</p><button class="btn" data-act="close" style="width:100%">확인</button>`); return;
  }
  try { await Cloud.signIn(); } catch (e) { toast('로그인에 실패했어요: ' + (e.code || e.message || '')); }
}
// 로그인 완료 시 클라우드 데이터와 병합 (클라우드 우선, 최고 기록은 큰 값)
window.onCloudUser = (user, cloud) => {
  if (user && cloud) {
    const local = S; S = Object.assign(defaults(), cloud, { sound: local.sound });
    S.best = Math.max(cloud.best || 0, local.best); S.maxCombo = Math.max(cloud.maxCombo || 0, local.maxCombo); S.bestStage = Math.max(cloud.bestStage || 0, local.bestStage || 0);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* 무시 */ }
  }
  if (user) { if (!cloud) Cloud.save(S); toast(`${user.name}님, 환영해요!`); }
  refreshMeta(); maybeDaily();
};

document.addEventListener('click', e => {
  const act = e.target.closest('[data-act]'); if (!act) return;
  ({ close: closeModal, home: goHome, replay: () => { closeModal(); startGame(); if (G.state !== 'play') goHome(); }, claim: claimDaily })[act.dataset.act]();
});
$('btnPlay').onclick = startGame; $('btnDaily').onclick = showDaily; $('btnHelp').onclick = showHelp; $('btnRank').onclick = showRank; $('btnLogin').onclick = login;
$('btnSound').onclick = () => { S.sound = !S.sound; Snd.init(); Snd.mute(S.sound); Store.save(); };
$('btnQuit').onclick = () => { if (G.state !== 'play') return; openModal(`<h2>그만할까요?</h2><p>지금 나가면 이번 판 점수는 저장되지 않아요.</p><div class="btnrow"><button class="btn" data-act="close">계속하기</button><button class="btn" data-act="home">나가기</button></div>`); };
$('btnComet').onclick = () => {
  if (G.state !== 'play' || G.cometQ) return;
  if (G.freeComet > 0) G.freeComet--;
  else if (!DEMO) { if (S.credits < COMET_COST) { toast('크레딧이 부족해요'); return; } S.credits -= COMET_COST; Store.save(); }
  G.cometQ = true;
};
$('modal').addEventListener('click', e => { if (e.target === $('modal') && G.state === 'home') closeModal(); });

// ───────────────────────── 시작 ─────────────────────────
let last = 0;
function frame(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
  const paused = G.state === 'play' && !$('modal').classList.contains('hidden');
  if (!paused) update(dt);
  draw(); requestAnimationFrame(frame);
}
async function boot() {
  Store.load(); layout(); G.orbitDays = realOrbitDays(); refreshMeta();
  if (DEMO) { document.querySelector('#btnPlay em').textContent = 'DEMO 무료'; $('saveNote').textContent = '데모 버전 · 크레딧 무제한'; }
  window.addEventListener('resize', layout);
  await loadImages(); requestAnimationFrame(frame); maybeDaily();
  const cfg = window.FIREBASE_CONFIG;
  if (cfg && cfg.apiKey) {
    try { const m = await import('./cloud.js'); await m.initCloud(cfg); refreshMeta(); }
    catch (e) { console.warn('Firebase 연결 실패 — 게스트 모드로 진행', e); }
  }
}
window.__cp = { G, S: () => S, PLANETS, planetGrab, planetRelease, trackU, findHintMove, findGroups, typeCounts, dragStart, dragTo, dragEnd, startGame, buildStage, L };
boot();
})();
