import test from 'node:test';
import assert from 'node:assert/strict';
import { computeStat, matchesStatTarget } from '../src/scripts/dnd/stats.ts';
import { recalculateCharacter } from '../src/scripts/dnd/calculations.ts';
import { validSlotsFor, wornSlotsFor } from '../src/scripts/dnd/equipment.ts';
import { defaultCharacter } from '../src/scripts/data/defaultCharacter.ts';
import { characterStore } from '../src/scripts/state/characterStore.ts';
import { parseEffectsText } from '../src/scripts/dnd/catalog.ts';
import { targetsMatch } from '../src/scripts/dnd/effects.ts';

test('matchesStatTarget reconoce alias en inglés y español para todas las características', () => {
  assert.equal(matchesStatTarget('wis', 'wis'), true);
  assert.equal(matchesStatTarget('sab', 'wis'), true);
  assert.equal(matchesStatTarget('stat.wis', 'wis'), true);
  assert.equal(matchesStatTarget('stats.sab', 'wis'), true);
  assert.equal(matchesStatTarget('ability.sabiduria', 'wis'), true);
  assert.equal(matchesStatTarget('str', 'wis'), false);

  assert.equal(matchesStatTarget('fue', 'str'), true);
  assert.equal(matchesStatTarget('fuerza', 'str'), true);
  assert.equal(matchesStatTarget('des', 'dex'), true);
  assert.equal(matchesStatTarget('destreza', 'dex'), true);
  assert.equal(matchesStatTarget('con', 'con'), true);
  assert.equal(matchesStatTarget('int', 'int'), true);
  assert.equal(matchesStatTarget('car', 'cha'), true);
});

test('computeStat: sabiduría base 19 con túnica "wis add 1" equipada sube a 20 con mod +5', () => {
  const char = {
    stats: {
      wis: { score: 19, baseScore: 19, modifier: 4, savingProficient: false },
    },
    inventory: [
      {
        id: 'robe-1',
        name: 'Túnica de Sabiduría',
        quantity: 1,
        category: 'armor',
        equipped: true,
        slot: 'cloak',
        effects: [{ target: 'wis', op: 'add', value: 1 }],
      },
    ],
  };

  const res = computeStat(char, 'wis');
  assert.equal(res.base, 19);
  assert.equal(res.total, 20);
  assert.equal(res.modifier, 5);
  assert.equal(res.hasModifiers, true);
  assert.equal(res.parts.length, 2);
  assert.equal(res.parts[0].label, 'Base');
  assert.equal(res.parts[0].value, 19);
  assert.equal(res.parts[1].value, 1);
});

test('computeStat: un objeto no equipado o sin sintonizar no aporta su bono', () => {
  const char = {
    stats: {
      wis: { score: 19, baseScore: 19, modifier: 4, savingProficient: false },
    },
    inventory: [
      {
        id: 'robe-1',
        name: 'Túnica',
        quantity: 1,
        category: 'armor',
        equipped: false,
        effects: [{ target: 'wis', op: 'add', value: 1 }],
      },
      {
        id: 'ring-attuned',
        name: 'Anillo Místico',
        quantity: 1,
        category: 'gear',
        equipped: true,
        slot: 'ring1',
        requiresAttunement: true,
        attuned: false, // sin sintonizar
        effects: [{ target: 'wis', op: 'add', value: 2 }],
      },
    ],
  };

  const res = computeStat(char, 'wis');
  assert.equal(res.total, 19);
  assert.equal(res.modifier, 4);
  assert.equal(res.hasModifiers, false);
});

test('computeStat: efecto "set" (fijar en 19 como Diadema de Intelecto o Guanteletes de Ogro)', () => {
  const char = {
    stats: {
      str: { score: 12, baseScore: 12, modifier: 1, savingProficient: false },
    },
    inventory: [
      {
        id: 'gauntlets',
        name: 'Guanteletes de Poder de Ogro',
        quantity: 1,
        category: 'gear',
        equipped: true,
        slot: 'gloves',
        effects: [{ target: 'str', op: 'set', value: 19 }],
      },
    ],
  };

  const res = computeStat(char, 'str');
  assert.equal(res.base, 12);
  assert.equal(res.total, 19);
  assert.equal(res.modifier, 4);
  assert.equal(res.hasModifiers, true);

  // Si la fuerza base ya era 20, un set 19 no la reduce
  const charStrong = {
    stats: {
      str: { score: 20, baseScore: 20, modifier: 5, savingProficient: false },
    },
    inventory: char.inventory,
  };
  const resStrong = computeStat(charStrong, 'str');
  assert.equal(resStrong.total, 20);
  assert.equal(resStrong.modifier, 5);
});

test('recalculateCharacter: ciclo de equipar y desequipar es reversible e idempotente', () => {
  const char = JSON.parse(JSON.stringify(defaultCharacter));
  char.stats.wis.score = 19;
  delete char.stats.wis.baseScore;

  // 1. Recálculo inicial sin túnica: inicializa baseScore a 19
  recalculateCharacter(char);
  assert.equal(char.stats.wis.baseScore, 19);
  assert.equal(char.stats.wis.score, 19);
  assert.equal(char.stats.wis.modifier, 4);

  // 2. Se equipa la túnica con wis add 1
  const robe = {
    id: 'test-robe',
    name: 'Túnica de Sabiduría',
    quantity: 1,
    category: 'armor',
    equipped: true,
    slot: 'cloak',
    effects: [{ target: 'wis', op: 'add', value: 1 }],
  };
  char.inventory.push(robe);

  recalculateCharacter(char);
  assert.equal(char.stats.wis.baseScore, 19);
  assert.equal(char.stats.wis.score, 20);
  assert.equal(char.stats.wis.modifier, 5);

  // La habilidad de Percepción (stat: wis) escala automáticamente
  const perception = char.skills.find((s) => s.id === 'perception');
  assert.ok(perception);
  assert.equal(perception.value, 5 + (perception.proficient ? char.proficiencyBonus : 0) + (perception.expertise ? char.proficiencyBonus : 0) + (perception.customBonus || 0));

  // 3. Se desequipa la túnica
  robe.equipped = false;
  recalculateCharacter(char);
  assert.equal(char.stats.wis.baseScore, 19);
  assert.equal(char.stats.wis.score, 19);
  assert.equal(char.stats.wis.modifier, 4);
});

test('equipment: Túnica y Robe son válidas tanto para cuerpo como para capa', () => {
  const tunicaSinSlot = {
    id: 't-1',
    name: 'Túnica Arcana',
    quantity: 1,
    category: 'armor',
  };

  const slots = validSlotsFor(tunicaSinSlot);
  assert.ok(slots.includes('body'));
  assert.ok(slots.includes('cloak'));

  const worn = wornSlotsFor(tunicaSinSlot);
  assert.ok(worn.includes('body'));
  assert.ok(worn.includes('cloak'));

  // Si tiene equipSlot explícito a cloak, validSlotsFor devuelve ['cloak']
  const tunicaCapa = { ...tunicaSinSlot, equipSlot: 'cloak' };
  assert.deepEqual(validSlotsFor(tunicaCapa), ['cloak']);
  assert.deepEqual(wornSlotsFor(tunicaCapa), ['cloak']);
});

test('characterStore: cambiar equipSlot de un objeto equipado lo desequipa de la ranura vieja', () => {
  const char = JSON.parse(JSON.stringify(defaultCharacter));
  char.inventory.push({
    id: 'robe-test-switch',
    name: 'Túnica Élfica',
    quantity: 1,
    category: 'armor',
    equipped: true,
    slot: 'body',
    equipSlot: 'body',
  });

  characterStore.loadCharacter(char);

  // Comprobar que está equipado en 'body'
  const before = characterStore.get().inventory.find((i) => i.id === 'robe-test-switch');
  assert.equal(before?.equipped, true);
  assert.equal(before?.slot, 'body');

  // El usuario edita el objeto y cambia su ranura a 'cloak'
  characterStore.updateInventoryItem('robe-test-switch', { equipSlot: 'cloak' });

  const after = characterStore.get().inventory.find((i) => i.id === 'robe-test-switch');
  assert.equal(after?.equipSlot, 'cloak');
  // Se desequipó limpiamente de 'body' para no quedar en incoherencia
  assert.equal(after?.equipped, false);
  assert.equal(after?.slot, undefined);

  // Ahora se puede equipar directamente en 'cloak'
  const equipRes = characterStore.equipItem('robe-test-switch', 'cloak');
  assert.equal(equipRes.error, undefined);

  const finalItem = characterStore.get().inventory.find((i) => i.id === 'robe-test-switch');
  assert.equal(finalItem?.equipped, true);
  assert.equal(finalItem?.slot, 'cloak');
});

test('Glamour Sobrenatural: efecto "check.cha add wis" escala dinámicamente con la Sabiduría', () => {
  const char = JSON.parse(JSON.stringify(defaultCharacter));
  char.stats.wis.score = 16;
  char.stats.wis.baseScore = 16;
  char.stats.wis.modifier = 3;

  char.stats.cha.score = 8;
  char.stats.cha.baseScore = 8;
  char.stats.cha.modifier = -1;

  // Persuasión no competente: inicialmente -1
  recalculateCharacter(char);
  const persBefore = char.skills.find((s) => s.id === 'persuasion');
  assert.equal(persBefore.value, -1);

  // Se añade efecto activo Glamour Sobrenatural: "check.cha add wis"
  char.activeEffects.push({
    id: 'glamour-sobrenatural',
    name: 'Glamour Sobrenatural',
    sourceType: 'feat',
    duration: { kind: 'indefinite' },
    modifiers: [{ target: 'check.cha', op: 'add', value: 'wis' }],
    appliedAt: Date.now(),
  });

  recalculateCharacter(char);
  const persAfter = char.skills.find((s) => s.id === 'persuasion');
  // -1 (CAR) + 3 (SAB) = +2
  assert.equal(persAfter.value, 2);

  const deception = char.skills.find((s) => s.id === 'deception');
  // Engaño también se beneficia automáticamente
  assert.equal(deception.value, 2);

  // Si la Sabiduría sube a 20 (mod +5), Persuasión escala automáticamente a +4
  char.stats.wis.baseScore = 20;
  recalculateCharacter(char);
  const persBoosted = char.skills.find((s) => s.id === 'persuasion');
  assert.equal(persBoosted.value, 4);

  // Límite de 20: si se intenta poner 22, se trunca a 20 y el bono no pasa de +5
  char.stats.wis.baseScore = 22;
  recalculateCharacter(char);
  assert.equal(char.stats.wis.score, 20);
  assert.equal(char.stats.wis.modifier, 5);
  const persCapped = char.skills.find((s) => s.id === 'persuasion');
  assert.equal(persCapped.value, 4);
});

test('Rasgo pasivo en features y efecto "car set sab": Carisma adopta la puntuación de Sabiduría', () => {
  const char = JSON.parse(JSON.stringify(defaultCharacter));
  char.stats.wis.score = 20;
  char.stats.wis.baseScore = 20;
  char.stats.wis.modifier = 5;

  char.stats.cha.score = 8;
  char.stats.cha.baseScore = 8;
  char.stats.cha.modifier = -1;

  // Añadido como rasgo pasivo en char.features
  char.features = [
    {
      title: 'Sustitución de Carisma',
      description: 'Permite usar sabiduría cuando necesito carisma',
      source: 'subclass',
      enabled: true,
      featType: 'passive',
      effects: [{ target: 'car', op: 'set', value: 'sab' }],
    },
  ];

  recalculateCharacter(char);
  assert.equal(char.stats.cha.score, 20);
  assert.equal(char.stats.cha.modifier, 5);

  const pers = char.skills.find((s) => s.id === 'persuasion');
  // Al ser Carisma 20 (+5), Persuasión pasa de -1 a +5
  assert.equal(pers.value, 5);
});

test('Flexibilidad de sintaxis: acepta alias y prefijos como pruebas.car, check.car + sab, mod.sab y +5', () => {
  // Operadores flexibles (+, =, add, set)
  assert.deepEqual(parseEffectsText('check.car + sab'), [{ target: 'check.car', op: 'add', value: 'wis' }]);
  assert.deepEqual(parseEffectsText('car = sab'), [{ target: 'car', op: 'set', value: 'wis' }]);
  assert.deepEqual(parseEffectsText('check.car add mod.sab'), [{ target: 'check.car', op: 'add', value: 'wis' }]);
  assert.deepEqual(parseEffectsText('check.car add +sab'), [{ target: 'check.car', op: 'add', value: 'wis' }]);
  assert.deepEqual(parseEffectsText('check.car add + 5'), [{ target: 'check.car', op: 'add', value: 5 }]);
  assert.deepEqual(parseEffectsText('check.car add +5'), [{ target: 'check.car', op: 'add', value: 5 }]);

  // Coincidencia de prefijos en español y plurales
  assert.equal(targetsMatch('checks.car', 'check.cha'), true);
  assert.equal(targetsMatch('pruebas.car', 'check.cha'), true);
  assert.equal(targetsMatch('prueba.carisma', 'check.cha'), true);
  assert.equal(targetsMatch('salvacion.des', 'save.dex'), true);
  assert.equal(targetsMatch('salvaciones.con', 'save.con'), true);
});

test('Límite de regla: stats tienen tope de 20 (base, con/sin modificadores)', () => {
  // 1. Base score mayor de 20 queda acotado a 20
  const charBaseOver = {
    stats: {
      str: { score: 24, baseScore: 24, modifier: 7 },
    },
  };
  const resBase = computeStat(charBaseOver, 'str');
  assert.equal(resBase.base, 20);
  assert.equal(resBase.total, 20);
  assert.equal(resBase.modifier, 5);

  // 2. Modificadores 'add' que suman más de 20 quedan limitados a 20 con ajuste en parts
  const charAddOver = {
    stats: {
      str: { score: 18, baseScore: 18, modifier: 4 },
    },
    inventory: [
      {
        id: 'belt-giant',
        name: 'Cinturón de Fuerza',
        quantity: 1,
        category: 'gear',
        equipped: true,
        slot: 'belt',
        effects: [{ target: 'str', op: 'add', value: 5 }], // 18 + 5 = 23 -> cap 20
      },
    ],
  };
  const resAdd = computeStat(charAddOver, 'str');
  assert.equal(resAdd.base, 18);
  assert.equal(resAdd.total, 20);
  assert.equal(resAdd.modifier, 5);
  assert.equal(resAdd.hasModifiers, true);
  // Parts incluye Base (18), Cinturón (+5) y Ajuste de tope de regla (-3)
  const capPart = resAdd.parts.find((p) => p.label.includes('Tope de regla') || p.label.includes('Máximo 20'));
  assert.ok(capPart);
  assert.equal(capPart.value, -3);

  // 3. Efecto 'set' con valor > 20 queda acotado a 20
  const charSetOver = {
    stats: {
      int: { score: 12, baseScore: 12, modifier: 1 },
    },
    activeEffects: [
      {
        id: 'godly-intellect',
        name: 'Intelecto Divino',
        modifiers: [{ target: 'int', op: 'set', value: 25 }],
      },
    ],
  };
  const resSet = computeStat(charSetOver, 'int');
  assert.equal(resSet.base, 12);
  assert.equal(resSet.total, 20);
  assert.equal(resSet.modifier, 5);
});



