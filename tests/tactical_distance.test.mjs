// tests/tactical_distance.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTokenGridBounds,
  calculateTokenDistanceFeet,
  resolveCombatantDistance,
} from '../src/scripts/vtt/tacticalCombat.ts';

test('getTokenGridBounds calculates correct column and row bounds for various token sizes', () => {
  const grid = { size: 50, offsetX: 0, offsetY: 0 };

  // Token Mediano (1x1) en celda (0, 0)
  const t1 = { x: 0, y: 0, size: 1 };
  const b1 = getTokenGridBounds(t1, grid);
  assert.deepEqual(b1, { minCol: 0, maxCol: 0, minRow: 0, maxRow: 0 });

  // Token Mediano (1x1) en celda (3, 5) => x = 150, y = 250
  const t2 = { x: 150, y: 250, size: 1 };
  const b2 = getTokenGridBounds(t2, grid);
  assert.deepEqual(b2, { minCol: 3, maxCol: 3, minRow: 5, maxRow: 5 });

  // Token Grande (2x2) en celda (2, 4) => x = 100, y = 200
  const t3 = { x: 100, y: 200, size: 2 };
  const b3 = getTokenGridBounds(t3, grid);
  assert.deepEqual(b3, { minCol: 2, maxCol: 3, minRow: 4, maxRow: 5 });

  // Token Enorme (3x3) con offsets en el mapa (offsetX: 10, offsetY: 20)
  const offsetGrid = { size: 40, offsetX: 10, offsetY: 20 };
  const t4 = { x: 90, y: 140, size: 3 }; // (90 - 10)/40 = 2, (140 - 20)/40 = 3
  const b4 = getTokenGridBounds(t4, offsetGrid);
  assert.deepEqual(b4, { minCol: 2, maxCol: 4, minRow: 3, maxRow: 5 });
});

test('calculateTokenDistanceFeet handles 1x1 tokens: adjacent, diagonal, distance and overlap', () => {
  const grid = { size: 50, offsetX: 0, offsetY: 0 };

  const origin = { x: 0, y: 0, size: 1 }; // (0, 0)

  // 1. Ortogonalmente adyacente a la derecha (1, 0) => 5 pies, adyacente
  const right = { x: 50, y: 0, size: 1 };
  const dRight = calculateTokenDistanceFeet(origin, right, grid);
  assert.equal(dRight.cells, 1);
  assert.equal(dRight.feet, 5);
  assert.equal(dRight.adjacent, true);
  assert.equal(dRight.overlapping, false);

  // 2. Diagonalmente adyacente (1, 1) => 5 pies, adyacente (regla 5/5/5 de 5e)
  const diag = { x: 50, y: 50, size: 1 };
  const dDiag = calculateTokenDistanceFeet(origin, diag, grid);
  assert.equal(dDiag.cells, 1);
  assert.equal(dDiag.feet, 5);
  assert.equal(dDiag.adjacent, true);
  assert.equal(dDiag.overlapping, false);

  // 3. Dos casillas de distancia horizontal (2, 0) => 10 pies (alcance de alabarda)
  const reach = { x: 100, y: 0, size: 1 };
  const dReach = calculateTokenDistanceFeet(origin, reach, grid);
  assert.equal(dReach.cells, 2);
  assert.equal(dReach.feet, 10);
  assert.equal(dReach.adjacent, false);
  assert.equal(dReach.overlapping, false);

  // 4. Seis casillas de distancia (30 pies)
  const far = { x: 300, y: 200, size: 1 }; // max(6, 4) = 6 celdas
  const dFar = calculateTokenDistanceFeet(origin, far, grid);
  assert.equal(dFar.cells, 6);
  assert.equal(dFar.feet, 30);
  assert.equal(dFar.adjacent, false);

  // 5. Misma casilla (solapados)
  const same = { x: 0, y: 0, size: 1 };
  const dSame = calculateTokenDistanceFeet(origin, same, grid);
  assert.equal(dSame.cells, 0);
  assert.equal(dSame.feet, 0);
  assert.equal(dSame.adjacent, false);
  assert.equal(dSame.overlapping, true);
});

test('calculateTokenDistanceFeet measures edge-to-edge for multi-cell tokens (Large, Huge, Gargantuan)', () => {
  const grid = { size: 50, offsetX: 0, offsetY: 0 };

  // Token A: Mediano (1x1) en (0, 0) -> ocupa col 0, fila 0
  const tokenMed = { x: 0, y: 0, size: 1 };

  // Token B: Grande (2x2) en (50, 0) -> ocupa col 1..2, fila 0..1
  // Como col 1 es contigua a col 0 y fila 0 se solapa, están en contacto
  const tokenLargeAdjacent = { x: 50, y: 0, size: 2 };
  const dLargeAdj = calculateTokenDistanceFeet(tokenMed, tokenLargeAdjacent, grid);
  assert.equal(dLargeAdj.cells, 1);
  assert.equal(dLargeAdj.feet, 5);
  assert.equal(dLargeAdj.adjacent, true);

  // Token C: Grande (2x2) en (100, 50) -> ocupa col 2..3, fila 1..2
  // Separación respecto a (0,0): deltaCol = 2 - 0 = 2, deltaRow = 1 - 0 = 1 => cells = 2 (10 pies)
  const tokenLargeReach = { x: 100, y: 50, size: 2 };
  const dLargeReach = calculateTokenDistanceFeet(tokenMed, tokenLargeReach, grid);
  assert.equal(dLargeReach.cells, 2);
  assert.equal(dLargeReach.feet, 10);
  assert.equal(dLargeReach.adjacent, false);

  // Token D: Enorme (3x3) en (0, 100) -> ocupa col 0..2, fila 2..4
  // Separación con Token B (Grande en 1..2, 0..1):
  // deltaCol = 0 (se solapan en cols 1 y 2), deltaRow = 2 - 1 = 1 => 5 pies (adyacentes)
  const tokenHuge = { x: 0, y: 100, size: 3 };
  const dHugeLarge = calculateTokenDistanceFeet(tokenLargeAdjacent, tokenHuge, grid);
  assert.equal(dHugeLarge.cells, 1);
  assert.equal(dHugeLarge.feet, 5);
  assert.equal(dHugeLarge.adjacent, true);

  // Token E: Gigantesco (4x4) en (300, 300) -> ocupa col 6..9, fila 6..9
  // Separación con Token A (0..0, 0..0): deltaCol = 6 - 0 = 6, deltaRow = 6 - 0 = 6 => 30 pies
  const tokenGargantuan = { x: 300, y: 300, size: 4 };
  const dGarg = calculateTokenDistanceFeet(tokenMed, tokenGargantuan, grid);
  assert.equal(dGarg.cells, 6);
  assert.equal(dGarg.feet, 30);
});

test('resolveCombatantDistance finds tokens by tokenId or characterId and calculates distance', () => {
  const mapDoc = {
    grid: { size: 50, offsetX: 0, offsetY: 0 },
    tokens: {
      'tok-fighter': { x: 0, y: 0, size: 1, characterId: 'char-lyra' },
      'tok-goblin': { x: 150, y: 0, size: 1 }, // a 3 casillas (15 pies)
      'tok-ogre': { x: 0, y: 100, size: 2, characterId: 'char-ogre' }, // Grande en fila 2..3 => a 10 pies de (0,0)
    },
  };

  const actor = { id: 'c1', tokenId: 'tok-fighter', characterId: 'char-lyra' };
  const goblin = { id: 'c2', tokenId: 'tok-goblin' };
  const ogre = { id: 'c3', characterId: 'char-ogre' }; // sin tokenId explícito, busca por characterId
  const unknown = { id: 'c4', tokenId: 'tok-ghost' };

  // 1. Actor vs Goblin (por tokenId) -> 15 pies
  const dGoblin = resolveCombatantDistance(actor, goblin, mapDoc);
  assert.notEqual(dGoblin, null);
  assert.equal(dGoblin.feet, 15);
  assert.equal(dGoblin.cells, 3);

  // 2. Actor vs Ogre (por characterId) -> deltaCol = 0, deltaRow = 2 - 0 = 2 => 10 pies
  const dOgre = resolveCombatantDistance(actor, ogre, mapDoc);
  assert.notEqual(dOgre, null);
  assert.equal(dOgre.feet, 10);
  assert.equal(dOgre.cells, 2);

  // 3. Actor vs Desconocido (token no existe en mapa) -> null
  const dUnknown = resolveCombatantDistance(actor, unknown, mapDoc);
  assert.equal(dUnknown, null);

  // 4. Sin mapa o sin tokens -> null
  assert.equal(resolveCombatantDistance(actor, goblin, null), null);
  assert.equal(resolveCombatantDistance(actor, goblin, { grid: mapDoc.grid, tokens: {} }), null);
});
