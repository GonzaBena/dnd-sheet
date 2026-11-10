// src/scripts/vtt/tokenCard.ts
// Datos de la tarjeta informativa de un token (T-55, RF-25). Lógica pura, sin DOM.

import type { Combat } from '../models/combat.ts';
import type { Token } from '../models/map.ts';
import { findCombatantByToken, visibleHp } from './initiative.ts';

export interface TokenCardData {
  name: string;
  /** null = no mostrar PG (sin combatiente enlazado o PG ocultos para este usuario). */
  hp: { hp: number; maxHp: number } | null;
  conditions: string[];
  linked: boolean;
}

export function buildTokenCardData(
  combat: Combat | null | undefined,
  tokenId: string,
  token: Pick<Token, 'name'>,
  viewer: { uid?: string | null; isDm: boolean }
): TokenCardData {
  const c = findCombatantByToken(combat, tokenId);
  if (!c) return { name: token.name, hp: null, conditions: [], linked: false };
  return {
    name: token.name,
    hp: visibleHp(c, viewer),
    conditions: [...(c.conditions ?? [])],
    linked: true,
  };
}
