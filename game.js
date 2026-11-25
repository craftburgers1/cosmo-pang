/* COSMO PANG — 태양계 중력 블록 퍼즐 (스테이지 클리어 방식) */
(() => {
'use strict';

// ───────────────────────── 기본 상수 ─────────────────────────
const COLS = 7, ROWS = 8, NT = 6;
const START_TIME = 60, MAX_CHARGE = 3, STAGE_BONUS_TIME = 15, PLAY_COST = 10, COMET_COST = 15;
const FREE_PLAYS = 10;             // 하루 무료 플레이 (KST 자정 리셋)
const COMET_MAX = 3;               // ☄ 혜성 폭탄: 한 판(게임 1회)당 최대 사용 횟수. 첫 1회 무료, 이후 1회당 COMET_COST
const NAT_COMET_PER_STAGE = 1, CHARGE_REFUND_PER_STAGE = 1;   // 자동 지급 아이템 횟수 제한
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
// 날짜는 모두 한국시간(KST, UTC+9) 기준 'YYYY-MM-DD'
const today = (ms = Date.now()) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
const yesterday = () => today(Date.now() - 86400e3);

// ───────────────────────── 저장 ─────────────────────────
const SAVE_KEY = 'cosmopang.v1';
const defaults = () => ({ credits: 0, playDate: '', playsToday: 0, best: 0, bestStage: 0, maxCombo: 0, games: 0, total: 0, streak: 0, lastClaim: '', sound: true, updatedAt: 0 });
let S = defaults();
const DEVICE_KEY = 'cosmopang.device';
function dev(k, v) {       // 이 기기에만 남기는 표시 (출석 시트 자동 표시일, 로컬 크레딧 이관 여부 등)
  let d = {}; try { d = JSON.parse(localStorage.getItem(DEVICE_KEY) || '{}'); } catch (e) { /* 무시 */ }
  if (v !== undefined) { d[k] = v; try { localStorage.setItem(DEVICE_KEY, JSON.stringify(d)); } catch (e) { /* 무시 */ } }
  return d[k];
}
// 통합 크레딧 지갑 상태 (로그인 시 users/{uid}/wallet/main 의 balance). 게스트는 크레딧 없음
const W = { bal: null, err: '' };
const signedIn = () => !!(window.Cloud && Cloud.user);
const freeLeft = () => S.playDate === today() ? Math.max(0, FREE_PLAYS - (S.playsToday || 0)) : FREE_PLAYS;
function deviceRecord(upd) {
  let d = { best: 0, bestStage: 0 };
  try { d = Object.assign(d, JSON.parse(localStorage.getItem(DEVICE_KEY) || '{}')); } catch (e) { /* 무시 */ }
  if (upd) { d.best = Math.max(d.best, upd.best); d.bestStage = Math.max(d.bestStage, upd.bestStage); try { localStorage.setItem(DEVICE_KEY, JSON.stringify(d)); } catch (e) { /* 무시 */ } }
  return d;
}
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
  time: START_TIME, fever: 0, feverT: 0, drag: null, sel: null, trig: [], swapping: false, moveVer: -1, idle: 0, hint: null, left: 0, ver: 0,
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
  for (let tries = 0; tries < 30; tries++) { fillStage(); if (findMove()) break; }
  stageIntro();
}
function fillStage() {
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
}
function stageIntro() {
  // 반대편 우주에서 날아 들어오는 등장 연출
  const [dx, dy] = DIRS[G.grav];
  G.grid.flat().forEach(p => {
    const d = dy ? (dy > 0 ? ROWS - 1 - p.ty : p.ty) : (dx > 0 ? COLS - 1 - p.tx : p.tx);
    p.x -= dx * (COLS + 2); p.y -= dy * (ROWS + 2); tween(p, p.tx, p.ty, 380 + d * 45 + irnd(60), 1, true);
  });
  G.time = G.stageTime = Math.max(36, START_TIME - (G.stage - 1) * 3); G.charges = 2; G.refundLeft = CHARGE_REFUND_PER_STAGE; G.natLeft = NAT_COMET_PER_STAGE; G.cometT = rnd(20, 30); G.hint = null; G.idle = 0; G.sel = null; G.trig = []; G.pdrag = null; G.ver++;
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
    let g = hit[0]; if (!g) { g = { t: run.t, keys: new Set(), runs: [], line: true }; groups.push(g); }
    for (const h of hit.slice(1)) { h.keys.forEach(k => g.keys.add(k)); g.runs.push(...h.runs); groups.splice(groups.indexOf(h), 1); }
    ks.forEach(k => g.keys.add(k)); g.runs.push(run);
  }
  return groups;
}
// 중력 파도 중에는 줄이 아니어도 같은 행성 3개 이상이 붙어 뭉치면 터진다
function findClusters() {
  const cnt = typeCounts(), seen = new Set(), groups = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = bt(r, c); if (t < 0 || seen.has(key(r, c))) continue;
    const out = [[r, c]]; seen.add(key(r, c));
    for (let i = 0; i < out.length; i++) for (const [dr, dc] of NB) { const r2 = out[i][0] + dr, c2 = out[i][1] + dc; if (bt(r2, c2) === t && !seen.has(key(r2, c2))) { seen.add(key(r2, c2)); out.push([r2, c2]); } }
    if (out.length >= (cnt[t] <= 2 ? 2 : 3)) groups.push({ t, keys: new Set(out.map(([a, b]) => key(a, b))), runs: [], line: false });
  }
  return groups;
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
  if (p.kind === 'nova' ? !p.used : p.item) G.trig.push({ item: p.kind === 'nova' ? 'nova' : p.item, r, c });
  burst(cellX(c), cellY(r), p.kind === 'b' ? TYPES[p.t].col : p.kind === 'hole' ? '#c9a0ff' : p.kind === 'nova' ? '#ffffff' : '#b6ff3a', 7 + Math.min(8, G.combo));
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
async function popGroups(groups, pref) {
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
    // 4개 = 혜성 블록(그 줄을 지움), 5개 이상 또는 ㄱ/ㅗ 모양 = 초신성 블록. 줄 매치(g.line)에서만 생김
    if (g.line) {
      const longest = g.runs.reduce((a, b) => b.cells.length > a.cells.length ? b : a), len = longest.cells.length;
      const cross = g.runs.some(r => r.o === 'h') && g.runs.some(r => r.o === 'v');
      const kind = len >= 5 || (cross && n >= 5) ? 'nova' : len === 4 ? longest.o : '';
      if (kind) {
        const spot = (pref || []).find(([r, c]) => g.keys.has(key(r, c))) || longest.cells[Math.floor(len / 2)], [ir, ic] = spot;
        if (!at(ir, ic)) {
          const it = kind === 'nova' ? mk('nova', -1, ir, ic) : mk('b', g.t, ir, ic); if (kind !== 'nova') it.item = kind; it.squash = 1; G.grid[ir][ic] = it; G.ver++;
          G.rings.push({ x: cellX(ic), y: cellY(ir), t: 0, max: L.cs * 1.6, col: '#ffe08a' }); Snd.special(); G.items = (G.items || 0) + 1;
          G.texts.push({ x: cellX(ic), y: cellY(ir) - L.cs * 0.7, s: kind === 'nova' ? '초신성 블록!' : '혜성 블록!', t: -0.1, size: 18, col: '#ffe08a' });
        }
      }
    }
    await runTriggers();
    await sleep(190);
  }
}
// 평소엔 무중력: 터져도 블록은 제자리에 떠 있다.
// wave=true(중력 파도)일 때만 전부 한쪽으로 쏟아지고, 부딪혀 맞은 줄이 연쇄로 터진다 (연쇄마다 배율 +1, +2초)
async function resolve(wave, pref) {
  G.chain = 0; G.waveMult = 1; await runTriggers();
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
    if (k >= 3 && G.charges < MAX_CHARGE && G.refundLeft > 0) { G.charges++; G.refundLeft--; G.texts.push({ x: L.W / 2, y: L.sy + 30, s: '중력 조종 +1', t: 0, size: 18, col: '#ffe08a' }); Snd.coin(); }
  }
  for (let guard = 0; guard < 60 && G.state === 'play'; guard++) {
    const g = findGroups();
    if (g.length) { await popGroups(g, pref); pref = null; continue; }
    if (G.trig.length) { await runTriggers(); continue; }
    const cnt = typeCounts(); let lone = false;
    G.grid.forEach((row, r) => row.forEach((p, c) => {      // 혼자 남은 행성은 스스로 사라짐
      if (p && p.kind === 'b' && cnt[p.t] === 1) { kill(r, c); addScore(100 * mult(), cellX(c), cellY(r), 18); lone = true; }
    }));
    if (!lone && !cnt.some(Boolean)) G.grid.forEach((row, r) => row.forEach((p, c) => { if (p && p.kind === 'bomb' && at(r, c)) { blast(r, c, true); addScore(300 * mult(), cellX(c), cellY(r), 22); lone = true; } else if (p && p.kind === 'nova' && at(r, c)) { p.used = true; kill(r, c); addScore(500 * mult(), cellX(c), cellY(r), 22); lone = true; } }));
    if (lone) { Snd.special(); await sleep(220); continue; }
    break;
  }
  if (G.state === 'play' && remaining() === 0) await stageClear();
}
// 아이템 블록이 부서지면 발동 대기열에 들어가고, runTriggers가 차례로 터뜨린다
async function runTriggers() {
  for (let guard = 0; guard < 30 && G.trig.length; guard++) {
    const t = G.trig.shift();
    if (t.item === 'nova') await novaBlast(-1, t.c, t.r);
    else { callout('혜성 블록!', '#9fe8ff'); await sweep([[t.item, t.item === 'h' ? t.r : t.c]]); }
  }
}
// 초신성: 한 종류의 행성을 전부 소멸 (t<0이면 보드에 가장 많은 행성)
async function novaBlast(t, c, r) {
  const cnt = typeCounts(); if (t < 0 || !cnt[t]) t = cnt.indexOf(Math.max(...cnt));
  let got = 0; if (cnt[t]) G.grid.forEach((row, rr) => row.forEach((q, cc) => { if (q && q.kind === 'b' && q.t === t) { kill(rr, cc); got++; } }));
  Snd.nova(); G.flash = 0.5; G.shake = Math.min(18, G.shake + 9); G.rings.push({ x: cellX(c), y: cellY(r), t: 0, max: L.cs * 6, col: '#fff' }); callout('초신성 폭발!', '#ffd23a');
  if (got) addScore(got * 50 * mult(), L.W / 2, L.by + L.bh / 2, 26);
  await sleep(260);
}
// 아이템 바로 쓰기 (선택한 아이템을 한 번 더 탭)
async function useItem(r, c) {
  const p = at(r, c); if (G.state !== 'play' || G.busy || !p || !(p.item || p.kind === 'nova')) return;
  G.busy = true; G.sel = null; G.hint = null; G.idle = 0; bumpCombo();
  if (p.kind === 'nova') { p.used = true; kill(r, c); await novaBlast(-1, c, r); } else kill(r, c);
  await resolve(false); G.busy = false;
}
// ── 인접 한 칸 교환. 3개 이상 줄이 맞거나 아이템이 끼어 있을 때만 유효, 아니면 원위치
const movable = p => p && p.kind !== 'hole';
async function trySwap(r1, c1, r2, c2) {
  if (G.state !== 'play' || G.busy || G.pdrag) return false;
  if (r2 < 0 || r2 >= ROWS || c2 < 0 || c2 >= COLS || Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return false;
  const a = at(r1, c1), b = at(r2, c2);
  if (!movable(a) || (b && !movable(b))) { if (a) a.squash = 1; Snd.bad(); return false; }
  G.busy = true; G.swapping = true; G.sel = null; G.hint = null; G.idle = 0;
  const put = (x, y) => { G.grid[r1][c1] = x; G.grid[r2][c2] = y; if (x) tween(x, c1, r1, 120); if (y) tween(y, c2, r2, 120); G.ver++; };
  put(b, a); Snd.swap(); await sleep(130);
  const nova = a.kind === 'nova' ? a : b && b.kind === 'nova' ? b : null, hasItem = !!(nova || a.item || (b && b.item));
  const groups = findGroups().filter(g => g.keys.has(key(r1, c1)) || g.keys.has(key(r2, c2)));
  if (!groups.length && !hasItem) {          // 무효: 되돌리기 (시간은 흐르지 않음)
    put(a, b); Snd.bad(); await sleep(130); G.swapping = false; G.busy = false; return false;
  }
  G.swapping = false;
  if (nova) {                                 // 초신성 블록: 맞바꾼 행성 종류를 전부 소멸
    const other = nova === a ? b : a, nr = nova === a ? r2 : r1, nc = nova === a ? c2 : c1;
    bumpCombo(); nova.used = true; kill(nr, nc);
    if (other && other.kind === 'nova') {      // 초신성 + 초신성 = 보드 전체
      other.used = true; G.grid.forEach((row, r) => row.forEach((q, c) => { if (q && q.kind !== 'hole') kill(r, c); }));
      Snd.nova(); G.flash = 0.6; callout('빅뱅!!!!', '#ffd23a'); addScore(3000 * mult(), L.W / 2, L.by + L.bh / 2, 30); await sleep(300);
    } else await novaBlast(other && other.kind === 'b' ? other.t : -1, nc, nr);
  } else if (a.item || (b && b.item)) {       // 혜성 블록은 옮기기만 해도 발동
    if (!groups.length) bumpCombo();
    if (a.item) kill(r2, c2); if (b && b.item && at(r1, c1) === b) kill(r1, c1);
  }
  await resolve(false, [[r2, c2], [r1, c1]]);
  G.busy = false; return true;
}
// 옮길 수 있는 유효한 수 찾기 (힌트·자동 셔플 판정용)
function findMove() {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) for (const [dr, dc] of [[0, 1], [1, 0]]) {
    const r2 = r + dr, c2 = c + dc; if (r2 >= ROWS || c2 >= COLS) continue;
    const a = at(r, c), b = at(r2, c2); if ((!a && !b) || (a && !movable(a)) || (b && !movable(b))) continue;
    if ((a && (a.item || a.kind === 'nova')) || (b && (b.item || b.kind === 'nova'))) return [[r, c], [r2, c2]];
    G.grid[r][c] = b; G.grid[r2][c2] = a; const ok = findGroups().some(g => g.keys.has(key(r, c)) || g.keys.has(key(r2, c2))); G.grid[r][c] = a; G.grid[r2][c2] = b;
    if (ok) return [[r, c], [r2, c2]];
  }
  return null;
}
// 자동 셔플: 유효한 수가 하나도 없을 때. 섞은 뒤 바로 터지는 줄은 없고 유효한 수는 최소 1개 보장
async function shuffleBoard() {
  G.busy = true; G.sel = null; G.hint = null;        // 섞는 동안에도 제한 시간은 흐름
  const pieces = [], cells = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const p = G.grid[r][c]; if (p && p.kind === 'hole') continue; cells.push([r, c]); if (p) pieces.push(p); }
  const place = order => { cells.forEach(([r, c]) => { G.grid[r][c] = null; }); order.forEach((cell, i) => { G.grid[cell[0]][cell[1]] = pieces[i]; }); };
  const mix = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = irnd(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  let ok = false;
  for (let tries = 0; tries < 250 && !ok; tries++) { place(mix(cells.slice()).slice(0, pieces.length)); ok = !findGroups().length && !!findMove(); }
  if (!ok) {     // 블록이 몇 개 안 남았을 때: 같은 행성을 "■■_■"(2개뿐이면 "■_■") 모양으로 놓아 한 수를 확실히 만든다
    const cnt = typeCounts(), t = cnt.indexOf(Math.max(...cnt)), same = pieces.filter(p => p.kind === 'b' && p.t === t), rest = pieces.filter(p => !same.includes(p));
    const spots = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c + 3 < COLS; c++) if ([0, 1, 2, 3].every(k => !(G.grid[r][c + k] && G.grid[r][c + k].kind === 'hole'))) spots.push([r, c]);
    for (let tries = 0; tries < 200 && !ok && spots.length; tries++) {
      const [r, c] = spots[irnd(spots.length)], seat = same.length >= 3 ? [[r, c], [r, c + 1], [r, c + 3]] : [[r, c], [r, c + 2]];
      const gap = key(r, c + (same.length >= 3 ? 2 : 1)), used = new Set(seat.map(([a, b]) => key(a, b)));
      const free = mix(cells.filter(([a, b]) => !used.has(key(a, b)) && key(a, b) !== gap));
      const order = [...same.slice(0, seat.length), ...same.slice(seat.length), ...rest], pos = [...seat, ...free.slice(0, order.length - seat.length)];
      cells.forEach(([a, b]) => { G.grid[a][b] = null; }); order.forEach((p, i) => { G.grid[pos[i][0]][pos[i][1]] = p; });
      ok = !findGroups().length && !!findMove();
    }
  }
  G.ver++; G.shuffles = (G.shuffles || 0) + 1;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const p = G.grid[r][c]; if (p && p.kind !== 'hole') tween(p, c, r, 420 + irnd(120), 0); }
  callout('다시 섞었어요', '#9fe8ff'); Snd.whoosh(); G.texts.push({ x: L.W / 2, y: L.by + L.bh * 0.62, s: '옮길 블록이 없어서 섞었어요', t: -0.2, size: 16, col: '#d6caff' });
  await sleep(620); G.busy = false;
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
  if (!user) G.natLeft--;
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
function payFail(e, what) {       // 결제 실패: 로컬 크레딧으로 대신 결제하지 않고 안내만
  const code = errCode(e);
  if (code === 'wallet/insufficient') openModal(`<h2>크레딧이 부족해요</h2><p>${what}에 필요한 크레딧이 모자라요.<br>현재 잔액 <b>✦${fmt(e.balance || 0)}</b></p><p>출석 보상, 스테이지 클리어, 가계부·근태 앱 활동으로 크레딧을 모을 수 있어요.</p><button class="btn" data-act="close" style="width:100%">닫기</button>`);
  else { console.warn('[cosmo] 결제 실패', e); toast(`결제하지 못했어요 (${code}) — 크레딧은 차감되지 않았어요`, 5000); }
}
let starting = false;
async function startGame() {
  if (starting || G.state === 'play' || G.state === 'ending') return;
  Snd.init();
  const runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  if (freeLeft() > 0) { if (S.playDate !== today()) { S.playDate = today(); S.playsToday = 0; } S.playsToday++; }
  else if (!signedIn()) {
    openModal(`<h2>오늘 무료 ${FREE_PLAYS}판을 다 썼어요</h2><p>내일 0시(한국시간)에 다시 ${FREE_PLAYS}판이 채워져요.</p><p>Google 로그인하면 크레딧(한 판 ✦${PLAY_COST})으로 계속 할 수 있어요.</p><div class="btnrow"><button class="btn" data-act="close">닫기</button><button class="btn" data-act="login">로그인</button></div>`); return;
  } else {
    starting = true; toast('크레딧 결제 중…');
    try { const r = await Cloud.walletApply({ logId: `cosmo:play:${runId}`, amount: -PLAY_COST, reason: 'play', refId: runId }); W.bal = r.balance; W.err = ''; }
    catch (e) { starting = false; $('toast').classList.add('hidden'); payFail(e, '한 판'); return; }
    starting = false; $('toast').classList.add('hidden');
  }
  S.games++; Store.save();
  Object.assign(G, { state: 'play', busy: true, stage: 1, cleared: 0, score: 0, shown: 0, combo: 0, comboT: 0, maxCombo: 0, fever: 0, feverT: 0,
    drag: null, sel: null, trig: [], swapping: false, shuffles: 0, items: 0, pdrag: null, maxWave: 0, waveMult: 1, usedPlanet: false, cometQ: false, cometUsed: 0, cometPaying: false, runId, shake: 0, earned: 0, orbitDays: realOrbitDays(), gravLock: 1.5, gravDirty: false,
    dying: [], parts: [], rings: [], beams: [], texts: [], comets: [], callout: null });
  PLANETS.forEach(p => { p.off = 0; }); updateGravity(0, true); buildStage();
  $('home').classList.add('hidden'); $('hud').classList.remove('hidden'); closeModal(); refreshMeta();
  setTimeout(() => { if (G.state === 'play') G.busy = false; }, 900);
}
async function failStage(why) {
  G.state = 'ending'; G.busy = true; G.sel = null; G.pdrag = null;
  callout('STAGE ' + G.stage + ' 실패', '#ff5252'); Snd.over(); G.shake = 10; await sleep(1500);
  const isBest = G.score > S.best;
  G.earned = Math.min(5, G.cleared);
  S.best = Math.max(S.best, G.score); S.bestStage = Math.max(S.bestStage || 0, G.cleared); S.maxCombo = Math.max(S.maxCombo, G.maxCombo); S.total += G.score;
  deviceRecord({ best: G.score, bestStage: G.cleared });
  // 스테이지 클리어 적립은 지갑에 (트랜잭션 + 원장). 게스트는 적립 없음
  let earnMsg = signedIn() ? `<span class="star">✦</span> +${G.earned}` : '로그인 시 적립';
  if (signedIn() && G.earned > 0) {
    try { const r = await Cloud.walletApply({ logId: `cosmo:stage_clear:${G.runId}`, amount: G.earned, reason: 'stage_clear', refId: G.runId }); W.bal = r.balance; }
    catch (e) { console.warn('[cosmo] 클리어 적립 실패', e); earnMsg = `적립 실패 (${errCode(e)})`; }
  }
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
    <div class="kv"><span>획득 크레딧 (클리어 1스테이지당 1, 최대 5)</span><b>${earnMsg}</b></div>
    <div class="kv"><span>오늘 남은 무료</span><b>${freeLeft()}/${FREE_PLAYS}</b></div>
    <div class="btnrow"><button class="btn" data-act="home">홈으로</button><button class="btn primary" style="font-size:16px;padding:12px;animation:none" data-act="replay">다시 하기 <em>${freeLeft() > 0 ? '무료' : '✦' + PLAY_COST}</em></button></div>
    ${window.Cloud && Cloud.user ? '' : '<p style="font-size:11px;opacity:.7;margin-top:12px">Google 로그인하면 기록이 저장되고 크레딧이 쌓여요</p>'}`);
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
  if (G.state !== 'play' || G.busy || G.pdrag || G.charges <= 0) return false;
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
  if (!G.swapping) G.time -= dt;          // 교환이 유효한지 판정하고 되돌리는 동안에는 시간이 흐르지 않음
  G.left = remaining();
  if (G.feverT > 0) { G.feverT -= dt; G.fever = Math.max(0, G.feverT / 8 * 100); }
  let act = null;
  G.grid.forEach((row, r) => row.forEach((p, c) => {
    if (!p) return;
    if (p.kind === 'bomb' && (p.fuse -= dt) <= 0 && !act) act = () => bombExplode(r, c);
    if (p.kind === 'hole' && (p.eat -= dt) <= 0 && !act) act = () => holeEat(r, c, p);
  }));
  if (!G.busy && !G.pdrag) {
    G.comboT -= dt; if (G.comboT <= 0) G.combo = 0;
    if (G.time <= 0) { failStage('시간 초과'); return; }
    if (G.gravDirty) { G.gravDirty = false; G.busy = true; resolve(true).then(() => { G.busy = false; }); }
    else if (act) act();
    else if (G.cometQ) { G.cometQ = false; cometStrike(true); }
    else if (G.natLeft > 0 && (G.cometT -= dt) <= 0 && G.left > 0) cometStrike(false);
    else {
      if (G.moveVer !== G.ver) { G.moveVer = G.ver; G.move = findMove(); }
      if (!G.move && typeCounts().some(Boolean)) { shuffleBoard(); return; }          // 유효한 수가 없으면 자동 셔플
      G.idle += dt;
      if (G.idle > 5 && !G.hint && G.move) G.hint = new Set(G.move.map(([r, c]) => G.grid[r][c] && G.grid[r][c].id).filter(Boolean));
    }
  }
  if (G.time <= 5 && G.time > 0 && Math.ceil(G.time) !== G.lastTick) { G.lastTick = Math.ceil(G.time); Snd.tick(); }
  const tb = $('timeFill').parentNode; $('timeFill').style.width = Math.max(0, Math.min(100, G.time / (G.stageTime || START_TIME) * 100)) + '%';
  $('timeText').textContent = Math.max(0, Math.ceil(G.time)); tb.classList.toggle('low', G.time <= 10);
  $('feverFill').style.width = Math.min(100, G.fever) + '%'; $('feverFill').parentNode.classList.toggle('on', G.feverT > 0);
  $('feverText').textContent = G.feverT > 0 ? 'FEVER ×2' : 'FEVER';
  const cl = COMET_MAX - G.cometUsed; $('cometCost').textContent = cl <= 0 ? '소진' : (G.cometUsed === 0 ? '무료' : signedIn() ? '✦' + COMET_COST : '로그인') + ' · ' + cl + '회';
  $('btnComet').classList.toggle('off', cl <= 0 || G.cometPaying);
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
  if (G.stage === 1 && !G.usedPlanet && G.state === 'play' && G.time < 52) { ctx.globalAlpha = 0.6 + 0.4 * Math.sin(T * 5); ctx.fillStyle = '#ffe08a'; ctx.fillText('☝ 궤도의 행성을 끌어 옮기면 중력 파도!', L.W / 2, L.ty + L.th + 26); ctx.globalAlpha = 1; }
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
  for (const row of G.grid) for (const p of row) if (p) drawPiece(p, dx * sl, dy * sl);
  for (const d of G.dying) { const k = Math.max(0, d.t) / 0.2; drawPiece(d.p, 0, 0, d.p.gone ? 1 - k * 0.8 : 1 + k * 0.5, d.p.gone ? 1 - k * 0.5 : 1 - k); }
  ctx.restore();
  if (G.sel) { const [r, c] = G.sel; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.setLineDash([6, 5]); ctx.lineDashOffset = -T * 30; rr(bx + c * cs + 2, by + r * cs + 2, cs - 4, cs - 4, 11); ctx.stroke(); ctx.setLineDash([]); }
}
function drawPiece(p, ox = 0, oy = 0, sc = 1, alpha = 1) {
  const cs = L.cs, fixed = p.kind === 'hole';
  const x = L.bx + (p.x + 0.5) * cs + (fixed ? 0 : ox + Math.sin(T * 1.3 + p.id * 2.1) * cs * 0.022), y = L.by + (p.y + 0.5) * cs + (fixed ? 0 : oy + Math.cos(T * 1.6 + p.id) * cs * 0.028);
  let s = cs * 0.92 * sc * (1 + Math.sin(p.squash * Math.PI) * 0.14);
  if (G.hint && G.hint.has(p.id)) s *= 1 + 0.1 * Math.sin(T * 10);
  if (G.sel && G.sel[0] === p.ty && G.sel[1] === p.tx) s *= 1.14;
  ctx.save(); ctx.translate(x, y); ctx.globalAlpha = alpha;
  if (p.kind === 'nova') {       // 초신성 블록: 무지개 구슬
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) { const a = T * 2.4 + i * 2.094; drawGlow(Math.cos(a) * s * 0.14, Math.sin(a) * s * 0.14, s * 0.95, TYPES[(i * 2 + Math.floor(T * 2)) % NT].col, alpha * 0.9); }
    drawGlow(0, 0, s * 0.7, '#ffffff', alpha);
    ctx.globalCompositeOperation = 'source-over'; ctx.rotate(T * 1.5); ctx.fillStyle = '#fff';
    for (let i = 0; i < 4; i++) { ctx.rotate(1.5708); ctx.beginPath(); ctx.moveTo(0, -s * 0.36); ctx.lineTo(s * 0.06, 0); ctx.lineTo(-s * 0.06, 0); ctx.fill(); }
    ctx.restore(); return;
  }
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
  if (p.item) {                  // 혜성 블록: 지울 방향으로 빛줄기와 화살표
    ctx.rotate(-Math.sin(T * 0.9 + p.id * 1.7) * 0.07); if (p.item === 'v') ctx.rotate(1.5708);
    ctx.globalCompositeOperation = 'lighter'; const w = s * (0.52 + 0.08 * Math.sin(T * 9));
    const g = ctx.createLinearGradient(-w, 0, w, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(-w, -s * 0.08, w * 2, s * 0.16);
    ctx.fillStyle = '#fff'; for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(d * s * 0.52, 0); ctx.lineTo(d * s * 0.33, -s * 0.15); ctx.lineTo(d * s * 0.33, s * 0.15); ctx.fill(); }
  }
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

// ───────────────────────── 입력 (옆 칸으로 밀기 / 두 번 탭) ─────────────────────────
function pointerCell(e) {
  const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
  return [Math.floor((y - L.by) / L.cs), Math.floor((x - L.bx) / L.cs), x, y];
}
let press = null;       // 누른 칸. 밀면 교환, 그냥 떼면 탭
cv.addEventListener('pointerdown', e => {
  Snd.init(); if (G.state !== 'play') return;
  const [r, c, x, y] = pointerCell(e), inBoard = r >= 0 && r < ROWS && c >= 0 && c < COLS;
  if (!inBoard) { G.sel = null; if (planetGrab(x, y)) { try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ } } return; }
  press = { r, c, x, y, id: e.pointerId }; G.idle = 0;
  try { cv.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
});
cv.addEventListener('pointermove', e => {
  if (G.pdrag) { const [, , x, y] = pointerCell(e); G.pdrag.u = trackU(x, y); return; }
  if (!press || e.pointerId !== press.id) return;
  const b = cv.getBoundingClientRect(), dx = e.clientX - b.left - press.x, dy = e.clientY - b.top - press.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < Math.max(14, L.cs * 0.34)) return;      // 손떨림은 무시
  const p = press; press = null; G.sel = null;
  if (!movable(at(p.r, p.c))) return;
  const horiz = Math.abs(dx) > Math.abs(dy);
  trySwap(p.r, p.c, p.r + (horiz ? 0 : Math.sign(dy)), p.c + (horiz ? Math.sign(dx) : 0));
});
function tapCell(r, c) {
  if (G.busy) return;
  const p = at(r, c), s = G.sel;
  if (s && s[0] === r && s[1] === c) { G.sel = null; if (p && (p.item || p.kind === 'nova')) useItem(r, c); return; }   // 같은 칸 다시 탭: 아이템이면 사용, 아니면 선택 해제
  if (s && Math.abs(s[0] - r) + Math.abs(s[1] - c) === 1) { G.sel = null; trySwap(s[0], s[1], r, c); return; }           // 옆 칸 탭: 교환
  G.sel = movable(p) ? [r, c] : null; if (G.sel) Snd.swap();
}
window.addEventListener('pointerup', e => { planetRelease(); if (press && e.pointerId === press.id) { const p = press; press = null; if (G.state === 'play') tapCell(p.r, p.c); } });
window.addEventListener('pointercancel', () => { planetRelease(); press = null; });

// ───────────────────────── 메타 UI ─────────────────────────
let toastTimer = 0;
function toast(s, ms = 2400) { const t = $('toast'); t.textContent = s; t.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), ms); }
function openModal(html) { sheetName = ''; $('sheet').innerHTML = html; $('modal').classList.remove('hidden'); }
function closeModal() { $('modal').classList.add('hidden'); }
function refreshMeta() {
  const u0 = signedIn();
  $('homeCredits').textContent = $('hudCredits').textContent = !u0 ? '게스트' : W.bal !== null ? fmt(W.bal) : W.err ? '연결 실패' : '…';
  const fl = freeLeft();
  $('hudFree').textContent = `무료 ${fl}/${FREE_PLAYS}`;
  $('freeNote').innerHTML = `오늘 남은 무료 <b>${fl}/${FREE_PLAYS}</b>` + (fl > 0 ? '' : u0 ? ` · 이제 한 판 ✦${PLAY_COST}` : ' · 내일 0시에 충전');
  document.querySelector('#btnPlay em').textContent = fl > 0 ? '무료' : u0 ? '✦' + PLAY_COST : '내일 다시';
  $('homeBest').textContent = fmt(S.best); $('homeCombo').textContent = S.bestStage || 0;
  $('homeLevel').textContent = 'Lv.' + (Math.floor(Math.sqrt(S.total / 50000)) + 1);
  $('dailyDot').classList.toggle('hidden', S.lastClaim === today());
  $('btnSound').style.opacity = S.sound ? 1 : 0.4;
  const u = window.Cloud && Cloud.user;
  $('loginLabel').textContent = u ? u.name : 'Google 계정으로 로그인';
  $('loginOut').classList.toggle('hidden', !u); $('loginG').classList.toggle('hidden', !!(u && u.photo));
  const ph = $('loginPhoto'); ph.classList.toggle('hidden', !(u && u.photo)); if (u && u.photo && ph.getAttribute('src') !== u.photo) ph.src = u.photo;
  $('saveNote').textContent = u ? (Cloud.loaded ? '계정에 자동 저장 중 ☁' : '클라우드 연결 실패 · 이 기기에만 저장 중') + (W.err ? ` · 지갑 연결 실패(${W.err})` : '') : `게스트 모드 · 이 기기에만 저장 · 하루 무료 ${FREE_PLAYS}판`;
}
function dailyInfo() {
  const can = S.lastClaim !== today();
  const next = S.lastClaim === yesterday() ? S.streak + 1 : 1;
  return { can, streak: can ? next : S.streak, idx: ((can ? next : S.streak) - 1 + 7) % 7 };
}
let sheetName = '';
function showDaily() {
  const d = dailyInfo(), u = signedIn();
  const tiles = DAILY.map((v, i) => `<div class="day ${i < d.idx || (!d.can && i === d.idx) ? 'done' : ''} ${d.can && i === d.idx ? 'today' : ''}">${i + 1}일차<b>✦${v}</b></div>`).join('');
  const main = !u ? `<p><b>출석 보상은 로그인 후 지갑에 적립돼요</b></p><button class="btn primary" style="animation:none;font-size:17px" data-act="login">Google 로그인하고 받기</button>`
    : d.can ? `<button class="btn primary" style="animation:none" data-act="claim">오늘 보상 받기 ✦${DAILY[d.idx]}</button>`
    : `<p><b>오늘 보상 수령 완료</b> · 연속 ${S.streak}일째<br>다음 보상까지 <b id="cd"></b></p>`;
  openModal(`<h2>출석 보상</h2><p>매일 접속하면 크레딧을 드려요.<br>연속 출석할수록 보상이 커지고, 하루라도 빠지면 1일차부터 다시 시작해요.</p>
    <div class="days">${tiles}</div>${main}
    <button class="btn" data-act="close" style="width:100%;margin-top:10px">닫기</button>`);
  sheetName = 'daily'; tickCountdown();
}
function tickCountdown() {
  const el = $('cd'); if (!el) return;
  const s = Math.floor((86400e3 - ((Date.now() + 9 * 3600e3) % 86400e3)) / 1000);     // 한국시간 자정까지
  el.textContent = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(v => String(v).padStart(2, '0')).join(':');
  setTimeout(tickCountdown, 1000);
}
let claiming = false;
async function claimDaily() {
  const d = dailyInfo(); if (!d.can || claiming || !signedIn()) return;
  claiming = true; const date = today(), amt = DAILY[d.idx];
  try {
    const r = await Cloud.walletApply({ logId: `cosmo:attendance:${date}`, amount: amt, reason: 'attendance', refId: date });
    W.bal = r.balance; S.streak = d.streak; S.lastClaim = date; Store.save();
    Snd.init(); Snd.coin(); toast(r.applied ? `✦${amt} 크레딧 적립! 연속 ${S.streak}일째` : '오늘 보상은 이미 받았어요 (다른 기기)');
  } catch (e) { console.warn('[cosmo] 출석 적립 실패', e); toast(`출석 보상을 적립하지 못했어요 (${errCode(e)})`, 5000); }
  claiming = false; if (sheetName === 'daily' && !$('modal').classList.contains('hidden')) showDaily();
}
// 출석 시트는 하루 1회만 자동으로 뜸 (이 기기 기준). 그 외에는 출석 보상 버튼으로
function maybeDaily() {
  if (G.state !== 'home' || S.lastClaim === today() || dev('dailyShown') === today() || !$('modal').classList.contains('hidden')) return;
  dev('dailyShown', today()); showDaily();
}
function showHelp() {
  openModal(`<h2>게임 방법</h2><div class="help"><ul>
    <li><b>옆 칸과 자리를 바꿔요.</b> 블록을 옆으로 밀거나, 블록 두 개를 차례로 탭하면 됩니다. 같은 행성이 <b>한 줄로 3개 이상</b> 맞아야 바뀌고, 안 맞으면 제자리로 돌아와요(이때는 시간이 흐르지 않아요). 빈칸으로 옮기는 것도 됩니다.</li>
    <li><b>옮길 수 있는 블록이 하나도 없으면</b> 자동으로 다시 섞어줍니다.</li>
    <li><b>평소엔 무중력.</b> 터져도 나머지 블록은 그 자리에 떠 있습니다. 새 블록도 생기지 않아요.</li>
    <li><b>★ 중력 파도</b> — 궤도를 도는 <b>행성을 손가락으로 끌어 다른 변으로 옮기면</b> 중력이 바뀌고, 모든 블록이 그쪽으로 쏟아집니다. 파도 중에는 줄이 아니어도 <b>같은 행성 3개 이상이 붙어 뭉치면</b> 터지고, <b>연쇄마다 점수 ×2, ×3, ×4… 그리고 +2초.</b> 빈칸을 만들어 판을 짜둔 뒤 한 번에 쏟는 게 핵심이에요.</li>
    <li>중력 조종은 스테이지마다 ◆◆ 2번. 파도 3연쇄 이상이면 ◆ 하나를 돌려받습니다(스테이지당 1번). 행성이 돌다가 저절로 중력이 바뀌기도 해요.</li>
    <li>변마다 적힌 숫자가 그쪽 행성들의 힘이고, <b>가장 큰 변</b>이 중력 방향입니다. 큰 행성일수록 힘이 세요.</li>
    <li>제한 시간(1판 ${START_TIME}초, 판마다 3초씩 줄어 최소 36초) 안에 전부 없애면 다음 스테이지, 못 없애면 <b>실패</b>. 한 행성이 2개만 남으면 2개만 붙여도 터지고, 1개만 남으면 스스로 사라져요.</li>
    <li><b>아이템 블록</b> — <b>4개</b>를 맞추면 그 줄(가로/세로)을 통째로 지우는 <b>혜성 블록</b>, <b>5개 이상이나 ㄱ/ㅗ 모양</b>이면 같은 행성을 전부 없애는 <b>초신성 블록</b>이 그 자리에 생겨요. 옆 칸과 바꾸거나, 매치에 넣거나, 두 번 탭하면 터집니다. 초신성은 바꾼 상대 행성을 전부 없애요.</li>
    <li><b>블랙홀</b> — 끌 수도 지나갈 수도 없는 벽. 중력 방향에서 바로 옆에 붙은 블록을 삼키고 <b>−2초</b>.</li>
    <li><b>외계행성</b> — 0이 되면 폭발 <b>−8초</b>. 바로 옆에서 매치를 터뜨리면 해체 +2초.</li>
    <li><b>혜성</b> — 스테이지마다 한 번 저절로 날아와 한 줄을 쓸어줍니다. ☄ 버튼은 한 판에 최대 ${COMET_MAX}번: 첫 번째 무료, 그다음부터 ✦${COMET_COST}.</li>
    <li><b>하루 무료 ${FREE_PLAYS}판</b>(한국시간 자정 리셋). 다 쓰면 로그인한 계정의 크레딧 ✦${PLAY_COST}으로 계속할 수 있어요. 크레딧은 출석 보상, 스테이지 클리어(1스테이지당 ✦1, 최대 5), 가계부·근태 앱 활동으로 같은 지갑에 쌓입니다.</li></ul></div>
    <button class="btn" data-act="close" style="width:100%">확인</button>`);
}
function showRank() {
  const u = window.Cloud && Cloud.user, d = deviceRecord();
  openModal(`<h2>내 기록</h2>
    <p>${u ? `${u.name}님 계정에 저장된 기록이에요` : '로그인하면 기록이 계정에 저장되어 다른 기기에서도 이어집니다'}</p>
    <div class="kv"><span>${u ? '내 계정' : '현재'} 최고 점수</span><b>${fmt(S.best)}</b></div>
    <div class="kv"><span>${u ? '내 계정' : '현재'} 최고 스테이지</span><b>${S.bestStage || 0}</b></div>
    <div class="kv"><span>최대 콤보 · 플레이 횟수</span><b>${S.maxCombo} · ${S.games}판</b></div>
    ${u ? `<div class="kv"><span>크레딧 지갑 잔액</span><b><span class="star">✦</span> ${W.bal !== null ? fmt(W.bal) : '—'}</b></div>` : ''}
    <div class="kv"><span>오늘 남은 무료</span><b>${freeLeft()}/${FREE_PLAYS}</b></div>
    <div class="kv"><span>이 기기 최고 점수</span><b>${fmt(d.best)}</b></div>
    <div class="kv"><span>이 기기 최고 스테이지</span><b>${d.bestStage}</b></div>
    <button class="btn" data-act="close" style="width:100%;margin-top:14px">닫기</button>`);
}
const errCode = e => (e && (e.code || e.message)) || '알 수 없는 오류';
async function login() {
  if (window.Cloud && Cloud.user) { try { await Cloud.signOut(); toast('로그아웃했어요'); } catch (e) { toast('로그아웃 실패: ' + errCode(e)); } return; }
  if (!(window.Cloud && Cloud.ready)) { toast('Firebase 연결 실패: ' + (window.__cloudError || 'firebase-config.js 확인 필요')); return; }
  try { await Cloud.signIn(); } catch (e) { console.warn('[cosmo] 로그인 실패', e); toast('로그인 실패: ' + errCode(e), 6000); }
}
window.onCloudError = e => toast('로그인 실패: ' + errCode(e), 6000);
// 로그인 완료 시 클라우드 데이터와 병합 (클라우드 우선, 최고 기록은 큰 값)
window.onCloudUser = (user, cloud) => {
  const local = S, legacy = Math.max(0, Math.floor(Number(local.credits) || 0));     // 이 기기에 남아 있던 예전 로컬 크레딧
  if (user && cloud) {
    S = Object.assign(defaults(), cloud, { sound: local.sound });
    S.best = Math.max(cloud.best || 0, local.best); S.maxCombo = Math.max(cloud.maxCombo || 0, local.maxCombo); S.bestStage = Math.max(cloud.bestStage || 0, local.bestStage || 0);
    // 오늘 무료 사용 횟수는 계정·기기 중 큰 값
    const t = today(), a = cloud.playDate === t ? cloud.playsToday || 0 : 0, b = local.playDate === t ? local.playsToday || 0 : 0;
    S.playDate = t; S.playsToday = Math.max(a, b);
  }
  if (user) {
    S.credits = 0;                          // 크레딧은 이제 지갑에만 있음
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* 무시 */ }
    if (!cloud) Cloud.save(S);
    toast(Cloud.loaded ? `${user.name}님, 환영해요!` : '로그인됨 · 클라우드 불러오기 실패(콘솔 확인)');
    migrateLocalCredits(legacy);
  } else { W.bal = null; W.err = ''; }
  refreshMeta();
  if (sheetName === 'daily' && !$('modal').classList.contains('hidden')) showDaily(); else maybeDaily();
};
// 예전 로컬 크레딧을 지갑으로 1회만 이관. 계정에는 원장 id(cosmo:migrate:v1), 기기에는 migrated 표시를 남겨 중복 방지
async function migrateLocalCredits(legacy) {
  if (dev('migrated')) return;
  if (legacy <= 0) { dev('migrated', today()); return; }
  try {
    const r = await Cloud.walletApply({ logId: 'cosmo:migrate:v1', amount: Math.min(500, legacy), reason: 'migrate', refId: 'local' });
    dev('migrated', today()); W.bal = r.balance; refreshMeta();
    if (r.applied) toast(`이 기기의 크레딧 ✦${Math.min(500, legacy)}을 지갑으로 옮겼어요`, 4000);
  } catch (e) { S.credits = legacy; try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e2) { /* 무시 */ } console.warn('[cosmo] 로컬 크레딧 이관 실패 — 다음 로그인 때 다시 시도', e); }
}
// 지갑 잔액 갱신 (cloud.js가 호출). err가 있으면 유료 결제는 막히고 안내만
window.onWallet = (bal, err, note) => {
  W.bal = bal; W.err = err === 'signed-out' ? '' : (err || '');
  if (note === 'welcome') toast('웰컴 크레딧 ✦50을 드렸어요!', 4000);
  refreshMeta();
};

document.addEventListener('click', e => {
  const act = e.target.closest('[data-act]'); if (!act) return;
  ({ close: closeModal, home: goHome, replay: () => { goHome(); startGame(); }, claim: claimDaily, login: () => { if (sheetName !== 'daily') closeModal(); login(); } })[act.dataset.act]();
});
$('btnPlay').onclick = startGame; $('btnDaily').onclick = showDaily; $('btnHelp').onclick = showHelp; $('btnRank').onclick = showRank; $('btnLogin').onclick = login;
$('btnSound').onclick = () => { S.sound = !S.sound; Snd.init(); Snd.mute(S.sound); Store.save(); };
$('btnQuit').onclick = () => { if (G.state !== 'play') return; openModal(`<h2>그만할까요?</h2><p>지금 나가면 이번 판 점수는 저장되지 않아요.</p><div class="btnrow"><button class="btn" data-act="close">계속하기</button><button class="btn" data-act="home">나가기</button></div>`); };
// ☄ 혜성 폭탄: 한 판에 최대 COMET_MAX회, 첫 1회 무료, 이후 지갑에서 COMET_COST 차감
$('btnComet').onclick = async () => {
  if (G.state !== 'play' || G.cometQ || G.cometPaying) return;
  if (G.cometUsed >= COMET_MAX) { toast(`이번 판 혜성 ${COMET_MAX}회를 다 썼어요`); return; }
  if (G.cometUsed > 0) {
    if (!signedIn()) { toast('추가 혜성은 로그인 후 크레딧으로 쓸 수 있어요'); return; }
    G.cometPaying = true; const run = G.runId, n = G.cometUsed + 1;
    try { const r = await Cloud.walletApply({ logId: `cosmo:bomb:${run}:${n}`, amount: -COMET_COST, reason: 'bomb', refId: run }); W.bal = r.balance; refreshMeta(); }
    catch (e) { G.cometPaying = false; if (errCode(e) === 'wallet/insufficient') toast(`크레딧이 부족해요 (잔액 ✦${fmt(e.balance || 0)}, 필요 ✦${COMET_COST})`, 3500); else payFail(e, '혜성'); return; }
    G.cometPaying = false; if (G.state !== 'play' || G.runId !== run) return;
  }
  G.cometUsed++; G.cometQ = true;
};
$('modal').addEventListener('click', e => { if (e.target === $('modal') && G.state === 'home') closeModal(); });

window.addEventListener('unhandledrejection', e => { console.warn('[cosmo] 진행 중 오류', e.reason); if (G.state === 'play') { G.busy = false; G.swapping = false; G.trig = []; } });

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
  window.addEventListener('resize', layout);
  await loadImages(); requestAnimationFrame(frame);
  const cfg = window.FIREBASE_CONFIG;
  if (cfg && cfg.apiKey) {
    // 로그인 여부가 확인되면 onCloudUser가 출석 시트를 띄움 (게스트 화면이 먼저 뜨지 않게)
    try { const m = await import('./cloud.js'); await m.initCloud(cfg); refreshMeta(); setTimeout(maybeDaily, 2500); }
    catch (e) { window.__cloudError = errCode(e); console.warn('[cosmo] Firebase 연결 실패 — 게스트 모드로 진행', e); maybeDaily(); }
  } else maybeDaily();
  setInterval(refreshMeta, 60000);        // 자정이 지나면 무료 횟수 표시 갱신
}
window.__cp = { G, S: () => S, W, freeLeft, dev, PLANETS, planetGrab, planetRelease, trackU, findMove, findGroups, typeCounts, trySwap, useItem, shuffleBoard, mk, startGame, buildStage, L };
boot();
})();
