// Pachys Tempus — QR display and camera scanning (uses vendored qrcode.js + jsQR.js).

export function drawQR(canvas, text) {
  const qr = window.qrcode(0, 'L');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 3;
  const total = n + quiet * 2;
  const css = Math.min(canvas.parentElement.clientWidth || 360, 520);
  const dpr = window.devicePixelRatio || 1;
  const cell = Math.max(2, Math.floor((css * dpr) / total));
  canvas.width = canvas.height = cell * total;
  canvas.style.width = canvas.style.height = `${(cell * total) / dpr}px`;
  const c = canvas.getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) c.fillRect((k + quiet) * cell, (r + quiet) * cell, cell, cell);
  return n;
}

export class Scanner {
  constructor(video, { onCode, prefix, facing = 'environment' }) {
    this.video = video; this.onCode = onCode; this.prefix = prefix; this.facing = facing;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.stream = null; this.running = false;
  }

  async start() {
    this.stop();
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: this.facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    this.video.classList.toggle('mirror', this.facing === 'user');
    await this.video.play().catch(() => {});
    this.running = true;
    this._loop();
  }

  async flip() { this.facing = this.facing === 'user' ? 'environment' : 'user'; await this.start(); }

  _loop() {
    if (!this.running) return;
    const v = this.video;
    if (v.readyState >= 2 && v.videoWidth) {
      const scale = Math.min(1, 800 / v.videoWidth);
      const w = Math.round(v.videoWidth * scale), h = Math.round(v.videoHeight * scale);
      this.canvas.width = w; this.canvas.height = h;
      this.ctx.drawImage(v, 0, 0, w, h);
      const img = this.ctx.getImageData(0, 0, w, h);
      const res = window.jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
      if (res && res.data && (!this.prefix || res.data.startsWith(this.prefix))) {
        this.onCode(res.data);
      }
    }
    this._timer = setTimeout(() => requestAnimationFrame(() => this._loop()), 120);
  }

  stop() {
    this.running = false;
    clearTimeout(this._timer);
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
  }
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
    ta.remove(); return ok;
  }
}

export async function shareText(text) {
  if (navigator.share) { try { await navigator.share({ text }); return true; } catch (e) { return false; } }
  return copyText(text);
}
