import { test } from 'node:test';
import assert from 'node:assert';
import {
  addEffect, removeEffect, tickRounds, expireOnRest, collectModifiers, describeDuration, roundDelta,
} from '../src/scripts/dnd/effects.ts';

const fx = (id, duration, extra = {}) => ({
  id, name: id, sourceType: 'custom', duration, modifiers: [], appliedAt: 0, ...extra,
});

test('addEffect', () => {
  const a = fx('a', { kind: 'rounds', remaining: 2 });
  const r1 = addEffect([], a);
  assert.strictEqual(r1.effects.length, 1);
  assert.strictEqual(r1.replaced, undefined);

  const c1 = fx('c1', { kind: 'concentration' });
  const c2 = fx('c2', { kind: 'concentration' });
  const r2 = addEffect(addEffect([], c1).effects, c2);
  assert.strictEqual(r2.replaced?.id, 'c1');
  assert.strictEqual(r2.effects.length, 2); // no lo quita (FB-6)

  const s1 = fx('s1', { kind: 'indefinite' }, { sourceType: 'spell', sourceId: 'bless' });
  const s2 = fx('s2', { kind: 'indefinite' }, { sourceType: 'spell', sourceId: 'bless' });
  const r3 = addEffect([s1], s2);
  assert.deepStrictEqual(r3.effects.map((e) => e.id), ['s2']);
});

test('removeEffect', () => {
  const list = [fx('a', { kind: 'indefinite' }), fx('b', { kind: 'indefinite' })];
  assert.deepStrictEqual(removeEffect(list, 'a').map((e) => e.id), ['b']);
  assert.strictEqual(removeEffect(list, 'zzz').length, 2);
  assert.strictEqual(list.length, 2);
});

test('tickRounds', () => {
  const r3 = fx('r3', { kind: 'rounds', remaining: 3 });
  const r1 = fx('r1', { kind: 'rounds', remaining: 1 });
  const ind = fx('i', { kind: 'indefinite' });
  const t = tickRounds([r3, r1, ind], 1);
  assert.strictEqual(t.effects.find((e) => e.id === 'r3').duration.remaining, 2);
  assert.deepStrictEqual(t.expired.map((e) => e.id), ['r1']);
  assert.ok(t.effects.some((e) => e.id === 'i'));
  assert.strictEqual(r3.duration.remaining, 3); // no muta

  const zero = tickRounds([r3], 0);
  assert.strictEqual(zero.effects[0].duration.remaining, 3);
  assert.strictEqual(zero.expired.length, 0);

  assert.deepStrictEqual(tickRounds([r3], 10).expired.map((e) => e.id), ['r3']);
});

test('expireOnRest', () => {
  const list = [
    fx('s', { kind: 'untilRest', rest: 'short' }),
    fx('l', { kind: 'untilRest', rest: 'long' }),
    fx('c', { kind: 'concentration' }),
    fx('i', { kind: 'indefinite' }),
  ];
  const short = expireOnRest(list, 'short');
  assert.deepStrictEqual(short.expired.map((e) => e.id), ['s']);
  assert.deepStrictEqual(short.effects.map((e) => e.id), ['l', 'c', 'i']);
  const long = expireOnRest(list, 'long');
  assert.deepStrictEqual(long.expired.map((e) => e.id), ['s', 'l']);
  assert.deepStrictEqual(long.effects.map((e) => e.id), ['c', 'i']);
});

test('collectModifiers', () => {
  const e = fx('e', { kind: 'indefinite' }, {
    modifiers: [
      { target: 'save.dex', op: 'add', value: 1 },
      { target: 'save', op: 'add', value: 2 },
      { target: 'ac', op: 'add', value: 1 },
      { target: 'acrobatics', op: 'add', value: 1 },
    ],
  });
  const char = { activeEffects: [e] };
  assert.strictEqual(collectModifiers(char, 'save').length, 2);
  assert.strictEqual(collectModifiers(char, 'save.dex').length, 1);
  assert.strictEqual(collectModifiers(char, 'ac').length, 1);
  assert.strictEqual(collectModifiers({}, 'ac').length, 0);
});

test('collectModifiers: efectos de objetos según FD-4', () => {
  const ring = (extra) => ({
    id: 'r', name: 'Anillo', quantity: 1, category: 'gear',
    effects: [{ target: 'ac', op: 'add', value: 1 }], ...extra,
  });
  const n = (inventory) => collectModifiers({ inventory }, 'ac').length;
  assert.strictEqual(n([ring({})]), 0, 'sin equipar no aporta');
  assert.strictEqual(n([ring({ equipped: true })]), 1, 'equipado sin sintonía requerida aporta');
  assert.strictEqual(n([ring({ equipped: true, requiresAttunement: true })]), 0, 'requiere sintonía y no la tiene');
  assert.strictEqual(n([ring({ equipped: true, requiresAttunement: true, attuned: true })]), 1);
  assert.strictEqual(n([ring({ requiresAttunement: true, attuned: true })]), 0, 'sintonizado pero sin equipar');
  // suma objetos y efectos activos; sin inventario se comporta como antes
  const e = { id: 'e', name: 'e', sourceType: 'custom', duration: { kind: 'indefinite' }, appliedAt: 0,
    modifiers: [{ target: 'ac', op: 'add', value: 2 }] };
  assert.strictEqual(collectModifiers({ activeEffects: [e], inventory: [ring({ equipped: true })] }, 'ac').length, 2);
  assert.strictEqual(collectModifiers({ activeEffects: [e] }, 'ac').length, 1);
});

test('describeDuration', () => {
  assert.strictEqual(describeDuration({ kind: 'rounds', remaining: 1 }), '1 ronda');
  assert.strictEqual(describeDuration({ kind: 'rounds', remaining: 2 }), '2 rondas');
  assert.strictEqual(describeDuration({ kind: 'untilRest', rest: 'long' }), 'hasta descanso largo');
  assert.strictEqual(describeDuration({ kind: 'untilRest', rest: 'short' }), 'hasta descanso corto');
  assert.strictEqual(describeDuration({ kind: 'concentration' }), 'concentración');
  assert.strictEqual(describeDuration({ kind: 'untilUsed' }), 'hasta usarse');
  assert.strictEqual(describeDuration({ kind: 'indefinite' }), 'indefinido');
});

test('roundDelta', () => {
  assert.strictEqual(roundDelta(undefined, { campaignId: 'a', round: 3 }), 0);
  assert.strictEqual(roundDelta({ campaignId: 'a', round: 2 }, { campaignId: 'a', round: 5 }), 3);
  assert.strictEqual(roundDelta({ campaignId: 'a', round: 2 }, { campaignId: 'b', round: 5 }), 0);
  assert.strictEqual(roundDelta({ campaignId: 'a', round: 5 }, { campaignId: 'a', round: 1 }), 0);
  assert.strictEqual(roundDelta({ campaignId: 'a', round: 2 }, { campaignId: 'a', round: 2 }), 0);
});
