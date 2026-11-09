// src/scripts/vtt/geometry.ts
// Lógica pura de geometría y transformaciones de viewport para el VTT.
// Sin dependencias de UI, DOM ni Firebase para ser testeable directamente en Node.js.

// DECISION (F2-1): Todo se almacena en píxeles de la imagen original (imageWidth / imageHeight).
// El viewport (escala y posición) mapea entre coordenadas de pantalla (stage) y del mapa original.

export interface Point {
  x: number;
  y: number;
}

export interface Viewport {
  scale: number;
  x: number;
  y: number;
}

export interface GridConfigLike {
  size: number;
  offsetX: number;
  offsetY: number;
  visible?: boolean;
}

export interface SizeLike {
  width: number;
  height: number;
}

export const ZOOM_LIMITS = {
  min: 0.1,
  max: 8.0,
} as const;

/**
 * Convierte un punto de la pantalla (stage coords) a coordenadas del mapa original.
 */
export function screenToMap(p: Point, view: Viewport): Point {
  return {
    x: (p.x - view.x) / view.scale,
    y: (p.y - view.y) / view.scale,
  };
}

/**
 * Convierte un punto del mapa original a coordenadas de pantalla (stage coords).
 */
export function mapToScreen(p: Point, view: Viewport): Point {
  return {
    x: p.x * view.scale + view.x,
    y: p.y * view.scale + view.y,
  };
}

/**
 * Limita el valor de escala entre un mínimo y un máximo.
 */
export function clampZoom(scale: number, min = ZOOM_LIMITS.min, max = ZOOM_LIMITS.max): number {
  return Math.max(min, Math.min(max, scale));
}

/**
 * Aplica zoom centrado en un punto específico de la pantalla (p. ej. posición del puntero/cursor),
 * de modo que el punto del mapa que está bajo el cursor no se mueva.
 */
export function zoomAtPoint(
  view: Viewport,
  pointer: Point,
  factor: number,
  min = ZOOM_LIMITS.min,
  max = ZOOM_LIMITS.max
): Viewport {
  const newScale = clampZoom(view.scale * factor, min, max);
  if (newScale === view.scale) {
    return { ...view };
  }

  // Punto del mapa bajo el puntero antes de hacer zoom
  const mapPt = screenToMap(pointer, view);

  // Nueva posición del viewport para mantener ese punto del mapa en el puntero de pantalla
  return {
    scale: newScale,
    x: pointer.x - mapPt.x * newScale,
    y: pointer.y - mapPt.y * newScale,
  };
}

/**
 * Calcula el viewport para encuadrar completamente la imagen ("fit") en el contenedor,
 * centrándola horizontal y verticalmente.
 */
export function fitToContainer(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
  min = ZOOM_LIMITS.min,
  max = ZOOM_LIMITS.max
): Viewport {
  if (imgW <= 0 || imgH <= 0 || boxW <= 0 || boxH <= 0) {
    return { scale: 1, x: 0, y: 0 };
  }

  const scale = clampZoom(Math.min(boxW / imgW, boxH / imgH), min, max);
  const x = (boxW - imgW * scale) / 2;
  const y = (boxH - imgH * scale) / 2;

  return { scale, x, y };
}

/**
 * Ajusta la esquina superior izquierda de un token a la celda de la grilla más cercana,
 * teniendo en cuenta offsetX y offsetY.
 * Opcionalmente acota la posición dentro de los límites de la imagen (bounds).
 */
export function snapToGrid(
  pos: Point,
  grid: GridConfigLike,
  tokenSize = 1,
  bounds?: SizeLike
): Point {
  const size = Math.max(1, grid.size);
  let col = Math.round((pos.x - grid.offsetX) / size);
  let row = Math.round((pos.y - grid.offsetY) / size);

  if (bounds) {
    const tokenPixelWidth = tokenSize * size;
    const tokenPixelHeight = tokenSize * size;
    const maxCol = Math.floor((bounds.width - grid.offsetX - tokenPixelWidth) / size);
    const maxRow = Math.floor((bounds.height - grid.offsetY - tokenPixelHeight) / size);

    col = Math.max(0, Math.min(col, maxCol));
    row = Math.max(0, Math.min(row, maxRow));
  }

  return {
    x: grid.offsetX + col * size,
    y: grid.offsetY + row * size,
  };
}

/**
 * Calcula un nuevo viewport a partir de un gesto multi-touch (pinch-to-zoom + pan de 2 dedos).
 */
export function pinchZoom(
  view: Viewport,
  p1Prev: Point,
  p2Prev: Point,
  p1: Point,
  p2: Point,
  min = ZOOM_LIMITS.min,
  max = ZOOM_LIMITS.max
): Viewport {
  const dPrev = Math.hypot(p2Prev.x - p1Prev.x, p2Prev.y - p1Prev.y);
  const dCurr = Math.hypot(p2.x - p1.x, p2.y - p1.y);

  if (dPrev === 0) {
    return { ...view };
  }

  const factor = dCurr / dPrev;
  const newScale = clampZoom(view.scale * factor, min, max);

  const cPrev = { x: (p1Prev.x + p2Prev.x) / 2, y: (p1Prev.y + p2Prev.y) / 2 };
  const cCurr = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

  // El punto del mapa bajo el centro anterior se traslada al nuevo centro
  const m = screenToMap(cPrev, view);

  return {
    scale: newScale,
    x: cCurr.x - m.x * newScale,
    y: cCurr.y - m.y * newScale,
  };
}
