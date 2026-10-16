// Pachys Tempus — synthesized monitor sounds (WebAudio, no files, works offline).

export class Sound {
  constructor() {
    this.ctx = null;
    this.volume = 0.6;
    this.muted = false;
    this._ready = null;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state !== 'running') this.ctx.resume();
    // iOS: play a silent buffer inside the gesture to fully unlock.
    const b = this.ctx.createBuffer(1, 1, 22050);
    const s = this.ctx.createBufferSource();
    s.buffer = b; s.connect(this.master); s.start(0);
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  tone(freq, dur, { when = 0, type = 'sine', gain = 0.5, attack = 0.005 } = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const gn = this.ctx.createGain();
    o.type = type; o.frequency.value = freq;
    gn.gain.setValueAtTime(0, t);
    gn.gain.linearRampToValueAtTime(gain, t + attack);
    gn.gain.setValueAtTime(gain, t + Math.max(attack, dur - 0.02));
    gn.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(gn); gn.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // Pulse-oximetry style beep: pitch follows SpO2.
  pulse(spo2) {
    const s = spo2 == null ? 95 : Math.max(60, Math.min(100, spo2));
    this.tone(420 + (s - 60) * 11, 0.07, { type: 'triangle', gain: 0.35 });
  }

  qrsBeep() { this.tone(880, 0.06, { type: 'triangle', gain: 0.3 }); }

  alarm(priority) {
    if (priority === 'high') {
      // IEC 60601-1-8 style: 3 + 2 pulses
      const f = 960, d = 0.13;
      [0, 0.2, 0.4, 0.9, 1.1].forEach((w) => this.tone(f, d, { when: w, type: 'square', gain: 0.18 }));
    } else if (priority === 'medium') {
      [0, 0.25, 0.5].forEach((w) => this.tone(700, 0.18, { when: w, type: 'square', gain: 0.14 }));
    } else {
      this.tone(520, 0.25, { type: 'square', gain: 0.1 });
    }
  }

  charge(dur) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const gn = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(1800, t + dur);
    gn.gain.setValueAtTime(0.06, t);
    gn.gain.linearRampToValueAtTime(0, t + dur + 0.05);
    o.connect(gn); gn.connect(this.master);
    o.start(t); o.stop(t + dur + 0.1);
    this._chargeOsc = o;
  }

  cancelCharge() { try { this._chargeOsc && this._chargeOsc.stop(); } catch (e) { /* already stopped */ } this._chargeOsc = null; }

  readyTone() { this.tone(1500, 0.12, { type: 'square', gain: 0.12 }); }

  shock() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const n = this.ctx.createBufferSource();
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.25, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * 0.18));
    n.buffer = buf;
    const gn = this.ctx.createGain(); gn.gain.value = 0.5;
    n.connect(gn); gn.connect(this.master); n.start(t);
    this.tone(90, 0.25, { type: 'sine', gain: 0.6 });
  }

  click() { this.tone(1200, 0.02, { type: 'square', gain: 0.08 }); }
}
