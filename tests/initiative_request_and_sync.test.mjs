// tests/initiative_request_and_sync.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  syncCombatantsWithCharacters,
  applyDamage,
  sortCombatants,
} from '../src/scripts/vtt/initiative.ts';

test('1. Sincronización en vivo: actualiza Nombre, HP, MaxHP y CA de jugadores vivos', () => {
  const p1 = {
    id: 'pc-1',
    name: 'Thorin',
    initiative: 15,
    hp: 20,
    maxHp: 20,
    ac: 14,
    conditions: [],
    isPlayer: true,
    hiddenHp: false,
    characterId: 'char-thorin',
  };

  const monster = {
    id: 'm-1',
    name: 'Orco',
    initiative: 10,
    hp: 15,
    maxHp: 15,
    ac: 13,
    conditions: [],
    isPlayer: false,
    hiddenHp: true,
  };

  const initialCombat = {
    active: true,
    round: 1,
    turnIndex: 0,
    combatants: [p1, monster],
    updatedAt: 1000,
  };

  // Simulación: el jugador cambió su nombre, recibió daño en su ficha y aumentó su armadura
  const characters = [
    {
      id: 'char-thorin',
      name: 'Thorin Escudo de Roble',
      hp: { current: 12, max: 24, temp: 0 },
      armorClass: 16,
    },
  ];

  const res = syncCombatantsWithCharacters(initialCombat, characters);

  assert.equal(res.changed, true, 'Debe detectar cambios y devolver changed = true');
  const updatedP1 = res.combat.combatants.find((c) => c.id === 'pc-1');
  assert.ok(updatedP1, 'El combatiente debe existir');
  assert.equal(updatedP1.name, 'Thorin Escudo de Roble', 'Nombre debe concordar con la ficha real');
  assert.equal(updatedP1.hp, 12, 'Vida debe concordar con la ficha real');
  assert.equal(updatedP1.maxHp, 24, 'Vida máxima debe concordar con la ficha real');
  assert.equal(updatedP1.ac, 16, 'CA debe concordar con la ficha real');
  assert.equal(updatedP1.initiative, 15, 'Iniciativa se mantiene intacta');

  // El orco no debe modificarse
  const updatedMonster = res.combat.combatants.find((c) => c.id === 'm-1');
  assert.equal(updatedMonster.name, 'Orco');
  assert.equal(updatedMonster.hp, 15);
});

test('2. Sincronización: si no hay cambios, no muta ni reasigna innecesariamente', () => {
  const p1 = {
    id: 'pc-1',
    name: 'Elena',
    initiative: 20,
    hp: 18,
    maxHp: 18,
    ac: 15,
    conditions: [],
    isPlayer: true,
    hiddenHp: false,
    characterId: 'char-elena',
  };

  const initialCombat = {
    active: true,
    round: 1,
    turnIndex: 0,
    combatants: [p1],
    updatedAt: 1000,
  };

  const characters = [
    {
      id: 'char-elena',
      name: 'Elena',
      hp: { current: 18, max: 18, temp: 0 },
      armorClass: 15,
    },
  ];

  const res = syncCombatantsWithCharacters(initialCombat, characters);
  assert.equal(res.changed, false, 'No debe haber cambios si los datos concuerdan');
});

test('3. Sincronización preserva el turno activo cuando el nombre cambia', () => {
  const p1 = {
    id: 'pc-1',
    name: 'Zoe',
    initiative: 10,
    hp: 10,
    maxHp: 10,
    conditions: [],
    isPlayer: true,
    hiddenHp: false,
    characterId: 'char-zoe',
  };
  const p2 = {
    id: 'pc-2',
    name: 'Bob',
    initiative: 10,
    hp: 10,
    maxHp: 10,
    conditions: [],
    isPlayer: true,
    hiddenHp: false,
    characterId: 'char-bob',
  };

  // Turno activo en pc-1 (Zoe)
  const initialCombat = {
    active: true,
    round: 1,
    turnIndex: 1, // Zoe está en índice 1 (Bob es primero alfabéticamente)
    combatants: sortCombatants([p1, p2]),
    updatedAt: 1000,
  };

  // Zoe cambia su nombre a "Aaron" (ahora será primero alfabéticamente)
  const characters = [
    {
      id: 'char-zoe',
      name: 'Aaron',
      hp: { current: 10, max: 10, temp: 0 },
      armorClass: 10,
    },
  ];

  const res = syncCombatantsWithCharacters(initialCombat, characters);
  assert.equal(res.changed, true);
  // El combatiente activo pc-1 ahora debe estar en turnIndex = 0 tras reordenar
  const activeId = res.combat.combatants[res.combat.turnIndex]?.id;
  assert.equal(activeId, 'pc-1', 'El turno activo debe conservarse en el mismo combatiente');
});

test('4. Daño aplicado respeta límites de 0 a MaxHP', () => {
  const p1 = {
    id: 'pc-1',
    name: 'Guerrero',
    initiative: 12,
    hp: 10,
    maxHp: 25,
    conditions: [],
    isPlayer: true,
    hiddenHp: false,
  };

  const damaged = applyDamage(p1, -15);
  assert.equal(damaged.hp, 0, 'HP no puede ser menor a 0');

  const healed = applyDamage(p1, 50);
  assert.equal(healed.hp, 25, 'HP no puede superar maxHp');
});
