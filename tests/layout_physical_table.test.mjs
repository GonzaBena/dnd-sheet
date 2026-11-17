// tests/layout_physical_table.test.mjs
// Pruebas unitarias para el Modo Mesa Física (Spec 14, H7, Fase A)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { characterStore } from '../src/scripts/state/characterStore.ts';
import { defaultCharacter } from '../src/scripts/data/defaultCharacter.ts';

test('Modo Mesa Física: setViewMode y getViewMode actualizan layoutConfig correctamente', () => {
  const char = JSON.parse(JSON.stringify(defaultCharacter));
  char.id = 'test-view-mode-char';
  characterStore.loadCharacter(char, true);

  assert.equal(characterStore.getViewMode(), 'standard');

  characterStore.setViewMode('table');
  assert.equal(characterStore.getViewMode(), 'table');
  assert.equal(characterStore.get().layoutConfig?.viewMode, 'table');

  characterStore.setViewMode('standard');
  assert.equal(characterStore.getViewMode(), 'standard');
  assert.equal(characterStore.get().layoutConfig?.viewMode, 'standard');
});

test('Modo Mesa Física: matriz de slots táctiles (niveles 1 a 9) consume y recupera ranuras', () => {
  const char = JSON.parse(JSON.stringify(defaultCharacter));
  char.id = 'test-slots-char';
  char.className = 'Mago';
  char.level = 5;
  char.spellcasting = {
    ability: 'int',
    saveDc: 14,
    attackBonus: 6,
    slots: {
      1: { total: 4, used: 0 },
      2: { total: 3, used: 1 },
      3: { total: 2, used: 2 },
    },
    spells: []
  };
  characterStore.loadCharacter(char, true);

  // Gastar slot de nivel 1
  characterStore.useSpellSlot(1);
  assert.equal(characterStore.get().spellcasting.slots[1].used, 1);

  characterStore.useSpellSlot(1);
  assert.equal(characterStore.get().spellcasting.slots[1].used, 2);

  // Recuperar slot de nivel 1
  characterStore.restoreSpellSlot(1);
  assert.equal(characterStore.get().spellcasting.slots[1].used, 1);

  // Nivel 3 ya estaba lleno (2/2): gastar no debe exceder total
  characterStore.useSpellSlot(3);
  assert.equal(characterStore.get().spellcasting.slots[3].used, 2);

  // Recuperar de nivel 3
  characterStore.restoreSpellSlot(3);
  assert.equal(characterStore.get().spellcasting.slots[3].used, 1);
});

test('Modo Mesa Física: recursos de clase se consumen y recuperan con precisión', () => {
  const char = JSON.parse(JSON.stringify(defaultCharacter));
  char.id = 'test-res-char';
  char.resources = [
    { id: 'rage', name: 'Furia', max: 3, used: 0, rechargeOn: 'long', source: 'class' },
    { id: 'ki', name: 'Puntos Ki', max: 5, used: 2, rechargeOn: 'short', source: 'class' }
  ];
  characterStore.loadCharacter(char, true);

  // Gastar Furia
  characterStore.spendResource('rage', 1);
  assert.equal(characterStore.get().resources[0].used, 1);

  // Recuperar Furia
  characterStore.recoverResource('rage', 1);
  assert.equal(characterStore.get().resources[0].used, 0);

  // Gastar más del máximo Ki no excede max (5)
  characterStore.spendResource('ki', 10);
  assert.equal(characterStore.get().resources[1].used, 5);

  // Recuperar Ki por debajo de 0 no desciende
  characterStore.recoverResource('ki', 10);
  assert.equal(characterStore.get().resources[1].used, 0);
});

test('Modo Mesa Física: modificación táctil de PG respeta límites y salud temporal', () => {
  const char = JSON.parse(JSON.stringify(defaultCharacter));
  char.id = 'test-hp-char';
  char.hp = { current: 30, max: 40, temp: 5 };
  characterStore.loadCharacter(char, true);

  // Daño de 3 absorbe primero vida temporal
  characterStore.modifyHp(-3);
  assert.equal(characterStore.get().hp.temp, 2);
  assert.equal(characterStore.get().hp.current, 30);

  // Daño de 5 absorbe los 2 temp restantes y 3 de salud real
  characterStore.modifyHp(-5);
  assert.equal(characterStore.get().hp.temp, 0);
  assert.equal(characterStore.get().hp.current, 27);

  // Curar 10 no excede el máximo (40)
  characterStore.modifyHp(20);
  assert.equal(characterStore.get().hp.current, 40);

  // Daño masivo no baja de 0
  characterStore.modifyHp(-100);
  assert.equal(characterStore.get().hp.current, 0);
});
