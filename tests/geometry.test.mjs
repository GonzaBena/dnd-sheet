// tests/geometry.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  screenToMap,
  mapToScreen,
  clampZoom,
  zoomAtPoint,
  fitToContainer,
  snapToGrid,
  pinchZoom,
  ZOOM_LIMITS,
} from '../src/scripts/vtt/geometry.ts';

test('screenToMap y mapToScreen son funciones inversas exactas (ida y vuelta)', () => {
  const views = [
    { scale: 1, x: 0, y: 0 },
    { scale: 2.5, x: 120, y: -45 },
    { scale: 0.35, x: -500, y: 320 },
  ];

  const points = [
    { x: 0, y: 0 },
    { x: 100, y: 250 },
    { x: 843.5, y: 1204.2 },
    { x: -50, y: -90 },
  ];

  for (const view of views) {
    for (const p of points) {
      const mapPt = screenToMap(p, view);
      const roundTripScreen = mapToScreen(mapPt, view);
      assert.ok(Math.abs(roundTripScreen.x - p.x) < 1e-9, `x mismatch for view ${JSON.stringify(view)}`);
      assert.ok(Math.abs(roundTripScreen.y - p.y) < 1e-9, `y mismatch for view ${JSON.stringify(view)}`);

      const screenPt = mapToScreen(p, view);
      const roundTripMap = screenToMap(screenPt, view);
      assert.ok(Math.abs(roundTripMap.x - p.x) < 1e-9, `map x mismatch for view ${JSON.stringify(view)}`);
      assert.ok(Math.abs(roundTripMap.y - p.y) < 1e-9, `map y mismatch for view ${JSON.stringify(view)}`);
    }
  }
});

test('clampZoom respeta los límites mínimo (0.1) y máximo (8.0) por defecto', () => {
  assert.equal(clampZoom(0.01), ZOOM_LIMITS.min);
  assert.equal(clampZoom(0.099), ZOOM_LIMITS.min);
  assert.equal(clampZoom(0.1), 0.1);
  assert.equal(clampZoom(1.5), 1.5);
  assert.equal(clampZoom(8.0), 8.0);
  assert.equal(clampZoom(10.5), ZOOM_LIMITS.max);
  assert.equal(clampZoom(100), ZOOM_LIMITS.max);
});

test('zoomAtPoint: el punto del mapa bajo el puntero queda exactamente fijo en la pantalla', () => {
  const view = { scale: 1.2, x: 50, y: 100 };
  const pointer = { x: 400, y: 300 };

  // El punto del mapa bajo el puntero antes de hacer zoom
  const mapPtBefore = screenToMap(pointer, view);

  // Hacemos zoom in (factor 1.5)
  const zoomedIn = zoomAtPoint(view, pointer, 1.5);
  assert.equal(zoomedIn.scale, 1.2 * 1.5);
  const pointerAfterIn = mapToScreen(mapPtBefore, zoomedIn);
  assert.ok(Math.abs(pointerAfterIn.x - pointer.x) < 1e-9);
  assert.ok(Math.abs(pointerAfterIn.y - pointer.y) < 1e-9);

  // Hacemos zoom out (factor 0.5)
  const zoomedOut = zoomAtPoint(view, pointer, 0.5);
  assert.equal(zoomedOut.scale, 1.2 * 0.5);
  const pointerAfterOut = mapToScreen(mapPtBefore, zoomedOut);
  assert.ok(Math.abs(pointerAfterOut.x - pointer.x) < 1e-9);
  assert.ok(Math.abs(pointerAfterOut.y - pointer.y) < 1e-9);

  // Zoom alcanzando el límite clamp no mueve el punto
  const clampedZoom = zoomAtPoint(view, pointer, 100);
  assert.equal(clampedZoom.scale, ZOOM_LIMITS.max);
  const pointerClamped = mapToScreen(mapPtBefore, clampedZoom);
  assert.ok(Math.abs(pointerClamped.x - pointer.x) < 1e-9);
  assert.ok(Math.abs(pointerClamped.y - pointer.y) < 1e-9);
});

test('fitToContainer: encuadra y centra mapas horizontales y verticales', () => {
  // Mapa apaisado (horizontal): 2000x1000 en contenedor 1000x1000
  // La escala limitante es el ancho: 1000 / 2000 = 0.5
  // Alto escalado: 1000 * 0.5 = 500 px. Centrado vertical: (1000 - 500) / 2 = 250 px
  const horiz = fitToContainer(2000, 1000, 1000, 1000);
  assert.equal(horiz.scale, 0.5);
  assert.equal(horiz.x, 0);
  assert.equal(horiz.y, 250);

  // Mapa vertical: 800x1600 en contenedor 1000x1000
  // La escala limitante es el alto: 1000 / 1600 = 0.625
  // Ancho escalado: 800 * 0.625 = 500 px. Centrado horizontal: (1000 - 500) / 2 = 250 px
  const vert = fitToContainer(800, 1600, 1000, 1000);
  assert.equal(vert.scale, 0.625);
  assert.equal(vert.x, 250);
  assert.equal(vert.y, 0);

  // Dimensiones inválidas o cero devuelven escala 1 por seguridad
  assert.deepEqual(fitToContainer(0, 500, 800, 600), { scale: 1, x: 0, y: 0 });
});

test('snapToGrid: ajusta con offset y con tamaños 1 a 4, incluidos los bordes', () => {
  const grid = { size: 70, offsetX: 15, offsetY: 25, visible: true };

  // 1. Sin bounds, tamaño 1: celda (0,0) -> (15, 25)
  assert.deepEqual(snapToGrid({ x: 18, y: 30 }, grid, 1), { x: 15, y: 25 });
  // Cercano a celda (1, 2): x = 15 + 70 = 85, y = 25 + 140 = 165
  assert.deepEqual(snapToGrid({ x: 90, y: 160 }, grid, 1), { x: 85, y: 165 });
  // Redondeo exacto en la frontera: < 35 round down, > 35 round up
  assert.deepEqual(snapToGrid({ x: 15 + 34, y: 25 + 36 }, grid, 1), { x: 15, y: 25 + 70 });

  // 2. Con bounds (ancho 700, alto 700) y diferentes tamaños de token (1 a 4)
  const bounds = { width: 700, height: 700 };

  // Token tamaño 1 (1 celda = 70px)
  // Max col = floor((700 - 15 - 70) / 70) = floor(615 / 70) = 8
  // Max x = 15 + 8 * 70 = 575 (575 + 70 = 645 <= 700)
  assert.deepEqual(snapToGrid({ x: 1000, y: 1000 }, grid, 1, bounds), { x: 575, y: 585 });
  // Borde izquierdo / negativo se acota a 0 (primera celda válida)
  assert.deepEqual(snapToGrid({ x: -100, y: -50 }, grid, 1, bounds), { x: 15, y: 25 });

  // Token tamaño 2 (2 celdas = 140px)
  // Max col = floor((700 - 15 - 140) / 70) = floor(545 / 70) = 7
  // Max x = 15 + 7 * 70 = 505 (505 + 140 = 645 <= 700)
  assert.deepEqual(snapToGrid({ x: 1000, y: 1000 }, grid, 2, bounds), { x: 505, y: 515 });

  // Token tamaño 3 (3 celdas = 210px)
  // Max col = floor((700 - 15 - 210) / 70) = floor(475 / 70) = 6
  // Max x = 15 + 6 * 70 = 435 (435 + 210 = 645 <= 700)
  assert.deepEqual(snapToGrid({ x: 999, y: 999 }, grid, 3, bounds), { x: 435, y: 445 });

  // Token tamaño 4 (4 celdas = 280px)
  // Max col = floor((700 - 15 - 280) / 70) = floor(405 / 70) = 5
  // Max x = 15 + 5 * 70 = 365 (365 + 280 = 645 <= 700)
  assert.deepEqual(snapToGrid({ x: 800, y: 800 }, grid, 4, bounds), { x: 365, y: 375 });
});

test('pinchZoom: al separar los dedos aumenta la escala y al juntarlos disminuye', () => {
  const view = { scale: 1.0, x: 0, y: 0 };
  const p1Prev = { x: 100, y: 200 };
  const p2Prev = { x: 200, y: 200 }; // Distancia = 100 px

  // Separar los dedos a distancia 200 px (factor 2x)
  const p1CurrZoomIn = { x: 50, y: 200 };
  const p2CurrZoomIn = { x: 250, y: 200 };
  const zoomedIn = pinchZoom(view, p1Prev, p2Prev, p1CurrZoomIn, p2CurrZoomIn);
  assert.equal(zoomedIn.scale, 2.0);

  // Juntar los dedos a distancia 50 px (factor 0.5x)
  const p1CurrZoomOut = { x: 125, y: 200 };
  const p2CurrZoomOut = { x: 175, y: 200 };
  const zoomedOut = pinchZoom(view, p1Prev, p2Prev, p1CurrZoomOut, p2CurrZoomOut);
  assert.equal(zoomedOut.scale, 0.5);

  // Traslación pura con 2 dedos (pan sin cambiar distancia)
  const p1Pan = { x: 150, y: 250 };
  const p2Pan = { x: 250, y: 250 }; // Distancia = 100 px, delta = (+50, +50)
  const panned = pinchZoom(view, p1Prev, p2Prev, p1Pan, p2Pan);
  assert.equal(panned.scale, 1.0);
  assert.equal(panned.x, 50);
  assert.equal(panned.y, 50);
});
