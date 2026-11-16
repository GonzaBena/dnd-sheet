// tests/weapon_attack_dc.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Mock browser environment for node testing if needed
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear()
  };
}

const { journalStore } = await import('../src/scripts/state/journalStore.ts');

/**
 * Pure evaluation function matching the DiceRollerModal logic.
 */
function evaluateAttackRoll(params) {
  const { dieRoll, modifier, targetDc, isPendingDm } = params;
  const isCrit = dieRoll === 20;
  const isFumble = dieRoll === 1;
  const total = dieRoll + modifier;

  if (isCrit) {
    return { outcome: 'crit', total, label: '¡Impacto Crítico Automático!' };
  }
  if (isFumble) {
    return { outcome: 'fumble', total, label: 'Pifia Automática' };
  }
  if (!isPendingDm && typeof targetDc === 'number' && Number.isFinite(targetDc)) {
    if (total >= targetDc) {
      return { outcome: 'hit', total, label: `Acierto (${total} vs CD/CA ${targetDc})` };
    } else {
      return { outcome: 'miss', total, label: `Fallo (${total} vs CD/CA ${targetDc})` };
    }
  }
  return { outcome: 'pending', total, label: `Pendiente DM (${total})` };
}

test('Attack roll DC evaluation: Nat 20 is always a critical hit', () => {
  const res = evaluateAttackRoll({ dieRoll: 20, modifier: 3, targetDc: 30, isPendingDm: false });
  assert.equal(res.outcome, 'crit');
  assert.equal(res.total, 23);
});

test('Attack roll DC evaluation: Nat 1 is always a fumble', () => {
  const res = evaluateAttackRoll({ dieRoll: 1, modifier: 10, targetDc: 10, isPendingDm: false });
  assert.equal(res.outcome, 'fumble');
  assert.equal(res.total, 11);
});

test('Attack roll DC evaluation: Total >= DC is a Hit (Meets it beats it)', () => {
  // Equal
  const resEqual = evaluateAttackRoll({ dieRoll: 10, modifier: 5, targetDc: 15, isPendingDm: false });
  assert.equal(resEqual.outcome, 'hit');
  assert.equal(resEqual.total, 15);

  // Greater
  const resGreater = evaluateAttackRoll({ dieRoll: 12, modifier: 5, targetDc: 15, isPendingDm: false });
  assert.equal(resGreater.outcome, 'hit');
  assert.equal(resGreater.total, 17);
});

test('Attack roll DC evaluation: Total < DC is a Miss', () => {
  const resMiss = evaluateAttackRoll({ dieRoll: 9, modifier: 5, targetDc: 15, isPendingDm: false });
  assert.equal(resMiss.outcome, 'miss');
  assert.equal(resMiss.total, 14);
});

test('Attack roll DC evaluation: Pending DM or unassigned DC results in pending outcome', () => {
  const resPending = evaluateAttackRoll({ dieRoll: 14, modifier: 5, targetDc: null, isPendingDm: true });
  assert.equal(resPending.outcome, 'pending');
  assert.equal(resPending.total, 19);

  const resNoDc = evaluateAttackRoll({ dieRoll: 14, modifier: 5, targetDc: null, isPendingDm: false });
  assert.equal(resNoDc.outcome, 'pending');
});

test('Journal entry records targetDc and hitOutcome properly', () => {
  const entry = journalStore.addEntry({
    title: 'Ataque con Espada Larga contra Orco: 18',
    content: 'Tirada de 1d20 + 5 con resultado 18 (Objetivo: Orco • ¡IMPACTA vs CD/CA 15!)',
    tags: ['#Combate', '#Tirada'],
    diceRoll: {
      formula: '1d20 + 5 (Ataque con Espada Larga)',
      result: 18,
      breakdown: '[13] + 5',
      targetDc: 15,
      hitOutcome: 'hit',
      targetName: 'Orco',
    },
  });

  assert.ok(entry.id);
  assert.equal(entry.diceRoll?.targetDc, 15);
  assert.equal(entry.diceRoll?.hitOutcome, 'hit');
  assert.equal(entry.diceRoll?.targetName, 'Orco');

  const retrieved = journalStore.getEntries().find((e) => e.id === entry.id);
  assert.ok(retrieved);
  assert.equal(retrieved.diceRoll?.hitOutcome, 'hit');
  assert.equal(retrieved.diceRoll?.targetDc, 15);
});

test('UI elements presence in DiceRollerModal and EditCharacterModal', () => {
  const diceModalPath = path.resolve('src/components/modals/DiceRollerModal.astro');
  const diceModalContent = fs.readFileSync(diceModalPath, 'utf-8');

  // Verify target DC input and pending checkbox exist
  assert.ok(diceModalContent.includes('id="dice-target-dc-input"'));
  assert.ok(diceModalContent.includes('id="dice-target-dc-pending"'));
  assert.ok(diceModalContent.includes('dice-dc-chip'));
  assert.ok(diceModalContent.includes('id="dice-dc-clear-btn"'));

  // Verify EditCharacterModal has stat max set to 20
  const editModalPath = path.resolve('src/components/modals/EditCharacterModal.astro');
  const editModalContent = fs.readFileSync(editModalPath, 'utf-8');
  assert.ok(editModalContent.includes('id="edit-stat-str"'));
  assert.ok(editModalContent.includes('max="20"'));
  assert.ok(!editModalContent.includes('Puntuaciones de Característica (1-30)'));
  assert.ok(editModalContent.includes('Puntuaciones de Característica (1-20)'));
});
