// src/scripts/dnd/resources.ts
// Funciones puras del registro de recursos y migraciones (Spec 07, Fase A).
import type { Resource } from '../models/resource.ts';
import { SPELL_LEVELS } from '../models/resource.ts';
import type { CharacterData } from '../models/character.ts';

export function remaining(r: Resource): number {
  return Math.max(0, r.max - r.used);
}

export function spend(r: Resource, n: number = 1): Resource {
  return { ...r, used: Math.min(r.max, Math.max(0, r.used + n)) };
}

export function recover(r: Resource, n: number = 1): Resource {
  return { ...r, used: Math.max(0, Math.min(r.max, r.used - n)) };
}

/** Reinicia los recursos según el tipo de descanso. `turn` y `manual` no se tocan. */
export function resetOn(resources: Resource[], rest: 'short' | 'long'): Resource[] {
  return resources.map((r) => {
    const applies =
      r.rechargeOn === 'shortRest' || (rest === 'long' && r.rechargeOn === 'longRest');
    if (!applies) return r;
    const next: Resource = { ...r, used: 0 };
    if (r.values) next.values = [];
    return next;
  });
}

/** "2/3" → 2 restantes de 3; "3" → solo máximo. Cualquier otro texto → null. */
export function parseUses(text: string | undefined): { remaining: number; max: number } | null {
  if (typeof text !== 'string') return null;
  const pair = text.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
  if (pair) {
    const rem = parseInt(pair[1], 10);
    const max = parseInt(pair[2], 10);
    return { remaining: Math.min(rem, max), max };
  }
  const single = text.match(/^\s*(\d+)\s*$/);
  if (single) {
    const max = parseInt(single[1], 10);
    return { remaining: max, max };
  }
  return null;
}

/**
 * Migra espacios de conjuro `level1`/`level2` a `slots[1..9]`.
 * DECISION: sin alias de `level1`/`level2`; los consumidores leen `slots[n]` directamente
 * para no tener dos fuentes de verdad (los consumidores son pocos).
 */
export function migrateSlots(char: CharacterData): boolean {
  if (!char.spellcasting) return false;
  let changed = false;
  const slots = (char.spellcasting.slots ?? {}) as Record<string | number, any>;
  if (!char.spellcasting.slots) changed = true;

  for (const legacy of ['level1', 'level2'] as const) {
    if (legacy in slots) {
      const n = legacy === 'level1' ? 1 : 2;
      if (!slots[n]) slots[n] = slots[legacy];
      delete slots[legacy];
      changed = true;
    }
  }
  for (const n of SPELL_LEVELS) {
    const s = slots[n];
    if (!s || typeof s.total !== 'number' || typeof s.used !== 'number') {
      slots[n] = { total: Number(s?.total) || 0, used: Number(s?.used) || 0 };
      changed = true;
    }
  }
  char.spellcasting.slots = slots as CharacterData['spellcasting']['slots'];
  return changed;
}

function mentionsShortRest(...texts: (string | undefined)[]): boolean {
  return texts.some((t) => typeof t === 'string' && /descanso corto|short rest/i.test(t));
}

/** Crea los recursos derivados de `wildShape` y de `features[].uses` parseable. Idempotente por id. */
export function migrateResources(char: CharacterData): boolean {
  let changed = false;
  if (!Array.isArray(char.resources)) {
    char.resources = [];
    changed = true;
  }
  const has = (id: string) => char.resources.some((r) => r.id === id);

  if (char.wildShape && !has('wildShape')) {
    const { usesTotal, usesRemaining } = char.wildShape;
    char.resources.push({
      id: 'wildShape',
      name: 'Forma Salvaje',
      max: usesTotal,
      used: Math.max(0, usesTotal - usesRemaining),
      rechargeOn: 'shortRest',
      source: 'wildShape',
    });
    changed = true;
  }

  for (const f of char.features ?? []) {
    if (!f.id) continue; // sin id estable no se puede migrar de forma idempotente
    const id = `feature:${f.id}`;
    if (has(id)) continue;
    const parsed = parseUses(f.uses);
    if (!parsed) continue;
    char.resources.push({
      id,
      name: f.title,
      max: parsed.max,
      used: parsed.max - parsed.remaining,
      rechargeOn: mentionsShortRest(f.uses, f.description) ? 'shortRest' : 'longRest',
      source: id,
    });
    changed = true;
  }
  return changed;
}
