// src/scripts/ui/customEntry.ts
// Lógica compartida del bloque "Entrada propia" de los modales de objeto y hechizo (Spec 07, Fase C).
import { sanitizeImageUrl, parseEffectsText, effectsToText } from '../dnd/catalog.ts';
import type { Modifier } from '../models/effect.ts';

export type EntryOrigin = 'new' | 'srd' | 'edit';

interface EditableEntry {
  source?: 'srd' | 'custom';
  custom?: boolean;
  imageUrl?: string;
  effects?: Modifier[];
}

export type CustomEntryResult =
  | { ok: true; patch: Record<string, unknown>; imageRejected: boolean }
  | { ok: false; error: string };

/** Conecta el bloque `CustomEntryFields.astro` con el prefijo dado. */
export function initCustomEntry(prefix: string) {
  const toggle = document.getElementById(`${prefix}-custom-toggle`) as HTMLInputElement | null;
  const fields = document.getElementById(`${prefix}-custom-fields`);
  const imageInp = document.getElementById(`${prefix}-image-input`) as HTMLInputElement | null;
  const effectsInp = document.getElementById(`${prefix}-effects-input`) as HTMLTextAreaElement | null;
  const errorEl = document.getElementById(`${prefix}-effects-error`);

  let origin: EntryOrigin = 'new';
  let editing: EditableEntry | undefined;

  const sync = () => fields?.classList.toggle('hidden', !toggle?.checked);
  toggle?.addEventListener('change', sync);

  function showError(message: string | null) {
    if (!errorEl) return;
    errorEl.textContent = message ?? '';
    errorEl.classList.toggle('hidden', !message);
  }

  return {
    /**
     * - 'new': alta manual → "Entrada propia" activada.
     * - 'srd': viene del compendio → desactivada (no muestra insignia).
     * - 'edit': refleja `entry.custom`; los objetos antiguos (sin source ni custom) no cambian de origen salvo que se active.
     */
    reset(nextOrigin: EntryOrigin, entry?: EditableEntry) {
      origin = nextOrigin;
      editing = entry;
      if (toggle) toggle.checked = nextOrigin === 'new' || (nextOrigin === 'edit' && entry?.custom === true);
      if (imageInp) imageInp.value = entry?.imageUrl ?? '';
      if (effectsInp) effectsInp.value = effectsToText(entry?.effects);
      showError(null);
      sync();
    },

    read(): CustomEntryResult {
      showError(null);
      if (toggle?.checked) {
        const effects = parseEffectsText(effectsInp?.value ?? '');
        if (!Array.isArray(effects)) {
          showError(effects.error);
          return { ok: false, error: effects.error };
        }
        const rawImage = (imageInp?.value ?? '').trim();
        const imageUrl = sanitizeImageUrl(rawImage);
        return {
          ok: true,
          imageRejected: !!rawImage && !imageUrl,
          patch: {
            source: 'custom',
            custom: true,
            imageUrl,
            effects: effects.length ? effects : undefined,
          },
        };
      }
      // Desactivada: no se tocan imagen ni efectos ya guardados.
      let patch: Record<string, unknown>;
      if (origin === 'srd') patch = { source: 'srd', custom: false };
      else if (origin === 'new') patch = { source: 'custom', custom: false };
      else if (editing?.source === undefined && editing?.custom === undefined) patch = {};
      else patch = { source: editing?.source ?? 'custom', custom: false };
      return { ok: true, patch, imageRejected: false };
    },
  };
}
