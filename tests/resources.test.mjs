import { test } from 'node:test';
import assert from 'node:assert';
import {
  remaining, spend, recover, resetOn, parseUses, migrateSlots, migrateResources,
} from '../src/scripts/dnd/resources.ts';

test('parseUses', () => {
  assert.deepStrictEqual(parseUses('2/3'), { remaining: 2, max: 3 });
  assert.deepStrictEqual(parseUses(' 2 / 3 '), { remaining: 2, max: 3 });
  assert.deepStrictEqual(parseUses('3'), { remaining: 3, max: 3 });
  assert.strictEqual(parseUses('una vez por turno'), null);
  assert.strictEqual(parseUses('2 / descanso largo'), null);
  assert.strictEqual(parseUses(undefined), null);
});

test('spend/recover respetan límites y no mutan', () => {
  const r = { id: 'a', name: 'A', max: 3, used: 2, rechargeOn: 'manual' };
  assert.strictEqual(spend(r, 5).used, 3);
  assert.strictEqual(recover(r, 5).used, 0);
  assert.strictEqual(r.used, 2);
  assert.strictEqual(remaining({ ...r, used: 9 }), 0);
});

test('resetOn', () => {
  const mk = (id, rechargeOn) => ({ id, name: id, max: 2, used: 2, rechargeOn });
  const list = [mk('s', 'shortRest'), mk('l', 'longRest'), mk('t', 'turn'), mk('m', 'manual')];
  assert.deepStrictEqual(resetOn(list, 'short').map((r) => r.used), [0, 2, 2, 2]);
  assert.deepStrictEqual(resetOn(list, 'long').map((r) => r.used), [0, 0, 2, 2]);
  assert.strictEqual(list[0].used, 2);
});

test('migrateSlots', () => {
  const char = { spellcasting: { slots: { level1: { total: 4, used: 3 }, level2: { total: 2, used: 1 } } } };
  assert.strictEqual(migrateSlots(char), true);
  assert.deepStrictEqual(char.spellcasting.slots[1], { total: 4, used: 3 });
  assert.deepStrictEqual(char.spellcasting.slots[2], { total: 2, used: 1 });
  for (let n = 3; n <= 9; n++) assert.deepStrictEqual(char.spellcasting.slots[n], { total: 0, used: 0 });
  assert.ok(!('level1' in char.spellcasting.slots));
  assert.strictEqual(migrateSlots(char), false);
});

test('migrateResources', () => {
  const char = {
    wildShape: { usesTotal: 2, usesRemaining: 1, activeForm: null },
    features: [
      { id: 'f1', title: 'Furia', description: 'Recupera en descanso corto', uses: '2/3' },
      { id: 'f2', title: 'Pasivo', description: '', uses: 'Pasivo / 1er turno' },
    ],
  };
  assert.strictEqual(migrateResources(char), true);
  assert.strictEqual(char.resources.length, 2);
  const ws = char.resources.find((r) => r.id === 'wildShape');
  assert.deepStrictEqual([ws.max, ws.used, ws.rechargeOn], [2, 1, 'shortRest']);
  const f1 = char.resources.find((r) => r.id === 'feature:f1');
  assert.deepStrictEqual([f1.max, f1.used, f1.rechargeOn], [3, 1, 'shortRest']);
  assert.strictEqual(char.features[0].uses, '2/3');
  assert.strictEqual(migrateResources(char), false);
});
