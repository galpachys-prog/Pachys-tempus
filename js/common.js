// Pachys Tempus — shared helpers: service worker + screen wake lock.

export function registerSW(onReady) {
  if (!('serviceWorker' in navigator)) { onReady && onReady(false, 'unsupported'); return; }
  navigator.serviceWorker.register('./sw.js').then(async (reg) => {
    await navigator.serviceWorker.ready;
    onReady && onReady(true, reg);
  }).catch((e) => onReady && onReady(false, e));
}

let lock = null;
export async function keepAwake() {
  try {
    if ('wakeLock' in navigator) {
      lock = await navigator.wakeLock.request('screen');
      if (!keepAwake._bound) {
        keepAwake._bound = true;
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') keepAwake(); });
      }
    }
  } catch (e) { /* not available — ask user to set Auto-Lock to Never */ }
  return !!lock;
}
