// src/scripts/vtt/ping.ts
// Lógica pura del ping en el mapa (T-51b, RF-14): detección de clic largo y color por usuario.

import type { Point } from './geometry.ts';

export const LONG_PRESS_MS = 500;
/** Movimiento máximo (px de pantalla) que tolera un clic largo antes de cancelarse. */
export const LONG_PRESS_MOVE_PX = 6;

/** true si el puntero se movió lo suficiente como para dejar de ser un clic largo. */
export function exceedsLongPressMove(start: Point, current: Point, threshold = LONG_PRESS_MOVE_PX): boolean {
  return Math.hypot(current.x - start.x, current.y - start.y) > threshold;
}

const PING_COLORS = ['#f59e0b', '#38bdf8', '#34d399', '#f472b6', '#a78bfa', '#fb7185', '#facc15', '#2dd4bf'];

/** Color estable por usuario (mismo uid, mismo color en todas las pantallas). */
export function pingColor(uid: string): string {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return PING_COLORS[h % PING_COLORS.length];
}
