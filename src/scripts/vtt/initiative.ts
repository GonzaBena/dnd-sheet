// src/scripts/vtt/initiative.ts
// Lógica pura para gestión de combate, iniciativa y turnos (VTT).
// Todas las funciones son inmutables (devuelven objetos nuevos sin mutar el parámetro recibido).

import type { Combat, Combatant } from '../models/combat.ts';
import type { CharacterData } from '../models/character.ts';

/**
 * Ordena combatientes según F1-2:
 * 1. Iniciativa descendente (mayor a menor).
 * 2. Desempate: jugador tiene prioridad sobre monstruo / PNJ.
 * 3. Segundo desempate: alfabético por nombre.
 */
export function sortCombatants(list: Combatant[]): Combatant[] {
  return [...list].sort((a, b) => {
    if (b.initiative !== a.initiative) {
      return b.initiative - a.initiative;
    }
    if (a.isPlayer !== b.isPlayer) {
      return a.isPlayer ? -1 : 1;
    }
    return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
  });
}

/**
 * Inserta un combatiente manteniendo el orden y preservando el turno del combatiente actual.
 */
export function insertCombatant(combat: Combat, combatant: Combatant): Combat {
  const currentId = combat.combatants[combat.turnIndex]?.id;
  const nextList = sortCombatants([...combat.combatants, combatant]);
  let nextIndex = 0;

  if (currentId) {
    const found = nextList.findIndex(c => c.id === currentId);
    if (found !== -1) nextIndex = found;
  }

  return {
    ...combat,
    combatants: nextList,
    turnIndex: nextIndex,
    updatedAt: Date.now(),
  };
}

/**
 * Quita un combatiente preservando el combatiente actual si sigue en la lista.
 */
export function removeCombatant(combat: Combat, id: string): Combat {
  const currentCombatant = combat.combatants[combat.turnIndex];
  const nextList = combat.combatants.filter(c => c.id !== id);

  if (nextList.length === 0) {
    return {
      ...combat,
      combatants: [],
      turnIndex: 0,
      updatedAt: Date.now(),
    };
  }

  let nextIndex = combat.turnIndex;
  if (currentCombatant && currentCombatant.id === id) {
    // Si se eliminó el combatiente en turno, pasa al siguiente o vuelve a 0
    if (nextIndex >= nextList.length) {
      nextIndex = 0;
    }
  } else if (currentCombatant) {
    const found = nextList.findIndex(c => c.id === currentCombatant.id);
    nextIndex = found !== -1 ? found : Math.min(combat.turnIndex, nextList.length - 1);
  } else {
    nextIndex = 0;
  }

  return {
    ...combat,
    combatants: nextList,
    turnIndex: nextIndex,
    updatedAt: Date.now(),
  };
}

/**
 * Avanza al siguiente turno. Al pasar del último combatiente, vuelve al inicio y suma la ronda.
 */
export function nextTurn(combat: Combat): Combat {
  if (combat.combatants.length === 0) return combat;

  const nextIndex = combat.turnIndex + 1;
  if (nextIndex >= combat.combatants.length) {
    return {
      ...combat,
      round: combat.round + 1,
      turnIndex: 0,
      updatedAt: Date.now(),
    };
  }

  return {
    ...combat,
    turnIndex: nextIndex,
    updatedAt: Date.now(),
  };
}

/**
 * Retrocede el turno (útil si el DM avanzó por error).
 */
export function prevTurn(combat: Combat): Combat {
  if (combat.combatants.length === 0) return combat;

  if (combat.turnIndex > 0) {
    return {
      ...combat,
      turnIndex: combat.turnIndex - 1,
      updatedAt: Date.now(),
    };
  }

  if (combat.round > 1) {
    return {
      ...combat,
      round: combat.round - 1,
      turnIndex: combat.combatants.length - 1,
      updatedAt: Date.now(),
    };
  }

  return combat;
}

/**
 * Duplica un combatiente generando nombres secuenciales independientes (RF-03).
 * Ejemplo: "Goblin" -> "Goblin 1", "Goblin 2", "Goblin 3".
 */
export function duplicateCombatant(combat: Combat, id: string, count: number): Combat {
  if (count <= 0) return combat;
  const original = combat.combatants.find(c => c.id === id);
  if (!original) return combat;

  const currentId = combat.combatants[combat.turnIndex]?.id;

  // Analizar base del nombre y sufijo numérico
  const match = original.name.match(/^(.*?)\s*(\d+)$/);
  const baseName = match ? match[1].trim() : original.name.trim();

  // Buscar todos los números existentes para este baseName
  const regex = new RegExp(`^${baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(\\d+)$`, 'i');
  const usedNumbers = new Set<number>();

  for (const c of combat.combatants) {
    const m = c.name.match(regex);
    if (m) {
      usedNumbers.add(parseInt(m[1], 10));
    }
  }

  // Si el original no tenía número y no hay duplicados numerados todavía, el original pasa a ser "1"
  let updatedOriginal = original;
  if (!match && !usedNumbers.has(1)) {
    usedNumbers.add(1);
    updatedOriginal = { ...original, name: `${baseName} 1` };
  } else if (match) {
    usedNumbers.add(parseInt(match[2], 10));
  }

  // Generar nuevos combatientes con el siguiente número disponible
  const newCombatants: Combatant[] = [];
  let nextNum = 1;

  for (let i = 0; i < count; i++) {
    while (usedNumbers.has(nextNum)) {
      nextNum++;
    }
    usedNumbers.add(nextNum);

    newCombatants.push({
      ...original,
      id: `c-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`,
      name: `${baseName} ${nextNum}`,
      conditions: [...original.conditions],
      hp: original.hp,
      maxHp: original.maxHp,
      initiative: original.initiative,
      ac: original.ac,
      isPlayer: original.isPlayer,
      hiddenHp: original.hiddenHp,
    });
  }

  // Reemplazar el original (si se renombró) y agregar los nuevos
  const replacedList = combat.combatants.map(c => (c.id === original.id ? updatedOriginal : c));
  const nextList = sortCombatants([...replacedList, ...newCombatants]);

  let nextIndex = combat.turnIndex;
  if (currentId) {
    const found = nextList.findIndex(c => c.id === currentId);
    if (found !== -1) nextIndex = found;
  }

  return {
    ...combat,
    combatants: nextList,
    turnIndex: nextIndex,
    updatedAt: Date.now(),
  };
}

/**
 * Modifica los PG de un combatiente limitando el resultado entre 0 y maxHp.
 */
export function applyDamage(c: Combatant, delta: number): Combatant {
  const nextHp = Math.max(0, Math.min(c.maxHp, c.hp + delta));
  return {
    ...c,
    hp: nextHp,
  };
}

/**
 * Determina los PG visibles para un usuario observador según RF-04:
 * - DM ve todos los PG.
 * - Dueño del personaje ve sus propios PG.
 * - Si hiddenHp es false, cualquiera los ve.
 * - Si hiddenHp es true, devuelve null ("—" o estado oculto).
 */
export function visibleHp(
  c: Combatant,
  viewer: { uid?: string | null; isDm: boolean }
): { hp: number; maxHp: number } | null {
  if (viewer.isDm) {
    return { hp: c.hp, maxHp: c.maxHp };
  }
  if (viewer.uid && c.ownerUid && c.ownerUid === viewer.uid) {
    return { hp: c.hp, maxHp: c.maxHp };
  }
  if (!c.hiddenHp) {
    return { hp: c.hp, maxHp: c.maxHp };
  }
  return null;
}

/**
 * Sincroniza los combatientes de jugadores con los datos vivos de las fichas de personajes
 * (Nombre, PG actuales, PG máximos y CA), preservando la iniciativa, condiciones y el turno activo.
 */
export function syncCombatantsWithCharacters(
  combat: Combat,
  characters: CharacterData[]
): { combat: Combat; changed: boolean } {
  if (!combat.combatants || combat.combatants.length === 0) {
    return { combat, changed: false };
  }

  const charMap = new Map<string, CharacterData>();
  for (const char of characters) {
    if (char && char.id) {
      charMap.set(char.id, char);
    }
  }

  let changed = false;
  let nameChanged = false;
  const currentActiveId = combat.combatants[combat.turnIndex]?.id;

  const updatedCombatants = combat.combatants.map((c) => {
    if (!c.isPlayer || !c.characterId) return c;
    const char = charMap.get(c.characterId);
    if (!char) return c;

    const newName = char.name?.trim() ? char.name.trim() : c.name;
    const newHp = typeof char.hp?.current === 'number' ? char.hp.current : c.hp;
    const newMaxHp = typeof char.hp?.max === 'number' && char.hp.max > 0 ? char.hp.max : c.maxHp;
    const newAc = typeof char.armorClass === 'number' ? char.armorClass : c.ac;

    if (c.name !== newName || c.hp !== newHp || c.maxHp !== newMaxHp || c.ac !== newAc) {
      changed = true;
      if (c.name !== newName) nameChanged = true;
      return {
        ...c,
        name: newName,
        hp: newHp,
        maxHp: newMaxHp,
        ac: newAc,
      };
    }

    return c;
  });

  if (!changed) {
    return { combat, changed: false };
  }

  let nextCombatants = updatedCombatants;
  let nextTurnIndex = combat.turnIndex;

  if (nameChanged) {
    nextCombatants = sortCombatants(updatedCombatants);
    if (currentActiveId) {
      const foundIdx = nextCombatants.findIndex((c) => c.id === currentActiveId);
      nextTurnIndex = foundIdx !== -1 ? foundIdx : 0;
    }
  }

  return {
    combat: {
      ...combat,
      combatants: nextCombatants,
      turnIndex: nextTurnIndex,
      updatedAt: Date.now(),
    },
    changed: true,
  };
}

/**
 * Determina si todos los jugadores esperados ya están presentes en la lista de iniciativa (combat.combatants).
 * - Si `campaignCharacters` contiene personajes, verifica que cada uno esté presente como combatiente
 *   (por `characterId`, por id con prefijo `pc-<id>`, o por coincidencia de nombre).
 * - Si `campaignCharacters` está vacío, se considera completo si ya hay al menos un combatiente marcado como jugador (`isPlayer === true`).
 * Retorna true cuando todos los jugadores ya forman parte del orden de iniciativa.
 */
export function areAllPlayersInInitiative(
  combat: Combat | null | undefined,
  campaignCharacters: Array<{ id: string; name?: string }> = []
): boolean {
  if (!combat || !combat.active || !Array.isArray(combat.combatants)) {
    return false;
  }

  const playerCombatants = combat.combatants.filter((c) => Boolean(c && c.isPlayer));

  if (campaignCharacters.length > 0) {
    const presentCharIds = new Set<string>();
    const presentNames = new Set<string>();

    for (const c of playerCombatants) {
      if (c.characterId) presentCharIds.add(c.characterId);
      if (c.name && typeof c.name === 'string') {
        presentNames.add(c.name.trim().toLowerCase());
      }
    }

    return campaignCharacters.every((char) => {
      if (presentCharIds.has(char.id)) return true;
      if (playerCombatants.some((c) => c.id === `pc-${char.id}` || c.id.startsWith(`pc-${char.id}-`))) return true;
      if (char.name && presentNames.has(char.name.trim().toLowerCase())) return true;
      return false;
    });
  }

  return playerCombatants.length > 0;
}

/** Devuelve el combatiente enlazado a un token del mapa (T-55), o null. */
export function findCombatantByToken(combat: Combat | null | undefined, tokenId: string | null | undefined): Combatant | null {
  if (!combat || !tokenId) return null;
  return combat.combatants.find((c) => c.tokenId === tokenId) ?? null;
}

/** Devuelve el combatiente del turno actual, o null si no hay combate activo. */
export function currentTurnCombatant(combat: Combat | null | undefined): Combatant | null {
  if (!combat || !combat.active) return null;
  return combat.combatants[combat.turnIndex] ?? null;
}

/**
 * Calcula los enlaces automáticos combatiente→token (T-55): para cada jugador sin `tokenId`,
 * busca un token cuyo `characterId` coincida y que no esté ya enlazado a otro combatiente.
 * Función pura: devuelve solo los enlaces a escribir.
 */
export function computeAutoLinks(
  combat: Combat | null | undefined,
  tokens: Record<string, { characterId?: string }> | null | undefined
): Array<{ combatantId: string; tokenId: string }> {
  if (!combat || !tokens) return [];
  const used = new Set(combat.combatants.map((c) => c.tokenId).filter(Boolean) as string[]);
  const links: Array<{ combatantId: string; tokenId: string }> = [];
  for (const c of combat.combatants) {
    if (c.tokenId || !c.isPlayer || !c.characterId) continue;
    const entry = Object.entries(tokens).find(([tid, t]) => t.characterId === c.characterId && !used.has(tid));
    if (entry) {
      used.add(entry[0]);
      links.push({ combatantId: c.id, tokenId: entry[0] });
    }
  }
  return links;
}


