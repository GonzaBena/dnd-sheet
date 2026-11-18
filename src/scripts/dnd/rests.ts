// src/scripts/dnd/rests.ts
// Lógica pura y reglas oficiales de Descansos (SRD 5.1) y Dados Guardados (Spec 10, Fase A).
import type { HitDie, HitDicePool, CharacterData } from '../models/character.ts';
import type { Resource } from '../models/resource.ts';
import type {
  SpentHitDie,
  ShortRestOptions,
  ShortRestResult,
  LongRestOptions,
  LongRestResult,
} from '../models/rest.ts';
import { resetOn } from './resources.ts';
import { expireOnRest } from './effects.ts';

export const DIE_FACES: Record<HitDie, number> = {
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
};

export function getDieFaces(die: HitDie | string): number {
  if (die in DIE_FACES) return DIE_FACES[die as HitDie];
  const num = parseInt(String(die).replace(/\D/g, ''), 10);
  return Number.isFinite(num) && num > 0 ? num : 8;
}

/**
 * Calcula la curación de un único Dado de Golpe tirado.
 * Regla SRD 5.1: Se tira el dado y se suma el modificador de Constitución (mínimo 0 PG).
 */
export function calculateHitDieHeal(
  die: HitDie,
  conMod: number,
  roll?: number,
  rng: () => number = Math.random,
): SpentHitDie {
  const faces = getDieFaces(die);
  const actualRoll =
    typeof roll === 'number' && Number.isFinite(roll)
      ? Math.max(1, Math.min(faces, Math.round(roll)))
      : Math.floor(rng() * faces) + 1;
  const total = Math.max(0, actualRoll + conMod);
  return {
    die,
    roll: actualRoll,
    conMod,
    total,
  };
}

/**
 * Obtiene las reservas de Dados de Golpe del personaje.
 * Si no existen `pools`, infiere una única reserva compatible con el dado y nivel.
 */
export function getHitDicePools(char: CharacterData): HitDicePool[] {
  if (Array.isArray(char.hitDice?.pools) && char.hitDice.pools.length > 0) {
    return char.hitDice.pools.map((p) => ({
      die: p.die,
      total: Number(p.total) || 1,
      remaining: Math.max(0, Math.min(Number(p.total) || 1, Number(p.remaining) || 0)),
    }));
  }
  const die = ((char.hitDice?.die as HitDie) || 'd8') as HitDie;
  const total = Math.max(1, Number(char.hitDice?.total) || Number(char.level) || 1);
  const remaining = Math.max(0, Math.min(total, Number(char.hitDice?.remaining) ?? total));
  return [{ die, total, remaining }];
}

/**
 * Sincroniza idempotentemente las reservas de dados de golpe con el nivel del personaje.
 * Si el nivel del personaje cambió, ajusta los totales manteniendo la coherencia.
 */
export function syncHitDicePools(char: CharacterData): boolean {
  if (!char.hitDice) {
    const lvl = Math.max(1, Number(char.level) || 1);
    char.hitDice = {
      total: lvl,
      remaining: lvl,
      die: 'd8',
    };
    return true;
  }

  let changed = false;
  const targetLevel = Math.max(1, Number(char.level) || 1);

  if (Array.isArray(char.hitDice.pools) && char.hitDice.pools.length > 0) {
    const pools = char.hitDice.pools;
    let sumTotals = pools.reduce((acc, p) => acc + (Number(p.total) || 0), 0);

    if (sumTotals !== targetLevel) {
      const diff = targetLevel - sumTotals;
      if (diff > 0) {
        // Nivel subió: se agregan los dados al primer pool (clase principal)
        pools[0].total += diff;
        pools[0].remaining += diff;
        changed = true;
      } else {
        // Nivel bajó: se recortan dados sobrantes desde el final
        let toRemove = Math.abs(diff);
        for (let i = pools.length - 1; i >= 0 && toRemove > 0; i--) {
          const removable = Math.min(toRemove, Math.max(0, pools[i].total - 1));
          if (removable > 0) {
            pools[i].total -= removable;
            pools[i].remaining = Math.min(pools[i].total, pools[i].remaining);
            toRemove -= removable;
            changed = true;
          }
        }
      }
    }

    // Normalizar remaining
    pools.forEach((p) => {
      const clamped = Math.max(0, Math.min(p.total, p.remaining));
      if (clamped !== p.remaining) {
        p.remaining = clamped;
        changed = true;
      }
    });

    const newTotal = pools.reduce((acc, p) => acc + p.total, 0);
    const newRem = pools.reduce((acc, p) => acc + p.remaining, 0);

    if (char.hitDice.total !== newTotal) {
      char.hitDice.total = newTotal;
      changed = true;
    }
    if (char.hitDice.remaining !== newRem) {
      char.hitDice.remaining = newRem;
      changed = true;
    }
    if (char.hitDice.die !== pools[0].die) {
      char.hitDice.die = pools[0].die;
      changed = true;
    }
  } else {
    // Monoclass sin pools explícitos
    if (char.hitDice.total !== targetLevel) {
      const diff = targetLevel - char.hitDice.total;
      char.hitDice.total = targetLevel;
      char.hitDice.remaining = Math.max(0, Math.min(targetLevel, char.hitDice.remaining + Math.max(diff, 0)));
      changed = true;
    }
    const clamped = Math.max(0, Math.min(char.hitDice.total, char.hitDice.remaining));
    if (clamped !== char.hitDice.remaining) {
      char.hitDice.remaining = clamped;
      changed = true;
    }
  }

  return changed;
}

/**
 * Cuota máxima de dados a recuperar en un descanso largo.
 * Regla SRD 5.1: Se recupera hasta la mitad del total de Dados de Golpe máximos (mínimo 1).
 */
export function calculateMaxHitDiceRecovery(total: number): number {
  return Math.max(1, Math.floor(total / 2));
}

/**
 * Algoritmo sugerido de recuperación en descanso largo para multiclase.
 * Prioriza recuperar primero los dados con caras más altas (d12 > d10 > d8 > d6).
 */
export function suggestHitDiceRecovery(
  pools: HitDicePool[],
  maxToRecover: number,
): { die: HitDie; count: number }[] {
  let remainingQuota = Math.max(0, maxToRecover);
  const priorityOrder: HitDie[] = ['d12', 'd10', 'd8', 'd6'];

  // Agrupar pools por dado
  const sorted = [...pools].sort((a, b) => {
    return priorityOrder.indexOf(a.die) - priorityOrder.indexOf(b.die);
  });

  const recoveryPlan: { die: HitDie; count: number }[] = [];

  for (const pool of sorted) {
    if (remainingQuota <= 0) break;
    const spent = Math.max(0, pool.total - pool.remaining);
    if (spent > 0) {
      const recoverCount = Math.min(spent, remainingQuota);
      recoveryPlan.push({ die: pool.die, count: recoverCount });
      remainingQuota -= recoverCount;
    }
  }

  return recoveryPlan;
}

/**
 * Ejecuta la lógica matemática pura de un Descanso Corto.
 * Deduce dados, suma PG con CON (sin exceder hp.max), reinicia recursos shortRest y expira efectos.
 */
export function executeShortRestLogic(
  char: CharacterData,
  options: ShortRestOptions,
): { char: CharacterData; result: ShortRestResult } {
  const nextChar = JSON.parse(JSON.stringify(char)) as CharacterData;
  const pools = getHitDicePools(nextChar);
  const conMod =
    typeof options.conMod === 'number'
      ? options.conMod
      : nextChar.stats?.con?.modifier ?? 0;

  const spentDice: SpentHitDie[] = [];
  let totalCurado = 0;

  for (const item of options.spent ?? []) {
    const pool = pools.find((p) => p.die === item.die && p.remaining > 0);
    if (!pool) continue; // No quedan dados de ese tipo

    const spent = calculateHitDieHeal(item.die, conMod, item.roll, options.rng);
    pool.remaining -= 1;
    spentDice.push(spent);
    totalCurado += spent.total;
  }

  // Actualizar reservas del personaje
  if (Array.isArray(nextChar.hitDice.pools)) {
    nextChar.hitDice.pools = pools;
  }
  nextChar.hitDice.total = pools.reduce((acc, p) => acc + p.total, 0);
  nextChar.hitDice.remaining = pools.reduce((acc, p) => acc + p.remaining, 0);

  // Salud
  const hpBefore = nextChar.hp.current;
  const hpAfter = Math.min(nextChar.hp.max, hpBefore + totalCurado);
  const actualHealed = Math.max(0, hpAfter - hpBefore);
  nextChar.hp.current = hpAfter;

  // Recursos de descanso corto
  const recoveredResources: string[] = [];
  if (nextChar.wildShape && !nextChar.resources?.some((r) => r.id === 'wildShape')) {
    nextChar.wildShape.usesRemaining = nextChar.wildShape.usesTotal;
    recoveredResources.push('Forma Salvaje');
  }

  if (Array.isArray(nextChar.resources)) {
    const before = nextChar.resources;
    const after = resetOn(before, 'short');
    after.forEach((r, i) => {
      if (before[i].used > 0) recoveredResources.push(r.name);
    });
    nextChar.resources = after;
  }

  // Efectos que expiran en descanso corto
  const { effects, expired } = expireOnRest(nextChar.activeEffects || [], 'short');
  nextChar.activeEffects = effects;

  const result: ShortRestResult = {
    healedHp: actualHealed,
    hpBefore,
    hpAfter,
    spentDice,
    remainingDiceTotal: nextChar.hitDice.remaining,
    remainingPools: pools,
    recoveredResources,
    expiredEffects: expired.map((e) => e.name),
  };

  return { char: nextChar, result };
}

/**
 * Tira los dados guardados para un recurso que especifica `dieType` (ej. Portento: 2d20).
 */
export function rollSavedDice(resource: Resource, rng: () => number = Math.random): number[] {
  const faces = getDieFaces(resource.dieType || 'd20');
  const count = Math.max(1, resource.max || 2);
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    rolls.push(Math.floor(rng() * faces) + 1);
  }
  return rolls;
}

/**
 * Consume uno de los dados guardados de un recurso.
 */
export function consumeSavedDie(
  resource: Resource,
  valueOrIndex: number | { index: number },
): { resource: Resource; value: number } {
  const next = { ...resource, values: [...(resource.values || [])] };
  let removedVal: number | undefined;

  if (typeof valueOrIndex === 'object' && 'index' in valueOrIndex) {
    const idx = valueOrIndex.index;
    if (idx >= 0 && idx < next.values.length) {
      removedVal = next.values.splice(idx, 1)[0];
    }
  } else {
    const targetVal = valueOrIndex;
    const idx = next.values.indexOf(targetVal);
    if (idx !== -1) {
      removedVal = next.values.splice(idx, 1)[0];
    }
  }

  if (removedVal !== undefined) {
    next.used = Math.min(next.max, next.used + 1);
  }

  return { resource: next, value: removedVal ?? 0 };
}

/**
 * Ejecuta la lógica matemática pura de un Descanso Largo.
 * Salud al 100%, recupera la mitad de dados, restablece conjuros 1–9, recursos y genera dados de Portento.
 */
export function executeLongRestLogic(
  char: CharacterData,
  options: LongRestOptions = {},
): { char: CharacterData; result: LongRestResult } {
  const nextChar = JSON.parse(JSON.stringify(char)) as CharacterData;
  const pools = getHitDicePools(nextChar);
  const totalDice = pools.reduce((acc, p) => acc + p.total, 0);
  const maxQuota = calculateMaxHitDiceRecovery(totalDice);

  // Salud
  const hpBefore = nextChar.hp.current;
  nextChar.hp.current = nextChar.hp.max;
  nextChar.hp.temp = 0;
  const healedHp = Math.max(0, nextChar.hp.max - hpBefore);

  // Recuperación de dados
  let plan: { die: HitDie; count: number }[] = [];
  if (options.customDiceRecovery) {
    let customSum = 0;
    for (const [dieKey, count] of Object.entries(options.customDiceRecovery)) {
      const die = dieKey as HitDie;
      const pool = pools.find((p) => p.die === die);
      if (!pool) continue;
      const spent = Math.max(0, pool.total - pool.remaining);
      const safeCount = Math.min(spent, Math.max(0, Number(count) || 0));
      if (safeCount > 0 && customSum + safeCount <= maxQuota) {
        plan.push({ die, count: safeCount });
        customSum += safeCount;
      }
    }
  } else {
    plan = suggestHitDiceRecovery(pools, maxQuota);
  }

  // Aplicar recuperación a los pools
  for (const item of plan) {
    const pool = pools.find((p) => p.die === item.die);
    if (pool) {
      pool.remaining = Math.min(pool.total, pool.remaining + item.count);
    }
  }

  if (Array.isArray(nextChar.hitDice.pools)) {
    nextChar.hitDice.pools = pools;
  }
  nextChar.hitDice.total = totalDice;
  nextChar.hitDice.remaining = pools.reduce((acc, p) => acc + p.remaining, 0);

  // Espacios de conjuro (1–9)
  const recoveredSlots: Record<number, number> = {};
  if (nextChar.spellcasting?.slots) {
    for (const [lvlKey, slot] of Object.entries(nextChar.spellcasting.slots)) {
      const lvl = Number(lvlKey);
      if (slot.used > 0) {
        recoveredSlots[lvl] = slot.used;
        slot.used = 0;
      }
    }
  }

  // Recursos y dados de Portento
  const recoveredResources: string[] = [];
  const savedDiceRolled: { resourceName: string; values: number[] }[] = [];
  const rng = options.rng || Math.random;

  if (nextChar.wildShape) {
    nextChar.wildShape.usesRemaining = nextChar.wildShape.usesTotal;
    nextChar.wildShape.activeForm = null;
    recoveredResources.push('Forma Salvaje');
  }

  if (Array.isArray(nextChar.resources)) {
    nextChar.resources = nextChar.resources.map((r) => {
      const applies = r.rechargeOn === 'shortRest' || r.rechargeOn === 'longRest';
      if (!applies) return r;

      if (r.used > 0) recoveredResources.push(r.name);
      const nextR: Resource = { ...r, used: 0 };

      if (r.dieType) {
        const rolled = rollSavedDice(r, rng);
        nextR.values = rolled;
        savedDiceRolled.push({ resourceName: r.name, values: rolled });
      } else if (r.values) {
        nextR.values = [];
      }
      return nextR;
    });
  }

  // Efectos activos (expiran los de descanso corto y largo)
  const { effects, expired } = expireOnRest(nextChar.activeEffects || [], 'long');
  nextChar.activeEffects = effects;

  const result: LongRestResult = {
    healedHp,
    hpBefore,
    hpAfter: nextChar.hp.current,
    recoveredDice: plan,
    remainingDiceTotal: nextChar.hitDice.remaining,
    remainingPools: pools,
    recoveredSlots,
    recoveredResources,
    expiredEffects: expired.map((e) => e.name),
    savedDiceRolled,
  };

  return { char: nextChar, result };
}
