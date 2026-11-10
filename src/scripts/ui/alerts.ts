// src/scripts/ui/alerts.ts
// Servicio centralizado de avisos (M3): banner animado, vibración, sonido y parpadeo del título.

import anime from 'animejs';
import { getPrefs, setPrefs, type TurnAlertPrefs } from './alertPrefs.ts';

export { getPrefs, setPrefs, type TurnAlertPrefs };

export type AlertTone = 'turn' | 'next' | 'whisper';

export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

let audioCtx: AudioContext | null = null;
let sharedMediaAudio: HTMLAudioElement | null = null;
let mediaAudioUnlocked = false;
const wavCache = new Map<AlertTone | 'silent', string>();

// DECISION: FB-4 — Para que el sonido suene en celulares incluso cuando el teléfono está en modo
// Vibrar/Silencio de llamadas (interruptor lateral en iPhone o modo vibración en Android),
// combinamos tres mecanismos sin archivos externos:
// 1) navigator.audioSession.type = 'playback' (iOS 16.4+) para usar el canal Multimedia en vez de Ringer.
// 2) HTMLAudioElement con un WAV PCM sintetizado en memoria (siempre usa el canal Multimedia/Playback).
// 3) AudioContext (Web Audio API) como respaldo.
// Además, el desbloqueo se escucha en touchend/click/keydown hasta que realmente quede activo
// (pointerdown con { once: true } fallaba en móviles porque el navegador lo considera inicio de scroll).

function configurePlaybackSession(): void {
  if (typeof navigator === 'undefined') return;
  try {
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession && nav.audioSession.type !== 'playback') {
      nav.audioSession.type = 'playback';
    }
  } catch {
    // Ignorar si el navegador no soporta audioSession
  }
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  configurePlaybackSession();
  const AudioContextClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Sintetiza un archivo WAV PCM de 16 bits en memoria (data:audio/wav;base64,...)
 * para reproducirlo por el canal Multimedia (<audio>) sin depender de archivos externos.
 */
function buildWavDataUri(kind: AlertTone | 'silent'): string {
  const cached = wavCache.get(kind);
  if (cached) return cached;

  const sampleRate = 22050;
  const durationSec =
    kind === 'silent' ? 0.02 : kind === 'turn' ? 0.38 : kind === 'whisper' ? 0.34 : 0.22;
  const numSamples = Math.max(1, Math.floor(sampleRate * durationSec));
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true);  // PCM format
  view.setUint16(22, 1, true);  // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  let phase = 0;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    if (kind === 'turn') {
      // Acorde corto de dos notas ascendentes: 660 Hz -> 880 Hz
      const isSecondNote = t >= 0.15;
      const noteTime = isSecondNote ? t - 0.15 : t;
      const noteDur = isSecondNote ? 0.23 : 0.15;
      const freq = isSecondNote ? 880 : 660;
      const env = Math.sin(Math.min(1, noteTime / 0.015) * (Math.PI / 2)) * Math.exp(-noteTime * (4.5 / noteDur));
      phase += (2 * Math.PI * freq) / sampleRate;
      sample = (Math.sin(phase) * 0.75 + Math.sin(phase * 2) * 0.25) * env * 0.65;
    } else if (kind === 'next') {
      // Nota suave única: 528 Hz
      const freq = 528;
      const env = Math.sin(Math.min(1, t / 0.015) * (Math.PI / 2)) * Math.exp(-t * 10);
      phase += (2 * Math.PI * freq) / sampleRate;
      sample = Math.sin(phase) * env * 0.45;
    } else if (kind === 'whisper') {
      // Dos notas descendentes: 520 Hz -> 390 Hz
      const isSecondNote = t >= 0.14;
      const noteTime = isSecondNote ? t - 0.14 : t;
      const freq = isSecondNote ? 390 : 520;
      const env = Math.sin(Math.min(1, noteTime / 0.015) * (Math.PI / 2)) * Math.exp(-noteTime * 8);
      phase += (2 * Math.PI * freq) / sampleRate;
      sample = (Math.sin(phase) * 0.8 + Math.sin(phase * 1.5) * 0.2) * env * 0.55;
    }

    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const uri = `data:audio/wav;base64,${btoa(binary)}`;
  wavCache.set(kind, uri);
  return uri;
}

function getSharedMediaAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
  if (!sharedMediaAudio) {
    sharedMediaAudio = new Audio();
    sharedMediaAudio.preload = 'auto';
  }
  return sharedMediaAudio;
}

if (typeof window !== 'undefined') {
  const unlockEvents = ['touchend', 'click', 'keydown'] as const;

  const unlockAudio = () => {
    configurePlaybackSession();
    const ctx = getAudioContext();

    const audioEl = getSharedMediaAudio();
    if (audioEl && !mediaAudioUnlocked) {
      try {
        audioEl.src = buildWavDataUri('silent');
        audioEl.volume = 0.01;
        const p = audioEl.play();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            mediaAudioUnlocked = true;
            audioEl.pause();
            audioEl.currentTime = 0;
            audioEl.volume = 1;
          }).catch(() => {});
        }
      } catch {
        // Ignorar si el navegador aún bloquea play()
      }
    }

    if (ctx && ctx.state === 'running' && mediaAudioUnlocked) {
      for (const ev of unlockEvents) {
        window.removeEventListener(ev, unlockAudio, true);
      }
    }
  };

  for (const ev of unlockEvents) {
    window.addEventListener(ev, unlockAudio, { capture: true, passive: true });
  }
}

// Fallback háptico para iOS 17.4+ / iOS 18 Safari (<input type="checkbox" switch>)
let iosHapticLabel: HTMLLabelElement | null = null;
function triggerIosSwitchHaptic(): void {
  if (typeof document === 'undefined') return;
  try {
    if (!iosHapticLabel) {
      iosHapticLabel = document.createElement('label');
      iosHapticLabel.setAttribute('aria-hidden', 'true');
      iosHapticLabel.style.cssText =
        'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      iosHapticLabel.appendChild(input);
      document.body.appendChild(iosHapticLabel);
    }
    iosHapticLabel.click();
  } catch {
    // Ignorar en navegadores sin soporte
  }
}

export function buzz(kind: AlertTone): void {
  const prefs = getPrefs();
  if (!prefs.enabled || !prefs.vibrate) return;

  // DECISION: FB-5 — Patrones de vibración diferenciados por tipo de aviso.
  const pattern: number | number[] =
    kind === 'turn' ? [120, 60, 240] : kind === 'next' ? [60] : [100, 50, 100];

  if (canVibrate()) {
    try {
      const ok = navigator.vibrate(pattern);
      if (!ok && Array.isArray(pattern)) {
        navigator.vibrate(200);
      }
      return;
    } catch {
      // Continúa al fallback
    }
  }

  // En iOS Safari navigator.vibrate no existe; intentamos el pulso háptico nativo de switch (iOS 17.4+)
  triggerIosSwitchHaptic();
}

export function chime(kind: AlertTone): void {
  const prefs = getPrefs();
  if (!prefs.enabled || !prefs.sound) return;

  configurePlaybackSession();

  // 1. Intentar reproducir por HTMLAudioElement (canal Multimedia, suena aunque el celular esté en modo Silencio/Vibrar)
  const audioEl = getSharedMediaAudio();
  if (audioEl) {
    try {
      audioEl.pause();
      audioEl.src = buildWavDataUri(kind);
      audioEl.volume = 1;
      audioEl.currentTime = 0;
      const playPromise = audioEl.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => {
            mediaAudioUnlocked = true;
          })
          .catch(() => {
            // Si falló <audio>, caer al oscilador Web Audio
            playWebAudioChime(kind);
          });
        return;
      }
    } catch {
      // Caer al oscilador Web Audio
    }
  }

  // 2. Respaldo con Web Audio API
  playWebAudioChime(kind);
}

function playWebAudioChime(kind: AlertTone): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx
        .resume()
        .then(() => scheduleOscillators(ctx, kind))
        .catch(() => {});
    } else {
      scheduleOscillators(ctx, kind);
    }
  } catch {
    // Ignorar errores de audio
  }
}

function scheduleOscillators(ctx: AudioContext, kind: AlertTone): void {
  const now = ctx.currentTime;

  const playNote = (freq: number, startOffset: number, duration: number, peakGain: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now + startOffset);
    gain.gain.setValueAtTime(0.001, now + startOffset);
    gain.gain.linearRampToValueAtTime(peakGain, now + startOffset + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + startOffset + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + startOffset);
    osc.stop(now + startOffset + duration);
  };

  if (kind === 'turn') {
    playNote(660, 0, 0.15, 0.45);
    playNote(880, 0.15, 0.22, 0.5);
  } else if (kind === 'next') {
    playNote(528, 0, 0.18, 0.3);
  } else if (kind === 'whisper') {
    playNote(520, 0, 0.14, 0.35);
    playNote(390, 0.14, 0.2, 0.4);
  }
}

let flashInterval: ReturnType<typeof setInterval> | null = null;
let originalTitle = '';

export function flashTitle(text: string): void {
  if (typeof document === 'undefined') return;
  if (flashInterval) {
    clearInterval(flashInterval);
    flashInterval = null;
  } else {
    originalTitle = document.title;
  }

  let toggle = true;
  document.title = text;

  flashInterval = setInterval(() => {
    document.title = toggle ? originalTitle : text;
    toggle = !toggle;
  }, 1000);

  const stopFlash = () => {
    if (document.visibilityState === 'hidden' && !document.hasFocus()) return;
    if (flashInterval) {
      clearInterval(flashInterval);
      flashInterval = null;
      document.title = originalTitle;
    }
    window.removeEventListener('focus', stopFlash);
    document.removeEventListener('visibilitychange', stopFlash);
  };

  window.addEventListener('focus', stopFlash);
  document.addEventListener('visibilitychange', stopFlash);
}

let bannerContainer: HTMLElement | null = null;
let bannerTimeout: ReturnType<typeof setTimeout> | null = null;

export function showBanner(opts: {
  title: string;
  subtitle?: string;
  icon?: string;
  tone: AlertTone;
  timeoutMs?: number;
  actions?: { label: string; onClick: () => void }[];
}): () => void {
  const prefs = getPrefs();
  if (!prefs.enabled || typeof document === 'undefined') return () => {};

  if (!bannerContainer) {
    bannerContainer = document.createElement('div');
    bannerContainer.id = 'alert-banner-container';
    bannerContainer.className = 'fixed top-3 inset-x-3 z-[95] max-w-md mx-auto pointer-events-none';
    document.body.appendChild(bannerContainer);
  }

  if (bannerTimeout) {
    clearTimeout(bannerTimeout);
    bannerTimeout = null;
  }

  const toneStyles: Record<AlertTone, string> = {
    turn: 'bg-[#1c160b]/95 border-amber-500/70 text-amber-100 shadow-[0_8px_30px_rgba(245,158,11,0.35)]',
    next: 'bg-[#121721]/95 border-slate-600/80 text-slate-100 shadow-[0_8px_25px_rgba(0,0,0,0.6)]',
    whisper: 'bg-[#1b1226]/95 border-purple-500/70 text-purple-100 shadow-[0_8px_30px_rgba(168,85,247,0.35)]',
  };

  const defaultIcons: Record<AlertTone, string> = {
    turn: '⚔️',
    next: '⏳',
    whisper: '🤫',
  };

  const el = document.createElement('div');
  el.className = `pointer-events-auto border rounded-xl p-3.5 backdrop-blur-md flex items-center justify-between gap-3 cursor-pointer select-none ${toneStyles[opts.tone]}`;

  el.innerHTML = `
    <div class="flex items-center gap-3 min-w-0">
      <span class="text-xl shrink-0">${opts.icon || defaultIcons[opts.tone]}</span>
      <div class="min-w-0">
        <h4 class="font-headline font-bold text-sm leading-tight truncate">${opts.title}</h4>
        ${opts.subtitle ? `<p class="text-xs opacity-80 truncate mt-0.5">${opts.subtitle}</p>` : ''}
      </div>
    </div>
    <div class="flex items-center gap-2 shrink-0" data-banner-actions></div>
  `;

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (bannerTimeout) {
      clearTimeout(bannerTimeout);
      bannerTimeout = null;
    }
    if (el.parentElement) {
      anime({
        targets: el,
        translateY: [0, -16],
        opacity: [1, 0],
        duration: 220,
        easing: 'easeInQuad',
        complete: () => el.remove(),
      });
    }
  };

  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-banner-actions]')) return;
    close();
  });

  const actionsEl = el.querySelector('[data-banner-actions]');
  if (actionsEl && opts.actions) {
    opts.actions.forEach((act) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'px-2.5 py-1 text-xs font-bold rounded-lg bg-white/15 hover:bg-white/25 transition-colors cursor-pointer';
      btn.textContent = act.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        act.onClick();
        close();
      });
      actionsEl.appendChild(btn);
    });
  }

  bannerContainer.innerHTML = '';
  bannerContainer.appendChild(el);

  anime({
    targets: el,
    translateY: [-20, 0],
    opacity: [0, 1],
    duration: 350,
    easing: 'easeOutCubic',
  });

  const timeoutMs = opts.timeoutMs !== undefined ? opts.timeoutMs : 6000;
  if (timeoutMs > 0) {
    bannerTimeout = setTimeout(close, timeoutMs);
  }

  return close;
}
