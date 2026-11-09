// src/scripts/models/map.ts
// Mapas del VTT: campaigns/{cid}/maps/{mid} y su doc privado maps/{mid}/private/dmOnly.
// Solo `interface`/`type` (sin enum): Node importa estos archivos directo en los tests.

export interface GridConfig {
  /** Lado de la celda en px de la imagen original (1 celda = 5 ft). */
  size: number;
  offsetX: number;
  offsetY: number;
  visible: boolean;
  /** Color de la cuadrícula en formato hex (ej: '#ffffff'). Por defecto '#ffffff'. */
  color?: string;
  /** Opacidad de la cuadrícula entre 0.05 y 1 (ej: 0.7). Por defecto 0.65. */
  opacity?: number;
}

export interface Token {
  name: string;
  /** Unidades de la imagen original (px de imagen). */
  x: number;
  y: number;
  /** Celdas por lado. */
  size: 1 | 2 | 3 | 4;
  imageUrl?: string;
  color?: string;
  /** null = solo lo mueve el DM. */
  ownerUid: string | null;
  characterId?: string;
}

export type FogShape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; op?: 'cover' }
  | { kind: 'poly'; points: number[]; op?: 'cover' };

/**
 * Lo escribe el cliente junto con cada movimiento de un jugador: las reglas no pueden saber
 * qué token cambió a partir de affectedKeys(), así que validan contra `tokenId`.
 */
export interface LastMove {
  tokenId: string;
  by: string;
  at: number;
}

export interface MapDoc {
  /** = id del documento (no se guarda; se agrega al leer). */
  id: string;
  name: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  grid: GridConfig;
  tokens: Record<string, Token>;
  fogRevealed: FogShape[];
  lastMove?: LastMove;
  updatedAt: number;
}

/** maps/{mid}/private/dmOnly: tokens que los jugadores no ven. */
export interface DmOnly {
  secretTokens: Record<string, Token>;
}

/** Límites que también imponen las reglas (F0-3). */
export const MAP_LIMITS = {
  maxTokens: 200,
  maxNameLength: 80,
  maxUrlLength: 2048,
  maxFogShapes: 500,
} as const;
