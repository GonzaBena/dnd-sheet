// src/scripts/ui/alertPrefs.ts
// Preferencias locales de avisos de turno y susurros (M2: localStorage con try/catch).

export interface TurnAlertPrefs {
  enabled: boolean;
  vibrate: boolean;
  sound: boolean;
  nextUp: boolean;
  keepAwake: boolean;
}

export const DEFAULT_PREFS: TurnAlertPrefs = {
  enabled: true,
  vibrate: true,
  sound: true,
  nextUp: true,
  keepAwake: false,
};

const STORAGE_KEY = 'turnAlerts.v1';

/**
 * Parsea las preferencias desde un string JSON crudo.
 * Si el JSON es inválido o faltan campos, completa con DEFAULT_PREFS e ignora claves desconocidas.
 */
export function parsePrefs(raw: string | null): TurnAlertPrefs {
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_PREFS };
    }
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_PREFS.enabled,
      vibrate: typeof parsed.vibrate === 'boolean' ? parsed.vibrate : DEFAULT_PREFS.vibrate,
      sound: typeof parsed.sound === 'boolean' ? parsed.sound : DEFAULT_PREFS.sound,
      nextUp: typeof parsed.nextUp === 'boolean' ? parsed.nextUp : DEFAULT_PREFS.nextUp,
      keepAwake: typeof parsed.keepAwake === 'boolean' ? parsed.keepAwake : DEFAULT_PREFS.keepAwake,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function getPrefs(): TurnAlertPrefs {
  try {
    if (typeof localStorage === 'undefined') return { ...DEFAULT_PREFS };
    return parsePrefs(localStorage.getItem(STORAGE_KEY));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function setPrefs(patch: Partial<TurnAlertPrefs>): void {
  const current = getPrefs();
  const next = parsePrefs(JSON.stringify({ ...current, ...patch }));
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // M2: ignorar fallos de cuota o modo privado
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('alert-prefs-changed', { detail: next }));
  }
}
