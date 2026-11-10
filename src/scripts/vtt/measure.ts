// src/scripts/vtt/measure.ts
// Regla de medición del mapa (T-53, RF-13). Lógica pura y local: no se sincroniza ni escribe nada.

import type { Point, GridConfigLike } from './geometry.ts';

/** D9: cada celda de la grilla equivale a 5 pies. */
export const FEET_PER_CELL = 5;

export interface Measurement {
  cells: number;
  feet: number;
}

/**
 * Distancia entre dos puntos (px de imagen) en celdas y pies.
 * DECISION (F5-6): regla 5/5/5 de 5e (distancia Chebyshev): cada casilla diagonal cuenta como 5 ft.
 */
export function measureCells(a: Point, b: Point, grid: GridConfigLike): Measurement {
  const size = grid.size > 0 ? grid.size : 50;
  const toCell = (p: Point) => ({
    cx: Math.floor((p.x - grid.offsetX) / size),
    cy: Math.floor((p.y - grid.offsetY) / size),
  });
  const ca = toCell(a);
  const cb = toCell(b);
  const cells = Math.max(Math.abs(cb.cx - ca.cx), Math.abs(cb.cy - ca.cy));
  return { cells, feet: cells * FEET_PER_CELL };
}

/** Texto de la etiqueta: "6 celdas · 30 ft". */
export function formatMeasurement(m: Measurement): string {
  return `${m.cells} ${m.cells === 1 ? 'celda' : 'celdas'} · ${m.feet} ft`;
}
