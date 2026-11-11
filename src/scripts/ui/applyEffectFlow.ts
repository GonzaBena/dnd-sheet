// src/scripts/ui/applyEffectFlow.ts
// Flujo "aplicar efecto" desde un hechizo o una dote (Spec 07, Fase E: FE-5, FE-6, FE-7).
import { characterStore } from '../state/characterStore';
import { addEffect } from '../dnd/effects';
import { durationFromText, effectFromEntry } from '../dnd/effectFactory';
import { remaining } from '../dnd/resources';
import { showChoice, showConfirm, showPrompt } from './notify';
import type { CatalogEntry } from '../models/catalog';
import type { EffectDuration } from '../models/effect';

export function toast(message: string, kind?: 'error' | 'ok') {
  window.dispatchEvent(new CustomEvent('cloud-toast', { detail: { message, kind } }));
}

/** El hechizo declara una duración instantánea: no deja efecto en el panel. */
export function isInstant(entry: CatalogEntry): boolean {
  return /instant[aá]ne|instantaneous/i.test(String(entry.meta?.duration ?? ''));
}

async function askDuration(): Promise<EffectDuration | null> {
  const choice = await showChoice('¿Cuánto dura el efecto?', [
    { value: 'concentration', label: 'Concentración' },
    { value: 'rounds', label: 'Por rondas' },
    { value: 'short', label: 'Hasta descanso corto' },
    { value: 'long', label: 'Hasta descanso largo' },
    { value: 'used', label: 'Hasta usarse' },
    { value: 'indefinite', label: 'Indefinida' },
  ]);
  switch (choice) {
    case 'rounds': {
      const raw = await showPrompt('¿Cuántas rondas?', { type: 'number', value: '10', min: 1 });
      const n = parseInt(raw ?? '', 10);
      return n > 0 ? { kind: 'rounds', remaining: n } : null;
    }
    case 'concentration':
      return { kind: 'concentration' };
    case 'short':
      return { kind: 'untilRest', rest: 'short' };
    case 'long':
      return { kind: 'untilRest', rest: 'long' };
    case 'used':
      return { kind: 'untilUsed' };
    case 'indefinite':
      return { kind: 'indefinite' };
    default:
      return null;
  }
}

/**
 * Aplica el efecto de una entrada. Devuelve `true` si se aplicó.
 * Orden: comprobar recurso → duración → confirmar reemplazo de concentración → gastar recurso → aplicar.
 * Así, cancelar en cualquier paso no gasta nada.
 */
export async function applyFromEntry(entry: CatalogEntry): Promise<boolean> {
  if (!entry.effects?.length) return false;
  const char = characterStore.get();

  // FE-7: recurso vinculado
  const resourceId = typeof entry.meta?.resourceId === 'string' ? entry.meta.resourceId : '';
  const resource = resourceId ? char.resources.find((r) => r.id === resourceId) : undefined;
  if (resource && remaining(resource) <= 0) {
    toast(`Sin usos de ${resource.name}`, 'error');
    return false;
  }

  // FE-5: duración
  const duration = durationFromText(String(entry.meta?.duration ?? '')) ?? (await askDuration());
  if (!duration) return false;

  const effect = effectFromEntry(entry, duration, Date.now());

  // FE-6: concentración
  const { replaced } = addEffect(char.activeEffects, effect);
  if (replaced) {
    const ok = await showConfirm(`Ya concentras en ${replaced.name}. ¿Reemplazarlo?`, { kind: 'question' });
    if (!ok) return false;
    characterStore.endEffect(replaced.id);
  }

  if (resource) characterStore.spendResource(resource.id, 1);
  characterStore.applyEffect(effect);
  toast(`Efecto aplicado: ${entry.name}`, 'ok');
  return true;
}
