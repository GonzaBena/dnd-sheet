// tests/tokens.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canMoveToken,
  tokenPixelSize,
  snapTokenPosition,
  resolveTokenPosition,
  newTokenId,
} from '../src/scripts/vtt/tokens.ts';

test('canMoveToken validates permissions by role and session status', () => {
  const token = { ownerUid: 'player-1' };

  // Status active
  assert.equal(canMoveToken(token, { uid: 'dm-1', isDm: true }, 'active'), true);
  assert.equal(canMoveToken(token, { uid: 'player-1', isDm: false }, 'active'), true);
  assert.equal(canMoveToken(token, { uid: 'player-2', isDm: false }, 'active'), false);
  assert.equal(canMoveToken(token, { uid: null, isDm: false }, 'active'), false);

  // Status paused
  assert.equal(canMoveToken(token, { uid: 'dm-1', isDm: true }, 'paused'), false);
  assert.equal(canMoveToken(token, { uid: 'player-1', isDm: false }, 'paused'), false);

  // Status ended
  assert.equal(canMoveToken(token, { uid: 'dm-1', isDm: true }, 'ended'), false);
  assert.equal(canMoveToken(token, { uid: 'player-1', isDm: false }, 'ended'), false);

  // Unassigned / DM-only token (ownerUid: null)
  const dmToken = { ownerUid: null };
  assert.equal(canMoveToken(dmToken, { uid: 'dm-1', isDm: true }, 'active'), true);
  assert.equal(canMoveToken(dmToken, { uid: 'player-1', isDm: false }, 'active'), false);
});

test('tokenPixelSize calculates pixel size based on token cells and grid cell size', () => {
  assert.equal(tokenPixelSize({ size: 1 }, { size: 50 }), 50);
  assert.equal(tokenPixelSize({ size: 2 }, { size: 50 }), 100);
  assert.equal(tokenPixelSize({ size: 3 }, { size: 64 }), 192);
  assert.equal(tokenPixelSize({ size: 4 }, { size: 32 }), 128);
});

test('snapTokenPosition aligns with grid and bounds', () => {
  const grid = { size: 50, offsetX: 10, offsetY: 20 };
  const bounds = { width: 500, height: 500 };

  // Size 1
  const p1 = snapTokenPosition({ x: 55, y: 75 }, { size: 1 }, grid, bounds);
  // col near 1 => 10 + 1 * 50 = 60; row near 1 => 20 + 1 * 50 = 70
  assert.equal(p1.x, 60);
  assert.equal(p1.y, 70);

  // Size 2 clamping against right/bottom edge
  const p2 = snapTokenPosition({ x: 480, y: 480 }, { size: 2 }, grid, bounds);
  // Token size 2 is 100px. In 500px, max col is floor((500 - 10 - 100) / 50) = floor(390/50) = 7
  // x = 10 + 7 * 50 = 360
  assert.ok(p2.x + 100 <= bounds.width);
  assert.ok(p2.y + 100 <= bounds.height);
});

test('resolveTokenPosition prioritizes recent live over firestore', () => {
  const firestoreToken = { x: 100, y: 200 };
  const now = 10000;

  // Recent live (2s ago)
  const recentLive = { x: 150, y: 250, receivedAt: 8000 };
  const pos1 = resolveTokenPosition(firestoreToken, recentLive, now);
  assert.deepEqual(pos1, { x: 150, y: 250 });

  // Expired live (6s ago)
  const expiredLive = { x: 150, y: 250, receivedAt: 3999 };
  const pos2 = resolveTokenPosition(firestoreToken, expiredLive, now);
  assert.deepEqual(pos2, { x: 100, y: 200 });

  // No live
  const pos3 = resolveTokenPosition(firestoreToken, null, now);
  assert.deepEqual(pos3, { x: 100, y: 200 });
});

test('newTokenId generates unique identifiers starting with tok-', () => {
  const id1 = newTokenId();
  const id2 = newTokenId();
  assert.ok(id1.startsWith('tok-'));
  assert.ok(id2.startsWith('tok-'));
  assert.notEqual(id1, id2);
});
