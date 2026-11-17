// src/scripts/dnd/reactions.ts
// Motor puro de detección y resolución de Reacciones en Vivo (Spec 12, H5).

import type { CharacterData, AttackAction } from '../models/character.ts';
import type { ActiveEffect } from '../models/effect.ts';
import type {
  AvailableReaction,
  ReactionExecutionResult,
  ReactionTriggerPayload,
  ReactionTriggerType,
} from '../models/reaction.ts';
import { addEffect } from './effects.ts';
import { getArmorClass } from './ac.ts';

/**
 * Descuenta 1 ranura de conjuro del nivel indicado sobre el objeto CharacterData.
 */
export function consumeCharacterSpellSlot(character: CharacterData, level: number): boolean {
  const slot = character.spellcasting?.slots?.[level];
  if (slot && slot.used < slot.total) {
    slot.used++;
    return true;
  }
  return false;
}

const ELEMENTAL_TYPES = ['fire', 'cold', 'lightning', 'acid', 'thunder'];

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Encuentra todas las ranuras de conjuro disponibles de nivel >= minLevel.
 */
function getAvailableSlots(character: CharacterData, minLevel: number = 1): number[] {
  const slots = character.spellcasting?.slots || {};
  const available: number[] = [];
  for (let lvl = minLevel; lvl <= 9; lvl++) {
    const slot = slots[lvl];
    if (slot && slot.total > 0 && slot.used < slot.total) {
      available.push(lvl);
    }
  }
  return available;
}

/**
 * Evalúa si un nombre coincide con alguno de los alias conocidos.
 */
function matchesName(source: string, candidates: string[]): boolean {
  const normSource = normalizeText(source);
  return candidates.some((c) => normSource.includes(normalizeText(c)));
}

/**
 * Busca todas las reacciones disponibles para un personaje frente a un detonante.
 */
export function findAvailableReactions(
  character: CharacterData,
  trigger: ReactionTriggerPayload
): AvailableReaction[] {
  const reactions: AvailableReaction[] = [];
  const reactionUsed = Boolean(character.turnState?.reactionUsed);

  // Helper para añadir reacción con validación común de reacción gastada
  const registerReaction = (
    reaction: Omit<AvailableReaction, 'canExecute' | 'reasonDisabled'> & {
      canExecuteCondition: boolean;
      disabledReason?: string;
    }
  ) => {
    let canExecute = !reactionUsed && reaction.canExecuteCondition;
    let reasonDisabled: string | undefined;

    if (reactionUsed) {
      canExecute = false;
      reasonDisabled = 'Ya usaste tu reacción en este asalto';
    } else if (!reaction.canExecuteCondition) {
      canExecute = false;
      reasonDisabled = reaction.disabledReason || 'Requisitos no cumplidos';
    }

    reactions.push({
      id: reaction.id,
      name: reaction.name,
      sourceType: reaction.sourceType,
      description: reaction.description,
      triggerDescription: reaction.triggerDescription,
      cost: reaction.cost,
      effectSummary: reaction.effectSummary,
      canExecute,
      reasonDisabled,
      minSlotLevel: reaction.minSlotLevel,
      availableSlots: reaction.availableSlots,
    });
  };

  const spells = character.spellcasting?.spells || [];

  // 1. ESCUDO (Shield)
  const shieldSpell = spells.find((s) => matchesName(s.name, ['Escudo', 'Shield']));
  if (shieldSpell && (trigger.triggerType === 'attack_hits' || trigger.triggerType === 'manual')) {
    const availableSlots = getAvailableSlots(character, 1);
    const hasSlots = availableSlots.length > 0;
    registerReaction({
      id: 'reaction-shield',
      name: 'Escudo (Shield)',
      sourceType: 'spell',
      description: 'Suma +5 a tu CA contra el ataque desencadenante y hasta el inicio de tu próximo turno. Inmunidad a Proyectil Mágico.',
      triggerDescription: 'Al ser impactado por un ataque o por Proyectil Mágico',
      cost: { spellSlotLevel: availableSlots[0] || 1 },
      minSlotLevel: 1,
      availableSlots,
      effectSummary: '+5 a la CA hasta tu próximo turno',
      canExecuteCondition: hasSlots,
      disabledReason: 'Sin espacios de conjuro de nivel 1+ disponibles',
    });
  }

  // 2. ESQUIVA ASOMBROSA (Uncanny Dodge)
  const isRogueLevel5 = (normalizeText(character.className || '').includes('picar') ||
    normalizeText(character.className || '').includes('rogue')) &&
    (character.level || 1) >= 5;
  const hasUncannyDodgeFeat = (character.features || []).some((f) =>
    matchesName(f.title, ['Esquiva Asombrosa', 'Uncanny Dodge'])
  );

  if ((isRogueLevel5 || hasUncannyDodgeFeat) && (trigger.triggerType === 'damage_taken' || trigger.triggerType === 'attack_hits' || trigger.triggerType === 'manual')) {
    registerReaction({
      id: 'reaction-uncanny-dodge',
      name: 'Esquiva Asombrosa (Uncanny Dodge)',
      sourceType: 'feature',
      description: 'Cuando un atacante que puedes ver te impacta, reduce a la mitad el daño de ese ataque.',
      triggerDescription: 'Al recibir daño de un atacante visible',
      effectSummary: 'Reduce el daño a la mitad (⌊daño / 2⌋)',
      canExecuteCondition: true,
    });
  }

  // 3. ABSORBER ELEMENTOS (Absorb Elements)
  const absorbSpell = spells.find((s) => matchesName(s.name, ['Absorber Elementos', 'Absorb Elements']));
  const isElementalDamage = trigger.damageType && ELEMENTAL_TYPES.includes(trigger.damageType.toLowerCase());
  if (absorbSpell && (trigger.triggerType === 'damage_taken' || trigger.triggerType === 'manual')) {
    if (trigger.triggerType === 'manual' || isElementalDamage || !trigger.damageType) {
      const availableSlots = getAvailableSlots(character, 1);
      const hasSlots = availableSlots.length > 0;
      registerReaction({
        id: 'reaction-absorb-elements',
        name: 'Absorber Elementos (Absorb Elements)',
        sourceType: 'spell',
        description: 'Otorga resistencia contra el tipo de daño desencadenante hasta el inicio de tu próximo turno, y tu siguiente ataque cuerpo a cuerpo causa 1d6 extra de ese elemento.',
        triggerDescription: 'Al recibir daño de ácido, frío, fuego, rayo o trueno',
        cost: { spellSlotLevel: availableSlots[0] || 1 },
        minSlotLevel: 1,
        availableSlots,
        effectSummary: 'Resistencia elemental + 1d6 extra al próximo golpe',
        canExecuteCondition: hasSlots,
        disabledReason: 'Sin espacios de conjuro de nivel 1+ disponibles',
      });
    }
  }

  // 4. ATAQUE DE OPORTUNIDAD
  if (trigger.triggerType === 'opportunity_attack' || trigger.triggerType === 'manual') {
    const meleeWeapon = (character.actions || []).find((a) => {
      const tags = (a.tags || []).map((t) => t.toLowerCase());
      return a.equipped !== false && !tags.includes('a distancia') && !tags.includes('ranged');
    });
    registerReaction({
      id: 'reaction-opportunity-attack',
      name: 'Ataque de Oportunidad',
      sourceType: 'action',
      description: 'Realiza un ataque cuerpo a cuerpo contra una criatura hostil que abandona tu alcance sin destrabarse.',
      triggerDescription: 'Cuando un enemigo sale de tu alcance cuerpo a cuerpo',
      effectSummary: meleeWeapon ? `Atacar con ${meleeWeapon.name}` : 'Ataque desarmado',
      canExecuteCondition: true,
    });
  }

  // 5. CASTIGO INFERNAL (Hellish Rebuke)
  const rebukeSpell = spells.find((s) => matchesName(s.name, ['Castigo Infernal', 'Hellish Rebuke']));
  if (rebukeSpell && (trigger.triggerType === 'damage_taken' || trigger.triggerType === 'manual')) {
    const availableSlots = getAvailableSlots(character, 1);
    const hasSlots = availableSlots.length > 0;
    registerReaction({
      id: 'reaction-hellish-rebuke',
      name: 'Castigo Infernal (Hellish Rebuke)',
      sourceType: 'spell',
      description: 'Lanza llamas de retribución hacia la criatura que te dañó (2d10 fuego a nivel 1, salvación DES para mitad de daño).',
      triggerDescription: 'Al recibir daño de una criatura visible a menos de 60 pies',
      cost: { spellSlotLevel: availableSlots[0] || 1 },
      minSlotLevel: 1,
      availableSlots,
      effectSummary: '2d10 daño de fuego al atacante (Salvación DES)',
      canExecuteCondition: hasSlots,
      disabledReason: 'Sin espacios de conjuro de nivel 1+ disponibles',
    });
  }

  // 6. Otros conjuros de reacción presentes en la ficha
  for (const s of spells) {
    const casting = normalizeText(s.castingTime || '');
    if (casting.includes('reaccion') || casting.includes('reaction')) {
      // Si ya fue manejado específicamente arriba, lo omitimos
      if (['Escudo', 'Shield', 'Absorber Elementos', 'Absorb Elements', 'Castigo Infernal', 'Hellish Rebuke'].some(k => matchesName(s.name, [k]))) {
        continue;
      }
      const availableSlots = getAvailableSlots(character, s.level || 1);
      registerReaction({
        id: `reaction-spell-${s.id || s.name}`,
        name: s.name,
        sourceType: 'spell',
        description: s.notes || s.activationCondition || `Conjuro de reacción (${s.school}, nivel ${s.level}).`,
        triggerDescription: s.activationCondition || 'Reacción declarada',
        cost: { spellSlotLevel: s.level > 0 ? (availableSlots[0] || s.level) : undefined },
        minSlotLevel: s.level > 0 ? s.level : undefined,
        availableSlots,
        effectSummary: `Lanzar ${s.name}`,
        canExecuteCondition: s.level === 0 || availableSlots.length > 0,
        disabledReason: s.level > 0 && availableSlots.length === 0 ? `Sin espacios de nivel ${s.level}+` : undefined,
      });
    }
  }

  return reactions;
}

/**
 * Resuelve y ejecuta mecánicamente una reacción sobre el personaje.
 */
export function executeReaction(
  character: CharacterData,
  reactionId: string,
  options?: {
    spellSlotLevel?: number;
    damageTaken?: number;
    triggerPayload?: ReactionTriggerPayload;
  }
): {
  updatedCharacter: CharacterData;
  result: ReactionExecutionResult;
} {
  const updated = JSON.parse(JSON.stringify(character)) as CharacterData;
  if (!updated.turnState) updated.turnState = {};

  // Marcar la reacción como consumida
  updated.turnState.reactionUsed = true;

  // 1. ESCUDO
  if (reactionId === 'reaction-shield') {
    const slotLevel = options?.spellSlotLevel || 1;
    if (slotLevel > 0) {
      consumeCharacterSpellSlot(updated, slotLevel);
    }

    const shieldEffect: ActiveEffect = {
      id: `effect-shield-${Date.now()}`,
      name: 'Escudo (Shield)',
      sourceType: 'spell',
      duration: { kind: 'untilNextTurn' },
      modifiers: [{ target: 'ac', op: 'add', value: 5 }],
      appliedAt: Date.now(),
    };

    const addRes = addEffect(updated.activeEffects || [], shieldEffect);
    updated.activeEffects = addRes.effects;

    const baseAc = getArmorClass(character);
    const newAc = baseAc + 5;

    let logMessage = `🛡️ Lanzó Escudo (Shield) con ranura de nivel ${slotLevel}. +5 a la CA hasta el inicio de su próximo turno (Nueva CA: ${newAc}). Inmunidad a Proyectil Mágico.`;
    if (options?.triggerPayload?.attackRoll !== undefined) {
      const roll = options.triggerPayload.attackRoll;
      if (roll < newAc) {
        logMessage += ` ¡El ataque (tirada ${roll}) ahora falla contra la CA ${newAc}!`;
      }
    }

    return {
      updatedCharacter: updated,
      result: {
        success: true,
        reactionName: 'Escudo (Shield)',
        logMessage,
        appliedEffectName: 'Escudo (+5 CA)',
        consumedSlotLevel: slotLevel,
        newAc,
      },
    };
  }

  // 2. ESQUIVA ASOMBROSA
  if (reactionId === 'reaction-uncanny-dodge') {
    const rawDamage = options?.damageTaken ?? options?.triggerPayload?.damageAmount ?? 0;
    const mitigated = Math.floor(rawDamage / 2);
    const finalDamage = rawDamage - mitigated;

    return {
      updatedCharacter: updated,
      result: {
        success: true,
        reactionName: 'Esquiva Asombrosa (Uncanny Dodge)',
        logMessage: `⚡ Usó Esquiva Asombrosa para esquivar el golpe: el daño de ${rawDamage} se redujo a la mitad (${finalDamage} daño recibido).`,
        damageMitigated: mitigated,
      },
    };
  }

  // 3. ABSORBER ELEMENTOS
  if (reactionId === 'reaction-absorb-elements') {
    const slotLevel = options?.spellSlotLevel || 1;
    if (slotLevel > 0) {
      consumeCharacterSpellSlot(updated, slotLevel);
    }

    const damageType = options?.triggerPayload?.damageType || 'fuego';
    const rawDamage = options?.damageTaken ?? options?.triggerPayload?.damageAmount ?? 0;
    const mitigated = Math.floor(rawDamage / 2);

    // Escalado de daño extra: 1d6 a nv 1, +1d6 por cada nivel superior
    const extraDice = `${slotLevel}d6`;

    const absorbEffect: ActiveEffect = {
      id: `effect-absorb-${Date.now()}`,
      name: `Absorber Elementos (${damageType})`,
      sourceType: 'spell',
      duration: { kind: 'untilNextTurn' },
      modifiers: [
        { target: 'resistance', op: 'resistance', value: damageType },
        { target: 'attack.damage', op: 'add', value: extraDice },
      ],
      appliedAt: Date.now(),
    };

    const addRes = addEffect(updated.activeEffects || [], absorbEffect);
    updated.activeEffects = addRes.effects;

    return {
      updatedCharacter: updated,
      result: {
        success: true,
        reactionName: 'Absorber Elementos (Absorb Elements)',
        logMessage: `🔥 Lanzó Absorber Elementos (nivel ${slotLevel}): otorga resistencia a daño de ${damageType} (mitiga ${mitigated} PG) y suma +${extraDice} de ese elemento en el próximo golpe cuerpo a cuerpo.`,
        appliedEffectName: `Resistencia (${damageType}) & +${extraDice}`,
        consumedSlotLevel: slotLevel,
        damageMitigated: mitigated,
      },
    };
  }

  // 4. ATAQUE DE OPORTUNIDAD
  if (reactionId === 'reaction-opportunity-attack') {
    const meleeWeapon = (updated.actions || []).find((a) => {
      const tags = (a.tags || []).map((t) => t.toLowerCase());
      return a.equipped !== false && !tags.includes('a distancia') && !tags.includes('ranged');
    });
    const weaponName = meleeWeapon ? meleeWeapon.name : 'Ataque Desarmado';

    return {
      updatedCharacter: updated,
      result: {
        success: true,
        reactionName: 'Ataque de Oportunidad',
        logMessage: `⚔️ Ejecutó un Ataque de Oportunidad con ${weaponName} contra una criatura que abandonó su alcance.`,
      },
    };
  }

  // 5. CASTIGO INFERNAL
  if (reactionId === 'reaction-hellish-rebuke') {
    const slotLevel = options?.spellSlotLevel || 1;
    if (slotLevel > 0) {
      consumeCharacterSpellSlot(updated, slotLevel);
    }
    const damageDice = `${1 + slotLevel}d10`;
    const dc = updated.spellcasting?.saveDc || 13;

    return {
      updatedCharacter: updated,
      result: {
        success: true,
        reactionName: 'Castigo Infernal (Hellish Rebuke)',
        logMessage: `🔥 Lanzó Castigo Infernal (nivel ${slotLevel}): la criatura agresora debe superar una Salvación de DES CD ${dc} o recibir ${damageDice} de daño de fuego (mitad si supera).`,
        consumedSlotLevel: slotLevel,
      },
    };
  }

  // 6. Genérico
  const genericSpell = (updated.spellcasting?.spells || []).find(
    (s) => `reaction-spell-${s.id || s.name}` === reactionId
  );
  if (genericSpell) {
    const slotLevel = options?.spellSlotLevel || genericSpell.level || 1;
    if (slotLevel > 0) {
      consumeCharacterSpellSlot(updated, slotLevel);
    }
    return {
      updatedCharacter: updated,
      result: {
        success: true,
        reactionName: genericSpell.name,
        logMessage: `✨ Usó su reacción para lanzar ${genericSpell.name}${slotLevel > 0 ? ` (ranura nivel ${slotLevel})` : ''}.`,
        consumedSlotLevel: slotLevel > 0 ? slotLevel : undefined,
      },
    };
  }

  return {
    updatedCharacter: updated,
    result: {
      success: true,
      reactionName: 'Reacción',
      logMessage: `⚡ Usó su reacción de combate.`,
    },
  };
}
