// tests/initiative.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sortCombatants,
  insertCombatant,
  removeCombatant,
  nextTurn,
  prevTurn,
  duplicateCombatant,
  applyDamage,
  visibleHp,
  syncCombatantsWithCharacters,
  areAllPlayersInInitiative,
  findCombatantByToken,
  currentTurnCombatant,
  computeAutoLinks,
} from '../src/scripts/vtt/initiative.ts';

function combatant(id, name, initiative, isPlayer = false, hiddenHp = true, ownerUid = null) {
  return {
    id,
    name,
    initiative,
    hp: 10,
    maxHp: 10,
    conditions: [],
    isPlayer,
    hiddenHp,
    ownerUid,
  };
}

function baseCombat(combatants = []) {
  return {
    active: true,
    round: 1,
    turnIndex: 0,
    combatants: sortCombatants(combatants),
    updatedAt: 1,
  };
}

test('sortCombatants orders by initiative DESC and resolves ties', () => {
  const p1 = combatant('p1', 'Zoe', 15, true); // Jugador
  const m1 = combatant('m1', 'Goblin', 15, false); // Monstruo mismo valor
  const p2 = combatant('p2', 'Alice', 15, true); // Jugador mismo valor pero nombre A
  const m2 = combatant('m2', 'Orco', 20, false); // Mayor iniciativa
  const p3 = combatant('p3', 'Bob', 5, true); // Menor iniciativa

  const sorted = sortCombatants([p1, m1, p2, m2, p3]);

  // 1: m2 (20)
  assert.equal(sorted[0].id, 'm2');
  // 2 y 3: p2 (Alice) y p1 (Zoe) empatados en 15 con jugador prioritario
  assert.equal(sorted[1].id, 'p2');
  assert.equal(sorted[2].id, 'p1');
  // 4: m1 (Goblin 15 monstruo)
  assert.equal(sorted[3].id, 'm1');
  // 5: p3 (Bob 5)
  assert.equal(sorted[4].id, 'p3');
});

test('nextTurn and prevTurn manage rounds and cyclic turns', () => {
  const c1 = combatant('c1', 'A', 20);
  const c2 = combatant('c2', 'B', 15);
  const c3 = combatant('c3', 'C', 10);
  let c = baseCombat([c1, c2, c3]);

  assert.equal(c.turnIndex, 0);
  assert.equal(c.round, 1);

  // Turno 2
  c = nextTurn(c);
  assert.equal(c.turnIndex, 1);
  assert.equal(c.round, 1);

  // Turno 3
  c = nextTurn(c);
  assert.equal(c.turnIndex, 2);
  assert.equal(c.round, 1);

  // Vuelve al primero y suma ronda
  c = nextTurn(c);
  assert.equal(c.turnIndex, 0);
  assert.equal(c.round, 2);

  // Retrocede
  c = prevTurn(c);
  assert.equal(c.turnIndex, 2);
  assert.equal(c.round, 1);

  c = prevTurn(c);
  assert.equal(c.turnIndex, 1);
  assert.equal(c.round, 1);
});

test('insertCombatant and removeCombatant preserve active combatant turn', () => {
  const c1 = combatant('c1', 'C1', 20);
  const c2 = combatant('c2', 'C2', 15);
  const c3 = combatant('c3', 'C3', 10);
  let c = baseCombat([c1, c2, c3]);

  // Supongamos que el turno está en c2 (índice 1)
  c = nextTurn(c);
  assert.equal(c.turnIndex, 1);
  assert.equal(c.combatants[c.turnIndex].id, 'c2');

  // Insertar un combatiente con iniciativa 25 (antes de c2)
  const cNew = combatant('cNew', 'Boss', 25);
  c = insertCombatant(c, cNew);

  // Boss pasa a índice 0, c1 a índice 1, c2 a índice 2
  assert.equal(c.combatants[c.turnIndex].id, 'c2');
  assert.equal(c.turnIndex, 2);

  // Eliminar un combatiente que estaba antes de c2 (Boss)
  c = removeCombatant(c, 'cNew');
  assert.equal(c.combatants[c.turnIndex].id, 'c2');
  assert.equal(c.turnIndex, 1);

  // Eliminar el que está en turno actual (c2)
  c = removeCombatant(c, 'c2');
  // Pasa al siguiente que estaba después (c3, ahora en índice 1)
  assert.equal(c.combatants[c.turnIndex].id, 'c3');
});

test('duplicateCombatant renames original to 1 and generates sequential copies with independent IDs', () => {
  const g = combatant('g1', 'Goblin', 12, false, true);
  let c = baseCombat([g]);

  c = duplicateCombatant(c, 'g1', 2); // Deberían haber 3: Goblin 1, Goblin 2, Goblin 3

  assert.equal(c.combatants.length, 3);
  const names = c.combatants.map(x => x.name);
  assert.deepEqual(names, ['Goblin 1', 'Goblin 2', 'Goblin 3']);

  // Modificar condiciones o PG de uno no afecta a los otros
  const originalModified = applyDamage(c.combatants[0], -5);
  assert.equal(originalModified.hp, 5);
  assert.equal(c.combatants[1].hp, 10);
  assert.equal(c.combatants[2].hp, 10);
});

test('applyDamage clamps between 0 and maxHp', () => {
  const c = combatant('c1', 'Guerrero', 10);
  c.hp = 10;
  c.maxHp = 20;

  // Curar +5
  const healed = applyDamage(c, 5);
  assert.equal(healed.hp, 15);

  // Sobrecurar más de maxHp (20)
  const overHealed = applyDamage(c, 30);
  assert.equal(overHealed.hp, 20);

  // Daño -8
  const damaged = applyDamage(c, -8);
  assert.equal(damaged.hp, 2);

  // Daño letal menor a 0
  const killed = applyDamage(c, -50);
  assert.equal(killed.hp, 0);
});

test('visibleHp respects DM, character ownership and hiddenHp', () => {
  const playerChar = combatant('c-p', 'Elena', 15, true, false, 'uid-elena');
  const monsterSecret = combatant('c-m1', 'Goblin', 10, false, true, null);
  const monsterRevealed = combatant('c-m2', 'Dragón', 10, false, false, null);

  // DM ve todo
  assert.deepEqual(visibleHp(playerChar, { uid: 'uid-dm', isDm: true }), { hp: 10, maxHp: 10 });
  assert.deepEqual(visibleHp(monsterSecret, { uid: 'uid-dm', isDm: true }), { hp: 10, maxHp: 10 });

  // Dueño de ficha ve sus propios PG
  assert.deepEqual(visibleHp(playerChar, { uid: 'uid-elena', isDm: false }), { hp: 10, maxHp: 10 });

  // Otro jugador ve jugador con hiddenHp: false
  assert.deepEqual(visibleHp(playerChar, { uid: 'uid-otro', isDm: false }), { hp: 10, maxHp: 10 });

  // Jugador NO ve monstruo secreto
  assert.equal(visibleHp(monsterSecret, { uid: 'uid-elena', isDm: false }), null);

  // Jugador SÍ ve monstruo revelado
  assert.deepEqual(visibleHp(monsterRevealed, { uid: 'uid-elena', isDm: false }), { hp: 10, maxHp: 10 });
});

test('syncCombatantsWithCharacters synchronizes player name, HP, maxHp and AC in real time', () => {
  const p1 = {
    ...combatant('c-p1', 'Thorin', 18, true, false, 'uid-1'),
    characterId: 'char-thorin',
    ac: 14,
  };
  const m1 = {
    ...combatant('c-m1', 'Goblin 1', 12, false, true, null),
    ac: 13,
  };

  const initialCombat = baseCombat([p1, m1]);

  // Personaje vivo con nombre actualizado, daño recibido y CA mayor
  const liveCharacters = [
    {
      id: 'char-thorin',
      name: 'Thorin Escudo de Roble',
      hp: { current: 15, max: 28, temp: 0 },
      armorClass: 16,
    },
  ];

  const result = syncCombatantsWithCharacters(initialCombat, liveCharacters);

  assert.equal(result.changed, true);
  const syncedThorin = result.combat.combatants.find((c) => c.id === 'c-p1');
  assert.ok(syncedThorin);
  assert.equal(syncedThorin.name, 'Thorin Escudo de Roble');
  assert.equal(syncedThorin.hp, 15);
  assert.equal(syncedThorin.maxHp, 28);
  assert.equal(syncedThorin.ac, 16);
  assert.equal(syncedThorin.initiative, 18); // Iniciativa preservada

  // El monstruo no debe haber sido tocado
  const goblin = result.combat.combatants.find((c) => c.id === 'c-m1');
  assert.ok(goblin);
  assert.equal(goblin.name, 'Goblin 1');
  assert.equal(goblin.hp, 10);

  // Segunda pasada sin cambios debe devolver changed: false
  const noChangeResult = syncCombatantsWithCharacters(result.combat, liveCharacters);
  assert.equal(noChangeResult.changed, false);
});

test('areAllPlayersInInitiative returns false if combat is null or inactive', () => {
  assert.equal(areAllPlayersInInitiative(null, [{ id: 'p1', name: 'Roland' }]), false);
  assert.equal(areAllPlayersInInitiative({ active: false, combatants: [] }, [{ id: 'p1' }]), false);
});

test('areAllPlayersInInitiative: hides "Pedir Iniciativa" when all campaign characters are in initiative list', () => {
  const campaignChars = [
    { id: 'char-roland', name: 'Roland' },
    { id: 'char-lyra', name: 'Lyra' },
  ];

  // Caso 1: Solo Roland en combate -> Faltan jugadores (false)
  const c1 = baseCombat([
    { ...combatant('pc-char-roland', 'Roland', 10, true), characterId: 'char-roland' },
    combatant('m1', 'Goblin', 12, false),
  ]);
  assert.equal(
    areAllPlayersInInitiative(c1, campaignChars),
    false,
    'Debe retornar false si falta Lyra en el orden de combate'
  );

  // Caso 2: Roland y Lyra ambos en combate -> Todos presentes (true)
  const c2 = baseCombat([
    { ...combatant('pc-char-roland', 'Roland', 10, true), characterId: 'char-roland' },
    { ...combatant('pc-char-lyra', 'Lyra', 14, true), characterId: 'char-lyra' },
    combatant('m1', 'Goblin', 12, false),
  ]);
  assert.equal(
    areAllPlayersInInitiative(c2, campaignChars),
    true,
    'Debe retornar true si todos los personajes de la campaña están en iniciativa'
  );

  // Caso 3: Campaña con solo Roland (como en la captura del usuario)
  const singleCharCampaign = [{ id: 'char-roland', name: 'Roland' }];
  assert.equal(
    areAllPlayersInInitiative(c1, singleCharCampaign),
    true,
    'Debe retornar true cuando el único jugador de la campaña ya está en iniciativa'
  );

  // Caso 4: Resolución por nombre o prefijo de ID
  const c4 = baseCombat([
    { ...combatant('pc-char-roland-12345', 'Roland', 10, true) },
  ]);
  assert.equal(
    areAllPlayersInInitiative(c4, singleCharCampaign),
    true,
    'Debe resolver por nombre o prefijo de ID pc-<id>'
  );
});


