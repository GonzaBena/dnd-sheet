// src/scripts/ui/wakeLock.ts
import { getPrefs } from './alertPrefs';

let sentinel: WakeLockSentinel | null = null;

export function initKeepAwake(getStatus: () => 'active' | 'paused' | 'ended' | null): void {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

  const requestWakeLock = async () => {
    const prefs = getPrefs();
    const status = getStatus();
    
    if (prefs.keepAwake && status === 'active' && document.visibilityState === 'visible') {
      if (sentinel) return;
      try {
        sentinel = await navigator.wakeLock.request('screen');
        sentinel.onrelease = () => {
          sentinel = null;
        };
      } catch (err) {
        console.warn('WakeLock no disponible:', err);
      }
    } else {
      if (sentinel) {
        sentinel.release().catch(() => {});
        sentinel = null;
      }
    }
  };

  document.addEventListener('visibilitychange', requestWakeLock);
  window.addEventListener('alert-prefs-changed', requestWakeLock);
  window.addEventListener('session-status-changed', requestWakeLock);
  requestWakeLock();
}
