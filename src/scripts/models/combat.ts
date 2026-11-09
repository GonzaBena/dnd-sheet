// src/scripts/models/combat.ts
// Combate de la campaña: campaigns/{cid}/combat/current (solo lo escribe el DM).

export interface Combatant {
  id: string;
  name: string;
  initiative: number;
  hp: number;
  maxHp: number;
  ac?: number;
  conditions: string[];
  tokenId?: string;
  isPlayer: boolean;
  /** Los jugadores ven "Herido/Grave" en lugar del número. */
  hiddenHp: boolean;
  /** Jugador dueño (para que vea su propio HP, RF-04). */
  ownerUid?: string;
  characterId?: string;
  avatarUrl?: string;
}

export interface Combat {
  active: boolean;
  round: number;
  turnIndex: number;
  combatants: Combatant[];
  updatedAt: number;
}

export const COMBAT_LIMITS = {
  maxCombatants: 50,
} as const;
