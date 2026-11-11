// src/scripts/models/catalog.ts
// Esquema común para objetos, hechizos y dotes (Spec 07, Fase C).
import type { Modifier } from './effect.ts';

export type CatalogKind = 'item' | 'spell' | 'feat';
export type CatalogSource = 'srd' | 'custom';

export interface CatalogEntry {
  id: string;
  kind: CatalogKind;
  source: CatalogSource;
  name: string;
  description: string;
  imageUrl?: string;
  meta: Record<string, unknown>; // rareza, peso, nivel, escuela, componentes…
  effects?: Modifier[];
}

export type FeatType = 'passive' | 'conditional' | 'active' | 'reaction';

export const FEAT_TYPE_LABELS: Record<FeatType, string> = {
  passive: 'Pasiva',
  conditional: 'Condicional',
  active: 'Activa',
  reaction: 'Reacción',
};
