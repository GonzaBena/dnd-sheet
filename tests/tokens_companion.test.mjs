// tests/tokens_companion.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCompanionToken, canMoveToken, tokenPixelSize } from '../src/scripts/vtt/tokens.ts';

test('buildCompanionToken constructs proper companion, mount and summon tokens with player ownership', () => {
  const char = { id: 'char-lyra', name: 'Lyra' };
  const playerUid = 'usr-player-123';

  // 1. Familiar (1x1)
  const owl = {
    id: 'comp-owl',
    name: 'Archimedes',
    type: 'familiar',
    size: 1,
    hp: { current: 1, max: 1 },
    avatarUrl: '/characters/owl.png',
  };

  const owlToken = buildCompanionToken(owl, char, playerUid, { x: 50, y: 100 });
  assert.equal(owlToken.name, 'Archimedes (Lyra)');
  assert.equal(owlToken.size, 1);
  assert.equal(owlToken.ownerUid, playerUid);
  assert.equal(owlToken.characterId, char.id);
  assert.equal(owlToken.kind, 'companion');
  assert.equal(owlToken.companionId, 'comp-owl');
  assert.equal(owlToken.x, 50);
  assert.equal(owlToken.y, 100);

  // 2. Montura (2x2)
  const steed = {
    id: 'comp-horse',
    name: 'Relámpago',
    type: 'mount',
    size: 2,
    hp: { current: 19, max: 19 },
  };

  const steedToken = buildCompanionToken(steed, char, playerUid);
  assert.equal(steedToken.name, 'Relámpago (Lyra)');
  assert.equal(steedToken.size, 2);
  assert.equal(steedToken.kind, 'mount');
  assert.equal(steedToken.color, '#f59e0b');

  // 3. Invocación (Espíritu de batalla)
  const spirit = {
    id: 'comp-spirit',
    name: 'Espíritu Guardián',
    type: 'summon',
    size: 1,
    hp: { current: 30, max: 30 },
  };

  const spiritToken = buildCompanionToken(spirit, char, playerUid);
  assert.equal(spiritToken.kind, 'summon');
  assert.equal(spiritToken.color, '#06b6d4');
});

test('canMoveToken allows player to move their own companion token when session is active', () => {
  const playerUid = 'usr-player-123';
  const otherPlayerUid = 'usr-other-456';
  const dmUid = 'usr-dm-999';

  const companionToken = {
    ownerUid: playerUid,
  };

  // 1. Dueño con sesión activa -> PUEDE MOVER
  assert.equal(
    canMoveToken(companionToken, { uid: playerUid, isDm: false }, 'active'),
    true
  );

  // 2. DM con sesión activa -> PUEDE MOVER
  assert.equal(
    canMoveToken(companionToken, { uid: dmUid, isDm: true }, 'active'),
    true
  );

  // 3. Otro jugador con sesión activa -> NO PUEDE MOVER
  assert.equal(
    canMoveToken(companionToken, { uid: otherPlayerUid, isDm: false }, 'active'),
    false
  );

  // 4. Con sesión pausada -> NINGÚN JUGADOR PUEDE MOVER
  assert.equal(
    canMoveToken(companionToken, { uid: playerUid, isDm: false }, 'paused'),
    false
  );

  // 5. Con sesión terminada -> NO SE PUEDE MOVER
  assert.equal(
    canMoveToken(companionToken, { uid: playerUid, isDm: false }, 'ended'),
    false
  );
});

test('tokenPixelSize handles companion token sizes correctly on grid', () => {
  const grid = { size: 50 };

  // Familiar 1x1 en grilla de 50px = 50px
  assert.equal(tokenPixelSize({ size: 1 }, grid), 50);

  // Montura 2x2 en grilla de 50px = 100px
  assert.equal(tokenPixelSize({ size: 2 }, grid), 100);

  // Invocación Enorme 3x3 = 150px
  assert.equal(tokenPixelSize({ size: 3 }, grid), 150);
});
