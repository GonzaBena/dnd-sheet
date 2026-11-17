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

  const reactions = findAvailableReactions(character, payload).filter((r) => r.canExecute);
  if (reactions.length === 0) return false;

  window.dispatchEvent(
    new CustomEvent('show-reaction-prompt', {
      detail: {
        trigger: payload,
        reactions,
      } as ReactionPromptDetail,
    })
  );
  return true;
}

/**
 * Inicializa los listeners globales para oportunidades de reacción (ataques, daño, oportunidad).
 */
export function initReactionListeners(): void {
  if (typeof window === 'undefined') return;

  // Oportunidad disparada por el VTT o por el DM
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
}
