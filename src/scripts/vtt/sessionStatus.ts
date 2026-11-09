// src/scripts/vtt/sessionStatus.ts
// Utilidades puras para el manejo y validación de estados de la partida (VTT).
// Sin dependencias de UI ni SDKs para poder ser consumido en Node.js (tests unitarios) y navegador.

import type { SessionStatus } from '../models/campaign.ts';

export type SessionAction =
  | 'view'
  | 'movePlayerToken'
  | 'playerWrite'
  | 'editOwnSheet'
  | 'dmPlay'
  | 'dmPrepare'
  | 'changeStatus';

/**
 * Normaliza cualquier valor recibido de almacenamiento o reglas:
 * - 'completed' (legado) -> 'ended'
 * - 'active' | 'paused' | 'ended' se conservan
 * - Valor ausente o desconocido -> 'paused' (F0B-1)
 */
export function normalizeStatus(raw: unknown): SessionStatus {
  if (raw === 'active') return 'active';
  if (raw === 'paused') return 'paused';
  if (raw === 'ended' || raw === 'completed') return 'ended';
  return 'paused';
}

/**
 * Transiciones permitidas para el estado de la partida:
 * - active <-> paused
 * - active | paused -> ended
 * - ended -> paused (reabrir)
 * Cualquier otra (ej. ended -> active) es inválida.
 */
export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  if (from === to) return false;
  if (from === 'active' && (to === 'paused' || to === 'ended')) return true;
  if (from === 'paused' && (to === 'active' || to === 'ended')) return true;
  if (from === 'ended' && to === 'paused') return true;
  return false;
}

/**
 * Evalúa los permisos de acción según rol y estado de la sesión (Matriz D7):
 * | Acción          | active | paused | ended |
 * | view            | Sí     | Sí     | Sí    |
 * | movePlayerToken | Sí     | No     | No    |
 * | playerWrite     | Sí     | No     | No    |
 * | editOwnSheet    | Sí     | Sí     | Sí    |
 * | dmPlay          | Sí     | No     | No    |
 * | dmPrepare       | Sí     | Sí     | No    |
 * | changeStatus    | Sí     | Sí     | Sí (reabrir a paused) |
 */
export function canPerform(action: SessionAction, role: 'dm' | 'player', status: SessionStatus): boolean {
  const s = normalizeStatus(status);

  switch (action) {
    case 'view':
      return true;

    case 'movePlayerToken':
      return role === 'player' && s === 'active';

    case 'playerWrite':
      return role === 'player' && s === 'active';

    case 'editOwnSheet':
      return true;

    case 'dmPlay':
      return role === 'dm' && s === 'active';

    case 'dmPrepare':
      return role === 'dm' && (s === 'active' || s === 'paused');

    case 'changeStatus':
      return role === 'dm';

    default:
      return false;
  }
}

/**
 * Etiqueta legible para mostrar en banners, bitácora e interfaz.
 */
export function statusLabel(status: SessionStatus): string {
  const s = normalizeStatus(status);
  switch (s) {
    case 'active':
      return 'Partida iniciada';
    case 'paused':
      return 'Partida pausada';
    case 'ended':
      return 'Partida terminada';
  }
}
