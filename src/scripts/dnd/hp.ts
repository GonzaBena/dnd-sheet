// src/scripts/dnd/hp.ts
// Lógica pura de Puntos de Golpe. Todo cambio de PG se expresa como una operación (HpOp) que se
// aplica sobre el valor vigente: así la misma operación se puede reaplicar en una transacción de
// Firestore sobre el valor del servidor, en vez de escribir un número calculado con una copia vieja.

export interface HitPoints {
  current: number;
  max: number;
  temp: number;
}

export type HpOp =
  /** Daño (amount < 0): consume primero los PG temporales. Curación (amount > 0): hasta el máximo, no toca los temporales. */
  | { kind: 'delta'; amount: number }
  /** Ajuste manual: fija los valores indicados (los que falten se conservan). */
  | { kind: 'set'; current?: number; max?: number; temp?: number }
  /** Descanso largo: PG al máximo y sin temporales. */
  | { kind: 'full' }
  /**
   * Cambio de PG máximos (subida/bajada de nivel, edición de la ficha). Si estaba al máximo
   * (o keepFull), sigue al máximo; si el máximo sube, los PG actuales suben lo mismo; si baja, se recortan.
   */
  | { kind: 'setMax'; max: number; keepFull?: boolean };

function toInt(value: unknown, fallback: number): number {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) ? n : fallback;
}

/** Sanea un valor de PG cualquiera (documentos viejos, datos importados): enteros, max ≥ 1, 0 ≤ current ≤ max, temp ≥ 0. */
export function normalizeHp(hp: Partial<HitPoints> | null | undefined): HitPoints {
  const max = Math.max(1, toInt(hp?.max, 1));
  const current = Math.min(max, Math.max(0, toInt(hp?.current, max)));
  const temp = Math.max(0, toInt(hp?.temp, 0));
  return { current, max, temp };
}

export function applyHpOp(hp: Partial<HitPoints> | null | undefined, op: HpOp): HitPoints {
  const base = normalizeHp(hp);
  switch (op.kind) {
    case 'delta': {
      const amount = toInt(op.amount, 0);
      if (amount < 0) {
        const damage = -amount;
        const absorbed = Math.min(base.temp, damage);
        return {
          current: Math.max(0, base.current - (damage - absorbed)),
          max: base.max,
          temp: base.temp - absorbed,
        };
      }
      if (amount > 0) {
        return { ...base, current: Math.min(base.max, base.current + amount) };
      }
      return base;
    }
    case 'set':
      return normalizeHp({
        current: op.current ?? base.current,
        max: op.max ?? base.max,
        temp: op.temp ?? base.temp,
      });
    case 'full':
      return { current: base.max, max: base.max, temp: 0 };
    case 'setMax': {
      const max = Math.max(1, toInt(op.max, base.max));
      const wasFull = base.current >= base.max;
      let current: number;
      if (op.keepFull || wasFull) current = max;
      else if (max > base.max) current = base.current + (max - base.max);
      else current = base.current;
      return { current: Math.min(max, Math.max(0, current)), max, temp: base.temp };
    }
    default:
      return base;
  }
}

export function sameHp(a: Partial<HitPoints> | null | undefined, b: Partial<HitPoints> | null | undefined): boolean {
  return (a?.current ?? null) === (b?.current ?? null)
    && (a?.max ?? null) === (b?.max ?? null)
    && (a?.temp ?? 0) === (b?.temp ?? 0);
}

export function formatHp(hp: HitPoints): string {
  return `${hp.current}/${hp.max} PG${hp.temp > 0 ? ` (+${hp.temp} Temp)` : ''}`;
}

/** Resultado de una operación confirmada: valores antes y después en el servidor. */
export interface HpChange {
  before: HitPoints;
  after: HitPoints;
}

/**
 * Texto de bitácora para un cambio de PG ya confirmado. Usa los valores reales del servidor,
 * así la entrada refleja el resultado final aunque otro cliente haya cambiado los PG en el medio.
 */
export function describeHpChange(
  name: string,
  op: HpOp,
  change: HpChange,
  actor: 'self' | 'dm' = 'self'
): { title: string; content: string } {
  const { before, after } = change;
  const by = actor === 'dm' ? ' (DM)' : '';
  if (op.kind === 'delta' && op.amount < 0) {
    const dmg = -op.amount;
    const absorbed = before.temp - after.temp;
    return {
      title: `Daño recibido${by}: ${dmg} PG`,
      content: `${name}: ${formatHp(before)} → ${formatHp(after)}.${absorbed > 0 ? ` ${absorbed} absorbido(s) por PG temporales.` : ''}`,
    };
  }
  if (op.kind === 'delta' && op.amount > 0) {
    return {
      title: `Curación recibida${by}: +${op.amount} PG`,
      content: `${name}: ${formatHp(before)} → ${formatHp(after)}.`,
    };
  }
  return {
    title: `Puntos de Golpe ajustados${by}`,
    content: `${name}: ${formatHp(before)} → ${formatHp(after)}.`,
  };
}
