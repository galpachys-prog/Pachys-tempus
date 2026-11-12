// Pachys Tempus — instructor control panel (used on the iPhone station and
// inside the monitor's hidden single-device drawer).

import { RHYTHMS, PARAMS, SCENARIOS, DEFAULTS, cloneState, fmt } from './model.js';

const RAMPS = [[0, 'מיידי'], [10, '10 ש׳'], [30, '30 ש׳'], [60, '1 ד׳'], [120, '2 ד׳'], [300, '5 ד׳']];
const SENSORS = [['ecg', 'ECG'], ['spo2', 'SpO₂'], ['co2', 'CO₂'], ['nibp', 'NIBP'], ['temp', 'Temp']];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function buildControls(root, { send }) {
  let applied = cloneState(DEFAULTS);
  let pending = {};
  let ramp = 0;
  let live = false;
  let curScen = '';
  let synced = false;
  let timer = { start: null, acc: 0 };
  const events = [];

  root.classList.add('ctl');
  root.innerHTML = `
    <section class="ctl-readout" data-ro>
      <div><b data-ro="hr">---</b><small data-ro="hrSrc">HR</small></div>
      <div><b data-ro="spo2">---</b><small>SpO₂</small></div>
      <div><b data-ro="nibp">---/---</b><small>NIBP</small></div>
      <div><b data-ro="etco2">---</b><small>EtCO₂</small></div>
      <div><b data-ro="rr">---</b><small>RR</small></div>
    </section>
    <section class="ctl-timer">
      <span data-timer>00:00</span>
      <button data-act="timer">▶︎ התחל תרחיש</button>
      <button data-act="timer-reset" class="ghost">איפוס</button>
    </section>

    <h3>קצב</h3>
    <section class="ctl-grid rhythms">
      ${RHYTHMS.map((r) => `<button data-rhythm="${r.id}">${esc(r.label)}</button>`).join('')}
    </section>
    <section class="ctl-row toggles">
      <button data-toggle="pulse" class="tog">דופק</button>
      <button data-toggle="cpr" class="tog">עיסויים (CPR)</button>
      <button data-toggle="capno" class="tog">קפנו׳ חסימתי</button>
    </section>

    <h3>מדדים</h3>
    <section class="ctl-params">
      ${PARAMS.map((p) => `
        <div class="param" data-param="${p.k}">
          <span class="pl">${esc(p.label)}<small>${esc(p.unit)}</small></span>
          <button class="st" data-step="-1" aria-label="הורד">−</button>
          <input type="number" inputmode="decimal" data-input="${p.k}" min="${p.min}" max="${p.max}" step="${p.step}">
          <button class="st" data-step="1" aria-label="העלה">+</button>
        </div>`).join('')}
    </section>

    <h3>זמן מעבר</h3>
    <section class="ctl-row chips">
      ${RAMPS.map(([s, l]) => `<button data-ramp="${s}">${l}</button>`).join('')}
    </section>

    <h3>חיישנים מחוברים</h3>
    <section class="ctl-row chips">
      ${SENSORS.map(([k, l]) => `<button data-lead="${k}" class="tog">${l}</button>`).join('')}
    </section>

    <h3>פעולות על המוניטור</h3>
    <section class="ctl-row">
      <button data-act="nibp">מדידת NIBP עכשיו</button>
      <button data-act="sync" class="ghost">סנכרון</button>
    </section>

    <h3>תרחישים</h3>
    <section class="ctl-grid scen">
      ${SCENARIOS.map((s) => `<button data-scen="${s.id}">${esc(s.name)}</button>`).join('')}
    </section>
    <p class="hint">לחיצה על תרחיש משדרת אותו מיד למוניטור, עם זמן המעבר שנבחר למעלה.</p>

    <h3>יומן אירועים</h3>
    <ol class="ctl-log" data-log></ol>

    <footer class="ctl-foot">
      <button data-act="live" class="tog live">LIVE</button>
      <button data-act="discard" class="ghost">בטל</button>
      <button data-act="apply" class="apply">החל <span data-pcount></span></button>
    </footer>`;

  const $ = (sel) => root.querySelector(sel);
  const $$ = (sel) => [...root.querySelectorAll(sel)];
  const val = (k) => (k in pending ? pending[k] : applied[k]);

  function render() {
    $$('[data-rhythm]').forEach((b) => {
      b.classList.toggle('on', applied.rhythm === b.dataset.rhythm);
      b.classList.toggle('pend', 'rhythm' in pending && pending.rhythm === b.dataset.rhythm);
    });
    const tog = (k, on, pend) => { const b = $(`[data-toggle="${k}"]`); b.classList.toggle('on', on); b.classList.toggle('pend', pend); };
    tog('pulse', !!val('pulse'), 'pulse' in pending);
    $('[data-toggle="pulse"]').textContent = val('pulse') ? 'דופק נמוש' : 'ללא דופק';
    tog('cpr', !!val('cpr'), 'cpr' in pending);
    tog('capno', val('capno') === 'obstructive', 'capno' in pending);
    for (const p of PARAMS) {
      const inp = $(`[data-input="${p.k}"]`);
      if (document.activeElement !== inp) inp.value = fmt(val(p.k), p.dec || 0);
      inp.closest('.param').classList.toggle('pend', p.k in pending);
    }
    $$('[data-ramp]').forEach((b) => b.classList.toggle('on', Number(b.dataset.ramp) === ramp));
    $$('[data-scen]').forEach((b) => b.classList.toggle('on', b.dataset.scen === curScen));
    const leads = val('leads');
    $$('[data-lead]').forEach((b) => {
      b.classList.toggle('on', !!leads[b.dataset.lead]);
      b.classList.toggle('pend', 'leads' in pending && pending.leads[b.dataset.lead] !== applied.leads[b.dataset.lead]);
    });
    const n = Object.keys(pending).length;
    $('[data-pcount]').textContent = n ? `(${n})` : '';
    $('[data-act="apply"]').disabled = !n;
    $('[data-act="discard"]').disabled = !n;
    $('[data-act="live"]').classList.toggle('on', live);
    root.classList.toggle('has-pending', n > 0);
  }

  function change(p) {
    for (const [k, v] of Object.entries(p)) {
      if (k === 'leads') pending.leads = { ...(pending.leads || applied.leads), ...v };
      else pending[k] = v;
    }
    // Drop entries equal to the applied value.
    for (const k of Object.keys(pending)) {
      if (JSON.stringify(pending[k]) === JSON.stringify(applied[k])) delete pending[k];
    }
    if (live) apply(); else render();
  }

  function apply() {
    if (!Object.keys(pending).length) return;
    send({ t: 'set', p: pending, ramp });
    for (const [k, v] of Object.entries(pending)) applied[k] = k === 'leads' ? { ...v } : v;
    log(`שינוי: ${describe(pending)}${ramp ? ` (מעבר ${ramp} ש׳)` : ''}`, 'set');
    pending = {};
    render();
  }

  function describe(p) {
    const parts = [];
    for (const [k, v] of Object.entries(p)) {
      if (k === 'rhythm') parts.push(RHYTHMS.find((r) => r.id === v)?.label || v);
      else if (k === 'pulse') parts.push(v ? 'דופק +' : 'ללא דופק');
      else if (k === 'cpr') parts.push(v ? 'CPR on' : 'CPR off');
      else if (k === 'capno') parts.push(`capno ${v}`);
      else if (k === 'leads') parts.push('חיישנים');
      else { const m = PARAMS.find((x) => x.k === k); parts.push(`${m ? m.label : k} ${fmt(v, m?.dec || 0)}`); }
    }
    return parts.join(', ');
  }

  function elapsed() {
    const ms = timer.acc + (timer.start ? Date.now() - timer.start : 0);
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  function log(text, kind = '') {
    const started = timer.start || timer.acc;
    events.unshift({ time: started ? elapsed() : new Date().toLocaleTimeString('en-GB', { hour12: false }), clock: new Date().toLocaleTimeString('he-IL', { hour12: false }), text, kind });
    if (events.length > 200) events.pop();
    $('[data-log]').innerHTML = events.map((e) => `<li class="${e.kind}"><time>${e.time}</time> ${esc(e.text)}</li>`).join('');
  }

  // --- Events ---
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !root.contains(b)) return;
    const d = b.dataset;
    if (d.rhythm) {
      const r = RHYTHMS.find((x) => x.id === d.rhythm);
      const p = { rhythm: r.id };
      if (!('hr' in pending)) p.hr = r.hr;
      if (r.id === 'vf' || r.id === 'asys') p.pulse = false;
      change(p);
    } else if (d.toggle === 'pulse') change({ pulse: !val('pulse') });
    else if (d.toggle === 'cpr') change({ cpr: !val('cpr') });
    else if (d.toggle === 'capno') change({ capno: val('capno') === 'obstructive' ? 'normal' : 'obstructive' });
    else if (d.step) {
      const k = b.closest('.param').dataset.param;
      const m = PARAMS.find((x) => x.k === k);
      let v = Number(val(k)) + Number(d.step) * m.step;
      v = Math.min(m.max, Math.max(m.min, Math.round(v / m.step) * m.step));
      change({ [k]: Number(v.toFixed(m.dec || 0)) });
    } else if (d.ramp !== undefined) { ramp = Number(d.ramp); render(); }
    else if (d.lead) { const l = val('leads'); change({ leads: { [d.lead]: !l[d.lead] } }); }
    else if (d.scen) {
      const s = SCENARIOS.find((x) => x.id === d.scen);
      if (!s) return;
      // A scenario goes to the monitor straight away (with the chosen ramp time).
      const was = live; live = false;
      change(cloneState(s.p));
      live = was;
      curScen = s.id;
      log(`תרחיש: ${s.name}`, 'scen');
      if (Object.keys(pending).length) apply(); else render();
    } else if (d.act === 'apply') apply();
    else if (d.act === 'discard') { pending = {}; render(); }
    else if (d.act === 'live') { live = !live; if (live) apply(); render(); }
    else if (d.act === 'nibp') { send({ t: 'nibp' }); log('הופעלה מדידת NIBP מהמדריך', 'act'); }
    else if (d.act === 'sync') send({ t: 'sync' });
    else if (d.act === 'timer') {
      if (timer.start) { timer.acc += Date.now() - timer.start; timer.start = null; b.textContent = '▶︎ המשך'; }
      else { timer.start = Date.now(); b.textContent = '❚❚ השהה'; }
    } else if (d.act === 'timer-reset') { timer = { start: null, acc: 0 }; $('[data-act="timer"]').textContent = '▶︎ התחל תרחיש'; }
  });

  // Long-press repeat on +/- steppers
  let rep = null;
  root.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.st'); if (!b) return;
    clearInterval(rep);
    rep = setTimeout(() => { rep = setInterval(() => b.click(), 90); }, 450);
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => root.addEventListener(ev, () => { clearTimeout(rep); clearInterval(rep); }));

  root.addEventListener('change', (e) => {
    const k = e.target.dataset.input; if (!k) return;
    const m = PARAMS.find((x) => x.k === k);
    let v = Number(e.target.value);
    if (Number.isNaN(v)) { render(); return; }
    v = Math.min(m.max, Math.max(m.min, v));
    change({ [k]: Number(v.toFixed(m.dec || 0)) });
  });

  setInterval(() => { $('[data-timer]').textContent = elapsed(); }, 500);
  render();

  return {
    setMonitor(st) {
      if (st.target && (!synced || st.fullSync)) {
        applied = cloneState(st.target);
        synced = true;
        render();
      }
      const d = st.display || {};
      const ro = (k, v) => { const el = $(`b[data-ro="${k}"]`); if (el) el.textContent = v; };
      ro('hr', fmt(d.hr));
      $('small[data-ro="hrSrc"]').textContent = d.hrSrc || 'HR';
      ro('spo2', fmt(d.spo2));
      ro('nibp', st.nibp && st.nibp.sys != null ? `${st.nibp.sys}/${st.nibp.dia}` : (st.nibp && st.nibp.measuring ? '…' : '---/---'));
      ro('etco2', fmt(d.etco2));
      ro('rr', fmt(d.rr));
    },
    event(ev) {
      const map = {
        shock: () => `⚡ שוק ${ev.energy}J`,
        charge: () => `טעינה ${ev.energy}J`,
        disarm: () => 'פריקה פנימית (disarm)',
        nibp: () => `NIBP ${ev.result || ''}`,
        silence: () => 'השתקת אזעקות',
        alarm: () => `אזעקה: ${ev.text}`,
        pulse_check: () => 'בדיקת דופק',
      };
      log(map[ev.type] ? map[ev.type]() : ev.type, ev.type);
    },
    log,
    forceSync() { synced = false; },
  };
}
