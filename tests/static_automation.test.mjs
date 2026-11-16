import assert from 'node:assert';
import { test } from 'node:test';
import {
  calculatePassivePerception,
  calculatePassiveInsight,
  calculatePassiveInvestigation,
  computeSpeed,
  recalculateCharacter,
} from '../src/scripts/dnd/calculations.ts';
import { getSpellSlotsForClass, getSpellcastingAbilityForClass, getCasterType } from '../src/scripts/dnd/spellSlots.ts';
import { computeCarryingCapacity, computeInventoryWeight, getItemWeightLb } from '../src/scripts/dnd/equipment.ts';
import { getClassDefinition, matchClass } from '../src/scripts/dnd/classes.ts';
import { defaultCharacter } from '../src/scripts/data/defaultCharacter.ts';

test('1. Sentidos Pasivos: Percepción, Perspicacia e Investigación', () => {
  const char = JSON.parse(JSON.stringify(defaultCharacter));
  // Atlas en defaultCharacter: SAB 15 (+2), prof en percepción (bono +3), total habilidad = 5.
  // PP = 10 + 5 = 15
  assert.strictEqual(calculatePassivePerception(char), 15);

  // Con ventaja en percepción (+5 regla 5e)
  char.activeEffects = [
    {
      id: 'eff-adv',
      name: 'Oído Aguzado',
      sourceType: 'feature',
      duration: { kind: 'permanent' },
      modifiers: [{ target: 'skill.perception', op: 'advantage' }],
    },
  ];
  assert.strictEqual(calculatePassivePerception(char), 20);

  // Con desventaja (-5 regla 5e)
  char.activeEffects = [
    {
      id: 'eff-dis',
      name: 'Niebla Densa',
      sourceType: 'condition',
      duration: { kind: 'permanent' },
      modifiers: [{ target: 'skill.perception', op: 'disadvantage' }],
    },
  ];
  assert.strictEqual(calculatePassivePerception(char), 10);
});

test('2. Velocidad: Casillas y Penalización por Armadura Pesada', () => {
  const char = JSON.parse(JSON.stringify(defaultCharacter));
  char.speedFt = 30;
  char.stats.str.score = 13;

  // Sin armadura pesada: 30 ft = 6 casillas
  const normal = computeSpeed(char);
  assert.strictEqual(normal.speedFt, 30);
  assert.strictEqual(normal.speedNote, '6 casillas');

  // Con Cota de Malla (FUE mín 13) y FUE 13: cumple requisito, no hay penalización
  char.inventory.push({
    id: 'chain-mail',
    name: 'Cota de malla',
    quantity: 1,
    category: 'armor',
    equipped: true,
    armor: { category: 'heavy', baseAc: 16, strMin: 13 },
  });
  const meetsStr = computeSpeed(char);
  assert.strictEqual(meetsStr.speedFt, 30);
  assert.strictEqual(meetsStr.speedNote, '6 casillas');

  // Con Placas (FUE mín 15) y FUE 13: no cumple requisito, resta 10 ft
  char.inventory = [
    {
      id: 'plate-armor',
      name: 'Armadura de placas',
      quantity: 1,
      category: 'armor',
      equipped: true,
      armor: { category: 'heavy', baseAc: 18, strMin: 15 },
    },
  ];
  const lowStr = computeSpeed(char);
  assert.strictEqual(lowStr.speedFt, 20);
  assert.ok(lowStr.speedNote.includes('4 casillas'));
  assert.ok(lowStr.speedNote.includes('-10 ft por armadura'));

  // Raza Enano: ignora penalización de armadura pesada
  char.race = 'Enano de las Colinas';
  const dwarfSpeed = computeSpeed(char);
  assert.strictEqual(dwarfSpeed.speedFt, 30);
  assert.strictEqual(dwarfSpeed.speedNote, '6 casillas');
});

test('3. Espacios de Conjuro Automáticos por Clase y Nivel', () => {
  // Mago Nivel 1: 2 slots de nivel 1
  const wizL1 = getSpellSlotsForClass('Mago', 1);
  assert.deepStrictEqual(wizL1, { 1: 2 });

  // Mago Nivel 5: 4 de nivel 1, 3 de nivel 2, 2 de nivel 3
  const wizL5 = getSpellSlotsForClass('Mago', 5);
  assert.strictEqual(wizL5[1], 4);
  assert.strictEqual(wizL5[2], 3);
  assert.strictEqual(wizL5[3], 2);
  assert.strictEqual(wizL5[4], undefined);

  // Paladín Nivel 5: 4 de nivel 1, 2 de nivel 2
  const palL5 = getSpellSlotsForClass('Paladín', 5);
  assert.strictEqual(palL5[1], 4);
  assert.strictEqual(palL5[2], 2);

  // Brujo Nivel 5: 2 slots de nivel 3 (Magia de Pacto)
  const lockL5 = getSpellSlotsForClass('Brujo', 5);
  assert.strictEqual(lockL5[3], 2);
  assert.strictEqual(lockL5[1], undefined);

  // Atributos de lanzamiento
  assert.strictEqual(getSpellcastingAbilityForClass('Mago'), 'int');
  assert.strictEqual(getSpellcastingAbilityForClass('Clérigo'), 'wis');
  assert.strictEqual(getSpellcastingAbilityForClass('Bardo'), 'cha');

  // Recalculate character actualiza los slots automáticamente
  const char = JSON.parse(JSON.stringify(defaultCharacter));
  char.className = 'Mago';
  char.level = 3;
  delete char.spellcasting.ability;
  recalculateCharacter(char);
  assert.strictEqual(char.spellcasting.slots[1].total, 4);
  assert.strictEqual(char.spellcasting.slots[2].total, 2);
  assert.strictEqual(char.spellcasting.ability, 'int');
});

test('4. Capacidad de Carga Oficial D&D 5e (FUE x 15 lb)', () => {
  const char = JSON.parse(JSON.stringify(defaultCharacter));
  char.stats.str.score = 14; // Capacidad = 14 * 15 = 210 lb
  char.inventory = [
    { id: 'i1', name: 'Cuerda', quantity: 2, weightLb: 10, category: 'gear' }, // 20 lb
    { id: 'i2', name: 'Raciones', quantity: 5, weightLb: 2, category: 'gear' }, // 10 lb
  ];

  const cap = computeCarryingCapacity(char);
  assert.strictEqual(cap.totalWeightLb, 30);
  assert.strictEqual(cap.maxCarryLb, 210);
  assert.strictEqual(cap.pushDragLiftLb, 420);
  assert.strictEqual(cap.isEncumbered, false);

  // Sobrecargado
  char.inventory.push({ id: 'i3', name: 'Tesoro Pesado', quantity: 1, weightLb: 190, category: 'treasure' });
  const capOver = computeCarryingCapacity(char);
  assert.strictEqual(capOver.totalWeightLb, 220);
  assert.strictEqual(capOver.isEncumbered, true);

  // Raza con Constitución Poderosa (Goliath/Orco): duplica capacidad
  char.race = 'Goliat';
  const goliathCap = computeCarryingCapacity(char);
  assert.strictEqual(goliathCap.maxCarryLb, 420);
  assert.strictEqual(goliathCap.isEncumbered, false);
});

test('5. Definiciones Canónicas de Clases: Dados, Salvaciones y Equipo', () => {
  const barbaro = getClassDefinition('Bárbaro');
  assert.strictEqual(barbaro?.hitDie, 'd12');
  assert.deepStrictEqual(barbaro?.savingThrows, ['str', 'con']);
  assert.ok(barbaro?.armorProficiencies.includes('medium'));

  const mago = getClassDefinition('Mago');
  assert.strictEqual(mago?.hitDie, 'd6');
  assert.deepStrictEqual(mago?.savingThrows, ['int', 'wis']);
  assert.strictEqual(mago?.armorProficiencies.length, 0);

  const picaro = getClassDefinition('Pícaro');
  assert.strictEqual(picaro?.hitDie, 'd8');
  assert.deepStrictEqual(picaro?.savingThrows, ['dex', 'int']);
});
