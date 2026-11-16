// tests/hp.test.mjs
// Lógica pura de PG (src/scripts/dnd/hp.ts): clamp entre 0 y el máximo y PG temporales.
import test from 'node:test';
import assert from 'node:assert/strict';

const { applyHpOp, normalizeHp, sameHp, describeHpChange } = await import('../src/scripts/dnd/hp.ts');

const hp = (current, max, temp = 0) => ({ current, max, temp });

test('daño: resta de los PG actuales y no baja de 0', () => {
  assert.deepEqual(applyHpOp(hp(10, 20), { kind: 'delta', amount: -3 }), hp(7, 20));
  assert.deepEqual(applyHpOp(hp(2, 20), { kind: 'delta', amount: -5 }), hp(0, 20));
  assert.deepEqual(applyHpOp(hp(0, 20), { kind: 'delta', amount: -1 }), hp(0, 20));
});

test('daño: los PG temporales absorben primero', () => {
  // Todo absorbido por temporales.
  assert.deepEqual(applyHpOp(hp(10, 20, 5), { kind: 'delta', amount: -3 }), hp(10, 20, 2));
  // Exactamente los temporales.
  assert.deepEqual(applyHpOp(hp(10, 20, 5), { kind: 'delta', amount: -5 }), hp(10, 20, 0));
  // Parte a temporales y el resto a los actuales.
  assert.deepEqual(applyHpOp(hp(10, 20, 5), { kind: 'delta', amount: -8 }), hp(7, 20, 0));
  // Excede temporales + actuales: queda en 0, sin negativos.
  assert.deepEqual(applyHpOp(hp(3, 20, 2), { kind: 'delta', amount: -50 }), hp(0, 20, 0));
});

test('curación: suma hasta el máximo y no toca los temporales', () => {
  assert.deepEqual(applyHpOp(hp(10, 20, 4), { kind: 'delta', amount: 3 }), hp(13, 20, 4));
  assert.deepEqual(applyHpOp(hp(18, 20, 4), { kind: 'delta', amount: 5 }), hp(20, 20, 4));
  assert.deepEqual(applyHpOp(hp(20, 20), { kind: 'delta', amount: 1 }), hp(20, 20));
  assert.deepEqual(applyHpOp(hp(0, 20), { kind: 'delta', amount: 1 }), hp(1, 20));
});

test('delta 0 o no numérico no cambia nada', () => {
  assert.deepEqual(applyHpOp(hp(10, 20, 3), { kind: 'delta', amount: 0 }), hp(10, 20, 3));
  assert.deepEqual(applyHpOp(hp(10, 20, 3), { kind: 'delta', amount: Number.NaN }), hp(10, 20, 3));
});

test('una secuencia de deltas da la suma de los cambios, con el clamp aplicado en cada paso', () => {
  const ops = [-1, -1, -1, +1].map(amount => ({ kind: 'delta', amount }));
  assert.deepEqual(ops.reduce(applyHpOp, hp(10, 20)), hp(8, 20));
  // Cerca de 0 el clamp intermedio importa: 1 −1 −1 +1 = 1 (no 0).
  assert.deepEqual(ops.slice(1).reduce(applyHpOp, hp(1, 20)), hp(1, 20));
});

test('set: fija los valores indicados, conserva el resto y recorta al rango válido', () => {
  assert.deepEqual(applyHpOp(hp(10, 20, 2), { kind: 'set', current: 15 }), hp(15, 20, 2));
  assert.deepEqual(applyHpOp(hp(10, 20, 2), { kind: 'set', current: 18, max: 30, temp: 6 }), hp(18, 30, 6));
  assert.deepEqual(applyHpOp(hp(10, 20), { kind: 'set', current: 99 }), hp(20, 20));
  assert.deepEqual(applyHpOp(hp(10, 20), { kind: 'set', current: -4, temp: -1 }), hp(0, 20, 0));
  assert.deepEqual(applyHpOp(hp(10, 20), { kind: 'set', current: 5, max: 3 }), hp(3, 3));
});

test('full (descanso largo): PG al máximo y sin temporales', () => {
  assert.deepEqual(applyHpOp(hp(3, 20, 7), { kind: 'full' }), hp(20, 20, 0));
});

test('setMax: al máximo sigue al máximo; si sube, los actuales suben lo mismo; si baja, se recortan', () => {
  assert.deepEqual(applyHpOp(hp(20, 20), { kind: 'setMax', max: 28 }), hp(28, 28));
  assert.deepEqual(applyHpOp(hp(12, 20, 3), { kind: 'setMax', max: 28 }), hp(20, 28, 3));
  assert.deepEqual(applyHpOp(hp(12, 20), { kind: 'setMax', max: 10 }), hp(10, 10));
  assert.deepEqual(applyHpOp(hp(5, 20), { kind: 'setMax', max: 10 }), hp(5, 10));
  assert.deepEqual(applyHpOp(hp(5, 20), { kind: 'setMax', max: 30, keepFull: true }), hp(30, 30));
  assert.deepEqual(applyHpOp(hp(5, 20), { kind: 'setMax', max: 0 }), hp(1, 1));
});

test('normalizeHp sanea documentos viejos o corruptos', () => {
  assert.deepEqual(normalizeHp(undefined), hp(1, 1));
  assert.deepEqual(normalizeHp({ current: 30, max: 20 }), hp(20, 20));
  assert.deepEqual(normalizeHp({ current: -2, max: 20, temp: -1 }), hp(0, 20));
  assert.deepEqual(normalizeHp({ current: '7', max: '20', temp: '2.9' }), hp(7, 20, 2));
  assert.deepEqual(normalizeHp({ max: 12 }), hp(12, 12));
});

test('sameHp compara los tres valores (temp ausente = 0)', () => {
  assert.ok(sameHp(hp(3, 8), { current: 3, max: 8 }));
  assert.ok(!sameHp(hp(3, 8, 1), hp(3, 8)));
});

test('describeHpChange usa los valores confirmados y menciona lo absorbido por temporales', () => {
  const op = { kind: 'delta', amount: -8 };
  const change = { before: hp(10, 20, 5), after: applyHpOp(hp(10, 20, 5), op) };
  const entry = describeHpChange('Lyra', op, change, 'dm');
  assert.equal(entry.title, 'Daño recibido (DM): 8 PG');
  assert.match(entry.content, /10\/20 PG \(\+5 Temp\) → 7\/20 PG/);
  assert.match(entry.content, /5 absorbido/);
  assert.equal(describeHpChange('Lyra', { kind: 'delta', amount: 2 }, { before: hp(7, 20), after: hp(9, 20) }).title, 'Curación recibida: +2 PG');
});
