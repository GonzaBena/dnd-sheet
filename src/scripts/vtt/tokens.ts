// src/scripts/vtt/tokens.ts
// Lógica pura de tokens para el VTT.
// Sin dependencias de UI, DOM ni Firebase para poder ejecutarse directamente en Node.js y navegador.

import type { Token, GridConfig } from '../models/map.ts';
import type { SessionStatus } from '../models/campaign.ts';
import { snapToGrid, type Point, type SizeLike } from './geometry.ts';
import { normalizeStatus } from './sessionStatus.ts';

export interface TokenViewer {
  uid: string | null;
  isDm: boolean;
}

export interface LiveTokenPosition {
  x: number;
  y: number;
  receivedAt: number;
  by?: string;
}

/**
 * Límite de caducidad para posiciones 'live' sin refrescar (F3-5).
 * Si un cliente se desconecta o cuelga durante 5s, se vuelve a la posición fija de Firestore.
 */
export const LIVE_TTL_MS = 5000;

/**
 * Valida si un espectador puede mover un token dado en el estado actual de la partida.
 * Coherente con las reglas de Firestore y RTDB (D7, RF-23).
 */
export function canMoveToken(
  token: Pick<Token, 'ownerUid'>,
  viewer: TokenViewer,
  status: SessionStatus | string
): boolean {
  const norm = normalizeStatus(status);
  if (norm !== 'active') return false;
  if (viewer.isDm) return true;
  if (!viewer.uid) return false;
  return token.ownerUid === viewer.uid;
}

/**
 * Calcula el tamaño en píxeles de un token según la grilla del mapa (F3-1).
 */
export function tokenPixelSize(
  token: { size: number },
  grid: Pick<GridConfig, 'size'>
): number {
  const cellSize = Math.max(1, grid.size);
  const tokenSize = Math.max(1, token.size || 1);
  return tokenSize * cellSize;
}

/**
 * Ajusta la posición de un token a la grilla y dentro de los límites del mapa.
 */
export function snapTokenPosition(
  pos: Point,
  token: { size: number },
  grid: Pick<GridConfig, 'size' | 'offsetX' | 'offsetY'>,
  bounds?: SizeLike
): Point {
  return snapToGrid(pos, grid, token.size || 1, bounds);
}

/**
 * Resuelve la posición efectiva de un token dando prioridad a 'live' si tiene menos de 5 segundos.
 *
 * DECISION (F3-5): Si una posición live queda sin actualizar por más de 5 s
 * (por ejemplo, un cliente colgado), se ignora y se muestra la de Firestore.
 */
export function resolveTokenPosition(
  token: Pick<Token, 'x' | 'y'>,
  live?: LiveTokenPosition | null,
  now?: number
): Point {
  if (live && typeof live.x === 'number' && typeof live.y === 'number') {
    const currentTime = typeof now === 'number' ? now : Date.now();
    if (currentTime - live.receivedAt < LIVE_TTL_MS) {
      return { x: live.x, y: live.y };
    }
  }
  return { x: token.x, y: token.y };
}

/**
 * Genera un identificador único para tokens en formato tok-<timestamp36><random4>.
 *
 * DECISION (F3-3): Los ids de token son tok-${Date.now().toString(36)}${random4}.
 */
export function newTokenId(): string {
  const time = Date.now().toString(36);
  const random4 = Math.random().toString(36).substring(2, 6).padEnd(4, '0');
  return `tok-${time}${random4}`;
}
