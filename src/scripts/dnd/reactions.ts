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

export const ELEMENTAL_TYPES = [
  'fire', 'fuego',
  'cold', 'frio', 'frío',
  'lightning', 'rayo', 'electricidad', 'relampago', 'relámpago',
  'acid', 'acido', 'ácido',
  'thunder', 'trueno',
];

export function normalizeText(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function isElementalDamageType(type?: string): boolean {
  if (!type) return false;
  const norm = normalizeText(type);
  return ELEMENTAL_TYPES.some((elem) => {
    const normElem = normalizeText(elem);
    return norm.includes(normElem) || normElem.includes(norm);
  });
}

/**
 * Evalúa si el personaje tiene un escudo físico equipado en su inventario.
 */
export function hasShieldEquipped(character: CharacterData): boolean {
  return (character.inventory || []).some(
    (item) => Boolean(item.equipped) && (item.slot === 'shield' || item.armor?.category === 'shield')
  );
}

/**
 * Evalúa si el personaje tiene al menos un arma cuerpo a cuerpo preparada.
 */
export function hasMeleeWeaponEquipped(character: CharacterData): boolean {
  return (character.actions || []).some((a) => {
    const tags = (a.tags || []).map((t) => normalizeText(t));
    return a.equipped !== false && !tags.some((t) => t.includes('distancia') || t.includes('ranged'));
  });
}

/**
 * Verifica estrictamente si un conjuro es el conjuro de reacción "Escudo / Shield" (y NO "Escudo de Fe").
 */
export function isShieldSpell(spell: { name: string; castingTime?: string }): boolean {
  const normName = normalizeText(spell.name);
  if (normName.includes('de fe') || normName.includes('of faith')) return false;

  const isExactName = normName === 'escudo' || normName === 'shield' || normName === 'escudo arcano';
  if (!isExactName) return false;

  if (spell.castingTime) {
    const normCast = normalizeText(spell.castingTime);
    if (!normCast.includes('reacc') && !normCast.includes('react')) return false;
  }
  return true;
}

/**
 * Encuentra todas las ranuras de conjuro disponibles de nivel >= minLevel.
 */
export function getAvailableSlots(character: CharacterData, minLevel: number = 1): number[] {
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
 * Evalúa si un nombre coincide con alguno de los alias conocidos (palabra completa o frase).
 */
export function matchesName(source: string, candidates: string[]): boolean {
  const normSource = normalizeText(source);
  return candidates.some((c) => {
    const normC = normalizeText(c);
    return normSource === normC || normSource.includes(normC);
  });
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
  const triggerType = trigger.triggerType;

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
  const features = character.features || [];
  const inventory = character.inventory || [];

  // ==========================================
  // 1. CONJUROS CLÁSICOS DE REACCIÓN
  // ==========================================

  // 1.1 ESCUDO (Shield) — Verificación estricta: NO coincide con "Escudo de Fe" ni con armadura
  const shieldSpell = spells.find((s) => isShieldSpell(s));
  if (shieldSpell && (triggerType === 'attack_hits' || triggerType === 'manual')) {
    const availableSlots = getAvailableSlots(character, 1);
    const hasSlots = availableSlots.length > 0;
    registerReaction({
      id: 'reaction-shield',
      name: 'Escudo (Shield)',
      sourceType: 'spell',
      description: 'Suma +5 a tu CA contra el ataque desencadenante y hasta el inicio de tu próximo turno. Otorga inmunidad a Proyectil Mágico.',
      triggerDescription: 'Al ser impactado por un ataque o por Proyectil Mágico',
      cost: { spellSlotLevel: availableSlots[0] || 1 },
      minSlotLevel: 1,
      availableSlots,
      effectSummary: '+5 a la CA hasta tu próximo turno',
      canExecuteCondition: hasSlots,
      disabledReason: 'Sin espacios de conjuro de nivel 1+ disponibles',
    });
  }

  // 1.2 ABSORBER ELEMENTOS (Absorb Elements) — Soporta tipos de daño en español e inglés
  const absorbSpell = spells.find((s) => {
    const n = normalizeText(s.name);
    return n.includes('absorber elementos') || n.includes('absorb elements');
  });
  const isElementalDmg = trigger.damageType ? isElementalDamageType(trigger.damageType) : false;
  if (absorbSpell && (triggerType === 'damage_taken' || triggerType === 'manual')) {
    if (triggerType === 'manual' || !trigger.damageType || isElementalDmg) {
      const availableSlots = getAvailableSlots(character, 1);
      const hasSlots = availableSlots.length > 0;
      registerReaction({
        id: 'reaction-absorb-elements',
        name: 'Absorber Elementos (Absorb Elements)',
        sourceType: 'spell',
        description: 'Otorga resistencia contra el daño elemental desencadenante hasta el inicio de tu próximo turno, y tu siguiente golpe cuerpo a cuerpo inflige 1d6 extra de ese elemento.',
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

  // 1.3 CASTIGO INFERNAL (Hellish Rebuke)
  const rebukeSpell = spells.find((s) => {
    const n = normalizeText(s.name);
    return n.includes('castigo infernal') || n.includes('hellish rebuke') || n.includes('reprension infernal');
  });
  if (rebukeSpell && (triggerType === 'damage_taken' || triggerType === 'manual')) {
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

  // ==========================================
  // 2. RASGOS DE CLASE Y DOTES DE REACCIÓN
  // ==========================================

  // 2.1 ESQUIVA ASOMBROSA (Uncanny Dodge)
  const isRogueLevel5 =
    (normalizeText(character.className || '').includes('picar') ||
      normalizeText(character.className || '').includes('rogue')) &&
    (character.level || 1) >= 5;
  const hasUncannyDodgeFeat = features.some((f) =>
    matchesName(f.title, ['Esquiva Asombrosa', 'Uncanny Dodge'])
  );
  if (
    (isRogueLevel5 || hasUncannyDodgeFeat) &&
    (triggerType === 'damage_taken' || triggerType === 'attack_hits' || triggerType === 'manual')
  ) {
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

  // 2.2 ESTILO DE COMBATE: PROTECCIÓN (Requiere escudo equipado)
  const hasProtectionStyle = features.some((f) => {
    const t = normalizeText(f.title);
    return t.includes('proteccion') || t.includes('protection');
  });
  if (
    hasProtectionStyle &&
    (triggerType === 'ally_attacked' || triggerType === 'ally_targeted' || triggerType === 'manual')
  ) {
    const hasShield = hasShieldEquipped(character);
    registerReaction({
      id: 'reaction-protection',
      name: 'Estilo de Combate: Protección',
      sourceType: 'feature',
      description: 'Cuando una criatura a la que puedes ver ataca a un aliado a 5 pies de ti, puedes usar tu reacción para imponer desventaja en la tirada de ataque.',
      triggerDescription: 'Cuando un enemigo ataca a un aliado a 5 pies de ti',
      effectSummary: 'Impone Desventaja en el ataque enemigo contra el aliado',
      canExecuteCondition: hasShield,
      disabledReason: 'Requiere tener un escudo equipado',
    });
  }

  // 2.3 ESTILO DE COMBATE: INTERCEPCIÓN (Requiere escudo o arma de combate)
  const hasInterceptionStyle = features.some((f) => {
    const t = normalizeText(f.title);
    return t.includes('intercepcion') || t.includes('interception');
  });
  if (
    hasInterceptionStyle &&
    (triggerType === 'ally_attacked' || triggerType === 'ally_targeted' || triggerType === 'damage_taken' || triggerType === 'manual')
  ) {
    const hasShield = hasShieldEquipped(character);
    const hasWeapon = hasMeleeWeaponEquipped(character);
    const prof = character.proficiencyBonus || 2;
    registerReaction({
      id: 'reaction-interception',
      name: 'Estilo de Combate: Intercepción',
      sourceType: 'feature',
      description: `Cuando una criatura a la que puedes ver impacta a un aliado a 5 pies de ti, usas tu reacción para reducir el daño en 1d10 + ${prof}.`,
      triggerDescription: 'Cuando un aliado a 5 pies de ti recibe un impacto',
      effectSummary: `Reduce el daño al aliado en 1d10 + ${prof}`,
      canExecuteCondition: hasShield || hasWeapon,
      disabledReason: 'Requiere tener un escudo o un arma cuerpo a cuerpo preparada',
    });
  }

  // 2.4 MAESTRO EN ESCUDOS (Shield Master - Requiere escudo equipado)
  const hasShieldMaster = features.some((f) => {
    const t = normalizeText(f.title);
    return t.includes('maestro en escudos') || t.includes('shield master');
  });
  if (hasShieldMaster && (triggerType === 'damage_taken' || triggerType === 'manual')) {
    const hasShield = hasShieldEquipped(character);
    registerReaction({
      id: 'reaction-shield-master',
      name: 'Maestro en Escudos (Shield Master)',
      sourceType: 'feature',
      description: 'Si superas una tirada de salvación de Destreza para recibir la mitad del daño de un efecto, usas tu reacción para no recibir ningún daño.',
      triggerDescription: 'Al superar una tirada de salvación de DES con daño a la mitad',
      effectSummary: 'Evita el 100% del daño en salvaciones superadas de DES',
      canExecuteCondition: hasShield,
      disabledReason: 'Requiere tener un escudo equipado',
    });
  }

  // 2.5 DESVÍO DE PROYECTILES (Monk 3+)
  const isMonkLevel3 =
    (normalizeText(character.className || '').includes('monj') ||
      normalizeText(character.className || '').includes('monk')) &&
    (character.level || 1) >= 3;
  const hasDeflectMissiles = features.some((f) => {
    const t = normalizeText(f.title);
    return t.includes('desvio de proyectiles') || t.includes('deflect missiles');
  });
  if (
    (isMonkLevel3 || hasDeflectMissiles) &&
    (triggerType === 'damage_taken' || triggerType === 'attack_hits' || triggerType === 'manual')
  ) {
    const dexMod = Math.floor(((character.abilities?.dex ?? 10) - 10) / 2);
    const monkLvl = character.level || 3;
    registerReaction({
      id: 'reaction-deflect-missiles',
      name: 'Desvío de Proyectiles (Deflect Missiles)',
      sourceType: 'feature',
      description: `Puedes usar tu reacción para desviar o atrapar el proyectil cuando recibes un impacto de un ataque con arma a distancia. El daño se reduce en 1d10 + ${dexMod + monkLvl}.`,
      triggerDescription: 'Al ser impactado por un ataque de proyectil a distancia',
      effectSummary: `Reduce el daño a distancia en 1d10 + ${dexMod + monkLvl}`,
      canExecuteCondition: true,
    });
  }

  // 2.6 OTROS RASGOS Y DOTES QUE MENCIONAN REACCIÓN, HECHIZADO O MIEDO
  for (const feat of features) {
    const title = normalizeText(feat.title);
    const desc = normalizeText(feat.description || '');

    // Omitir los ya manejados específicamente arriba
    if (
      title.includes('uncanny dodge') ||
      title.includes('esquiva asombrosa') ||
      title.includes('proteccion') ||
      title.includes('protection') ||
      title.includes('intercepcion') ||
      title.includes('interception') ||
      title.includes('maestro en escudos') ||
      title.includes('shield master') ||
      title.includes('desvio de proyectiles') ||
      title.includes('deflect missiles')
    ) {
      continue;
    }

    const mentionsReaction = desc.includes('reaccion') || desc.includes('reaction') || title.includes('reaccion');
    const mentionsCharmFear =
      desc.includes('hechiz') ||
      desc.includes('encant') ||
      desc.includes('charm') ||
      desc.includes('miedo') ||
      desc.includes('frighten') ||
      desc.includes('asustad');
    const mentionsAllyProtection =
      desc.includes('aliad') ||
      desc.includes('amig') ||
      desc.includes('ally') ||
      desc.includes('compañer');

    let shouldInclude = false;

    if (triggerType === 'manual' && mentionsReaction) {
      shouldInclude = true;
    } else if (triggerType === 'condition_applied') {
      const condition = normalizeText(trigger.condition || '');
      if (
        mentionsReaction &&
        (mentionsCharmFear || (condition && desc.includes(condition)))
      ) {
        shouldInclude = true;
      }
    } else if (triggerType === 'ally_targeted' || triggerType === 'ally_attacked') {
      if (mentionsReaction && mentionsAllyProtection) {
        shouldInclude = true;
      }
    } else if (triggerType === 'attack_hits' && mentionsReaction && (desc.includes('ataque') || desc.includes('impact'))) {
      shouldInclude = true;
    } else if (triggerType === 'damage_taken' && mentionsReaction && (desc.includes('dano') || desc.includes('daño') || desc.includes('herid'))) {
      shouldInclude = true;
    }

    if (shouldInclude) {
      // Si requiere escudo, validarlo
      const requiresShield = desc.includes('escudo') || desc.includes('shield');
      const shieldOk = !requiresShield || hasShieldEquipped(character);

      registerReaction({
        id: `reaction-feature-${feat.id || feat.title}`,
        name: feat.title,
        sourceType: 'feature',
        description: feat.description || 'Rasgo que otorga una reacción en combate.',
        triggerDescription: trigger.condition
          ? `Al activarse efecto de ${trigger.condition}`
          : 'Oportunidad de reacción',
        effectSummary: feat.title,
        canExecuteCondition: shieldOk,
        disabledReason: requiresShield && !shieldOk ? 'Requiere tener un escudo equipado' : undefined,
      });
    }
  }

  // ==========================================
  // 3. OBJETOS EQUIPADOS CON REACCIONES
  // ==========================================
  for (const item of inventory) {
    if (!item.equipped) continue;
    const notes = normalizeText(item.notes || '');
    const desc = normalizeText(item.description || '');
    const actCond = normalizeText(item.activationCondition || '');

    const text = `${notes} ${desc} ${actCond}`;
    if (text.includes('reaccion') || text.includes('reaction')) {
      let match = false;
      if (triggerType === 'manual') match = true;
      else if (triggerType === 'attack_hits' && (text.includes('ataque') || text.includes('impact'))) match = true;
      else if (triggerType === 'damage_taken' && (text.includes('daño') || text.includes('dano'))) match = true;
      else if (triggerType === 'condition_applied' && (text.includes('hechiz') || text.includes('miedo') || text.includes('charm'))) match = true;
      else if ((triggerType === 'ally_targeted' || triggerType === 'ally_attacked') && text.includes('aliad')) match = true;

      if (match) {
        registerReaction({
          id: `reaction-item-${item.id || item.name}`,
          name: item.name,
          sourceType: 'item',
          description: item.notes || item.description || `Reacción otorgada por ${item.name}.`,
          triggerDescription: item.activationCondition || 'Activación de objeto equipado',
          effectSummary: `Activar efecto de ${item.name}`,
          canExecuteCondition: true,
        });
      }
    }
  }

  // ==========================================
  // 4. ATAQUE DE OPORTUNIDAD (Meele)
  // ==========================================
  if (triggerType === 'opportunity_attack' || triggerType === 'manual') {
    const meleeWeapon = (character.actions || []).find((a) => {
      const tags = (a.tags || []).map((t) => normalizeText(t));
      return a.equipped !== false && !tags.some((t) => t.includes('distancia') || t.includes('ranged'));
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

  // ==========================================
  // 5. OTROS CONJUROS CON TIEMPO DE REACCIÓN
  // ==========================================
  for (const s of spells) {
    const casting = normalizeText(s.castingTime || '');
    if (casting.includes('reaccion') || casting.includes('reaction')) {
      const normName = normalizeText(s.name);
      // Si ya fue manejado específicamente arriba, lo omitimos
      if (
        isShieldSpell(s) ||
        normName.includes('absorber elementos') ||
        normName.includes('absorb elements') ||
        normName.includes('castigo infernal') ||
        normName.includes('hellish rebuke') ||
        normName.includes('reprension infernal')
      ) {
        continue;
      }

      // Evaluar si coincide con el detonante
      let match = false;
      if (triggerType === 'manual') match = true;
      else if (triggerType === 'spell_cast' && (normName.includes('contraconjuro') || normName.includes('counterspell'))) match = true;
      else if ((triggerType === 'attack_hits' || triggerType === 'ally_targeted') && (normName.includes('puas plateadas') || normName.includes('silvery barbs'))) match = true;
      else if (triggerType === 'condition_applied' && (normName.includes('santuario') || normName.includes('proteccion'))) match = true;
      else if (triggerType === 'attack_hits' && normName.includes('reaccion')) match = true;

      if (match) {
        const availableSlots = getAvailableSlots(character, s.level || 1);
        registerReaction({
          id: `reaction-spell-${s.id || s.name}`,
          name: s.name,
          sourceType: 'spell',
          description: s.notes || s.activationCondition || `Conjuro de reacción (${s.school || 'Magia'}, nivel ${s.level || 0}).`,
          triggerDescription: s.activationCondition || 'Reacción declarada',
          cost: { spellSlotLevel: (s.level || 0) > 0 ? (availableSlots[0] || s.level) : undefined },
          minSlotLevel: (s.level || 0) > 0 ? s.level : undefined,
          availableSlots,
          effectSummary: `Lanzar ${s.name}`,
          canExecuteCondition: (s.level || 0) === 0 || availableSlots.length > 0,
          disabledReason: (s.level || 0) > 0 && availableSlots.length === 0 ? `Sin espacios de nivel ${s.level}+` : undefined,
        });
      }
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

  // 1. ESCUDO (Shield)
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

  // 2. ESQUIVA ASOMBROSA (Uncanny Dodge)
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

  // 3. ABSORBER ELEMENTOS (Absorb Elements)
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
      const tags = (a.tags || []).map((t) => normalizeText(t));
      return a.equipped !== false && !tags.some((t) => t.includes('distancia') || t.includes('ranged'));
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

  // 5. CASTIGO INFERNAL (Hellish Rebuke)
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

  // 6. PROTECCIÓN
  if (reactionId === 'reaction-protection') {
    return {
      updatedCharacter: updated,
      result: {
        success: true,
        reactionName: 'Estilo de Combate: Protección',
        logMessage: `🛡️ Usó Estilo de Combate: Protección para imponer Desventaja en la tirada de ataque contra su aliado.`,
      },
    };
  }

  // 7. INTERCEPCIÓN
  if (reactionId === 'reaction-interception') {
    const prof = updated.proficiencyBonus || 2;
    return {
      updatedCharacter: updated,
      result: {
        success: true,
        reactionName: 'Estilo de Combate: Intercepción',
        logMessage: `🛡️ Usó Estilo de Combate: Intercepción para reducir el daño infligido a su aliado en 1d10 + ${prof}.`,
      },
    };
  }

  // 8. MAESTRO EN ESCUDOS
  if (reactionId === 'reaction-shield-master') {
    return {
      updatedCharacter: updated,
      result: {
        success: true,
        reactionName: 'Maestro en Escudos (Shield Master)',
        logMessage: `🛡️ Usó Maestro en Escudos para no recibir daño en la tirada de salvación superada de Destreza.`,
      },
    };
  }

  // 9. DESVÍO DE PROYECTILES
  if (reactionId === 'reaction-deflect-missiles') {
    const dexMod = Math.floor(((updated.abilities?.dex ?? 10) - 10) / 2);
    const monkLvl = updated.level || 3;
    return {
      updatedCharacter: updated,
      result: {
        success: true,
        reactionName: 'Desvío de Proyectiles (Deflect Missiles)',
        logMessage: `✋ Usó Desvío de Proyectiles para reducir el daño del proyectil en 1d10 + ${dexMod + monkLvl}.`,
      },
    };
  }

  // 10. RASGO GENÉRICO
  if (reactionId.startsWith('reaction-feature-')) {
    const feat = (updated.features || []).find((f) => `reaction-feature-${f.id || f.title}` === reactionId);
    if (feat) {
      if (feat.uses && feat.uses.includes('/')) {
        const parts = feat.uses.split('/');
        const cur = parseInt(parts[0], 10);
        const max = parts[1];
        if (!isNaN(cur) && cur > 0) {
          feat.uses = `${cur - 1}/${max}`;
        }
      }
      return {
        updatedCharacter: updated,
        result: {
          success: true,
          reactionName: feat.title,
          logMessage: `⚡ Usó la reacción de rasgo: "${feat.title}".`,
        },
      };
    }
  }

  // 11. OBJETO GENÉRICO
  if (reactionId.startsWith('reaction-item-')) {
    const item = (updated.inventory || []).find((i) => `reaction-item-${i.id || i.name}` === reactionId);
    if (item) {
      return {
        updatedCharacter: updated,
        result: {
          success: true,
          reactionName: item.name,
          logMessage: `🛡️ Activó la reacción del objeto equipado: "${item.name}".`,
        },
      };
    }
  }

  // 12. CONJURO GENÉRICO
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
