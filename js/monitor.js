// Pachys Tempus — monitor (tablet).

import { Physio } from './physio.js';
import { Sound } from './audio.js';
import { Link } from './link.js';
import { drawQR, Scanner, shareText } from './pairing.js';
import { buildControls } from './controls.js';
import { fmt, DEFAULTS, cloneState } from './model.js';
import { registerSW, keepAwake } from './common.js';

registerSW();

const $ = (id) => document.getElementById(id);
const nowS = () => performance.now() / 1000;
const store = {
  get(k, d) { try { const v = localStorage.getItem('pt.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('pt.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
};

const physio = new Physio(store.get('target', null));
const sound = new Sound();
const settings = Object.assign({ tone: true, alarmSound: true, volume: 0.6, autoNibp: 0 }, store.get('settings', {}));
sound.setVolume(settings.volume);
const saveSettings = () => store.set('settings', settings);

// ---------------------------------------------------------------- strips
class Strip {
  constructor(canvas, sample, opt) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.sample = sample; this.o = Object.assign({ secs: 6, gap: 0.22, pad: 6 }, opt);
    this.resize();
  }
  resize() {
    const r = this.c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.dpr = dpr;
    this.w = Math.max(50, Math.floor(r.width)); this.h = Math.max(30, Math.floor(r.height));
    this.c.width = this.w * dpr; this.c.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ys = new Float32Array(this.w).fill(NaN);
    this.x = 0; this.acc = 0;
  }
  advance(t0, t1, on) {
    const pps = this.w / this.o.secs;
    this.acc += (t1 - t0) * pps;
    let n = Math.floor(this.acc); this.acc -= n;
    n = Math.min(n, this.w);
    for (let i = 0; i < n; i++) {
      const t = t1 - (n - 1 - i) / pps;
      this.ys[this.x] = on ? this.sample(t) : NaN;
      this.x = (this.x + 1) % this.w;
    }
  }
  yOf(v) {
    const { min, max, pad } = this.o;
    const u = (v - min) / (max - min);
    return Math.min(this.h - 1, Math.max(1, this.h - pad - u * (this.h - pad * 2)));
  }
  draw(offMsg) {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    if (this.o.grid) this.o.grid(ctx, w, h, this);
    ctx.strokeStyle = this.o.color; ctx.lineWidth = this.o.lw || 2; ctx.lineJoin = 'round';
    const gap = Math.floor(this.o.gap * w / this.o.secs);
    ctx.beginPath();
    let pen = false;
    for (let i = gap; i < w; i++) {
      const xi = (this.x + i) % w;
      if (xi === 0) pen = false;
      const v = this.ys[xi];
      if (Number.isNaN(v)) { pen = false; continue; }
      const y = this.yOf(v);
      if (pen) ctx.lineTo(xi, y); else { ctx.moveTo(xi, y); pen = true; }
    }
    ctx.stroke();
    if (offMsg) {
      ctx.fillStyle = this.o.color; ctx.font = `600 ${Math.min(22, h / 4)}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(offMsg, w / 2, h / 2);
      ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(0, h * 0.72); ctx.lineTo(w, h * 0.72); ctx.stroke(); ctx.setLineDash([]);
    }
  }
}

const co2Grid = (ctx, w, h, s) => {
  ctx.strokeStyle = 'rgba(255,214,10,.25)'; ctx.lineWidth = 1; ctx.setLineDash([3, 5]);
  ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,214,10,.7)'; ctx.textAlign = 'right';
  const top = s.o.max;
  [top, top / 2].forEach((v) => { const y = s.yOf(v); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); ctx.fillText(String(v), w - 6, y + 13); });
  ctx.setLineDash([]);
};

const strips = {
  ecg: new Strip($('cEcg'), (t) => physio.ecg(t), { color: '#39ff6a', min: -0.7, max: 1.45 }),
  pleth: new Strip($('cPleth'), (t) => physio.pleth(t), { color: '#2fd6ff', min: -0.1, max: 1.35 }),
  co2: new Strip($('cCo2'), (t) => physio.co2(t), { color: '#ffd60a', min: -2, max: 50, grid: co2Grid }),
};
window.addEventListener('resize', () => Object.values(strips).forEach((s) => s.resize()));
window.addEventListener('orientationchange', () => setTimeout(() => Object.values(strips).forEach((s) => s.resize()), 300));

// ---------------------------------------------------------------- NIBP
const nibp = Object.assign({ sys: null, dia: null, map: null, time: null, measuring: false, start: 0, err: null }, store.get('nibp', {}));
nibp.measuring = false;
let nextAuto = settings.autoNibp ? Date.now() + settings.autoNibp * 60000 : null;
const NIBP_DUR = 18;

function startNibp(src) {
  if (nibp.measuring) return;
  if (!physio.target.leads.nibp) { nibp.err = 'CUFF OFF'; renderNibp(); flashMsg('NIBP: cuff not connected'); return; }
  nibp.measuring = true; nibp.start = nowS(); nibp.err = null;
  nibp.peak = Math.max(160, Math.round(physio.cur.sbp + 35));
  if (src !== 'auto' && settings.autoNibp) nextAuto = Date.now() + settings.autoNibp * 60000;
}

function tickNibp(now) {
  if (!nibp.measuring) {
    if (nextAuto && Date.now() >= nextAuto) { nextAuto = Date.now() + settings.autoNibp * 60000; startNibp('auto'); }
    return;
  }
  const el = now - nibp.start;
  if (el >= NIBP_DUR) {
    nibp.measuring = false;
    const c = physio.cur;
    if (physio.perfusing && c.sbp >= 45) {
      const j = () => Math.round((Math.random() - 0.5) * 6);
      nibp.sys = Math.round(c.sbp) + j(); nibp.dia = Math.max(10, Math.round(c.dbp) + j());
      if (nibp.dia >= nibp.sys) nibp.dia = nibp.sys - 10;
      nibp.map = Math.round((nibp.sys + 2 * nibp.dia) / 3);
      nibp.err = null;
    } else { nibp.sys = nibp.dia = nibp.map = null; nibp.err = 'NO READING'; }
    nibp.time = Date.now();
    store.set('nibp', { sys: nibp.sys, dia: nibp.dia, map: nibp.map, time: nibp.time, err: nibp.err });
    emit({ type: 'nibp', result: nibp.sys != null ? `${nibp.sys}/${nibp.dia} (${nibp.map})` : 'נכשלה' });
    sound.tone(1000, 0.15, { gain: 0.2 });
  }
  renderNibp(now);
}

function renderNibp(now = nowS()) {
  const v = $('vNibp'), m = $('vMap'), tm = $('nibpTime');
  if (nibp.measuring) {
    const el = now - nibp.start;
    const p = el < 6 ? nibp.peak * (el / 6) : nibp.peak - (nibp.peak - 30) * ((el - 6) / (NIBP_DUR - 6));
    v.textContent = String(Math.round(p)); v.classList.add('cuff');
    m.textContent = 'measuring…';
    return;
  }
  v.classList.remove('cuff');
  if (nibp.err) { v.textContent = '---/---'; m.textContent = nibp.err; }
  else if (nibp.sys != null) { v.textContent = `${nibp.sys}/${nibp.dia}`; m.textContent = `(${nibp.map})`; }
  else { v.textContent = '---/---'; m.textContent = '(---)'; }
  tm.textContent = nibp.time ? new Date(nibp.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
  $('autoLbl').textContent = settings.autoNibp ? `${settings.autoNibp} min` : 'Off';
  $('nibpAuto').textContent = settings.autoNibp ? `Auto ${settings.autoNibp}'` : '';
}

// ---------------------------------------------------------------- alarms
const LIM = { hr: [50, 120], spo2: [90, 100], etco2: [30, 50], rr: [8, 30], sys: [90, 180] };
const alarmState = { first: {}, active: [], silencedUntil: 0, lastSound: 0, idx: 0, announced: new Set() };

function evalAlarms() {
  const t = physio.target, L = t.leads, d = physio.display(), p = physio.props;
  const list = [];
  const add = (id, text, prio, box) => list.push({ id, text, prio, box });
  if (L.ecg) {
    if (p.vf) add('vf', 'VF / VT', 'high', 'hr');
    else if (p.asys) add('asys', 'ASYSTOLE', 'high', 'hr');
    else if (p.vt && physio.cur.hr >= 120) add('vt', 'V-TACH', 'high', 'hr');
    else if (d.hr != null && d.hr > LIM.hr[1]) add('hrh', `HR HIGH  ${fmt(d.hr)} > ${LIM.hr[1]}`, d.hr > 150 ? 'high' : 'medium', 'hr');
    else if (d.hr != null && d.hr < LIM.hr[0]) add('hrl', `HR LOW  ${fmt(d.hr)} < ${LIM.hr[0]}`, d.hr < 40 ? 'high' : 'medium', 'hr');
  } else add('ecgoff', 'ECG LEADS OFF', 'tech', 'hr');
  if (L.spo2) {
    if (!physio.perfusing) add('spnp', 'SpO2 NO PULSE', 'medium', 'spo2');
    else if (d.spo2 < LIM.spo2[0]) add('spl', `SpO2 LOW  ${fmt(d.spo2)} < ${LIM.spo2[0]}`, d.spo2 < 85 ? 'high' : 'medium', 'spo2');
  } else add('spoff', 'SpO2 SENSOR OFF', 'tech', 'spo2');
  if (L.co2) {
    if (physio.cur.rr < 1) add('apnea', 'APNEA', 'high', 'co2');
    else {
      if (d.etco2 > LIM.etco2[1]) add('coh', `EtCO2 HIGH  ${fmt(d.etco2)}`, 'medium', 'co2');
      else if (d.etco2 < LIM.etco2[0] && physio.perfusing) add('col', `EtCO2 LOW  ${fmt(d.etco2)}`, 'medium', 'co2');
      if (d.rr > LIM.rr[1]) add('rrh', `RR HIGH  ${fmt(d.rr)}`, 'medium', 'co2');
      else if (d.rr < LIM.rr[0]) add('rrl', `RR LOW  ${fmt(d.rr)}`, 'medium', 'co2');
    }
  } else add('cooff', 'CO2 LINE OFF', 'tech', 'co2');
  if (nibp.sys != null && !nibp.measuring) {
    if (nibp.sys < LIM.sys[0]) add('bpl', `NIBP SYS LOW  ${nibp.sys}`, 'medium', 'nibp');
    else if (nibp.sys > LIM.sys[1]) add('bph', `NIBP SYS HIGH  ${nibp.sys}`, 'medium', 'nibp');
  }
  if (d.temp != null && d.temp >= 38.5) add('temph', `TEMP HIGH  ${fmt(d.temp, 1)}`, 'low', 'temp');

  // 3-second onset delay for physiological alarms
  const now = Date.now();
  const ids = new Set(list.map((a) => a.id));
  for (const id of Object.keys(alarmState.first)) if (!ids.has(id)) { delete alarmState.first[id]; alarmState.announced.delete(id); }
  for (const a of list) if (!alarmState.first[a.id]) alarmState.first[a.id] = now;
  const rank = { high: 0, medium: 1, low: 2, tech: 3 };
  alarmState.active = list.filter((a) => a.prio === 'tech' || now - alarmState.first[a.id] >= 3000).sort((a, b) => rank[a.prio] - rank[b.prio]);
  for (const a of alarmState.active) if (a.prio !== 'tech' && !alarmState.announced.has(a.id)) { alarmState.announced.add(a.id); emit({ type: 'alarm', text: a.text }, false); }

  // Boxes
  for (const box of ['hr', 'spo2', 'nibp', 'co2', 'temp']) {
    const el = $('nb' + box[0].toUpperCase() + box.slice(1));
    const a = alarmState.active.find((x) => x.box === box && x.prio !== 'tech');
    el.classList.toggle('alm-high', !!a && a.prio === 'high');
    el.classList.toggle('alm-med', !!a && a.prio !== 'high');
  }
  // Banner (rotate through active alarms)
  const bar = $('alarmbar');
  if (alarmState.active.length) {
    alarmState.idx = (alarmState.idx + 1) % alarmState.active.length;
    const a = alarmState.active[Math.floor(Date.now() / 2000) % alarmState.active.length];
    bar.textContent = (alarmState.active.length > 1 ? `(${alarmState.active.length}) ` : '') + a.text;
    bar.className = 'alarmbar ' + a.prio;
  } else { bar.textContent = ''; bar.className = 'alarmbar'; }
  // Sound
  const sil = now < alarmState.silencedUntil;
  $('silLbl').textContent = sil ? `${Math.ceil((alarmState.silencedUntil - now) / 1000)} s` : 'Silence';
  $('kSil').classList.toggle('on', sil);
  const top = alarmState.active.find((a) => a.prio !== 'tech');
  if (top && settings.alarmSound && !sil) {
    const every = top.prio === 'high' ? 4000 : top.prio === 'medium' ? 8000 : 15000;
    if (now - alarmState.lastSound >= every) { alarmState.lastSound = now; sound.alarm(top.prio); }
  }
}

// ---------------------------------------------------------------- defib
const ENERGIES = [120, 150, 200, 360];
const defib = { idx: store.get('energyIdx', 2), state: 'idle', t: 0, readyTimer: null };
function renderDefib() {
  $('energyLbl').textContent = `${ENERGIES[defib.idx]} J`;
  $('kCharge').textContent = defib.state === 'charging' ? 'CHARGING…' : defib.state === 'charged' ? 'CHARGED' : 'CHARGE';
  $('kCharge').classList.toggle('busy', defib.state !== 'idle');
  $('kShock').disabled = defib.state !== 'charged';
  $('kShock').classList.toggle('armed', defib.state === 'charged');
}
function disarm(reason) {
  clearInterval(defib.readyTimer); clearTimeout(defib.autoDisarm); clearTimeout(defib.chargeTimer);
  sound.cancelCharge();
  if (defib.state !== 'idle' && reason) emit({ type: 'disarm' });
  defib.state = 'idle'; renderDefib();
}
$('kEnergy').onclick = () => { if (defib.state !== 'idle') disarm(true); defib.idx = (defib.idx + 1) % ENERGIES.length; store.set('energyIdx', defib.idx); renderDefib(); };
$('kCharge').onclick = () => {
  if (defib.state === 'charged') { disarm(true); return; }
  if (defib.state !== 'idle') return;
  defib.state = 'charging'; renderDefib(); sound.charge(3.5);
  emit({ type: 'charge', energy: ENERGIES[defib.idx] });
  defib.chargeTimer = setTimeout(() => {
    defib.state = 'charged'; renderDefib();
    sound.readyTone(); defib.readyTimer = setInterval(() => sound.readyTone(), 900);
    defib.autoDisarm = setTimeout(() => disarm(true), 60000);
  }, 3500);
};
$('kShock').onclick = () => {
  if (defib.state !== 'charged') return;
  const r = physio.target.rhythm;
  disarm(false);
  physio.shock(nowS()); sound.shock();
  document.body.classList.add('shockflash'); setTimeout(() => document.body.classList.remove('shockflash'), 180);
  emit({ type: 'shock', energy: ENERGIES[defib.idx], rhythm: r });
};

// ---------------------------------------------------------------- keys
$('kNibp').onclick = () => { if (nibp.measuring) { nibp.measuring = false; nibp.err = 'CANCELLED'; renderNibp(); } else startNibp('user'); };
$('kAuto').onclick = () => {
  const opts = [0, 3, 5, 10, 15];
  settings.autoNibp = opts[(opts.indexOf(settings.autoNibp) + 1) % opts.length];
  nextAuto = settings.autoNibp ? Date.now() + settings.autoNibp * 60000 : null;
  saveSettings(); renderNibp();
};
$('kSil').onclick = () => {
  const now = Date.now();
  if (now < alarmState.silencedUntil) alarmState.silencedUntil = 0;
  else { alarmState.silencedUntil = now + 120000; emit({ type: 'silence' }); }
  evalAlarms();
};
$('kTone').onclick = () => { settings.tone = !settings.tone; saveSettings(); $('toneLbl').textContent = settings.tone ? 'On' : 'Off'; };
$('toneLbl').textContent = settings.tone ? 'On' : 'Off';

// ---------------------------------------------------------------- link
const link = new Link('monitor', {
  onMessage: (m) => handle(m, true),
  onStatus: (s, via) => {
    const dot = $('linkDot');
    dot.className = 'dot ' + s;
    dot.title = s + (via ? ` (${via})` : '');
    $('linkTxt').textContent = s === 'connected' ? (via === 'wifi' ? 'INSTR' : 'INSTR (local)') : s === 'connecting' ? 'INSTR …' : '';
    if (s === 'connected') { sendState(true); if (pairOpen) setTimeout(closePair, 900); }
  },
});

function emit(ev, toDrawer = true) {
  link.send({ t: 'event', e: ev });
  if (drawerCtl && toDrawer !== null) drawerCtl.event(ev);
}

function handle(m, remote) {
  const now = nowS();
  if (m.t === 'set') {
    physio.set(m.p || {}, Number(m.ramp) || 0, now);
    store.set('target', physio.target);
    if (remote && drawerCtl) drawerCtl.setMonitor(stateMsg(true));
    if (!remote) sendState(true);
  } else if (m.t === 'nibp') startNibp('instructor');
  else if (m.t === 'sync' || m.t === 'hello') sendState(true);
  else if (m.t === 'reset') { physio.set(cloneState(DEFAULTS), 0, now); store.set('target', physio.target); sendState(true); }
}

function stateMsg(full) {
  return { t: 'state', target: physio.target, display: physio.display(), fullSync: !!full,
    nibp: { sys: nibp.sys, dia: nibp.dia, map: nibp.map, measuring: nibp.measuring } };
}
function sendState(full) { link.send(stateMsg(full)); }

// ---------------------------------------------------------------- drawer (single-device instructor)
let drawerCtl = null;
function openDrawer() {
  $('drawer').classList.remove('hidden');
  if (!drawerCtl) drawerCtl = buildControls($('drawerCtl'), { send: (m) => handle(m, false) });
  drawerCtl.setMonitor(stateMsg(true));
}
$('closeDrawer').onclick = () => $('drawer').classList.add('hidden');
// Hidden trigger: long-press the logo (1 s)
let lp = null;
$('brand').addEventListener('pointerdown', () => { lp = setTimeout(openDrawer, 1000); });
['pointerup', 'pointerleave', 'pointercancel'].forEach((e) => $('brand').addEventListener(e, () => clearTimeout(lp)));

// ---------------------------------------------------------------- menu
const modal = (id, show) => $(id).classList.toggle('hidden', !show);
$('kMenu').onclick = () => { $('optAlarm').textContent = settings.alarmSound ? 'On' : 'Off'; $('optVol').value = settings.volume; modal('menu', true); };
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { b.closest('.modal').classList.add('hidden'); if (b.closest('#pairModal')) closePair(); }));
$('mPair').onclick = () => { modal('menu', false); openPair(); };
$('mDrawer').onclick = () => { modal('menu', false); openDrawer(); };
$('mAlarm').onclick = () => { settings.alarmSound = !settings.alarmSound; saveSettings(); $('optAlarm').textContent = settings.alarmSound ? 'On' : 'Off'; };
$('optVol').oninput = (e) => { settings.volume = Number(e.target.value); sound.setVolume(settings.volume); saveSettings(); };
$('mFull').onclick = () => {
  const el = document.documentElement;
  if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else if (el.requestFullscreen || el.webkitRequestFullscreen) (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  else flashMsg('Add to Home Screen for full screen');
};
$('mReset').onclick = () => {
  if (!confirm('Reset monitor to baseline values?')) return;
  handle({ t: 'reset' }, false);
  nibp.sys = nibp.dia = nibp.map = nibp.time = null; nibp.err = null; store.set('nibp', {}); renderNibp();
  modal('menu', false);
};

// ---------------------------------------------------------------- pairing
let scanner = null, pairOpen = false;
async function openPair() {
  pairOpen = true;
  modal('pairModal', true);
  const st = $('offerStatus'), sc = $('scanStatus');
  st.textContent = 'מכין קוד…'; sc.textContent = 'מפעיל מצלמה…';
  const ctx = $('qrOffer').getContext('2d'); ctx.clearRect(0, 0, 9999, 9999);
  // Camera first: on iOS/Safari camera permission also unlocks local network candidates for WebRTC.
  scanner = new Scanner($('pairVideo'), {
    prefix: 'PT1A',
    facing: store.get('pairFacing', 'user'),
    onCode: async (code) => {
      if (code === scanner.lastCode) return;
      scanner.lastCode = code;
      sc.textContent = 'קוד התקבל — מתחבר…';
      try { await link.acceptAnswer(code); } catch (e) { sc.textContent = 'שגיאה: ' + e.message; scanner.lastCode = null; }
    },
  });
  try { await scanner.start(); sc.textContent = 'כוון את קוד התשובה מהאייפון למצלמה'; }
  catch (e) { sc.textContent = 'אין גישה למצלמה — השתמש בהעתק/הדבק למטה'; }
  try {
    const offer = await link.createOffer();
    $('qrOffer').dataset.code = offer;
    drawQR($('qrOffer'), offer);
    st.textContent = '1. סרוק קוד זה באייפון (עמדת מדריך)';
  } catch (e) { st.textContent = 'WebRTC לא זמין בדפדפן זה: ' + e.message; }
}
function closePair() {
  pairOpen = false;
  if (scanner) { store.set('pairFacing', scanner.facing); scanner.stop(); scanner = null; }
  modal('pairModal', false);
}
$('flipCam').onclick = async () => { if (scanner) { try { await scanner.flip(); } catch (e) { $('scanStatus').textContent = 'לא ניתן להחליף מצלמה'; } } };
$('copyOffer').onclick = async () => { const c = $('qrOffer').dataset.code; if (c) { await shareText(c); $('copyOffer').textContent = 'הועתק ✓'; } };
$('useAnswer').onclick = async () => {
  try { await link.acceptAnswer($('pasteAnswer').value); $('scanStatus').textContent = 'מתחבר…'; }
  catch (e) { $('scanStatus').textContent = 'שגיאה: ' + e.message; }
};

// ---------------------------------------------------------------- misc
let msgTimer = null;
function flashMsg(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(msgTimer); msgTimer = setTimeout(() => el.classList.remove('show'), 2500); }

function renderNums() {
  const d = physio.display();
  $('vHr').textContent = fmt(d.hr);
  $('hrSrc').textContent = d.hrSrc;
  $('vSpo2').textContent = fmt(d.spo2);
  $('vCo2').textContent = fmt(d.etco2);
  $('vRr').textContent = fmt(d.rr);
  $('vTemp').textContent = d.temp == null ? '---' : fmt(d.temp, 1);
  const top = physio.cur.etco2 > 48 ? 75 : 50;
  if (strips.co2.o.max !== top) strips.co2.o.max = top;
}

function clock() {
  $('clock').textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
}

// ---------------------------------------------------------------- main loop
let last = nowS(), lastNums = 0, lastAlarm = 0, lastSend = 0, lastClock = 0;
function frame() {
  const now = nowS();
  const dt = Math.min(now - last, 0.5);
  const t0 = now - dt;
  physio.update(now);
  const L = physio.target.leads;
  strips.ecg.advance(t0, now, L.ecg);
  strips.pleth.advance(t0, now, L.spo2);
  strips.co2.advance(t0, now, L.co2);
  strips.ecg.draw(L.ecg ? null : 'LEADS OFF');
  strips.pleth.draw(L.spo2 ? null : 'SpO2 SENSOR OFF');
  strips.co2.draw(L.co2 ? null : 'CO2 LINE OFF');

  // Beat feedback
  const beats = physio.beatsBetween(t0, now);
  if (beats.length && (L.ecg || (L.spo2 && physio.perfusing))) {
    const h = $('heart'); h.classList.add('beat'); setTimeout(() => h.classList.remove('beat'), 130);
    if (settings.tone) {
      if (L.spo2 && physio.perfusing) sound.pulse(physio.display().spo2);
      else if (L.ecg) sound.qrsBeep();
    }
  }
  if (now - lastNums > 0.5) { lastNums = now; renderNums(); }
  tickNibp(now);
  if (now - lastAlarm > 1) { lastAlarm = now; evalAlarms(); }
  if (now - lastSend > 1) { lastSend = now; const m = stateMsg(false); link.send(m); if (drawerCtl) drawerCtl.setMonitor(m); }
  if (now - lastClock > 0.5) { lastClock = now; clock(); }
  last = now;
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- start
$('startOverlay').addEventListener('click', () => {
  sound.unlock();
  keepAwake();
  $('startOverlay').classList.add('hidden');
  Object.values(strips).forEach((s) => s.resize());
});
renderDefib(); renderNibp(); clock(); renderNums();
requestAnimationFrame(frame);

if (new URLSearchParams(location.search).has('solo')) setTimeout(openDrawer, 50);
