// Pachys Tempus — physiology / waveform engine.
// Time is in seconds (performance.now()/1000). Events (beats, breaths,
// compressions) are scheduled ~1 s ahead so waveform sampling never misses them.

import { DEFAULTS, NUM_KEYS, RHYTHM_PROPS, cloneState } from './model.js';

const TAU = Math.PI * 2;
const g = (x, mu, sd, a) => a * Math.exp(-((x - mu) * (x - mu)) / (2 * sd * sd));
const smooth = (x, a, b) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

export class Physio {
  constructor(saved) {
    this.target = cloneState(DEFAULTS);
    if (saved) this.merge(saved);
    this.cur = {};
    for (const k of NUM_KEYS) this.cur[k] = this.target[k];
    this.ramps = {};
    this.beats = [];
    this.pwaves = [];
    this.breaths = [];
    this.comps = [];
    this.nextBeat = 0; this.nextP = 0; this.nextBreath = 0; this.nextComp = 0;
    this.shockAt = -99;
    this.started = false;
  }

  merge(p) {
    for (const [k, v] of Object.entries(p)) {
      if (k === 'leads') this.target.leads = { ...this.target.leads, ...v };
      else if (k in DEFAULTS) this.target[k] = v;
    }
  }

  // Apply a partial update. Numeric params ramp linearly over `ramp` seconds.
  set(p, ramp, now) {
    const prevRhythm = this.target.rhythm;
    this.merge(p);
    for (const k of NUM_KEYS) {
      if (!(k in p)) continue;
      const to = Number(p[k]);
      if (ramp > 0) this.ramps[k] = { from: this.cur[k], to, t0: now, dur: ramp };
      else { delete this.ramps[k]; this.cur[k] = to; }
    }
    if (this.target.rhythm !== prevRhythm) {
      // Drop future beats so the new rhythm starts promptly.
      this.beats = this.beats.filter((b) => b.t <= now);
      this.nextBeat = now + 0.15;
    }
    if ('cpr' in p) { this.comps = this.comps.filter((c) => c.t <= now); this.nextComp = now + 0.05; }
  }

  shock(now) { this.shockAt = now; }

  get props() { return RHYTHM_PROPS[this.target.rhythm] || RHYTHM_PROPS.nsr; }
  get perfusing() { return this.props.organized && this.target.pulse && this.cur.hr > 0; }

  update(now) {
    if (!this.started) {
      this.started = true;
      this.nextBeat = this.nextP = this.nextBreath = this.nextComp = now + 0.2;
    }
    for (const [k, r] of Object.entries(this.ramps)) {
      const u = Math.min(1, (now - r.t0) / r.dur);
      this.cur[k] = r.from + (r.to - r.from) * u;
      if (u >= 1) delete this.ramps[k];
    }
    const ahead = now + 1;
    const props = this.props;
    // Ventricular beats
    while (this.nextBeat < ahead) {
      const hr = this.cur.hr;
      if (!props.organized || hr < 5) { this.nextBeat = ahead + 0.01; break; }
      let rr = 60 / hr;
      if (props.irregular) rr *= 0.65 + Math.random() * 0.7;
      else rr *= 1 + (Math.random() - 0.5) * 0.02;
      this.beats.push({ t: this.nextBeat, rr, wide: !!props.wide, vt: !!props.vt, p: !!props.p });
      this.nextBeat += rr;
    }
    // Dissociated P waves (CHB)
    while (this.nextP < ahead) {
      if (!props.dissociatedP) { this.nextP = ahead + 0.01; break; }
      this.pwaves.push(this.nextP);
      this.nextP += 0.78;
    }
    // Breaths
    while (this.nextBreath < ahead) {
      const rr = this.cur.rr;
      if (rr < 1) { this.nextBreath = ahead + 0.01; break; }
      const T = 60 / rr;
      this.breaths.push({ t: this.nextBreath, T });
      this.nextBreath += T;
    }
    // Chest compressions
    while (this.nextComp < ahead) {
      if (!this.target.cpr) { this.nextComp = ahead + 0.01; break; }
      this.comps.push(this.nextComp);
      this.nextComp += 60 / 110;
    }
    const old = now - 4;
    this.beats = this.beats.filter((b) => b.t > old);
    this.pwaves = this.pwaves.filter((t) => t > old);
    this.breaths = this.breaths.filter((b) => b.t + b.T > old);
    this.comps = this.comps.filter((t) => t > old);
  }

  // Beats whose QRS falls in (a, b] — used for pulse tone / heart icon.
  beatsBetween(a, b) { return this.beats.filter((x) => x.t > a && x.t <= b); }

  ecg(t) {
    const p = this.props;
    let v = 0;
    if (p.organized) {
      for (const b of this.beats) {
        const dt = t - b.t;
        if (dt < -0.35 || dt > 1.2) continue;
        if (!b.wide) {
          if (b.p) v += g(dt, -0.16, 0.022, 0.13);
          v += g(dt, -0.028, 0.008, -0.12) + g(dt, 0, 0.011, 1.0) + g(dt, 0.028, 0.011, -0.28);
          const rr = Math.min(b.rr, 1.5);
          const tc = 0.27 * Math.sqrt(rr) + 0.03;
          v += g(dt, tc, 0.05, 0.27);
          const ste = this.cur.ste;
          if (ste > 0) v += ste * 0.1 * smooth(dt, 0.03, 0.06) * (1 - smooth(dt, tc, tc + 0.09));
        } else if (b.vt) {
          v += g(dt, 0, 0.045, 1.1) + g(dt, 0.09, 0.045, -0.75);
        } else {
          const tc = 0.34 * Math.sqrt(Math.min(b.rr, 2));
          v += g(dt, 0, 0.035, 1.0) + g(dt, 0.06, 0.035, -0.45) + g(dt, tc, 0.08, -0.3);
        }
      }
      if (p.dissociatedP) for (const pt of this.pwaves) { const dt = t - pt; if (dt > -0.2 && dt < 0.2) v += g(dt, 0, 0.022, 0.13); }
      if (p.fib) v += 0.035 * (Math.sin(TAU * 6.1 * t) + 0.6 * Math.sin(TAU * 7.3 * t + 1) + 0.4 * Math.sin(TAU * 4.7 * t + 2));
      if (p.flutter) { const s = (t * 5) % 1; v += -0.2 * (s < 0.8 ? s / 0.8 : (1 - s) / 0.2) + 0.1; }
    } else if (p.vf) {
      const amp = 0.42 * (0.7 + 0.3 * Math.sin(TAU * 0.27 * t));
      v += amp * (Math.sin(TAU * 5 * t) + 0.5 * Math.sin(TAU * 3.7 * t + 1.3) + 0.3 * Math.sin(TAU * 6.6 * t + 0.4)) / 1.4;
    } else {
      v += 0.015 * Math.sin(TAU * 0.3 * t);
    }
    if (this.target.cpr) for (const c of this.comps) { const dt = t - c; if (dt >= 0 && dt < 0.32) v += 0.85 * Math.sin(Math.PI * dt / 0.32); }
    const ds = t - this.shockAt;
    if (ds >= 0 && ds < 0.12) return 3;
    if (ds >= 0.12 && ds < 3) v += 1.4 * Math.exp(-(ds - 0.12) / 0.5);
    return v + (Math.random() - 0.5) * 0.012;
  }

  pleth(t) {
    let v = 0;
    if (this.perfusing) {
      const perf = this.cur.perf;
      for (const b of this.beats) {
        const x = t - (b.t + 0.22);
        if (x < 0 || x > 2) continue;
        const u = x / Math.min(Math.max(b.rr, 0.3), 1);
        const up = u < 0.15 ? Math.sin((Math.PI / 2) * (u / 0.15)) : Math.exp(-(u - 0.15) * 3.4) + g(u, 0.46, 0.05, 0.13);
        v += perf * up;
      }
    }
    if (this.target.cpr) for (const c of this.comps) { const dt = t - c - 0.1; if (dt >= 0 && dt < 0.45) v += 0.3 * Math.sin(Math.PI * dt / 0.45); }
    return v + (Math.random() - 0.5) * 0.008;
  }

  co2(t) {
    const E = this.cur.etco2;
    for (const b of this.breaths) {
      if (t < b.t || t >= b.t + b.T) continue;
      const u = (t - b.t) / b.T;
      const exp = 0.55;
      if (u > exp + 0.05) return 0;
      if (u > exp) return E * (1 - (u - exp) / 0.05) * 0.98;
      if (this.target.capno === 'obstructive') return E * (1 - Math.exp(-u / 0.17)) / (1 - Math.exp(-exp / 0.17));
      const rise = smooth(u, 0, 0.07);
      return E * rise * (0.9 + 0.1 * (u / exp));
    }
    return 0;
  }

  // Values a real monitor would display (null = '---').
  display() {
    const p = this.props, L = this.target.leads, c = this.cur;
    let hr = null, hrSrc = 'HR';
    if (L.ecg) hr = p.organized ? c.hr : (p.asys ? 0 : null);
    else if (L.spo2 && this.perfusing) { hr = c.hr; hrSrc = 'PR'; }
    if (this.target.cpr && L.ecg && !this.perfusing) hr = 110;
    return {
      hr, hrSrc,
      spo2: L.spo2 && this.perfusing ? c.spo2 : null,
      etco2: L.co2 ? c.etco2 : null,
      rr: L.co2 ? c.rr : null,
      temp: L.temp ? c.temp : null,
    };
  }
}
