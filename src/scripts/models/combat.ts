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

// --- Spec 11: Combate en la Hoja (H4) ---

export type CombatModifierType = 'attack' | 'damage' | 'both';

export interface CombatModifierOption {
  id: string;
  name: string;
  description: string;
  type: CombatModifierType;
  /** Fórmula o valor numérico a añadir (ej. "+1d6", "+2d8", "+2", "+1d10") */
  formula: string;
  damageType?: string;
  /** Identificador de recurso o slot que se gastará al impactar */
  resourceCost?: {
    resourceId?: string;
    spellSlotLevel?: number;
    amount: number;
    /** 'onHit' = solo se descuenta si el ataque impacta contra la CA; 'onAttack' = se gasta al tirar */
    consumeTiming: 'onHit' | 'onAttack';
  };
  /** Indica si esta opción solo se puede usar 1 vez por turno (ej. Sneak Attack) */
  oncePerTurn?: boolean;
  /** Si ya fue utilizada en el turno actual */
  usedThisTurn?: boolean;
}

export interface ConcentrationStatus {
  isConcentrating: boolean;
  effectId?: string;
  sourceName?: string;
  startedAt?: number;
}

export interface ConcentrationCheckRequired {
  characterId: string;
  damageTaken: number;
  dc: number; // Math.max(10, Math.floor(damageTaken / 2))
  sourceName: string;
  effectId: string;
}

export type RollAdvantageState = 'normal' | 'advantage' | 'disadvantage';

export interface AdvantageEvaluation {
  state: RollAdvantageState;
  advantages: string[];     // Motivos de ventaja ("Vex", "Flanqueo", etc.)
  disadvantages: string[];  // Motivos de desventaja ("Sin competencia con armadura", "A quemarropa", etc.)
  isCanceled: boolean;      // true si coexisten ventajas y desventajas
  summaryText: string;      // Resumen legible en español
}

export interface SpellComponentCheck {
  canCast: boolean;
  warnings: string[];
  verbalOk: boolean;
  somaticOk: boolean;
  materialOk: boolean;
  hasFreeHand: boolean;
  hasFocusOrPouch: boolean;
  missingMaterial?: string;
}

