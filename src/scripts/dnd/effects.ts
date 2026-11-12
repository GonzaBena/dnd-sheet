// src/scripts/dnd/effects.ts
// Funciones puras del registro de efectos activos (Spec 07, Fase B). No mutan sus argumentos.
import type { ActiveEffect, EffectDuration, Modifier } from '../models/effect.ts';
import type { InventoryItem } from '../models/character.ts';
import { normalizeStatName } from './stats.ts';

const TARGET_PREFIX_ALIASES: Record<string, string> = {
  check: 'check',
  checks: 'check',
  prueba: 'check',
  pruebas: 'check',
  skill: 'check',
  skills: 'check',
  habilidad: 'check',
  habilidades: 'check',
  save: 'save',
  saves: 'save',
  salvacion: 'save',
  salvaciones: 'save',
  stat: 'stat',
  stats: 'stat',
  ability: 'stat',
  caracteristica: 'stat',
  caracteristicas: 'stat',
};

function normalizePrefix(raw: string): string {
  const clean = raw.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  return TARGET_PREFIX_ALIASES[clean] ?? clean;
}

export function targetsMatch(modTarget: string, target: string): boolean {
  if (modTarget === target || modTarget.startsWith(target + '.')) return true;
  const mParts = modTarget.split('.');
  const tParts = target.split('.');
  if (mParts.length === tParts.length && mParts.length === 2) {
    const p1 = normalizePrefix(mParts[0]);
    const p2 = normalizePrefix(tParts[0]);
    if (p1 === p2) {
      const s1 = normalizeStatName(mParts[1]);
      const s2 = normalizeStatName(tParts[1]);
      if (s1 && s2 && s1 === s2) return true;
      if (mParts[1].toLowerCase() === tParts[1].toLowerCase()) return true;
    }
  }
  return false;
}

export interface AddResult {
  effects: ActiveEffect[];
  replaced?: ActiveEffect;
}

/**
 * Agrega un efecto.
 * - Mismo `sourceType` + `sourceId` → reemplaza al existente (evita duplicados de un mismo hechizo).
 * - DECISION (FB-6): si el nuevo es de concentración y ya había otro, se devuelve en `replaced`
 *   pero NO se quita; la UI decide si avisa y lo termina (RF-243).
 */
export function addEffect(effects: ActiveEffect[], effect: ActiveEffect): AddResult {
  let list = effects;
  if (effect.sourceId) {
    list = list.filter((e) => !(e.sourceId === effect.sourceId && e.sourceType === effect.sourceType));
  }
  let replaced: ActiveEffect | undefined;
  if (effect.duration.kind === 'concentration') {
    replaced = list.find((e) => e.duration.kind === 'concentration' && e.id !== effect.id);
  }
  const result: AddResult = { effects: [...list, effect] };
  if (replaced) result.replaced = replaced;
  return result;
}

export function removeEffect(effects: ActiveEffect[], id: string): ActiveEffect[] {
  return effects.filter((e) => e.id !== id);
}

/** Resta `rounds` a los efectos por rondas; los que llegan a 0 o menos expiran y se quitan. */
export function tickRounds(
  effects: ActiveEffect[],
  rounds: number
): { effects: ActiveEffect[]; expired: ActiveEffect[] } {
  if (!(rounds > 0)) return { effects: effects.slice(), expired: [] };
  const kept: ActiveEffect[] = [];
  const expired: ActiveEffect[] = [];
  for (const e of effects) {
    if (e.duration.kind !== 'rounds') {
      kept.push(e);
      continue;
    }
    const remaining = e.duration.remaining - rounds;
    if (remaining <= 0) expired.push(e);
    else kept.push({ ...e, duration: { kind: 'rounds', remaining } });
  }
  return { effects: kept, expired };
}

/** FB-4: el corto quita `untilRest: short`; el largo quita `short` y `long`. */
export function expireOnRest(
  effects: ActiveEffect[],
  rest: 'short' | 'long'
): { effects: ActiveEffect[]; expired: ActiveEffect[] } {
  const kept: ActiveEffect[] = [];
  const expired: ActiveEffect[] = [];
  for (const e of effects) {
    const d = e.duration;
    const ends = d.kind === 'untilRest' && (d.rest === 'short' || rest === 'long');
    (ends ? expired : kept).push(e);
  }
  return { effects: kept, expired };
}

/** FB-5: coincidencia exacta o por prefijo con punto (`save` coincide con `save.dex`). No evalúa `when`. */
export function collectModifiers(
  char: { activeEffects?: ActiveEffect[]; inventory?: InventoryItem[]; features?: any[] },
  target: string,
): Modifier[] {
  const out: Modifier[] = [];
  const matches = (m: Modifier) => targetsMatch(m.target, target);
  for (const e of char.activeEffects ?? []) {
    for (const m of e.modifiers ?? []) if (matches(m)) out.push(m);
  }
  // FD-4/FD-8: un objeto aporta efectos solo si está equipado y, si lo exige, sintonizado.
  for (const item of char.inventory ?? []) {
    if (!itemContributes(item)) continue;
    for (const m of item.effects ?? []) if (matches(m)) out.push(m);
  }
  // Rasgos pasivos o activos de la sección Dotes y Rasgos
  for (const feat of char.features ?? []) {
    if (feat.enabled === false) continue;
    for (const m of feat.effects ?? []) if (matches(m)) out.push(m);
  }
  return out;
}

/** FD-4 (RF-264): equipado y, si requiere sintonización, también sintonizado. */
export function itemContributes(item: InventoryItem): boolean {
  return !!item.equipped && (!item.requiresAttunement || !!item.attuned);
}

export function describeDuration(d: EffectDuration): string {
  switch (d.kind) {
    case 'rounds':
      return `${d.remaining} ${d.remaining === 1 ? 'ronda' : 'rondas'}`;
    case 'untilRest':
      return d.rest === 'short' ? 'hasta descanso corto' : 'hasta descanso largo';
    case 'concentration':
      return 'concentración';
    case 'untilUsed':
      return 'hasta usarse';
    case 'indefinite':
      return 'indefinido';
  }
}

/**
 * FB-2: cuántas rondas descontar. 0 si no hay marca, si cambió la campaña o si la ronda retrocedió.
 * DECISION: una ronda que retrocede (el DM reinició el combate) no descuenta; solo se re-fija la marca.
 */
export function roundDelta(
  last: { campaignId: string; round: number } | undefined,
  current: { campaignId: string; round: number }
): number {
  if (!last || last.campaignId !== current.campaignId) return 0;
  return current.round > last.round ? current.round - last.round : 0;
}
