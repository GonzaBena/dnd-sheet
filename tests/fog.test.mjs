// tests/fog.test.mjs
// Pruebas unitarias para la lógica de niebla de guerra pura (T-40, T-41).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRect,
  clampRectToImage,
  isTinyRect,
  appendFog,
  fogOps,
  simplifyPoints,
  createBrushShape,
} from '../src/scripts/vtt/fog.ts';

test('normalizeRect normaliza arrastres en todas las direcciones', () => {
  // Arrastre hacia abajo y a la derecha (normal)
  assert.deepEqual(normalizeRect(10, 20, 50, 70), { x: 10, y: 20, w: 40, h: 50 });

  // Arrastre hacia arriba y a la izquierda
  assert.deepEqual(normalizeRect(50, 70, 10, 20), { x: 10, y: 20, w: 40, h: 50 });

  // Arrastre hacia abajo y a la izquierda
  assert.deepEqual(normalizeRect(50, 20, 10, 70), { x: 10, y: 20, w: 40, h: 50 });

  // Arrastre hacia arriba y a la derecha
  assert.deepEqual(normalizeRect(10, 70, 50, 20), { x: 10, y: 20, w: 40, h: 50 });
});

test('clampRectToImage restringe el rectángulo a las dimensiones del mapa', () => {
  const imgW = 1000;
  const imgH = 800;

  // Rectángulo totalmente dentro
  assert.deepEqual(
    clampRectToImage({ x: 100, y: 100, w: 200, h: 150 }, imgW, imgH),
    { x: 100, y: 100, w: 200, h: 150 }
  );

  // Rectángulo que empieza en negativo
  assert.deepEqual(
    clampRectToImage({ x: -50, y: -20, w: 150, h: 100 }, imgW, imgH),
    { x: 0, y: 0, w: 100, h: 80 }
  );

  // Rectángulo que excede el ancho y alto
  assert.deepEqual(
    clampRectToImage({ x: 900, y: 750, w: 200, h: 100 }, imgW, imgH),
    { x: 900, y: 750, w: 100, h: 50 }
  );

  // Rectángulo completamente fuera a la derecha/abajo
  assert.deepEqual(
    clampRectToImage({ x: 1200, y: 900, w: 100, h: 100 }, imgW, imgH),
    { x: 1000, y: 800, w: 0, h: 0 }
  );
});

test('isTinyRect detecta clics accidentales sin arrastre suficiente', () => {
  assert.equal(isTinyRect({ w: 0, h: 0 }), true);
  assert.equal(isTinyRect({ w: 2, h: 10 }), true);
  assert.equal(isTinyRect({ w: 10, h: 3 }), true);
  assert.equal(isTinyRect({ w: 4, h: 4 }), false);
  assert.equal(isTinyRect({ w: 50, h: 50 }), false);
});

test('appendFog respeta el umbral de aviso (450) y el límite máximo (500)', () => {
  const shape = { kind: 'rect', x: 0, y: 0, w: 10, h: 10 };

  // Menor a 450: no advierte, no rechaza
  const list400 = Array.from({ length: 448 }, () => shape);
  const res449 = appendFog(list400, shape);
  assert.equal(res449.list.length, 449);
  assert.equal(res449.warn, false);
  assert.equal(res449.rejected, false);

  // Al llegar a 450: advierte pero no rechaza
  const res450 = appendFog(res449.list, shape);
  assert.equal(res450.list.length, 450);
  assert.equal(res450.warn, true);
  assert.equal(res450.rejected, false);

  // Llenar hasta 500
  const list500 = Array.from({ length: 500 }, () => shape);
  const res501 = appendFog(list500, shape);
  assert.equal(res501.list.length, 500);
  assert.equal(res501.warn, true);
  assert.equal(res501.rejected, true);
});

test('fogOps preserva el orden y mapea a reveal o cover', () => {
  const shapes = [
    { kind: 'rect', x: 0, y: 0, w: 100, h: 100 }, // reveal por defecto
    { kind: 'rect', x: 20, y: 20, w: 50, h: 50, op: 'cover' }, // cover
    { kind: 'poly', points: [0, 0, 10, 10, 20, 0] }, // poly sin op -> reveal
    { kind: 'rect', x: 30, y: 30, w: 20, h: 20, op: 'reveal' }, // reveal explícito
  ];

  const ops = fogOps(shapes);
  assert.equal(ops.length, 4);
  assert.equal(ops[0].op, 'reveal');
  assert.equal(ops[1].op, 'cover');
  assert.equal(ops[2].op, 'reveal');
  assert.equal(ops[3].op, 'reveal');
  assert.deepEqual(ops[1].shape, shapes[1]);
});

test('simplifyPoints descarta puntos demasiado cercanos conservando inicio y fin', () => {
  // Puntos con distancias: (0,0) -> (1,1) [dist 1.41 < 8, descarta] -> (10,0) [dist 10 >= 8, conserva] -> (11,0) [descarta] -> (20,0) [conserva]
  const raw = [0, 0, 1, 1, 2, 2, 10, 0, 11, 0, 20, 0];
  const simplified = simplifyPoints(raw, 8);
  assert.deepEqual(simplified, [0, 0, 10, 0, 20, 0]);

  // Si tiene solo 1 punto (2 coords), lo conserva intacto
  assert.deepEqual(simplifyPoints([50, 50], 8), [50, 50]);

  // Si el último punto no se agregó en el loop pero difiere del último retenido, se conserva
  const raw2 = [0, 0, 10, 0, 12, 0];
  assert.deepEqual(simplifyPoints(raw2, 8), [0, 0, 10, 0, 12, 0]);
});

test('createBrushShape genera círculo para 1 punto y trazo brush para múltiples puntos', () => {
  // 1 punto (clic sin arrastre)
  const singlePt = createBrushShape([100.4, 200.6], 25.2, false);
  assert.deepEqual(singlePt, {
    kind: 'circle',
    x: 100,
    y: 201,
    r: 25,
  });

  // 1 punto con cover
  const singleCover = createBrushShape([50, 50], 30, true);
  assert.deepEqual(singleCover, {
    kind: 'circle',
    x: 50,
    y: 50,
    r: 30,
    op: 'cover',
  });

  // Múltiples puntos (arrastre de pincel)
  const stroke = createBrushShape([0.1, 0.2, 10.3, 10.4, 20.5, 30.6], 15, false);
  assert.deepEqual(stroke, {
    kind: 'brush',
    points: [0, 0, 10, 10, 21, 31],
    radius: 15,
  });

  // Múltiples puntos con cover
  const strokeCover = createBrushShape([0, 0, 5, 5, 10, 10], 20, true);
  assert.deepEqual(strokeCover, {
    kind: 'brush',
    points: [0, 0, 5, 5, 10, 10],
    radius: 20,
    op: 'cover',
  });
});
