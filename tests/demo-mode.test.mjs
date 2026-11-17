import { test } from 'node:test';
import assert from 'node:assert';
import { campaignStore } from '../src/scripts/state/campaignStore.ts';
import { PREMADE_CHARACTERS } from '../src/scripts/data/premadeCharacters.ts';

test('ensureDemoCharacter() creates a random pre-made character excluding Atlas', () => {
  const demoChar = campaignStore.ensureDemoCharacter(true);
  assert.ok(demoChar, 'Demo character should exist');
  assert.ok(demoChar.id.startsWith('demo-'), `ID should start with demo- but got ${demoChar.id}`);
  assert.notStrictEqual(demoChar.name, 'Atlas', 'Demo character should NEVER be Atlas');
  assert.notStrictEqual(demoChar.name, 'Atlas Ventosombra', 'Demo character should NEVER be Atlas Ventosombra');
  assert.strictEqual(demoChar.level, 3, 'Demo character should be level 3');
  assert.strictEqual(demoChar.campaignId, null);
  assert.strictEqual(demoChar.playerName, 'Aventurero (Demo)');
  assert.ok(demoChar.hp.current > 0, 'HP should be positive');
  assert.ok(demoChar.hp.max > 0, 'Max HP should be positive');
  assert.ok(demoChar.inventory.length > 0, 'Should have starter kit inventory');
  assert.ok(demoChar.actions.length > 0, 'Should have weapon attack actions');
});

test('ensureDemoCharacter() is idempotent without forceNewRandom', () => {
  const char1 = campaignStore.ensureDemoCharacter(false);
  const char2 = campaignStore.ensureDemoCharacter(false);
  assert.strictEqual(char1.id, char2.id);
  assert.strictEqual(char1.name, char2.name);
  assert.strictEqual(char1.className, char2.className);
});

test('Multiple random rolls never select Atlas', () => {
  for (let i = 0; i < 20; i++) {
    const char = campaignStore.ensureDemoCharacter(true);
    assert.notStrictEqual(char.name, 'Atlas');
    assert.notStrictEqual(char.name, 'Atlas Ventosombra');
    assert.notStrictEqual(char.id, 'demo-atlas');
    assert.notStrictEqual(char.id, 'demo-explorador');
  }
});
