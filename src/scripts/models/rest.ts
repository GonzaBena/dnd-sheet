// src/scripts/models/rest.ts
// Modelos de datos para resultados y opciones de descansos (Spec 10, Fase A).
import type { HitDie, HitDicePool } from './character.ts';

export interface SpentHitDie {
  die: HitDie;
  roll: number;
  conMod: number;
  total: number; // Math.max(0, roll + conMod)
}

export interface ShortRestOptions {
  spent: { die: HitDie; roll?: number }[];
  conMod?: number;
  rng?: () => number;
}

export interface ShortRestResult {
  healedHp: number;
  hpBefore: number;
  hpAfter: number;
  spentDice: SpentHitDie[];
  remainingDiceTotal: number;
  remainingPools: HitDicePool[];
  recoveredResources: string[];
  expiredEffects: string[];
}

export interface LongRestOptions {
  customDiceRecovery?: Partial<Record<HitDie, number>>;
  rng?: () => number;
}

export interface LongRestResult {
  healedHp: number;
  hpBefore: number;
  hpAfter: number;
  recoveredDice: { die: HitDie; count: number }[];
  remainingDiceTotal: number;
  remainingPools: HitDicePool[];
  recoveredSlots: Record<number, number>;
  recoveredResources: string[];
  expiredEffects: string[];
  savedDiceRolled: { resourceName: string; values: number[] }[];
}
