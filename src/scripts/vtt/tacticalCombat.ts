// src/scripts/vtt/tacticalCombat.ts
// Reglas tácticas de combate 5e: validación de turnos, alcances de armas, conjuros y objetos.

import type { Combatant } from '../models/combat.ts';
import type { AttackAction, SpellItem, InventoryItem } from '../models/character.ts';

export interface ActionReach {
  normal: number;
  max: number;
  isRanged: boolean;
  isReach: boolean;
  isThrown: boolean;
  isTouch?: boolean;
  isSelf?: boolean;
  label: string;
}

export interface ReachValidationResult {
  valid: boolean;
  disadvantage: boolean;
  reason?: string;
  badgeText: string;
}

/**
 * Valida si un combatiente puede atacar a otro objetivo según el turno activo y su facción.
 */
export function canCombatantAttackTarget(
  actor: Pick<Combatant, 'id' | 'isPlayer' | 'hp'>,
  target: Pick<Combatant, 'id' | 'isPlayer' | 'hp'>,
  isActorTurn: boolean
): boolean {
  if (!isActorTurn) return false;
  if (actor.id === target.id) return false;
  if (actor.isPlayer === target.isPlayer) return false; // Jugadores atacan enemigos, enemigos atacan jugadores
  return true;
}

/**
 * Extrae el alcance en pies (ft) de un arma / acción física de ataque según 5e.
 */
export function getWeaponReachFeet(action: Partial<AttackAction>): ActionReach {
  const typeStr = (action.type || '').toLowerCase();
  const tagsStr = (action.tags || []).join(' ').toLowerCase();
  const notesStr = (action.notes || '').toLowerCase();
  const combined = `${typeStr} ${tagsStr} ${notesStr}`;

  // Detección de alcance con tags numéricos (ej: 'rango 150/600', '20/60', '80/320')
  const rangeMatch = combined.match(/(?:rango|range)?\s*(\d+)\s*\/\s*(\d+)/i);
  if (rangeMatch) {
    const normal = parseInt(rangeMatch[1], 10);
    const max = parseInt(rangeMatch[2], 10);
    const isThrown = combined.includes('arrojadiza') || combined.includes('thrown');
    return {
      normal,
      max,
      isRanged: true,
      isReach: false,
      isThrown,
      label: `${normal}/${max} pies`,
    };
  }

  // Detección de armas a distancia sin tag explícito (ej: 'A distancia')
  const isRanged = typeStr.includes('distancia') || typeStr.includes('ranged');
  if (isRanged) {
    return {
      normal: 60,
      max: 120,
      isRanged: true,
      isReach: false,
      isThrown: false,
      label: '60/120 pies',
    };
  }

  // Detección de propiedad 'Alcance' (Reach, 10 pies de melé)
  const isReach = combined.includes('alcance') || combined.includes('reach');
  if (isReach) {
    return {
      normal: 10,
      max: 10,
      isRanged: false,
      isReach: true,
      isThrown: false,
      label: '10 pies (Alcance)',
    };
  }

  // Arma cuerpo a cuerpo estándar (5 pies)
  return {
    normal: 5,
    max: 5,
    isRanged: false,
    isReach: false,
    isThrown: false,
    label: '5 pies (Melé)',
  };
}

/**
 * Extrae el alcance en pies de un conjuro según 5e.
 */
export function getSpellRangeFeet(spell: Partial<SpellItem>): ActionReach {
  const rangeStr = (spell.range || '').toLowerCase().trim();

  if (rangeStr.includes('personal') || rangeStr.includes('self')) {
    return {
      normal: 0,
      max: 0,
      isRanged: false,
      isReach: false,
      isThrown: false,
      isSelf: true,
      label: 'Personal',
    };
  }

  if (rangeStr.includes('toque') || rangeStr.includes('contacto') || rangeStr.includes('touch')) {
    return {
      normal: 5,
      max: 5,
      isRanged: false,
      isReach: false,
      isThrown: false,
      isTouch: true,
      label: 'Contacto (5 pies)',
    };
  }

  // Buscar indicación en pies (ej: '30 pies', '60 pies', '90 ft', '120 feet')
  const feetMatch = rangeStr.match(/(\d+)\s*(?:pies|ft|feet)/i);
  if (feetMatch) {
    const feet = parseInt(feetMatch[1], 10);
    return {
      normal: feet,
      max: feet,
      isRanged: feet > 5,
      isReach: feet === 10,
      isThrown: false,
      label: `${feet} pies`,
    };
  }

  // Buscar indicación en metros (ej: '9 m', '18 m / 60 pies', '36 metros')
  const metersMatch = rangeStr.match(/(\d+)\s*(?:m|metros)/i);
  if (metersMatch) {
    const meters = parseInt(metersMatch[1], 10);
    const feet = Math.round(meters * 3.28);
    return {
      normal: feet,
      max: feet,
      isRanged: feet > 5,
      isReach: feet === 10,
      isThrown: false,
      label: `${feet} pies (~${meters}m)`,
    };
  }

  // Por defecto si es ataque de conjuro
  return {
    normal: 60,
    max: 60,
    isRanged: true,
    isReach: false,
    isThrown: false,
    label: spell.range || '60 pies',
  };
}

/**
 * Extrae el alcance de un objeto de inventario táctico (armas, frascos arrojadizos, pociones).
 */
export function getItemReachFeet(item: Partial<InventoryItem>): ActionReach {
  const nameStr = (item.name || '').toLowerCase();
  const descStr = (item.description || '').toLowerCase();
  const notesStr = (item.notes || '').toLowerCase();
  const combined = `${nameStr} ${descStr} ${notesStr}`;

  // Objetos arrojadizos como fuego alquímico, frasco de ácido, bombas de humo, dagas
  if (
    combined.includes('arrojadiz') ||
    combined.includes('fuego alquímico') ||
    combined.includes('ácido') ||
    combined.includes('bomba') ||
    combined.includes('frasco')
  ) {
    return {
      normal: 20,
      max: 60,
      isRanged: true,
      isReach: false,
      isThrown: true,
      label: '20/60 pies (Arrojadizo)',
    };
  }

  // Flechas o virotes
  if (combined.includes('flecha') || combined.includes('arco') || combined.includes('virote')) {
    return {
      normal: 150,
      max: 600,
      isRanged: true,
      isReach: false,
      isThrown: false,
      label: '150/600 pies',
    };
  }

  // Pociones o consumibles adyacentes
  if (item.category === 'potion' || item.usableType === 'drinkable') {
    return {
      normal: 5,
      max: 5,
      isRanged: false,
      isReach: false,
      isThrown: false,
      label: '5 pies (Adyacente)',
    };
  }

  // Objetos estándar de melé
  return {
    normal: 5,
    max: 5,
    isRanged: false,
    isReach: false,
    isThrown: false,
    label: '5 pies',
  };
}

/**
 * Evalúa si una acción de ataque es válida para una distancia dada en pies, según reglas 5e.
 */
export function validateActionForDistance(
  reach: ActionReach,
  distanceFeet: number
): ReachValidationResult {
  const dist = Math.max(0, distanceFeet);

  // Caso 1: Fuera del alcance máximo absoluto
  if (dist > reach.max) {
    return {
      valid: false,
      disadvantage: false,
      reason: `Fuera de alcance (${dist} pies > máx ${reach.max} pies)`,
      badgeText: `🚫 Fuera de alcance (máx ${reach.max} pies)`,
    };
  }

  // Caso 2: Arma/ataque a distancia usado a quemarropa (≤ 5 pies) -> 5e impone desventaja
  if (reach.isRanged && !reach.isThrown && dist <= 5) {
    return {
      valid: true,
      disadvantage: true,
      reason: 'Ataque a distancia a corta distancia (≤ 5 pies): desventaja táctica',
      badgeText: '⚠️ Desventaja (a quemarropa)',
    };
  }

  // Caso 3: Ataque entre alcance normal y alcance máximo -> 5e impone desventaja
  if (dist > reach.normal && dist <= reach.max) {
    return {
      valid: true,
      disadvantage: true,
      reason: `Ataque a largo alcance (${dist} pies > normal ${reach.normal} pies): desventaja`,
      badgeText: '⚠️ Desventaja (largo alcance)',
    };
  }

  // Caso 4: Ataque dentro de alcance normal y óptimo
  return {
    valid: true,
    disadvantage: false,
    badgeText: '✓ En alcance óptimo',
  };
}
