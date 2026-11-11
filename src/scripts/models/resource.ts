// src/scripts/models/resource.ts
// Registro unificado de recursos (Spec 07, Fase A).

export type RechargeOn = 'turn' | 'shortRest' | 'longRest' | 'manual';

export interface Resource {
  id: string;
  name: string;
  max: number;
  used: number; // 0..max
  rechargeOn: RechargeOn;
  source?: string; // 'wildShape' | 'feature:<id>' | 'custom'
  values?: number[]; // dados guardados (RF-235); longitud <= max
}

export const SPELL_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export interface SlotState {
  total: number;
  used: number;
}
