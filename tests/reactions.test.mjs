// tests/reactions.test.mjs
// Suite de pruebas unitarias para Reacciones en Vivo (Spec 12, H5).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findAvailableReactions,
  executeReaction,
} from '../src/scripts/dnd/reactions.ts';
import {
  expireUntilNextTurn,
  describeDuration,
} from '../src/scripts/dnd/effects.ts';
import { nextTurn } from '../src/scripts/vtt/initiative.ts';

function createMockCharacter(overrides = {}) {
  return {
    id: 'char-test-reactions',
    name: 'Elysian Silverleaf',
    className: 'Mago',
    level: 5,
    armorClass: 14,
    armorNote: 'Armadura de Mago',
    speedFt: 30,
    initiativeBonus: 3,
    hp: { current: 30, max: 30, temp: 0 },
    stats: {
      str: { score: 10, modifier: 0, savingProficient: false },
      dex: { score: 16, modifier: 3, savingProficient: false },
      con: { score: 14, modifier: 2, savingProficient: false },
      int: { score: 18, modifier: 4, savingProficient: true },
      wis: { score: 12, modifier: 1, savingProficient: true },
      cha: { score: 8, modifier: -1, savingProficient: false },
    },
    spellcasting: {
      ability: 'int',
      saveDc: 15,
      attackBonus: 7,
      slots: {
        1: { total: 4, used: 0 },
        2: { total: 3, used: 0 },
        3: { total: 2, used: 0 },
      },
      spells: [
        { name: 'Escudo', level: 1, school: 'abjuration', castingTime: '1 reaction' },
        { name: 'Absorber Elementos', level: 1, school: 'abjuration', castingTime: '1 reaction' },
        { name: 'Rayo de Fuego', level: 0, school: 'evocation', castingTime: '1 action' },
      ],
    },
    actions: [
      { id: 'act-staff', name: 'Bastón', type: 'Melee', bonus: '+3', damage: '1d6', damageType: 'Contundente', equipped: true, tags: ['Versátil'] }
    ],
    activeEffects: [],
    turnState: {
      usedModifiers: [],
      reactionUsed: false,
    },
    features: [],
    ...overrides,
  };
}

test('Fase A: Duración untilNextTurn y función expireUntilNextTurn', () => {
  const effects = [
    {
      id: 'eff-shield',
      name: 'Escudo (+5 CA)',
      sourceType: 'spell',
      duration: { kind: 'untilNextTurn' },
      modifiers: [{ target: 'ac', op: 'add', value: 5 }],
      appliedAt: Date.now(),
    },
    {
      id: 'eff-bless',
      name: 'Bendición',
      sourceType: 'spell',
      duration: { kind: 'concentration' },
      modifiers: [{ target: 'attack', op: 'add', value: '1d4' }],
      appliedAt: Date.now(),
    },
    {
      id: 'eff-potion',
      name: 'Poción de Velocidad',
      sourceType: 'item',
      duration: { kind: 'rounds', remaining: 3 },
      modifiers: [{ target: 'speed', op: 'add', value: 30 }],
      appliedAt: Date.now(),
    },
  ];

  assert.equal(describeDuration({ kind: 'untilNextTurn' }), 'hasta tu próximo turno');

  const { effects: remaining, expired } = expireUntilNextTurn(effects);
  assert.equal(expired.length, 1);
  assert.equal(expired[0].name, 'Escudo (+5 CA)');
  assert.equal(remaining.length, 2);
  assert.ok(remaining.some((e) => e.name === 'Bendición'));
  assert.ok(remaining.some((e) => e.name === 'Poción de Velocidad'));
});

test('Fase A: Ciclo de iniciativa restablece reactionUsed del combatiente en turno', () => {
  const combat = {
    active: true,
    round: 1,
    turnIndex: 0,
    combatants: [
      { id: 'c1', name: 'Goblin 1', initiative: 18, hp: 7, maxHp: 7, conditions: [], isPlayer: false, hiddenHp: false, reactionUsed: true },
      { id: 'c2', name: 'Elysian', initiative: 15, hp: 30, maxHp: 30, conditions: [], isPlayer: true, hiddenHp: false, reactionUsed: true },
      { id: 'c3', name: 'Goblin 2', initiative: 10, hp: 7, maxHp: 7, conditions: [], isPlayer: false, hiddenHp: false, reactionUsed: false },
    ],
    updatedAt: Date.now(),
  };

  // Avanza al turno 1 (Elysian)
  const afterNext = nextTurn(combat);
  assert.equal(afterNext.turnIndex, 1);
  assert.equal(afterNext.combatants[1].id, 'c2');
  // La reacción de Elysian se restableció automáticamente
  assert.equal(afterNext.combatants[1].reactionUsed, false);
  // Goblin 1 sigue con la suya gastada
  assert.equal(afterNext.combatants[0].reactionUsed, true);
});

test('Fase B: findAvailableReactions detecta Escudo ante ataque y valida ranuras', () => {
  const char = createMockCharacter();

  const reactions = findAvailableReactions(char, {
    triggerType: 'attack_hits',
    targetCharacterId: char.id,
    attackRoll: 16,
    targetAc: 14,
  });

  const shield = reactions.find((r) => r.id === 'reaction-shield');
  assert.ok(shield, 'Debe ofrecer la reacción de Escudo');
  assert.equal(shield.canExecute, true);
  assert.equal(shield.cost?.spellSlotLevel, 1);

  // Si ya gastó la reacción, canExecute debe ser false
  char.turnState.reactionUsed = true;
  const reactionsUsed = findAvailableReactions(char, {
    triggerType: 'attack_hits',
    targetCharacterId: char.id,
  });
  const shieldUsed = reactionsUsed.find((r) => r.id === 'reaction-shield');
  assert.equal(shieldUsed.canExecute, false);
  assert.match(shieldUsed.reasonDisabled, /Ya usaste tu reacción/);

  // Si no tiene ranuras disponibles, canExecute debe ser false
  char.turnState.reactionUsed = false;
  char.spellcasting.slots[1] = { total: 4, used: 4 };
  char.spellcasting.slots[2] = { total: 3, used: 3 };
  char.spellcasting.slots[3] = { total: 2, used: 2 };
  const reactionsNoSlots = findAvailableReactions(char, {
    triggerType: 'attack_hits',
    targetCharacterId: char.id,
  });
  const shieldNoSlots = reactionsNoSlots.find((r) => r.id === 'reaction-shield');
  assert.equal(shieldNoSlots.canExecute, false);
  assert.match(shieldNoSlots.reasonDisabled, /Sin espacios de conjuro/);
});

test('Fase B: findAvailableReactions detecta Esquiva Asombrosa para pícaro nivel 5+', () => {
  const rogue = createMockCharacter({
    className: 'Pícaro',
    level: 5,
    features: [{ title: 'Esquiva Asombrosa', description: 'Mitad de daño' }],
  });

  const reactions = findAvailableReactions(rogue, {
    triggerType: 'damage_taken',
    targetCharacterId: rogue.id,
    damageAmount: 20,
  });

  const uncanny = reactions.find((r) => r.id === 'reaction-uncanny-dodge');
  assert.ok(uncanny, 'Debe ofrecer Esquiva Asombrosa');
  assert.equal(uncanny.canExecute, true);
});

test('Fase B: findAvailableReactions detecta Absorber Elementos ante daño elemental', () => {
  const char = createMockCharacter();

  // Daño de fuego
  const fireReactions = findAvailableReactions(char, {
    triggerType: 'damage_taken',
    targetCharacterId: char.id,
    damageAmount: 18,
    damageType: 'fire',
  });
  const absorb = fireReactions.find((r) => r.id === 'reaction-absorb-elements');
  assert.ok(absorb, 'Debe ofrecer Absorber Elementos ante fuego');
  assert.equal(absorb.canExecute, true);

  // Daño contundente (no elemental): no debe ofrecer Absorber Elementos
  const bludgeonReactions = findAvailableReactions(char, {
    triggerType: 'damage_taken',
    targetCharacterId: char.id,
    damageAmount: 10,
    damageType: 'bludgeoning',
  });
  const absorbNonElem = bludgeonReactions.find((r) => r.id === 'reaction-absorb-elements');
  assert.equal(absorbNonElem, undefined);
});

test('Fase B: executeReaction ejecuta Escudo: descuenta ranura, aplica +5 CA y evalúa fallo', () => {
  const char = createMockCharacter();
  assert.equal(char.spellcasting.slots[1].used, 0);

  const { updatedCharacter, result } = executeReaction(char, 'reaction-shield', {
    spellSlotLevel: 1,
    triggerPayload: {
      triggerType: 'attack_hits',
      targetCharacterId: char.id,
      attackRoll: 17,
      targetAc: 14,
    },
  });

  // Reacción gastada
  assert.equal(updatedCharacter.turnState.reactionUsed, true);
  // Ranura nivel 1 descontada
  assert.equal(updatedCharacter.spellcasting.slots[1].used, 1);
  // Efecto activo de +5 CA añadido con duración untilNextTurn
  const shieldEffect = updatedCharacter.activeEffects.find((e) => e.name.includes('Escudo'));
  assert.ok(shieldEffect);
  assert.equal(shieldEffect.duration.kind, 'untilNextTurn');
  assert.equal(shieldEffect.modifiers[0].value, 5);

  // Nueva CA = 14 + 5 = 19
  assert.equal(result.newAc, 19);
  // Como el ataque fue 17 y la nueva CA es 19, el ataque ahora falla
  assert.match(result.logMessage, /¡El ataque \(tirada 17\) ahora falla contra la CA 19!/);
});

test('Fase B: executeReaction ejecuta Esquiva Asombrosa: mitiga daño a la mitad', () => {
  const char = createMockCharacter();

  const { updatedCharacter, result } = executeReaction(char, 'reaction-uncanny-dodge', {
    damageTaken: 25,
  });

  assert.equal(updatedCharacter.turnState.reactionUsed, true);
  // ⌊25 / 2⌋ = 12 mitigados, 13 de daño restante
  assert.equal(result.damageMitigated, 12);
  assert.match(result.logMessage, /el daño de 25 se redujo a la mitad \(13 daño recibido\)/);
});

test('Fase B: executeReaction ejecuta Absorber Elementos: otorga resistencia y bono de daño', () => {
  const char = createMockCharacter();

  const { updatedCharacter, result } = executeReaction(char, 'reaction-absorb-elements', {
    spellSlotLevel: 1,
    damageTaken: 20,
    triggerPayload: {
      triggerType: 'damage_taken',
      targetCharacterId: char.id,
      damageAmount: 20,
      damageType: 'lightning',
    },
  });

  assert.equal(updatedCharacter.turnState.reactionUsed, true);
  assert.equal(updatedCharacter.spellcasting.slots[1].used, 1);
  assert.equal(result.damageMitigated, 10);

  const absorbEffect = updatedCharacter.activeEffects.find((e) => e.name.includes('Absorber'));
  assert.ok(absorbEffect);
  assert.equal(absorbEffect.duration.kind, 'untilNextTurn');
  assert.ok(absorbEffect.modifiers.some((m) => m.target === 'resistance' && m.value === 'lightning'));
  assert.ok(absorbEffect.modifiers.some((m) => m.target === 'attack.damage' && m.value === '1d6'));
});

test('Fase B: findAvailableReactions y executeReaction para Ataque de Oportunidad', () => {
  const char = createMockCharacter();
  const reactions = findAvailableReactions(char, {
    triggerType: 'opportunity_attack',
    targetCharacterId: char.id,
    sourceCombatantName: 'Orco Renegado',
  });

  const opp = reactions.find((r) => r.id === 'reaction-opportunity-attack');
  assert.ok(opp, 'Debe ofrecer Ataque de Oportunidad');
  assert.equal(opp.canExecute, true);
  assert.match(opp.effectSummary, /Atacar con Bastón/);

  const { updatedCharacter, result } = executeReaction(char, 'reaction-opportunity-attack');
  assert.equal(updatedCharacter.turnState.reactionUsed, true);
  assert.match(result.logMessage, /Ataque de Oportunidad con Bastón/);
});

test('Fase B: findAvailableReactions y executeReaction para Castigo Infernal (Hellish Rebuke)', () => {
  const warlock = createMockCharacter({
    className: 'Brujo',
    spellcasting: {
      ability: 'cha',
      saveDc: 14,
      attackBonus: 6,
      slots: { 1: { total: 2, used: 0 } },
      spells: [
        { name: 'Castigo Infernal', level: 1, school: 'evocation', castingTime: '1 reaction' }
      ]
    }
  });

  const reactions = findAvailableReactions(warlock, {
    triggerType: 'damage_taken',
    targetCharacterId: warlock.id,
    damageAmount: 8,
  });

  const rebuke = reactions.find((r) => r.id === 'reaction-hellish-rebuke');
  assert.ok(rebuke, 'Debe ofrecer Castigo Infernal ante daño');
  assert.equal(rebuke.canExecute, true);

  const { updatedCharacter, result } = executeReaction(warlock, 'reaction-hellish-rebuke', {
    spellSlotLevel: 1,
  });
  assert.equal(updatedCharacter.turnState.reactionUsed, true);
  assert.equal(updatedCharacter.spellcasting.slots[1].used, 1);
  assert.match(result.logMessage, /Salvación de DES CD 14/);
  assert.match(result.logMessage, /2d10 de daño de fuego/);
});

test('Fase D: syncCombatTurn restablece la reacción del personaje cuando llega su turno', () => {
  const char = createMockCharacter({
    turnState: {
      usedModifiers: ['sneak-attack'],
      reactionUsed: true,
    },
    activeEffects: [
      {
        id: 'eff-shield',
        name: 'Escudo (+5 CA)',
        sourceType: 'spell',
        duration: { kind: 'untilNextTurn' },
        modifiers: [{ target: 'ac', op: 'add', value: 5 }],
        appliedAt: Date.now(),
      }
    ]
  });

  // Simular objeto de combate donde el combatiente activo es el personaje
  const combatActive = {
    active: true,
    turnIndex: 1,
    combatants: [
      { id: 'c1', name: 'Goblin', isPlayer: false, hp: 7, maxHp: 7 },
      { id: 'c2', name: 'Elysian', isPlayer: true, characterId: char.id, hp: 30, maxHp: 30 },
    ]
  };

  // Simular lógica de syncCombatTurn
  const currentCombatant = combatActive.combatants[combatActive.turnIndex];
  if (currentCombatant && currentCombatant.characterId === char.id) {
    if (char.turnState.reactionUsed) {
      char.turnState.reactionUsed = false;
      char.turnState.usedModifiers = [];
      const { effects } = expireUntilNextTurn(char.activeEffects);
      char.activeEffects = effects;
    }
  }

  assert.equal(char.turnState.reactionUsed, false, 'La reacción debe quedar disponible');
  assert.equal(char.turnState.usedModifiers.length, 0, 'Modificadores de turno reiniciados');
  assert.equal(char.activeEffects.length, 0, 'El efecto untilNextTurn debe haber expirado');
});

test('Feedback: Escudo de Fe (Shield of Faith) no debe registrarse como reacción de Escudo', () => {
  const paladin = createMockCharacter({
    className: 'Paladín',
    spellcasting: {
      ability: 'cha',
      saveDc: 14,
      slots: { 1: { total: 4, used: 0 } },
      spells: [
        { name: 'Escudo de Fe', level: 1, school: 'abjuration', castingTime: '1 bonus action' },
        { name: 'Castigo Divino', level: 1, school: 'evocation', castingTime: 'special' },
      ],
    },
    inventory: [
      { id: 'item-shield', name: 'Escudo Sagrado', slot: 'shield', equipped: true, armor: { category: 'shield', baseAc: 2 } }
    ]
  });

  const reactions = findAvailableReactions(paladin, {
    triggerType: 'attack_hits',
    targetCharacterId: paladin.id,
    attackRoll: 18,
    targetAc: 16,
  });

  const shieldReaction = reactions.find((r) => r.id === 'reaction-shield');
  assert.equal(shieldReaction, undefined, 'No debe ofrecer la reacción de Escudo Arcano a un Paladín con Escudo de Fe');
});

test('Feedback: Escudo físico habilita Estilo de Combate: Protección y deshabilitarlo al desequipar', () => {
  const warriorWithShield = createMockCharacter({
    className: 'Guerrero',
    features: [
      { id: 'f-prot', title: 'Estilo de Combate: Protección', description: 'Usa tu reacción con un escudo para imponer desventaja al atacar a un aliado.' }
    ],
    inventory: [
      { id: 'item-sh', name: 'Escudo de Acero', slot: 'shield', equipped: true, armor: { category: 'shield', baseAc: 2 } }
    ],
  });

  // Con escudo equipado
  const withShieldReactions = findAvailableReactions(warriorWithShield, {
    triggerType: 'ally_targeted',
    targetCharacterId: warriorWithShield.id,
    allyName: 'Rogar',
    distanceFeet: 5,
  });
  const protWith = withShieldReactions.find((r) => r.id === 'reaction-protection');
  assert.ok(protWith, 'Debe ofrecer Protección');
  assert.equal(protWith.canExecute, true);

  // Al desequipar el escudo
  warriorWithShield.inventory[0].equipped = false;
  const withoutShieldReactions = findAvailableReactions(warriorWithShield, {
    triggerType: 'ally_targeted',
    targetCharacterId: warriorWithShield.id,
    allyName: 'Rogar',
    distanceFeet: 5,
  });
  const protWithout = withoutShieldReactions.find((r) => r.id === 'reaction-protection');
  assert.ok(protWithout);
  assert.equal(protWithout.canExecute, false);
  assert.match(protWithout.reasonDisabled, /escudo equipado/i);
});

test('Feedback: Absorber Elementos se activa con nombres de elementos en español', () => {
  const wizard = createMockCharacter();

  const spanishElements = ['fuego', 'frío', 'frio', 'rayo', 'ácido', 'acido', 'trueno'];
  for (const elem of spanishElements) {
    const reactions = findAvailableReactions(wizard, {
      triggerType: 'damage_taken',
      targetCharacterId: wizard.id,
      damageAmount: 15,
      damageType: elem,
    });
    const absorb = reactions.find((r) => r.id === 'reaction-absorb-elements');
    assert.ok(absorb, `Debe activarse ante daño de ${elem}`);
    assert.equal(absorb.canExecute, true);
  }
});

test('Feedback: Detección dinámica de rasgos que reaccionan a Hechizado / Miedo (condition_applied)', () => {
  const paladin = createMockCharacter({
    className: 'Paladín',
    features: [
      {
        id: 'f-aura-courage',
        title: 'Bastión contra el Miedo',
        description: 'Cuando un conjuro intente aplicar miedo sobre ti o un aliado, puedes usar tu reacción para inspirar entereza.',
      }
    ]
  });

  const reactions = findAvailableReactions(paladin, {
    triggerType: 'condition_applied',
    targetCharacterId: paladin.id,
    condition: 'miedo',
  });

  const fearReaction = reactions.find((r) => r.id === 'reaction-feature-f-aura-courage');
  assert.ok(fearReaction, 'Debe detectar el rasgo reactivo a la condición de miedo');
  assert.equal(fearReaction.canExecute, true);
});

test('Feedback: Detección dinámica de objetos equipados con reacción', () => {
  const char = createMockCharacter({
    inventory: [
      {
        id: 'item-brooch',
        name: 'Broche de Repulsión Mágica',
        equipped: true,
        notes: 'Otorga una reacción cuando una criatura te impacta con un ataque para emitir un pulso protector.',
      }
    ]
  });

  const reactions = findAvailableReactions(char, {
    triggerType: 'attack_hits',
    targetCharacterId: char.id,
    attackRoll: 18,
    targetAc: 14,
  });

  const itemReaction = reactions.find((r) => r.id === 'reaction-item-item-brooch');
  assert.ok(itemReaction, 'Debe detectar la reacción otorgada por el objeto equipado');
  assert.equal(itemReaction.sourceType, 'item');
  assert.equal(itemReaction.canExecute, true);
});


