// src/scripts/ui/reactionPrompt.ts
// Controlador de eventos para el banner y modales de reacción (Spec 12, H5).

import type { AvailableReaction, ReactionTriggerPayload } from '../models/reaction.ts';
import { characterStore } from '../state/characterStore.ts';
import { findAvailableReactions } from '../dnd/reactions.ts';
import { getArmorClass } from '../dnd/ac.ts';

export interface ReactionPromptDetail {
  trigger: ReactionTriggerPayload;
  reactions: AvailableReaction[];
}

/**
 * Evalúa y dispara la oportunidad de reacción si el personaje tiene reacciones viables.
 */
export function triggerReactionOpportunity(payload: ReactionTriggerPayload): boolean {
  if (typeof window === 'undefined') return false;
  const character = characterStore.get();
  if (!character || !character.id) return false;
  if (payload.targetCharacterId && payload.targetCharacterId !== character.id) return false;
  if (!characterStore.isReactionAvailable()) return false;

  const actualPayload: ReactionTriggerPayload = {
    ...payload,
    targetCharacterId: payload.targetCharacterId || character.id,
  };

  const reactions = findAvailableReactions(character, actualPayload).filter((r) => r.canExecute);
  if (reactions.length === 0) return false;

  window.dispatchEvent(
    new CustomEvent('show-reaction-prompt', {
      detail: {
        trigger: actualPayload,
        reactions,
      } as ReactionPromptDetail,
    })
  );
  return true;
}

/**
 * Inicializa los listeners globales para oportunidades de reacción (ataques, daño, condiciones, oportunidad).
 */
export function initReactionListeners(): void {
  if (typeof window === 'undefined') return;

  // Oportunidad genérica disparada por el VTT o por el DM
  window.addEventListener('reaction-opportunity', ((e: CustomEvent<ReactionTriggerPayload>) => {
    if (e.detail) {
      triggerReactionOpportunity(e.detail);
    }
  }) as EventListener);

  // Oportunidad al recibir un ataque que impacta (desde la Torre de Dados o el CombatTracker)
  window.addEventListener('incoming-attack-hit', ((e: CustomEvent<{ attackRoll: number; sourceName?: string }>) => {
    const character = characterStore.get();
    if (!character) return;
    const targetAc = getArmorClass(character);
    if (e.detail && e.detail.attackRoll >= targetAc) {
      triggerReactionOpportunity({
        triggerType: 'attack_hits',
        targetCharacterId: character.id,
        attackRoll: e.detail.attackRoll,
        targetAc,
        sourceCombatantName: e.detail.sourceName,
      });
    }
  }) as EventListener);

  // Oportunidad al recibir daño directo (elemental o físico)
  window.addEventListener('incoming-damage', ((e: CustomEvent<{ amount: number; damageType?: string; sourceName?: string }>) => {
    const character = characterStore.get();
    if (!character) return;
    triggerReactionOpportunity({
      triggerType: 'damage_taken',
      targetCharacterId: character.id,
      damageAmount: e.detail?.amount,
      damageType: e.detail?.damageType,
      sourceCombatantName: e.detail?.sourceName,
    });
  }) as EventListener);

  // Oportunidad cuando se intenta aplicar una condición mágica (hechizado, miedo, etc.)
  window.addEventListener('incoming-condition', ((e: CustomEvent<{ condition: string; sourceName?: string }>) => {
    const character = characterStore.get();
    if (!character) return;
    triggerReactionOpportunity({
      triggerType: 'condition_applied',
      targetCharacterId: character.id,
      condition: e.detail?.condition,
      sourceCombatantName: e.detail?.sourceName,
    });
  }) as EventListener);

  // Oportunidad cuando un aliado adyacente o cercano es blanco de ataque o magia
  window.addEventListener('incoming-ally-targeted', ((e: CustomEvent<{ allyName: string; distanceFeet?: number; sourceName?: string }>) => {
    const character = characterStore.get();
    if (!character) return;
    triggerReactionOpportunity({
      triggerType: 'ally_targeted',
      targetCharacterId: character.id,
      allyName: e.detail?.allyName,
      distanceFeet: e.detail?.distanceFeet,
      sourceCombatantName: e.detail?.sourceName,
    });
  }) as EventListener);
}
