// tests/measure.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { measureCells, formatMeasurement } from '../src/scripts/vtt/measure.ts';

const grid = { size: 50, offsetX: 0, offsetY: 0, visible: true };

test('distancia horizontal', () => {
  assert.deepEqual(measureCells({ x: 25, y: 25 }, { x: 325, y: 25 }, grid), { cells: 6, feet: 30 });
});

test('distancia vertical', () => {
  assert.deepEqual(measureCells({ x: 25, y: 25 }, { x: 25, y: 175 }, grid), { cells: 3, feet: 15 });
});

test('diagonal: 6 casillas en diagonal son 6 celdas · 30 ft (5/5/5)', () => {
  const m = measureCells({ x: 25, y: 25 }, { x: 325, y: 325 }, grid);
  assert.deepEqual(m, { cells: 6, feet: 30 });
  assert.equal(formatMeasurement(m), '6 celdas · 30 ft');
});

test('mixta: manda el eje mayor (Chebyshev)', () => {
  assert.equal(measureCells({ x: 25, y: 25 }, { x: 275, y: 125 }, grid).cells, 5);
});

test('mismo punto o misma celda es 0', () => {
  assert.deepEqual(measureCells({ x: 10, y: 10 }, { x: 40, y: 40 }, grid), { cells: 0, feet: 0 });
});

test('con offset de grilla las celdas se desplazan', () => {
  const g = { size: 50, offsetX: 20, offsetY: 0 };
  // x=60 y x=10 caen en celdas distintas por el offset (floor((60-20)/50)=0, floor((10-20)/50)=-1).
  assert.equal(measureCells({ x: 10, y: 25 }, { x: 60, y: 25 }, g).cells, 1);
  assert.equal(measureCells({ x: 10, y: 25 }, { x: 60, y: 25 }, { ...g, offsetX: 0 }).cells, 1);
  assert.equal(measureCells({ x: 25, y: 25 }, { x: 45, y: 25 }, g).cells, 0);
  assert.equal(measureCells({ x: 25, y: 25 }, { x: 75, y: 25 }, g).cells, 1);
});

test('singular en la etiqueta', () => {
  assert.equal(formatMeasurement({ cells: 1, feet: 5 }), '1 celda · 5 ft');
});

test('grilla inválida (size 0) usa 50 px por defecto sin dividir por cero', () => {
  assert.equal(measureCells({ x: 0, y: 0 }, { x: 100, y: 0 }, { size: 0, offsetX: 0, offsetY: 0 }).cells, 2);
});
