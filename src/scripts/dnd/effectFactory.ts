// src/scripts/dnd/effectFactory.ts
// Funciones puras para armar y mostrar efectos activos (Spec 07, Fase E).
import type { ActiveEffect, EffectDuration, Modifier } from '../models/effect.ts';
import type { CatalogEntry } from '../models/catalog.ts';

const ROUNDS_PER_MINUTE = 10;

/**
 * Duración declarada en el texto de un hechizo (español e inglés del SRD).
 * `null` = no genera efecto (instantáneo) o no se reconoce (la UI pregunta).
 */
export function durationFromText(text: string | undefined): EffectDuration | null {
  const t = (text ?? '').trim().toLowerCase();
  if (!t) return null;
  if (/instant[aá]ne/.test(t) || /instantaneous/.test(t)) return null;
  if (/concentra/.test(t)) return { kind: 'concentration' };
  if (/hasta (disipar|que se disipe)|until dispelled/.test(t)) return { kind: 'indefinite' };
  const n = (re: RegExp): number | null => {
    const m = t.match(re);
    return m ? parseInt(m[1], 10) : null;
  };
  const rounds = n(/(\d+)\s*(?:rondas?|rounds?)/);
  if (rounds !== null && rounds > 0) return { kind: 'rounds', remaining: rounds };
  const minutes = n(/(\d+)\s*(?:minutos?|minutes?|min\b)/);
  if (minutes !== null && minutes > 0) return { kind: 'rounds', remaining: minutes * ROUNDS_PER_MINUTE };
  if (n(/(\d+)\s*(?:horas?|hours?|h\b)/) !== null || n(/(\d+)\s*(?:d[ií]as?|days?)/) !== null) {
    return { kind: 'untilRest', rest: 'long' };
  }
  return null;
}

/** Arma un ActiveEffect desde una entrada de catálogo y una duración. */
export function effectFromEntry(entry: CatalogEntry, duration: EffectDuration, now: number): ActiveEffect {
  const effect: ActiveEffect = {
    id: globalThis.crypto.randomUUID(),
    name: entry.name,
    sourceType: entry.kind === 'spell' ? 'spell' : entry.kind === 'feat' ? 'feat' : 'item',
    sourceId: entry.id,
    duration,
    modifiers: (entry.effects ?? []).map((m) => ({ ...m })),
    appliedAt: now,
  };
  const resourceId = entry.meta?.resourceId;
  if (typeof resourceId === 'string' && resourceId) effect.resourceId = resourceId;
  return effect;
}

/** FE-3: concentración primero, luego rondas restantes ascendente, luego el resto (orden estable). */
export function sortForPanel(effects: ActiveEffect[]): ActiveEffect[] {
  const rank = (e: ActiveEffect): number => (e.duration.kind === 'concentration' ? 0 : e.duration.kind === 'rounds' ? 1 : 2);
  return effects
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const ra = rank(a.e);
      const rb = rank(b.e);
      if (ra !== rb) return ra - rb;
      if (ra === 1) {
        const da = (a.e.duration as { remaining: number }).remaining;
        const db = (b.e.duration as { remaining: number }).remaining;
        if (da !== db) return da - db;
      }
      return a.i - b.i;
    })
    .map((x) => x.e);
}

const TARGET_LABEL: Record<string, string> = {
  ac: 'CA',
  attack: 'ataque',
  damage: 'daño',
  speed: 'velocidad',
  initiative: 'iniciativa',
  hp: 'PG',
};

const ABILITY: Record<string, string> = { str: 'FUE', dex: 'DES', con: 'CON', int: 'INT', wis: 'SAB', cha: 'CAR' };

/** Nombre legible del objetivo: `save.dex` → "salvaciones de DES". */
function targetLabel(target: string): string {
  const [head, rest] = target.split('.');
  if (rest === undefined) return TARGET_LABEL[head] ?? head;
  if (head === 'save') return `salvaciones de ${ABILITY[rest] ?? rest.toUpperCase()}`;
  if (head === 'skill') return `pruebas de ${rest}`;
  if (head === 'check') return `pruebas de ${ABILITY[rest] ?? rest.toUpperCase()}`;
  return target;
}

/** Texto legible de un modificador: "CA +2", "ventaja en salvaciones de DES". */
export function modifierText(m: Modifier): string {
  const label = targetLabel(m.target);
  let text: string;
  switch (m.op) {
    case 'add': {
      const v = Number(m.value ?? 0);
      text = `${label} ${v >= 0 ? '+' : '-'}${Math.abs(v)}`;
      break;
    }
    case 'set':
      text = `${label} = ${m.value ?? ''}`;
      break;
    case 'advantage':
      text = `ventaja en ${label}`;
      break;
    case 'disadvantage':
      text = `desventaja en ${label}`;
      break;
    case 'resistance':
      text = `resistencia a ${m.value ?? label}`;
      break;
    default:
      text = label;
  }
  return m.when ? `${text} (${m.when})` : text;
}
