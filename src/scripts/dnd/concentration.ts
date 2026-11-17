// src/scripts/dnd/concentration.ts
// Lógica pura de concentración activa y cálculo de salvación de Constitución ante daño (Spec 11, H4).

import type { ActiveEffect, CharacterData } from '../models/character.ts';
import type { ConcentrationCheckRequired, ConcentrationStatus } from '../models/combat.ts';

/**
 * Calcula la Clase de Dificultad (CD) para mantener la concentración tras recibir daño.
 * Regla oficial SRD 5.1: CD = Math.max(10, Math.floor(damageTaken / 2)).
 * Si el daño es <= 0, no se exige tirada (retorna 0).
 */
export function calculateConcentrationDc(damageTaken: number): number {
  if (damageTaken <= 0) return 0;
  return Math.max(10, Math.floor(damageTaken / 2));
}

/** Comprueba si una cadena de duración o notas describe un conjuro con concentración. */
export function isConcentrationDuration(durationStr?: string, notes?: string): boolean {
  const target = `${durationStr || ''} ${notes || ''}`.toLowerCase();
  return /concentra/i.test(target);
}

/** Obtiene el efecto de concentración activo actual del personaje, si existe. */
export function getActiveConcentrationEffect(char: CharacterData): ActiveEffect | undefined {
  return (char.activeEffects || []).find((e) => e.duration.kind === 'concentration');
}

/** Obtiene el estado resumido de concentración del personaje. */
export function getConcentrationStatus(char: CharacterData): ConcentrationStatus {
  const active = getActiveConcentrationEffect(char);
  if (!active) {
    return { isConcentrating: false };
  }
  return {
    isConcentrating: true,
    effectId: active.id,
    sourceName: active.name,
  };
}

/**
 * Evalúa si una reducción de PG debe disparar una salvación de concentración.
 * Devuelve los detalles del chequeo requerido o null si no aplica.
 */
export function evaluateConcentrationOnDamage(
  char: CharacterData,
  damageTaken: number
): ConcentrationCheckRequired | null {
  if (damageTaken <= 0) return null;
  const active = getActiveConcentrationEffect(char);
  if (!active) return null;

  return {
    characterId: char.id,
    damageTaken,
    dc: calculateConcentrationDc(damageTaken),
    sourceName: active.name,
    effectId: active.id,
  };
}
