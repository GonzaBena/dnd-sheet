import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isWeaponEligibleForSneakAttack,
  isWeaponEligibleForDivineSmite,
  calculateSneakAttackDice,
  getBardicDieType,
  getAvailableCombatModifiers,
  parseFormulaDice,
  combineDamageModifiers,
} from '../src/scripts/dnd/combat.ts';

import {
  validateSpellComponents,
  isRitualSpell,
  canClassCastRituals,
  calculateUpcastFormula,
  countFreeHands,
} from '../src/scripts/dnd/spellcasting.ts';

import {
  calculateConcentrationDc,
  isConcentrationDuration,
  getActiveConcentrationEffect,
  evaluateConcentrationOnDamage,
} from '../src/scripts/dnd/concentration.ts';

import {
  evaluateAdvantage,
} from '../src/scripts/dnd/advantage.ts';

test('Combate en la Hoja (Spec 11, H4) — Lógica Pura de Modificadores', async (t) => {
  await t.test('1. isWeaponEligibleForSneakAttack valida solo armas sutiles o a distancia', () => {
    // Daga (sutil y arrojadiza) -> Válida
    const dagger = {
      id: 'act-dagger',
      name: 'Daga',
      type: 'Cuerpo a cuerpo',
      bonus: '+5 al Impacto',
      damage: '1d4 + 3',
      damageType: 'Perforante',
      tags: ['Sutil', 'Arrojadiza (20/60)'],
    };
    assert.equal(isWeaponEligibleForSneakAttack(dagger), true);

    // Arco corto (A distancia) -> Válido
    const bow = {
      id: 'act-bow',
      name: 'Arco corto',
      type: 'A distancia',
      bonus: '+5 al Impacto',
      damage: '1d6 + 3',
      damageType: 'Perforante',
      tags: ['A dos manos', 'Munición (80/320)'],
    };
    assert.equal(isWeaponEligibleForSneakAttack(bow), true);

    // Espadón (Cuerpo a cuerpo, Pesada, A dos manos) -> Inválido
    const greatsword = {
      id: 'act-greatsword',
      name: 'Espadón',
      type: 'Cuerpo a cuerpo',
      bonus: '+5 al Impacto',
      damage: '2d6 + 3',
      damageType: 'Cortante',
      tags: ['Pesada', 'A dos manos'],
    };
    assert.equal(isWeaponEligibleForSneakAttack(greatsword), false);
  });

  await t.test('2. isWeaponEligibleForDivineSmite valida solo armas cuerpo a cuerpo', () => {
    const sword = {
      id: 'act-sword',
      name: 'Espada larga',
      type: 'Cuerpo a cuerpo',
      bonus: '+6 al Impacto',
      damage: '1d8 + 3',
      damageType: 'Cortante',
      tags: ['Versátil (1d10)'],
    };
    assert.equal(isWeaponEligibleForDivineSmite(sword), true);

    const bow = {
      id: 'act-bow',
      name: 'Arco largo',
      type: 'A distancia',
      bonus: '+6 al Impacto',
      damage: '1d8 + 3',
      damageType: 'Perforante',
      tags: ['Pesada'],
    };
    assert.equal(isWeaponEligibleForDivineSmite(bow), false);
  });

  await t.test('3. calculateSneakAttackDice escala adecuadamente según el nivel', () => {
    assert.equal(calculateSneakAttackDice({ level: 1 }), '1d6');
    assert.equal(calculateSneakAttackDice({ level: 2 }), '1d6');
    assert.equal(calculateSneakAttackDice({ level: 3 }), '2d6');
    assert.equal(calculateSneakAttackDice({ level: 5 }), '3d6');
    assert.equal(calculateSneakAttackDice({ level: 9 }), '5d6');
    assert.equal(calculateSneakAttackDice({ level: 20 }), '10d6');
  });

  await t.test('4. getBardicDieType escala según el nivel', () => {
    assert.equal(getBardicDieType({ level: 1 }), 'd6');
    assert.equal(getBardicDieType({ level: 5 }), 'd8');
    assert.equal(getBardicDieType({ level: 10 }), 'd10');
    assert.equal(getBardicDieType({ level: 15 }), 'd12');
  });

  await t.test('5. getAvailableCombatModifiers detecta Ataque Furtivo para Pícaro', () => {
    const rogueChar = {
      level: 3,
      className: 'Pícaro',
      features: [{ title: 'Ataque Furtivo' }],
      turnState: { usedModifiers: [] },
      resources: [],
      spellcasting: { slots: {} },
    };
    const rapier = {
      id: 'act-rapier',
      name: 'Estoques',
      type: 'Cuerpo a cuerpo',
      bonus: '+5 al Impacto',
      damage: '1d8 + 3',
      damageType: 'Perforante',
      tags: ['Sutil'],
    };

    const mods = getAvailableCombatModifiers(rogueChar, rapier);
    const sneak = mods.find((m) => m.id === 'sneak-attack');
    assert.ok(sneak);
    assert.equal(sneak.formula, '+2d6');
    assert.equal(sneak.oncePerTurn, true);
    assert.equal(sneak.usedThisTurn, false);
    assert.equal(sneak.resourceCost?.consumeTiming, 'onHit');

    // Si ya se usó este turno
    const usedRogue = {
      ...rogueChar,
      turnState: { usedModifiers: ['sneak-attack'] },
    };
    const usedMods = getAvailableCombatModifiers(usedRogue, rapier);
    const usedSneak = usedMods.find((m) => m.id === 'sneak-attack');
    assert.ok(usedSneak);
    assert.equal(usedSneak.usedThisTurn, true);
  });

  await t.test('6. getAvailableCombatModifiers detecta Castigo Divino con ranuras disponibles', () => {
    const paladinChar = {
      level: 5,
      className: 'Paladín',
      features: [{ title: 'Castigo Divino' }],
      resources: [],
      spellcasting: {
        slots: {
          1: { total: 4, used: 2 },
          2: { total: 2, used: 2 }, // Agotado
        },
      },
    };
    const sword = {
      id: 'act-sword',
      name: 'Espada larga',
      type: 'Cuerpo a cuerpo',
      bonus: '+6 al Impacto',
      damage: '1d8 + 3',
      damageType: 'Cortante',
      tags: [],
    };

    const mods = getAvailableCombatModifiers(paladinChar, sword);
    const smite1 = mods.find((m) => m.id === 'divine-smite-lvl-1');
    const smite2 = mods.find((m) => m.id === 'divine-smite-lvl-2');

    assert.ok(smite1);
    assert.equal(smite1.formula, '+2d8');
    assert.equal(smite1.damageType, 'Radiante');
    assert.equal(smite1.usedThisTurn, false);

    assert.ok(smite2);
    assert.equal(smite2.formula, '+3d8');
    assert.equal(smite2.usedThisTurn, true); // Espacios agotados
  });

  await t.test('7. parseFormulaDice y combineDamageModifiers', () => {
    const p1 = parseFormulaDice('+2d8');
    assert.deepEqual(p1, { count: 2, die: 8, mod: 0 });

    const p2 = parseFormulaDice('+1d6+2');
    assert.deepEqual(p2, { count: 1, die: 6, mod: 2 });

    const p3 = parseFormulaDice('+3');
    assert.deepEqual(p3, { count: 0, die: 0, mod: 3 });

    const combined = combineDamageModifiers('1d8 + 3', 'Perforante', [
      { id: 'sneak', name: 'Ataque Furtivo', formula: '+2d6', type: 'damage', damageType: 'Perforante' },
      { id: 'smite', name: 'Castigo Divino', formula: '+2d8', type: 'damage', damageType: 'Radiante' },
    ]);

    assert.equal(combined.combinedFormula, '1d8 + 3 + 2d6 + 2d8');
    assert.equal(combined.extraDiceList.length, 2);
    assert.equal(combined.extraDiceList[0].name, 'Ataque Furtivo');
    assert.equal(combined.extraDiceList[0].die, 6);
    assert.equal(combined.extraDiceList[1].name, 'Castigo Divino');
    assert.equal(combined.extraDiceList[1].die, 8);
  });

  await t.test('8. Validación de Componentes de Conjuros (V, S, M) y manos ocupadas', () => {
    // Caso A: Mago con ambas manos libres y foco arcano
    const wizardChar = {
      className: 'Mago',
      actions: [],
      inventory: [{ name: 'Varita de Fresno (Foco Arcano)', equipped: true }],
      activeEffects: [],
      currency: { gp: 50 },
    };
    const spellVSM = {
      name: 'Bola de Fuego',
      components: 'V, S, M (una pequeña bola de guano de murciélago y azufre)',
    };
    const check1 = validateSpellComponents(wizardChar, spellVSM);
    assert.equal(check1.canCast, true);
    assert.equal(check1.warnings.length, 0);

    // Caso B: Guerrero/Mago con espada y escudo equipados (0 manos libres) sin War Caster
    const knightMage = {
      className: 'Mago',
      actions: [{ name: 'Espada larga', equipped: true, hands: 1 }],
      inventory: [{ name: 'Escudo', equipped: true, slot: 'shield' }],
      activeEffects: [],
      features: [],
    };
    const check2 = validateSpellComponents(knightMage, { name: 'Escudo', components: 'V, S' });
    assert.equal(check2.canCast, false);
    assert.ok(check2.warnings.some((w) => w.includes('Componente Somático (S)')));

    // Caso C: El mismo personaje con la dote Conjurador de Guerra
    const warCasterKnight = {
      ...knightMage,
      features: [{ title: 'Conjurador de Guerra (War Caster)' }],
    };
    const check3 = validateSpellComponents(warCasterKnight, { name: 'Escudo', components: 'V, S' });
    assert.equal(check3.canCast, true);
    assert.equal(check3.somaticOk, true);

    // Caso D: Conjuro con coste en oro faltante
    const check4 = validateSpellComponents(wizardChar, {
      name: 'Revivir',
      components: 'V, S, M (diamantes por valor de 300 po que el conjuro consume)',
    });
    assert.equal(check4.canCast, false);
    assert.ok(check4.warnings.some((w) => w.includes('300 po')));
  });

  await t.test('9. Rituales y Escalado de Conjuros (Upcasting)', () => {
    assert.equal(canClassCastRituals('Clérigo'), true);
    assert.equal(canClassCastRituals('Mago'), true);
    assert.equal(canClassCastRituals('Guerrero'), false);

    assert.equal(isRitualSpell({ name: 'Identificar', ritual: true }), true);
    assert.equal(isRitualSpell({ name: 'Identificar', notes: 'Lanzamiento: 1 minuto o Ritual' }), true);
    assert.equal(isRitualSpell({ name: 'Bola de fuego', notes: 'Explosión' }), false);

    // Upcasting
    const upcastDmg = calculateUpcastFormula('3d6', 1, 3); // Nivel 1 a nivel 3 (+2 dados)
    assert.equal(upcastDmg, '5d6');
  });

  await t.test('10. Concentración Activa y Salvación al Daño (CD máx(10, daño/2))', () => {
    // CD según daño recibido
    assert.equal(calculateConcentrationDc(0), 0);
    assert.equal(calculateConcentrationDc(5), 10);
    assert.equal(calculateConcentrationDc(10), 10);
    assert.equal(calculateConcentrationDc(20), 10);
    assert.equal(calculateConcentrationDc(22), 11);
    assert.equal(calculateConcentrationDc(30), 15);
    assert.equal(calculateConcentrationDc(50), 25);

    // Detección de duración de concentración
    assert.equal(isConcentrationDuration('Concentración, hasta 1 min'), true);
    assert.equal(isConcentrationDuration('Instantáneo'), false);

    // Chequeo de daño sobre personaje concentrado
    const charWithConcentration = {
      id: 'char-1',
      activeEffects: [
        { id: 'fx-bless', name: 'Bendición', duration: { kind: 'concentration' } },
      ],
    };
    const req = evaluateConcentrationOnDamage(charWithConcentration, 24);
    assert.ok(req);
    assert.equal(req.dc, 12); // Math.max(10, 24 / 2)
    assert.equal(req.sourceName, 'Bendición');

    // Personaje sin concentración no exige salvación
    const charNoConc = { id: 'char-2', activeEffects: [] };
    assert.equal(evaluateConcentrationOnDamage(charNoConc, 24), null);
  });

  await t.test('11. Evaluación y Explicación de Ventajas y Desventajas', () => {
    // Caso 1: Armadura sin competencia impone desventaja en ataques
    const nonProfChar = {
      proficiencies: { armor: ['light'], weapons: ['simple'] },
      inventory: [
        { name: 'Cota de malla', equipped: true, armor: { category: 'heavy' } },
      ],
      activeEffects: [],
    };
    const eval1 = evaluateAdvantage(nonProfChar, { checkType: 'attack' });
    assert.equal(eval1.state, 'disadvantage');
    assert.ok(eval1.disadvantages.some((d) => d.includes('Cota de malla')));
    assert.ok(eval1.summaryText.includes('Desventaja por:'));

    // Caso 2: Ventaja por efecto activo
    const blessedChar = {
      proficiencies: { armor: ['light', 'heavy'], weapons: ['simple'] },
      inventory: [],
      activeEffects: [
        { id: 'fx-adv', name: 'Invisibilidad', modifiers: [{ target: 'attack', op: 'advantage' }] },
      ],
    };
    const eval2 = evaluateAdvantage(blessedChar, { checkType: 'attack' });
    assert.equal(eval2.state, 'advantage');
    assert.equal(eval2.isCanceled, false);

    // Caso 3: Anulación mutua (Ventaja + Desventaja = Normal)
    const canceledChar = {
      proficiencies: { armor: ['light'], weapons: ['simple'] },
      inventory: [
        { name: 'Cota de malla', equipped: true, armor: { category: 'heavy' } }, // Desventaja
      ],
      activeEffects: [
        { id: 'fx-adv', name: 'Invisibilidad', modifiers: [{ target: 'attack', op: 'advantage' }] }, // Ventaja
      ],
    };
    const eval3 = evaluateAdvantage(canceledChar, { checkType: 'attack' });
    assert.equal(eval3.state, 'normal');
    assert.equal(eval3.isCanceled, true);
    assert.ok(eval3.summaryText.includes('anulan mutuamente'));
  });
});
