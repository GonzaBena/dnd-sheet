// tests/tokens_owner.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findCharacterToken,
  findMissingTokenOwners,
  resolveTokenOwner,
  isCompanionToken,
} from '../src/scripts/vtt/tokens.ts';

const base = { x: 0, y: 0, size: 1 };
const characters = [
  { id: 'char-1', userId: 'player-1' },
  { id: 'char-2' }, // ficha todavía sin usuario vinculado
];

test('resolveTokenOwner prioriza el dueño elegido a mano', () => {
  assert.equal(resolveTokenOwner({ ownerUid: 'dm-1', characterId: 'char-1' }, characters), 'dm-1');
});

test('resolveTokenOwner hereda el usuario del personaje vinculado', () => {
  assert.equal(resolveTokenOwner({ ownerUid: null, characterId: 'char-1' }, characters), 'player-1');
  assert.equal(resolveTokenOwner({ ownerUid: null, characterId: 'char-2' }, characters), null);
  assert.equal(resolveTokenOwner({ ownerUid: null, characterId: 'nope' }, characters), null);
  assert.equal(resolveTokenOwner({ ownerUid: null }, characters), null);
});

test('findCharacterToken solo empareja por characterId e ignora compañeros', () => {
  const tokens = {
    'tok-name': { ...base, name: 'Aria', ownerUid: null },
    'tok-pet': {
      ...base,
      name: 'Lobo (Aria)',
      ownerUid: 'player-1',
      characterId: 'char-1',
      kind: 'companion',
      companionId: 'c1',
    },
  };
  assert.equal(findCharacterToken(tokens, 'char-1'), undefined);

  tokens['tok-pc'] = { ...base, name: 'Aria', ownerUid: null, characterId: 'char-1' };
  assert.equal(findCharacterToken(tokens, 'char-1')?.[0], 'tok-pc');
});

test('isCompanionToken reconoce compañeros, monturas e invocaciones', () => {
  assert.equal(isCompanionToken({ kind: 'mount' }), true);
  assert.equal(isCompanionToken({ kind: 'summon' }), true);
  assert.equal(isCompanionToken({ companionId: 'x' }), true);
  assert.equal(isCompanionToken({ kind: 'character' }), false);
  assert.equal(isCompanionToken({}), false);
});

test('findMissingTokenOwners solo rellena huecos con dueño resoluble', () => {
  const tokens = {
    a: { ...base, name: 'A', ownerUid: null, characterId: 'char-1' },
    b: { ...base, name: 'B', ownerUid: 'dm-1', characterId: 'char-1' },
    c: { ...base, name: 'C', ownerUid: null, characterId: 'char-2' },
    d: { ...base, name: 'D', ownerUid: null },
  };
  assert.deepEqual(findMissingTokenOwners(tokens, characters), [{ tid: 'a', ownerUid: 'player-1' }]);
});
