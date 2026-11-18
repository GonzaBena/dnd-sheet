// src/scripts/vtt/tokens.ts
// Lógica pura de tokens para el VTT.
// Sin dependencias de UI, DOM ni Firebase para poder ejecutarse directamente en Node.js y navegador.

import type { Token, GridConfig } from '../models/map.ts';
import type { SessionStatus } from '../models/campaign.ts';
import type { CharacterCompanion } from '../models/character.ts';
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
 * Genera un identificador único para tokens en formato <prefix>-<timestamp36><random4>.
 *
 * DECISION (F3-3): Los ids de token son tok-${Date.now().toString(36)}${random4}.
 * El prefijo es opcional (p. ej. `tok-comp`, `tok-pc`) y solo sirve para depurar.
 */
export function newTokenId(prefix = 'tok'): string {
  const time = Date.now().toString(36);
  const random4 = Math.random().toString(36).substring(2, 6).padEnd(4, '0');
  return `${prefix || 'tok'}-${time}${random4}`;
}

/**
 * Construye un objeto Token para un compañero o criatura invocada subordinada (Spec 13, H6 · RF-354).
 * Asigna el ownerUid del jugador para permitir su control y movimiento en tiempo real.
 */
export function buildCompanionToken(
  companion: CharacterCompanion,
  char: { id: string; name: string },
  ownerUid: string,
  pos?: { x: number; y: number }
): Token {
  const kind = companion.type === 'mount'
    ? 'mount'
    : companion.type === 'summon'
    ? 'summon'
    : 'companion';

  return {
    name: `${companion.name} (${char.name})`,
    x: pos?.x ?? 0,
    y: pos?.y ?? 0,
    size: companion.size || 1,
    imageUrl: companion.avatarUrl,
    color: companion.type === 'mount' ? '#f59e0b' : companion.type === 'summon' ? '#06b6d4' : '#10b981',
    ownerUid,
    characterId: char.id,
    kind,
    companionId: companion.id,
  };
}

/** Personaje mínimo necesario para resolver el dueño de su token. */
export interface TokenOwnerSource {
  id: string;
  userId?: string | null;
}

/** Un token de compañero, montura o invocación pertenece al personaje pero no lo representa. */
export function isCompanionToken(token: Pick<Token, 'kind' | 'companionId'>): boolean {
  return (
    !!token.companionId ||
    token.kind === 'companion' ||
    token.kind === 'mount' ||
    token.kind === 'summon'
  );
}

/**
 * Busca el token que representa a un personaje. Solo empareja por characterId:
 * ni el nombre ni el dueño identifican al personaje (un compañero comparte dueño).
 */
export function findCharacterToken(
  tokens: Record<string, Token>,
  characterId: string
): [string, Token] | undefined {
  return Object.entries(tokens).find(
    ([, t]) => t.characterId === characterId && !isCompanionToken(t)
  );
}

/**
 * Dueño que debe tener un token: el elegido a mano si lo hay; si no, el usuario
 * actual del personaje vinculado. null = solo el DM.
 */
export function resolveTokenOwner(
  token: Pick<Token, 'ownerUid' | 'characterId'>,
  characters: TokenOwnerSource[]
): string | null {
  if (token.ownerUid) return token.ownerUid;
  if (!token.characterId) return null;
  const char = characters.find((c) => c.id === token.characterId);
  return char?.userId || null;
}

/**
 * Tokens vinculados a un personaje que quedaron sin dueño (p. ej. desplegados antes
 * de que la ficha estuviera asociada a un usuario) y el dueño que les corresponde.
 */
export function findMissingTokenOwners(
  tokens: Record<string, Token>,
  characters: TokenOwnerSource[]
): Array<{ tid: string; ownerUid: string }> {
  const fixes: Array<{ tid: string; ownerUid: string }> = [];
  for (const [tid, t] of Object.entries(tokens)) {
    if (t.ownerUid || !t.characterId) continue;
    const ownerUid = resolveTokenOwner(t, characters);
    if (ownerUid) fixes.push({ tid, ownerUid });
  }
  return fixes;
}
