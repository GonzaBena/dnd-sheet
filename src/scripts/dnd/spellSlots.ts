// src/scripts/dnd/spellSlots.ts
// Tablas oficiales del SRD D&D 5e (2014 / 2024) para espacios de conjuro por clase y nivel. Lógica pura.
import { matchClass } from './classes.ts';
import type { AbilityKey } from './stats.ts';

export type CasterType = 'full' | 'half' | 'pact' | 'third' | 'none';

const FULL_CASTER_SLOTS: Record<number, Record<number, number>> = {
  1: { 1: 2 },
  2: { 1: 3 },
  3: { 1: 4, 2: 2 },
  4: { 1: 4, 2: 3 },
  5: { 1: 4, 2: 3, 3: 2 },
  6: { 1: 4, 2: 3, 3: 3 },
  7: { 1: 4, 2: 3, 3: 3, 4: 1 },
  8: { 1: 4, 2: 3, 3: 3, 4: 2 },
  9: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
  10: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
  11: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
  12: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
  13: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
  14: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
  15: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
  16: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
  17: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1 },
  18: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1 },
  19: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1, 8: 1, 9: 1 },
  20: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 },
};

const HALF_CASTER_SLOTS_2024: Record<number, Record<number, number>> = {
  1: { 1: 2 },
  2: { 1: 2 },
  3: { 1: 3 },
  4: { 1: 3 },
  5: { 1: 4, 2: 2 },
  6: { 1: 4, 2: 2 },
  7: { 1: 4, 2: 3 },
  8: { 1: 4, 2: 3 },
  9: { 1: 4, 2: 3, 3: 2 },
  10: { 1: 4, 2: 3, 3: 2 },
  11: { 1: 4, 2: 3, 3: 3 },
  12: { 1: 4, 2: 3, 3: 3 },
  13: { 1: 4, 2: 3, 3: 3, 4: 1 },
  14: { 1: 4, 2: 3, 3: 3, 4: 1 },
  15: { 1: 4, 2: 3, 3: 3, 4: 2 },
  16: { 1: 4, 2: 3, 3: 3, 4: 2 },
  17: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
  18: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
  19: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
  20: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
};

const HALF_CASTER_SLOTS_2014: Record<number, Record<number, number>> = {
  ...HALF_CASTER_SLOTS_2024,
  1: {},
};

const WARLOCK_PACT_SLOTS: Record<number, Record<number, number>> = {
  1: { 1: 1 },
  2: { 1: 2 },
  3: { 2: 2 },
  4: { 2: 2 },
  5: { 3: 2 },
  6: { 3: 2 },
  7: { 4: 2 },
  8: { 4: 2 },
  9: { 5: 2 },
  10: { 5: 2 },
  11: { 5: 3 },
  12: { 5: 3 },
  13: { 5: 3 },
  14: { 5: 3 },
  15: { 5: 3 },
  16: { 5: 3 },
  17: { 5: 4 },
  18: { 5: 4 },
  19: { 5: 4 },
  20: { 5: 4 },
};

const THIRD_CASTER_SLOTS: Record<number, Record<number, number>> = {
  1: {},
  2: {},
  3: { 1: 2 },
  4: { 1: 3 },
  5: { 1: 3 },
  6: { 1: 3 },
  7: { 1: 4, 2: 2 },
  8: { 1: 4, 2: 2 },
  9: { 1: 4, 2: 2 },
  10: { 1: 4, 2: 3 },
  11: { 1: 4, 2: 3 },
  12: { 1: 4, 2: 3 },
  13: { 1: 4, 2: 3, 3: 2 },
  14: { 1: 4, 2: 3, 3: 2 },
  15: { 1: 4, 2: 3, 3: 2 },
  16: { 1: 4, 2: 3, 3: 3 },
  17: { 1: 4, 2: 3, 3: 3 },
  18: { 1: 4, 2: 3, 3: 3 },
  19: { 1: 4, 2: 3, 3: 3, 4: 1 },
  20: { 1: 4, 2: 3, 3: 3, 4: 1 },
};

/** Determina el tipo de lanzador según la clase y subclase. */
export function getCasterType(className: string | undefined, subclass?: string): CasterType {
  const canon = matchClass(className);
  if (!canon) {
    if (subclass && /caballero\s+arcano|eldritch\s+knight|burlador\s+arcano|arcane\s+trickster/i.test(subclass)) {
      return 'third';
    }
    return 'none';
  }

  switch (canon) {
    case 'Bardo':
    case 'Clérigo':
    case 'Druida':
    case 'Hechicero':
    case 'Mago':
      return 'full';
    case 'Paladín':
    case 'Explorador':
      return 'half';
    case 'Brujo':
      return 'pact';
    case 'Guerrero':
    case 'Pícaro':
      if (subclass && /caballero\s+arcano|eldritch\s+knight|burlador\s+arcano|arcane\s+trickster/i.test(subclass)) {
        return 'third';
      }
      return 'none';
    default:
      return 'none';
  }
}

/** Devuelve la característica canónica de lanzamiento de conjuros para la clase. */
export function getSpellcastingAbilityForClass(className: string | undefined): AbilityKey | null {
  const canon = matchClass(className);
  if (!canon) return null;
  switch (canon) {
    case 'Mago':
      return 'int';
    case 'Clérigo':
    case 'Druida':
    case 'Explorador':
      return 'wis';
    case 'Bardo':
    case 'Hechicero':
    case 'Brujo':
    case 'Paladín':
      return 'cha';
    default:
      return null;
  }
}

/**
 * Devuelve la tabla de slots de conjuro para la clase, nivel y edición dada.
 * Devuelve null si la clase no es un lanzador reconocido.
 */
export function getSpellSlotsForClass(
  className: string | undefined,
  level: number,
  rulesEdition: '2024' | '2014' = '2024',
  subclass?: string,
): Record<number, number> | null {
  const type = getCasterType(className, subclass);
  const lvl = Math.max(1, Math.min(20, Math.floor(level || 1)));

  let table: Record<number, Record<number, number>> | null = null;
  if (type === 'full') table = FULL_CASTER_SLOTS;
  else if (type === 'half') table = rulesEdition === '2014' ? HALF_CASTER_SLOTS_2014 : HALF_CASTER_SLOTS_2024;
  else if (type === 'pact') table = WARLOCK_PACT_SLOTS;
  else if (type === 'third') table = THIRD_CASTER_SLOTS;

  if (!table) return null;
  return table[lvl] ?? {};
}
