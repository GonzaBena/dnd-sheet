// src/scripts/dnd/stats.ts
// Lógica pura de cálculo y desglose de puntuaciones de característica (FUE, DES, CON, INT, SAB, CAR).
import type { CharacterData, InventoryItem } from '../models/character.ts';
import type { Modifier, ActiveEffect } from '../models/effect.ts';
import { itemContributes } from './effects.ts';

export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export const ABILITY_KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export const ABILITY_LABELS: Record<AbilityKey, { name: string; abbr: string; icon: string }> = {
  str: { name: 'Fuerza', abbr: 'FUE', icon: 'fitness_center' },
  dex: { name: 'Destreza', abbr: 'DES', icon: 'sprint' },
  con: { name: 'Constitución', abbr: 'CON', icon: 'favorite' },
  int: { name: 'Inteligencia', abbr: 'INT', icon: 'menu_book' },
  wis: { name: 'Sabiduría', abbr: 'SAB', icon: 'psychology' },
  cha: { name: 'Carisma', abbr: 'CAR', icon: 'campaign' },
};

const STAT_ALIASES: Record<AbilityKey, string[]> = {
  str: ['str', 'fue', 'fuerza', 'strength'],
  dex: ['dex', 'des', 'destreza', 'dexterity'],
  con: ['con', 'constitucion', 'constitución', 'constitution'],
  int: ['int', 'inteligencia', 'intelligence'],
  wis: ['wis', 'sab', 'sabiduria', 'sabiduría', 'wisdom'],
  cha: ['cha', 'car', 'carisma', 'charisma'],
};

/** Normaliza un nombre o abreviatura de característica a su clave canónica (ej: 'sab' -> 'wis'). */
export function normalizeStatName(raw: string | undefined): AbilityKey | null {
  if (!raw) return null;
  const s = clean(
    raw
      .replace(/^[+@]/, '')
      .replace(/^mod[._\s]+/i, '')
      .replace(/[._\s]+mod$/i, '')
  );
  for (const k of ABILITY_KEYS) {
    if (STAT_ALIASES[k].includes(s)) return k;
  }
  return null;
}

/** Resuelve el valor numérico de un modificador (número fijo o modificador de un stat referenciado). */
export function resolveModifierValue(
  char: { stats?: Partial<Record<AbilityKey, { modifier: number }>> },
  mod: Modifier,
): number {
  if (typeof mod.value === 'number' && Number.isFinite(mod.value)) {
    return mod.value;
  }
  if (typeof mod.value === 'string') {
    const rawVal = mod.value.trim().replace(/^\+\s*/, '');
    const num = Number(rawVal);
    if (Number.isFinite(num)) {
      return num;
    }
    const statKey = normalizeStatName(mod.value);
    if (statKey && char.stats?.[statKey]) {
      const m = char.stats[statKey].modifier;
      // Regla de 5e para Glamour Sobrenatural y similares: mínimo de +1
      return Math.max(1, m);
    }
  }
  return 0;
}

/** Normaliza un texto para comparaciones de alias. */
const clean = (s: string) =>
  s.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

/** Comprueba si el objetivo del modificador apunta a la característica dada. */
export function matchesStatTarget(target: string, statKey: AbilityKey): boolean {
  const parts = clean(target).split('.');
  const aliases = STAT_ALIASES[statKey];

  // Caso directo: 'wis', 'sab', 'str'
  if (parts.length === 1) {
    return aliases.includes(parts[0]);
  }
  // Caso compuesto: 'stat.wis', 'stats.sab', 'ability.con'
  if (parts.length === 2 && ['stat', 'stats', 'ability', 'caracteristica'].includes(parts[0])) {
    return aliases.includes(parts[1]);
  }
  return false;
}

export interface StatPart {
  label: string;
  value: number;
}

export interface StatSource {
  label: string;
  m: Modifier;
  type: 'effect' | 'item';
  item?: InventoryItem;
  effect?: ActiveEffect;
}

export interface StatCalculationResult {
  statKey: AbilityKey;
  name: string;
  abbr: string;
  icon: string;
  base: number;
  total: number;
  modifier: number;
  parts: StatPart[];
  hasModifiers: boolean;
  sources: StatSource[];
}

/** Recopila los modificadores de la característica desde efectos activos y objetos equipados/sintonizados. */
export function collectStatSources(
  char: Pick<CharacterData, 'activeEffects' | 'inventory'>,
  statKey: AbilityKey,
): StatSource[] {
  const sources: StatSource[] = [];

  for (const e of char.activeEffects ?? []) {
    for (const m of e.modifiers ?? []) {
      if (matchesStatTarget(m.target, statKey)) {
        sources.push({ label: e.name, m, type: 'effect', effect: e });
      }
    }
  }

  for (const item of char.inventory ?? []) {
    if (!itemContributes(item)) continue;
    for (const m of item.effects ?? []) {
      if (matchesStatTarget(m.target, statKey)) {
        sources.push({ label: item.name, m, type: 'item', item });
      }
    }
  }

  for (const feat of (char as any).features ?? []) {
    if (feat.enabled === false) continue;
    for (const m of feat.effects ?? []) {
      if (matchesStatTarget(m.target, statKey)) {
        sources.push({ label: feat.title || 'Rasgo', m, type: 'effect' });
      }
    }
  }

  return sources;
}

/** Calcula el modificador de D&D 5e: Math.floor((score - 10) / 2) */
export function calculateModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Calcula el valor dinámico de una característica considerando:
 * 1. Puntuación base (`baseScore` o `score` actual).
 * 2. Modificadores `set` (en 5e, e.g. Diadema de Intelecto fija en 19, o sustitución de característica ej: car set sab).
 * 3. Modificadores `add` (sumas acumulativas numéricas o de modificadores de otras características).
 */
export function computeStat(
  char: {
    stats?: Partial<Record<AbilityKey, { score: number; baseScore?: number }>>;
    activeEffects?: ActiveEffect[];
    inventory?: InventoryItem[];
    features?: any[];
  },
  statKey: AbilityKey,
): StatCalculationResult {
  const meta = ABILITY_LABELS[statKey];
  const statObj = char.stats?.[statKey];
  const base = typeof statObj?.baseScore === 'number' && Number.isFinite(statObj.baseScore)
    ? statObj.baseScore
    : (statObj?.score ?? 10);

  const sources = collectStatSources(char as any, statKey);
  const parts: StatPart[] = [{ label: 'Base', value: base }];

  // Regla 5e para `set`:
  // Puede ser un número o una referencia a otra estadística (ej. car set sab -> toma la sabiduría)
  const sets = sources.filter((s) => s.m.op === 'set');
  let currentBase = base;
  if (sets.length > 0) {
    let topSetValue = -Infinity;
    let topLabel = '';
    for (const s of sets) {
      let val = Number(s.m.value);
      if (!Number.isFinite(val) && typeof s.m.value === 'string') {
        const refKey = normalizeStatName(s.m.value);
        if (refKey && refKey !== statKey && char.stats?.[refKey]) {
          const targetStat = char.stats[refKey];
          val = targetStat?.baseScore ?? targetStat?.score ?? 10;
        }
      }
      if (Number.isFinite(val) && val > topSetValue) {
        topSetValue = val;
        topLabel = s.label;
      }
    }
    if (topSetValue > currentBase) {
      parts[0] = { label: `${topLabel} (Fijado en ${topSetValue})`, value: topSetValue };
      currentBase = topSetValue;
    }
  }

  // Modificadores `add` (sumas directas numéricas o modificadores de otra característica, ej: car add sab)
  let addSum = 0;
  for (const s of sources) {
    if (s.m.op === 'add') {
      let v = Number(s.m.value);
      if (!Number.isFinite(v) && typeof s.m.value === 'string') {
        const refKey = normalizeStatName(s.m.value);
        if (refKey && refKey !== statKey && char.stats?.[refKey]) {
          const targetStat = char.stats[refKey];
          const score = targetStat?.baseScore ?? targetStat?.score ?? 10;
          v = Math.max(1, calculateModifier(score));
        }
      }
      if (Number.isFinite(v) && v !== 0) {
        addSum += v;
        const sign = v >= 0 ? `+${v}` : `${v}`;
        parts.push({ label: `${s.label} (${sign})`, value: v });
      }
    }
  }

  const total = currentBase + addSum;
  const modifier = calculateModifier(total);
  const hasModifiers = total !== base;

  return {
    statKey,
    name: meta.name,
    abbr: meta.abbr,
    icon: meta.icon,
    base,
    total,
    modifier,
    parts,
    hasModifiers,
    sources,
  };
}

/** Calcula todas las 6 características a la vez. */
export function computeAllStats(
  char: Parameters<typeof computeStat>[0],
): Record<AbilityKey, StatCalculationResult> {
  const result = {} as Record<AbilityKey, StatCalculationResult>;
  for (const k of ABILITY_KEYS) {
    result[k] = computeStat(char, k);
  }
  return result;
}
