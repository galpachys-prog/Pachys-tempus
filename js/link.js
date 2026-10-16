// Pachys Tempus — serverless link between monitor and instructor.
//
// 1. WebRTC DataChannel with NO ICE/STUN servers: works on any local Wi-Fi /
//    phone hotspot with no internet. Signalling (offer/answer) is exchanged by
//    scanning QR codes (or copy/paste / AirDrop of the text code).
// 2. BroadcastChannel: automatic link between two tabs/windows on the same
//    device (e.g. iPad Split View, or testing on a laptop).

const PREFIX = 'PT1';
const KEEP = /^(v=|o=|s=|t=|a=group:|m=|c=|a=ice-ufrag|a=ice-pwd|a=ice-options|a=fingerprint|a=setup|a=mid|a=sctp-port|a=max-message-size|a=candidate)/;

export function encodeSdp(kind, sdp) {
  let lines = sdp.split(/\r?\n/).filter((l) => KEEP.test(l));
  const cand = lines.filter((l) => l.startsWith('a=candidate'));
  const udp = cand.filter((l) => / udp /i.test(l));
  if (udp.length) lines = lines.filter((l) => !l.startsWith('a=candidate') || / udp /i.test(l));
  return `${PREFIX}${kind}:${lines.join('\n')}`;
}

export function decodeSdp(code) {
  const s = String(code || '').trim();
  if (!s.startsWith(PREFIX) || s[4] !== ':') throw new Error('קוד לא תקין');
  const kind = s[3];
  const sdp = s.slice(5).split(/\r?\n/).filter(Boolean).join('\r\n') + '\r\n';
  return { kind, sdp };
}

function waitIce(pc, ms = 4000) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const done = () => { pc.removeEventListener('icegatheringstatechange', chk); clearTimeout(tm); resolve(); };
    const chk = () => { if (pc.iceGatheringState === 'complete') done(); };
    pc.addEventListener('icegatheringstatechange', chk);
    const tm = setTimeout(done, ms);
  });
}

export class Link {
  constructor(role, { onMessage, onStatus } = {}) {
    this.role = role;
    this.onMessage = onMessage || (() => {});
    this.onStatus = onStatus || (() => {});
    this.pc = null; this.dc = null;
    this.lastBc = 0; this.lastRtc = 0;
    this.seen = new Set(); this.seq = 0;
    this.id = Math.random().toString(36).slice(2, 8);
    this.status = 'disconnected';
    try {
      this.bc = new BroadcastChannel('pachys-tempus-link');
      this.bc.onmessage = (e) => {
        const d = e.data;
        if (!d || d.role === this.role) return;
        this.lastBc = Date.now();
        this._recv(d);
      };
    } catch (e) { this.bc = null; }
    setInterval(() => { this.send({ t: 'ping' }); this._updateStatus(); }, 1500);
  }

  get via() {
    const now = Date.now();
    if (this.dc && this.dc.readyState === 'open' && now - this.lastRtc < 6000) return 'wifi';
    if (now - this.lastBc < 5000) return 'local';
    return null;
  }

  _updateStatus() {
    const v = this.via;
    const s = v ? 'connected' : (this.pc && ['new', 'checking', 'connecting'].includes(this.pc.iceConnectionState) && this.dc && this.dc.readyState !== 'closed' ? 'connecting' : 'disconnected');
    const key = s + (v || '');
    if (key !== this._lastKey) { this._lastKey = key; this.status = s; this.onStatus(s, v); }
  }

  _recv(d) {
    const key = d.src + ':' + d.seq;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    if (this.seen.size > 400) this.seen = new Set([...this.seen].slice(-200));
    this._updateStatus();
    if (d.m && d.m.t !== 'ping') this.onMessage(d.m);
  }

  send(m) {
    const d = { role: this.role, src: this.id, seq: ++this.seq, m };
    if (this.bc) try { this.bc.postMessage(d); } catch (e) { /* ignore */ }
    if (this.dc && this.dc.readyState === 'open') try { this.dc.send(JSON.stringify(d)); } catch (e) { /* ignore */ }
  }

  _newPc() {
    if (this.pc) try { this.pc.close(); } catch (e) { /* ignore */ }
    const pc = new RTCPeerConnection({ iceServers: [] });
    pc.oniceconnectionstatechange = () => this._updateStatus();
    this.pc = pc;
    return pc;
  }

  _attach(dc) {
    this.dc = dc;
    dc.onopen = () => { this.lastRtc = Date.now(); this._updateStatus(); this.send({ t: 'hello', role: this.role }); };
    dc.onclose = () => this._updateStatus();
    dc.onmessage = (e) => {
      this.lastRtc = Date.now();
      try { this._recv(JSON.parse(e.data)); } catch (err) { /* ignore */ }
    };
  }

  // Monitor side
  async createOffer() {
    const pc = this._newPc();
    this._attach(pc.createDataChannel('pt', { ordered: true }));
    await pc.setLocalDescription(await pc.createOffer());
    await waitIce(pc);
    return encodeSdp('O', pc.localDescription.sdp);
  }

  async acceptAnswer(code) {
    const { kind, sdp } = decodeSdp(code);
    if (kind !== 'A') throw new Error('זה לא קוד תשובה של עמדת המדריך');
    if (!this.pc) throw new Error('אין הצעה פעילה');
    await this.pc.setRemoteDescription({ type: 'answer', sdp });
  }

  // Instructor side
  async acceptOffer(code) {
    const { kind, sdp } = decodeSdp(code);
    if (kind !== 'O') throw new Error('זה לא קוד של המוניטור');
    const pc = this._newPc();
    pc.ondatachannel = (e) => this._attach(e.channel);
    await pc.setRemoteDescription({ type: 'offer', sdp });
    await pc.setLocalDescription(await pc.createAnswer());
    await waitIce(pc);
    return encodeSdp('A', pc.localDescription.sdp);
  }
}
