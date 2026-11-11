// src/scripts/models/effect.ts
// Efectos activos del personaje (Spec 07, Fase B).

export type EffectDuration =
  | { kind: 'rounds'; remaining: number }
  | { kind: 'untilRest'; rest: 'short' | 'long' }
  | { kind: 'concentration' }
  | { kind: 'untilUsed' }
  | { kind: 'indefinite' };

export interface Modifier {
  target: string; // 'ac', 'attack', 'save.dex', 'check.str', 'skill.stealth', 'speed', 'spellcasting', …
  op: 'add' | 'set' | 'advantage' | 'disadvantage' | 'resistance';
  value?: number | string;
  when?: string; // lo evalúa H4
}

export interface ActiveEffect {
  id: string;
  name: string;
  sourceType: 'spell' | 'item' | 'feat' | 'dm' | 'custom';
  sourceId?: string;
  duration: EffectDuration;
  modifiers: Modifier[];
  resourceId?: string;
  appliedAt: number;
}
