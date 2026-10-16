// Pachys Tempus — instructor station (iPhone).

import { Link } from './link.js';
import { drawQR, Scanner, shareText } from './pairing.js';
import { buildControls } from './controls.js';
import { registerSW, keepAwake } from './common.js';

registerSW();
document.addEventListener('click', () => keepAwake(), { once: true });

const $ = (id) => document.getElementById(id);
const show = (id) => ['pairIdle', 'scanArea', 'answerArea', 'pairDone'].forEach((x) => { $(x).hidden = x !== id; });
let answerCode = null;
let scanner = null;

const link = new Link('instructor', {
  onMessage: (m) => {
    if (m.t === 'state') ctl.setMonitor(m);
    else if (m.t === 'event') ctl.event(m.e);
  },
  onStatus: (s, via) => {
    const pill = $('linkPill');
    pill.className = 'pill ' + s;
    pill.textContent = s === 'connected' ? (via === 'wifi' ? 'מחובר · Wi-Fi' : 'מחובר · מקומי') : s === 'connecting' ? 'מתחבר…' : 'לא מחובר';
    document.body.classList.toggle('linked', s === 'connected');
    if (s === 'connected') {
      $('viaTxt').textContent = via === 'wifi' ? '(Wi-Fi ישיר)' : '(אותו מכשיר)';
      show('pairDone');
      ctl.forceSync();
      link.send({ t: 'sync' });
      ctl.log('חובר למוניטור', 'act');
    } else if (answerCode === null && !scanner) show('pairIdle');
  },
});

const ctl = buildControls($('ctl'), { send: (m) => link.send(m) });

async function onOffer(code) {
  $('pairErr').textContent = '';
  try {
    answerCode = await link.acceptOffer(code);
    show('answerArea');
    drawQR($('qrAnswer'), answerCode);
    $('answerStatus').textContent = 'ממתין שהטאבלט יסרוק…';
  } catch (e) {
    $('pairErr').textContent = 'שגיאה: ' + e.message;
    show('pairIdle');
  }
}

$('scanBtn').onclick = async () => {
  $('pairErr').textContent = '';
  show('scanArea');
  scanner = new Scanner($('scanVideo'), {
    prefix: 'PT1O',
    facing: 'environment',
    onCode: (code) => { const s = scanner; scanner = null; s.stop(); onOffer(code); },
  });
  try { await scanner.start(); }
  catch (e) { scanner = null; show('pairIdle'); $('pairErr').textContent = 'אין גישה למצלמה. אשר הרשאת מצלמה ל-Safari, או השתמש בהדבקת קוד.'; }
};
$('flipBtn').onclick = () => scanner && scanner.flip().catch(() => {});
$('cancelScan').onclick = () => { if (scanner) scanner.stop(); scanner = null; show('pairIdle'); };
$('shareAnswer').onclick = async () => { if (answerCode) { await shareText(answerCode); $('shareAnswer').textContent = 'הועתק ✓'; } };
$('restartPair').onclick = () => { answerCode = null; show('pairIdle'); };
$('repair').onclick = () => { answerCode = null; show('pairIdle'); };
$('useOffer').onclick = () => onOffer($('pasteOffer').value);
