// src/scripts/models/reaction.ts
// Tipos para el sistema de Reacciones en Vivo (Spec 12, H5).

export type ReactionTriggerType =
  | 'attack_hits'         // Un ataque iguala o supera la CA
  | 'damage_taken'        // Recibe daño de cualquier tipo o elemental
  | 'opportunity_attack'  // Criatura hostil abandona alcance cuerpo a cuerpo
  | 'spell_cast'          // Criatura a la vista lanza un conjuro
  | 'ally_attacked'       // Aliado adyacente es atacado
  | 'ally_targeted'       // Aliado a X pies es objetivo de ataque o magia
  | 'condition_applied'   // Efecto mágico intenta aplicar hechizado, miedo u otra condición
  | 'manual';             // Activación a demanda por el usuario

export interface ReactionTriggerPayload {
  triggerType: ReactionTriggerType;
  sourceCombatantName?: string;
  targetCharacterId?: string;
  attackRoll?: number;
  targetAc?: number;
  damageAmount?: number;
  damageType?: string; // 'fire'/'fuego', 'cold'/'frío', 'lightning'/'rayo', etc.
  spellName?: string;
  isOpportunityLeaving?: boolean;
  condition?: string;   // 'charmed'/'hechizado', 'frightened'/'miedo', etc.
  allyName?: string;
  distanceFeet?: number;
}

export interface ReactionCost {
  spellSlotLevel?: number;
  resourceId?: string;
  amount?: number;
}

export interface AvailableReaction {
  id: string;
  name: string;
  sourceType: 'spell' | 'feature' | 'action' | 'item';
  description: string;
  triggerDescription: string;
  cost?: ReactionCost;
  effectSummary: string;
  canExecute: boolean;
  reasonDisabled?: string;
  /** Nivel de ranura mínimo sugerido para conjuros */
  minSlotLevel?: number;
  /** Niveles de ranura disponibles si es conjuro escalable */
  availableSlots?: number[];
}

export interface ReactionExecutionResult {
  success: boolean;
  reactionName: string;
  logMessage: string;
  appliedEffectName?: string;
  consumedSlotLevel?: number;
  damageMitigated?: number;
  newAc?: number;
}
