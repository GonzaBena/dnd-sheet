// tests/combatant_token.test.mjs
// Enlace combatiente ↔ token (T-55, RF-05 y RF-25).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findCombatantByToken,
  currentTurnCombatant,
  computeAutoLinks,
  visibleHp,
} from '../src/scripts/vtt/initiative.ts';
import { buildTokenCardData } from '../src/scripts/vtt/tokenCard.ts';

const mk = (id, extra = {}) => ({
  id,
  name: id,
  initiative: 10,
  hp: 7,
  maxHp: 10,
  conditions: [],
  isPlayer: false,
  hiddenHp: true,
  ...extra,
});

const combat = (combatants, turnIndex = 0, active = true) => ({ active, round: 1, turnIndex, combatants, updatedAt: 1 });

test('findCombatantByToken encuentra por tokenId y devuelve null si no hay enlace', () => {
  const c = combat([mk('goblin', { tokenId: 't1' }), mk('orco')]);
  assert.equal(findCombatantByToken(c, 't1')?.id, 'goblin');
  assert.equal(findCombatantByToken(c, 't2'), null);
  assert.equal(findCombatantByToken(c, undefined), null);
  assert.equal(findCombatantByToken(null, 't1'), null);
});

test('currentTurnCombatant respeta turnIndex y que el combate esté activo', () => {
  const list = [mk('a'), mk('b')];
  assert.equal(currentTurnCombatant(combat(list, 1))?.id, 'b');
  assert.equal(currentTurnCombatant(combat(list, 1, false)), null);
  assert.equal(currentTurnCombatant(null), null);
});

test('computeAutoLinks enlaza jugadores por characterId sin repetir tokens', () => {
  const c = combat([
    mk('pc-1', { isPlayer: true, characterId: 'char-1' }),
    mk('pc-2', { isPlayer: true, characterId: 'char-2', tokenId: 't-ya' }),
    mk('npc'),
  ]);
  const tokens = { tA: { characterId: 'char-1' }, tB: { characterId: 'char-2' }, tC: {} };
  assert.deepEqual(computeAutoLinks(c, tokens), [{ combatantId: 'pc-1', tokenId: 'tA' }]);
  assert.deepEqual(computeAutoLinks(c, {}), []);
  assert.deepEqual(computeAutoLinks(null, tokens), []);
});

test('buildTokenCardData: jugador ve nombre y condiciones del goblin oculto pero no sus PG', () => {
  const c = combat([mk('goblin', { tokenId: 't1', conditions: ['poisoned'] })]);
  const token = { name: 'Goblin' };
  const asPlayer = buildTokenCardData(c, 't1', token, { uid: 'p', isDm: false });
  assert.deepEqual(asPlayer, { name: 'Goblin', hp: null, conditions: ['poisoned'], linked: true });
  const asDm = buildTokenCardData(c, 't1', token, { uid: 'dm', isDm: true });
  assert.deepEqual(asDm.hp, { hp: 7, maxHp: 10 });
  const unlinked = buildTokenCardData(c, 'otro', token, { uid: 'p', isDm: false });
  assert.deepEqual(unlinked, { name: 'Goblin', hp: null, conditions: [], linked: false });
});

test('un goblin oculto: el jugador ve el combatiente pero no sus PG; el DM sí', () => {
  const goblin = mk('goblin', { tokenId: 't1', conditions: ['poisoned'] });
  const c = combat([goblin]);
  const found = findCombatantByToken(c, 't1');
  assert.equal(visibleHp(found, { uid: 'player', isDm: false }), null);
  assert.deepEqual(visibleHp(found, { uid: 'dm', isDm: true }), { hp: 7, maxHp: 10 });
  assert.deepEqual(found.conditions, ['poisoned']);
});
