// tests/session_status.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeStatus,
  canTransition,
  canPerform,
  statusLabel,
} from '../src/scripts/vtt/sessionStatus.ts';

test('normalizeStatus handles known, legacy and invalid states', () => {
  assert.equal(normalizeStatus('active'), 'active');
  assert.equal(normalizeStatus('paused'), 'paused');
  assert.equal(normalizeStatus('ended'), 'ended');
  assert.equal(normalizeStatus('completed'), 'ended');
  assert.equal(normalizeStatus(undefined), 'paused');
  assert.equal(normalizeStatus(null), 'paused');
  assert.equal(normalizeStatus('foo'), 'paused');
  assert.equal(normalizeStatus(123), 'paused');
});

test('canTransition validates valid and invalid status transitions', () => {
  // Valid transitions
  assert.equal(canTransition('active', 'paused'), true);
  assert.equal(canTransition('paused', 'active'), true);
  assert.equal(canTransition('active', 'ended'), true);
  assert.equal(canTransition('paused', 'ended'), true);
  assert.equal(canTransition('ended', 'paused'), true); // Reabrir

  // Invalid transitions
  assert.equal(canTransition('ended', 'active'), false); // Solo puede reabrir a paused
  assert.equal(canTransition('active', 'active'), false);
  assert.equal(canTransition('paused', 'paused'), false);
  assert.equal(canTransition('ended', 'ended'), false);
});

test('canPerform implements Table D7 permission matrix', () => {
  const statuses = ['active', 'paused', 'ended'];

  // View: all can view in any state
  for (const s of statuses) {
    assert.equal(canPerform('view', 'player', s), true, `player should view in ${s}`);
    assert.equal(canPerform('view', 'dm', s), true, `dm should view in ${s}`);
  }

  // Edit own sheet: all can edit their own sheet in any state
  for (const s of statuses) {
    assert.equal(canPerform('editOwnSheet', 'player', s), true, `player edit sheet in ${s}`);
    assert.equal(canPerform('editOwnSheet', 'dm', s), true, `dm edit sheet in ${s}`);
  }

  // Move player token: only player in active
  assert.equal(canPerform('movePlayerToken', 'player', 'active'), true);
  assert.equal(canPerform('movePlayerToken', 'player', 'paused'), false);
  assert.equal(canPerform('movePlayerToken', 'player', 'ended'), false);
  assert.equal(canPerform('movePlayerToken', 'dm', 'active'), false);

  // Player write: only player in active
  assert.equal(canPerform('playerWrite', 'player', 'active'), true);
  assert.equal(canPerform('playerWrite', 'player', 'paused'), false);
  assert.equal(canPerform('playerWrite', 'player', 'ended'), false);
  assert.equal(canPerform('playerWrite', 'dm', 'active'), false);

  // DM play: only DM in active
  assert.equal(canPerform('dmPlay', 'dm', 'active'), true);
  assert.equal(canPerform('dmPlay', 'dm', 'paused'), false);
  assert.equal(canPerform('dmPlay', 'dm', 'ended'), false);
  assert.equal(canPerform('dmPlay', 'player', 'active'), false);

  // DM prepare: DM in active or paused, not in ended
  assert.equal(canPerform('dmPrepare', 'dm', 'active'), true);
  assert.equal(canPerform('dmPrepare', 'dm', 'paused'), true);
  assert.equal(canPerform('dmPrepare', 'dm', 'ended'), false);
  assert.equal(canPerform('dmPrepare', 'player', 'active'), false);
  assert.equal(canPerform('dmPrepare', 'player', 'paused'), false);

  // Change status: only DM
  assert.equal(canPerform('changeStatus', 'dm', 'active'), true);
  assert.equal(canPerform('changeStatus', 'dm', 'paused'), true);
  assert.equal(canPerform('changeStatus', 'dm', 'ended'), true);
  assert.equal(canPerform('changeStatus', 'player', 'active'), false);
});

test('statusLabel returns user-facing labels', () => {
  assert.equal(statusLabel('active'), 'Partida iniciada');
  assert.equal(statusLabel('paused'), 'Partida pausada');
  assert.equal(statusLabel('ended'), 'Partida terminada');
});
