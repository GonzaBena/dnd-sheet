// src/scripts/vtt/fog.ts
// Lógica pura para la niebla de guerra del VTT (T-40, T-41).
// Sin dependencias de UI, DOM ni Firebase para ejecución directa en Node.js y navegador.

import type { FogShape } from '../models/map.ts';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FogOperation {
  op: 'reveal' | 'cover';
  shape: FogShape;
}

export interface AppendFogResult {
  list: FogShape[];
  warn: boolean;
  rejected: boolean;
}

/**
 * Normaliza dos puntos de arrastre arbitrarios en un rectángulo con ancho y alto positivos.
 */
export function normalizeRect(x1: number, y1: number, x2: number, y2: number): Rect {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  return { x, y, w, h };
}

/**
 * Acota un rectángulo a los límites de la imagen original.
 */
export function clampRectToImage(r: Rect, imgW: number, imgH: number): Rect {
  const x1 = Math.max(0, Math.min(imgW, r.x));
  const y1 = Math.max(0, Math.min(imgH, r.y));
  const x2 = Math.max(0, Math.min(imgW, r.x + r.w));
  const y2 = Math.max(0, Math.min(imgH, r.y + r.h));

  return {
    x: x1,
    y: y1,
    w: Math.max(0, x2 - x1),
    h: Math.max(0, y2 - y1),
  };
}

/**
 * Determina si un rectángulo es diminuto (p.ej. clics accidentales sin arrastre).
 */
export function isTinyRect(r: { w: number; h: number }, minPx = 4): boolean {
  return r.w < minPx || r.h < minPx;
}

/**
 * Agrega una forma a la lista de niebla respetando el límite máximo.
 * // DECISION: F4-1, F4-2: Notifica advertencia a las 450 formas y rechaza al llegar a 500.
 */
export function appendFog(
  list: FogShape[],
  shape: FogShape,
  max = 500
): AppendFogResult {
  if (list.length >= max) {
    return {
      list,
      warn: true,
      rejected: true,
    };
  }

  const newList = [...list, shape];
  return {
    list: newList,
    warn: newList.length >= 450,
    rejected: false,
  };
}

/**
 * Transforma la lista de formas en operaciones secuenciales de dibujo ('reveal' o 'cover').
 * // DECISION: F4-1: FogShape lleva op?: 'cover'. Las formas se aplican en orden:
 * sin `op` (o distinto de 'cover') revela; con `op: 'cover'` vuelve a cubrir.
 */
export function fogOps(list: FogShape[]): FogOperation[] {
  return list.map((shape) => ({
    op: shape.op === 'cover' ? 'cover' : 'reveal',
    shape,
  }));
}

/**
 * Simplifica una secuencia de puntos [x0, y0, x1, y1, ...] descartando puntos intermedios
 * cuya distancia euclidiana al punto retenido anterior sea inferior a `minDistance`.
 */
export function simplifyPoints(points: number[], minDistance = 8): number[] {
  if (points.length <= 2) return [...points];

  const simplified: number[] = [points[0], points[1]];
  let lastX = points[0];
  let lastY = points[1];

  const minDistanceSq = minDistance * minDistance;
  const len = points.length;

  for (let i = 2; i < len - 2; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    const dx = x - lastX;
    const dy = y - lastY;
    if (dx * dx + dy * dy >= minDistanceSq) {
      simplified.push(x, y);
      lastX = x;
      lastY = y;
    }
  }

  // Siempre conservar el último punto para no recortar el final del trazo
  const endX = points[len - 2];
  const endY = points[len - 1];
  const lastAddedX = simplified[simplified.length - 2];
  const lastAddedY = simplified[simplified.length - 1];

  if (endX !== lastAddedX || endY !== lastAddedY) {
    simplified.push(endX, endY);
  }

  return simplified;
}

/**
 * Crea una forma de niebla a partir de puntos de pincel y radio.
 * Si contiene un único punto (clic sin arrastre), produce un círculo.
 */
export function createBrushShape(
  points: number[],
  radius: number,
  isCover = false
): FogShape {
  const op = isCover ? { op: 'cover' as const } : {};
  const r = Math.max(4, Math.round(radius));

  if (points.length <= 2) {
    return {
      kind: 'circle',
      x: Math.round(points[0] || 0),
      y: Math.round(points[1] || 0),
      r,
      ...op,
    };
  }

  return {
    kind: 'brush',
    points: points.map((v) => Math.round(v)),
    radius: r,
    ...op,
  };
}
