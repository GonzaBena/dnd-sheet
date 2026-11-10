import test from 'node:test';
import assert from 'node:assert/strict';
import { isOwnedBy, turnKey, peekNext, turnRelation, canEndTurn, nextTurn } from '../src/scripts/vtt/initiative.ts';

test('isOwnedBy — jerarquía ownerUid > characterId > name', () => {
  const viewer = { uid: 'u1', characterIds: ['c1'], characterNames: ['Thorin'] };

  // Por ownerUid
  assert.equal(isOwnedBy({ id: '1', name: 'X', ownerUid: 'u1' }, viewer), true);
  // Sin ownerUid pero con characterId
  assert.equal(isOwnedBy({ id: '2', name: 'X', characterId: 'c1' }, viewer), true);
  // Solo por nombre
  assert.equal(isOwnedBy({ id: '3', name: 'Thorin' }, viewer), true);
  // ownerUid de otro usuario aunque tenga el mismo nombre → false
  assert.equal(isOwnedBy({ id: '4', name: 'Thorin', ownerUid: 'u2' }, viewer), false);
});

test('turnKey — combate activo, inactivo o vacío', () => {
  assert.equal(turnKey(null), null);
  assert.equal(turnKey({ active: false, round: 1, turnIndex: 0, combatants: [{ id: 'a' }] }), null);
  assert.equal(turnKey({ active: true, round: 1, turnIndex: 0, combatants: [] }), null);
  assert.equal(
    turnKey({ active: true, round: 3, turnIndex: 1, combatants: [{ id: 'a' }, { id: 'b' }] }),
    '3:1:b'
  );
});

test('peekNext — medio, último y único combatiente', () => {
  assert.deepEqual(
    peekNext({ active: true, round: 2, turnIndex: 0, combatants: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }),
    { index: 1, round: 2 }
  );
  assert.deepEqual(
    peekNext({ active: true, round: 2, turnIndex: 2, combatants: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }),
    { index: 0, round: 3 }
  );
  assert.deepEqual(
    peekNext({ active: true, round: 1, turnIndex: 0, combatants: [{ id: 'a' }] }),
    { index: 0, round: 2 }
  );
});

test('turnRelation — mine, next, cambio de ronda, dos combatientes seguidos y null', () => {
  const viewer = { uid: 'u1', characterIds: ['c1'], characterNames: ['Thorin'] };

  // Mío
  const relMine = turnRelation(
    {
      active: true,
      round: 1,
      turnIndex: 0,
      combatants: [
        { id: '1', name: 'Thorin', ownerUid: 'u1' },
        { id: '2', name: 'Goblin', ownerUid: 'dm' },
      ],
    },
    viewer
  );
  assert.equal(relMine?.kind, 'mine');
  assert.equal(relMine?.key, '1:0:1');

  // Siguiente en la misma ronda
  const relNext = turnRelation(
    {
      active: true,
      round: 1,
      turnIndex: 0,
      combatants: [
        { id: '2', name: 'Goblin', ownerUid: 'dm' },
        { id: '1', name: 'Thorin', ownerUid: 'u1' },
      ],
    },
    viewer
  );
  assert.equal(relNext?.kind, 'next');
  assert.equal(relNext?.key, '1:1:1');

  // Siguiente en la ronda nueva (soy el primero y el turno está en el último)
  const relWrap = turnRelation(
    {
      active: true,
      round: 2,
      turnIndex: 1,
      combatants: [
        { id: '1', name: 'Thorin', ownerUid: 'u1' },
        { id: '2', name: 'Goblin', ownerUid: 'dm' },
      ],
    },
    viewer
  );
  assert.equal(relWrap?.kind, 'next');
  assert.equal(relWrap?.key, '3:0:1');

  // Dos combatientes míos seguidos → prioriza 'mine'
  const relDouble = turnRelation(
    {
      active: true,
      round: 1,
      turnIndex: 0,
      combatants: [
        { id: '1', name: 'Thorin', ownerUid: 'u1' },
        { id: '3', name: 'Lobo de Thorin', ownerUid: 'u1' },
      ],
    },
    viewer
  );
  assert.equal(relDouble?.kind, 'mine');
  assert.equal(relDouble?.combatant.id, '1');

  // Nada
  const relNone = turnRelation(
    {
      active: true,
      round: 1,
      turnIndex: 0,
      combatants: [
        { id: '2', name: 'Goblin 1', ownerUid: 'dm' },
        { id: '3', name: 'Goblin 2', ownerUid: 'dm' },
        { id: '1', name: 'Thorin', ownerUid: 'u1' },
      ],
    },
    viewer
  );
  assert.equal(relNone, null);
});

test('canEndTurn — solo por ownerUid', () => {
  assert.equal(
    canEndTurn(
      { active: true, round: 1, turnIndex: 0, combatants: [{ id: '1', name: 'Thorin', ownerUid: 'u1' }] },
      'u1'
    ),
    true
  );
  assert.equal(
    canEndTurn(
      { active: true, round: 1, turnIndex: 0, combatants: [{ id: '1', name: 'Thorin', characterId: 'c1' }] },
      'u1'
    ),
    false
  );
});

test('turnKey — cambia antes y después de avanzar turno (incluso con un solo combatiente)', () => {
  const initial = {
    active: true,
    round: 1,
    turnIndex: 0,
    combatants: [
      { id: '1', name: 'Thorin', ownerUid: 'u1' },
      { id: '2', name: 'Goblin' },
    ],
    updatedAt: 1,
  };
  const keyBefore = turnKey(initial);
  const afterStep = nextTurn(initial);
  const keyAfterStep = turnKey(afterStep);
  assert.notEqual(keyBefore, keyAfterStep);
  assert.equal(keyBefore, '1:0:1');
  assert.equal(keyAfterStep, '1:1:2');

  const afterWrap = nextTurn(afterStep);
  assert.notEqual(keyAfterStep, turnKey(afterWrap));
  assert.equal(turnKey(afterWrap), '2:0:1');
});

