// src/scripts/data/combatService.ts
// Gestión del combate en tiempo real (campaigns/{cid}/combat/current).
//
// DECISION (F1-1): hiddenHp se aplica en la UI. combat/current lo leen todos los miembros.
// DECISION (F1-2): Los combatientes se almacenan pre-ordenados por iniciativa DESC con desempates.
// DECISION (F1-3): PG de los jugadores se copian de la ficha al agregarlos y son independientes durante el combate.
// DECISION (F1-4, FC-4): El documento completo lo escribe el DM con setDoc, excepto el avance/retroceso de turno
// (`endMyTurn`, `advanceTurn`, `previousTurn`), que usa `runTransaction` y escritura parcial (`turnIndex`, `round`, `updatedAt`).

import type { Combat, Combatant } from '../models/combat.ts';
import { COMBAT_LIMITS } from '../models/combat.ts';
import {
  sortCombatants,
  insertCombatant,
  removeCombatant,
  nextTurn,
  prevTurn,
  duplicateCombatant,
  applyDamage,
  syncCombatantsWithCharacters,
  turnKey,
  peekNext,
  canEndTurn,
} from '../vtt/initiative.ts';
import { campaignStore } from '../state/campaignStore.ts';
import { journalStore } from '../state/journalStore.ts';
import { userStore } from '../state/userStore.ts';
import { normalizeStatus, canPerform } from '../vtt/sessionStatus.ts';
import { getFirebase, isFirebaseConfigured } from '../firebase/client.ts';
import { toPlain } from './cloudTypes.ts';
import { getArmorClass } from '../dnd/ac.ts';

const LOCAL_STORAGE_PREFIX = 'dnd_combat_';

interface CampaignCombatSub {
  callbacks: Set<(combat: Combat | null) => void>;
  latest: Combat | null;
  fsUnsub: (() => void) | null;
  localHandler?: (event: Event) => void;
}

const activeSubscriptions = new Map<string, CampaignCombatSub>();

function getLocalCombat(cid: string): Combat | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_PREFIX + cid);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('[combatService] Error leyendo combate local:', e);
    return null;
  }
}

function setLocalCombat(cid: string, combat: Combat | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (combat) {
      localStorage.setItem(LOCAL_STORAGE_PREFIX + cid, JSON.stringify(combat));
    } else {
      localStorage.removeItem(LOCAL_STORAGE_PREFIX + cid);
    }
    window.dispatchEvent(new CustomEvent('combat-updated', {
      detail: { cid, combat }
    }));
  } catch (e) {
    console.warn('[combatService] Error guardando combate local:', e);
  }
}

/**
 * Valida si el DM puede realizar acciones de juego en el combate según el estado de la sesión.
 */
export function checkCanPlay(cid: string): boolean {
  const campaign = campaignStore.getCampaign(cid);
  const status = normalizeStatus(campaign?.status);
  return canPerform('dmPlay', 'dm', status);
}

/**
 * Obtiene el combate actual en memoria o desde almacenamiento local.
 */
export function getCurrentCombat(cid: string): Combat | null {
  const sub = activeSubscriptions.get(cid);
  if (sub && sub.latest !== undefined) return sub.latest;
  return getLocalCombat(cid);
}

/**
 * Suscribe a un callback a los cambios en el combate de una campaña.
 * Mantiene un único listener de Firestore (o fallback local) por campaña.
 * Devuelve la función para cancelar la suscripción.
 */
export function subscribeCombat(
  cid: string,
  callback: (combat: Combat | null) => void
): () => void {
  let sub = activeSubscriptions.get(cid);

  if (!sub) {
    sub = {
      callbacks: new Set(),
      latest: null,
      fsUnsub: null,
    };
    activeSubscriptions.set(cid, sub);

    if (isFirebaseConfigured()) {
      let isCancelled = false;
      getFirebase()
        .then(async ({ db }) => {
          if (isCancelled) return;
          const fs = await import('firebase/firestore');
          const combatRef = fs.doc(db, 'campaigns', cid, 'combat', 'current');
          const unsub = fs.onSnapshot(
            combatRef,
            (snap) => {
              const currentSub = activeSubscriptions.get(cid);
              if (!currentSub) return;
              const data = snap.exists() ? (snap.data() as Combat) : null;
              currentSub.latest = data;
              currentSub.callbacks.forEach((cb) => {
                try {
                  cb(data);
                } catch (err) {
                  console.error('[combatService] Error en callback de combate:', err);
                }
              });
            },
            (error) => {
              console.warn('[combatService] onSnapshot error:', error);
            }
          );

          if (isCancelled) {
            unsub();
          } else {
            const currentSub = activeSubscriptions.get(cid);
            if (currentSub) {
              currentSub.fsUnsub = unsub;
            } else {
              unsub();
            }
          }
        })
        .catch((err) => {
          console.warn('[combatService] Error inicializando Firebase para combate:', err);
        });

      // Cleanup hook si se cancela antes de resolver getFirebase
      sub.fsUnsub = () => {
        isCancelled = true;
      };
    } else {
      // Modo local / pruebas
      sub.latest = getLocalCombat(cid);
      const localHandler = (event: Event) => {
        const customEvent = event as CustomEvent<{ cid: string; combat: Combat | null }>;
        if (customEvent.detail && customEvent.detail.cid === cid) {
          const currentSub = activeSubscriptions.get(cid);
          if (!currentSub) return;
          currentSub.latest = customEvent.detail.combat;
          currentSub.callbacks.forEach((cb) => cb(currentSub.latest));
        }
      };
      sub.localHandler = localHandler;
      if (typeof window !== 'undefined') {
        window.addEventListener('combat-updated', localHandler);
      }
    }
  }

  sub.callbacks.add(callback);

  // Notificar inmediatamente si ya tenemos un valor disponible
  if (sub.latest !== null) {
    try {
      callback(sub.latest);
    } catch (err) {
      console.error('[combatService] Error en callback inicial:', err);
    }
  }

  return () => {
    const currentSub = activeSubscriptions.get(cid);
    if (!currentSub) return;
    currentSub.callbacks.delete(callback);

    if (currentSub.callbacks.size === 0) {
      if (currentSub.fsUnsub) {
        currentSub.fsUnsub();
      }
      if (currentSub.localHandler && typeof window !== 'undefined') {
        window.removeEventListener('combat-updated', currentSub.localHandler);
      }
      activeSubscriptions.delete(cid);
    }
  };
}

/**
 * Guarda el estado completo del combate en Firestore (o local si no hay nube).
 * DECISION (F1-4): setDoc completo del documento `campaigns/{cid}/combat/current`,
 * salvo el avance/retroceso de turno (`endMyTurn`, `advanceTurn`, `previousTurn`),
 * que usa `runTransaction` y escritura parcial (FC-4).
 */
export async function saveCombat(cid: string, combat: Combat): Promise<void> {
  if (!checkCanPlay(cid)) {
    throw new Error('La partida no está activa (está pausada o terminada).');
  }

  if (combat.combatants.length > COMBAT_LIMITS.maxCombatants) {
    throw new Error(`El combate no puede superar los ${COMBAT_LIMITS.maxCombatants} combatientes.`);
  }

  const payload: Combat = toPlain({
    ...combat,
    updatedAt: Date.now(),
  });

  if (isFirebaseConfigured()) {
    const { db } = await getFirebase();
    const fs = await import('firebase/firestore');
    const docRef = fs.doc(db, 'campaigns', cid, 'combat', 'current');
    await fs.setDoc(docRef, payload);
  } else {
    setLocalCombat(cid, payload);
  }

  const sub = activeSubscriptions.get(cid);
  if (sub) {
    sub.latest = payload;
  }
}

/**
 * Construye la lista de combatientes a partir de los personajes asignados a la campaña.
 * DECISION (F1-3): PG y CA copiados de la ficha, luego independientes.
 */
export function buildPlayerCombatants(cid: string): Combatant[] {
  const chars = campaignStore.getCharactersForCampaign(cid);
  return chars.map((char) => ({
    id: `pc-${char.id}`,
    name: char.name || 'Héroe sin nombre',
    initiative: 10,
    hp: typeof char.hp?.current === 'number' ? char.hp.current : 10,
    maxHp: typeof char.hp?.max === 'number' && char.hp.max > 0 ? char.hp.max : 10,
    ac: getArmorClass(char),
    conditions: [],
    isPlayer: true,
    hiddenHp: false,
    ownerUid: char.userId,
    characterId: char.id,
  }));
}

/**
 * Inicia un nuevo combate y registra el hito en la bitácora pública (T-14).
 */
export async function startCombat(cid: string, combatants: Combatant[]): Promise<void> {
  const sorted = sortCombatants(combatants);
  const newCombat: Combat = {
    active: true,
    round: 1,
    turnIndex: 0,
    combatants: sorted,
    updatedAt: Date.now(),
  };

  await saveCombat(cid, newCombat);

  // Bitácora pública (T-14): Título y lista de combatientes
  const campaign = campaignStore.getCampaign(cid);
  const combatantNames = sorted.map((c) => `${c.name} (${c.initiative})`).join(', ');

  journalStore.addEntry({
    title: 'Comienza el combate',
    content: `Iniciativa: ${combatantNames}.`,
    tags: ['#Combate'],
    sessionNumber: campaign?.sessionNumber || 1,
    campaignId: cid,
    authorName: campaign?.dmName || 'Dungeon Master',
    isDmOnly: false,
  });
}

/**
 * Termina el combate activo manteniendo la lista como registro y registra en bitácora (T-14).
 */
export async function endCombat(cid: string): Promise<void> {
  const current = getCurrentCombat(cid);
  if (!current) return;

  const endedCombat: Combat = {
    ...current,
    active: false,
    updatedAt: Date.now(),
  };

  await saveCombat(cid, endedCombat);

  // Bitácora pública (T-14): "Fin del combate (N rondas)"
  const campaign = campaignStore.getCampaign(cid);
  const rounds = endedCombat.round;
  const roundText = rounds === 1 ? '1 ronda' : `${rounds} rondas`;

  journalStore.addEntry({
    title: 'Fin del combate',
    content: `Fin del combate (${roundText}).`,
    tags: ['#Combate'],
    sessionNumber: campaign?.sessionNumber || 1,
    campaignId: cid,
    authorName: campaign?.dmName || 'Dungeon Master',
    isDmOnly: false,
  });
}

/**
 * Agrega un combatiente al combate activo respetando el orden y el turno actual.
 */
export async function addCombatant(cid: string, combatant: Combatant): Promise<void> {
  const current = getCurrentCombat(cid) || {
    active: true,
    round: 1,
    turnIndex: 0,
    combatants: [],
    updatedAt: Date.now(),
  };

  const updated = insertCombatant(current, combatant);
  await saveCombat(cid, updated);
}

/**
 * Modifica campos de un combatiente. Si cambia la iniciativa, reordena y preserva el turno activo.
 */
export async function updateCombatant(
  cid: string,
  combatantId: string,
  patch: Partial<Combatant>
): Promise<void> {
  const current = getCurrentCombat(cid);
  if (!current) return;

  const activeCombatantId = current.combatants[current.turnIndex]?.id;

  const combatants = current.combatants.map((c) => {
    if (c.id !== combatantId) return c;
    const updated = { ...c, ...patch };
    if (patch.hp !== undefined || patch.maxHp !== undefined) {
      const max = patch.maxHp !== undefined ? patch.maxHp : c.maxHp;
      const hp = patch.hp !== undefined ? patch.hp : c.hp;
      updated.maxHp = Math.max(1, max);
      updated.hp = Math.max(0, Math.min(updated.maxHp, hp));
    }
    return updated;
  });

  let nextCombat: Combat = {
    ...current,
    combatants,
  };

  if (patch.initiative !== undefined || patch.name !== undefined) {
    const sorted = sortCombatants(combatants);
    const newTurnIndex = sorted.findIndex((c) => c.id === activeCombatantId);
    nextCombat = {
      ...nextCombat,
      combatants: sorted,
      turnIndex: newTurnIndex >= 0 ? newTurnIndex : 0,
    };
  }

  await saveCombat(cid, nextCombat);
}

/**
 * Aplica daño o curación a un combatiente (delta negativo = daño, delta positivo = curación).
 */
export async function applyDamageToCombatant(
  cid: string,
  combatantId: string,
  delta: number
): Promise<void> {
  const current = getCurrentCombat(cid);
  if (!current) return;

  const target = current.combatants.find((c) => c.id === combatantId);
  if (!target) return;

  const updatedTarget = applyDamage(target, delta);
  await updateCombatant(cid, combatantId, { hp: updatedTarget.hp });

  // Sincronizar PG con la ficha del personaje si es un jugador
  if (target.isPlayer && target.characterId) {
    const char = campaignStore.getCharacter(target.characterId);
    if (char && char.hp) {
      char.hp.current = updatedTarget.hp;
      try {
        campaignStore.saveCharacter(char);
      } catch (err) {
        console.warn('[combatService] Error sincronizando PG con la ficha:', err);
      }
    }
  }
}

/**
 * Sincroniza el combate activo con los personajes de la campaña (Nombre, PG, CA).
 * Devuelve true si hubo cambios que se guardaron.
 */
export async function syncCombatWithLiveCharacters(cid: string): Promise<boolean> {
  const current = getCurrentCombat(cid);
  if (!current || !current.active || !current.combatants || current.combatants.length === 0) {
    return false;
  }

  const chars = campaignStore.getCharactersForCampaign(cid);
  const { combat: nextCombat, changed } = syncCombatantsWithCharacters(current, chars);

  if (changed) {
    await saveCombat(cid, nextCombat);
    return true;
  }

  return false;
}

/**
 * Elimina un combatiente del combate.
 */
export async function removeCombatantFromCombat(cid: string, combatantId: string): Promise<void> {
  const current = getCurrentCombat(cid);
  if (!current) return;

  const updated = removeCombatant(current, combatantId);
  await saveCombat(cid, updated);
}

/**
 * Permite al dueño del combatiente actual terminar su turno (T-67, RF-71, RF-73).
 * DECISION (FC-1): Solo por ownerUid (validado también por las reglas).
 * DECISION (FC-3): La transacción compara turnKey del documento leído con expectedKey; si cambió, devuelve 'stale'.
 * DECISION (FC-5): Si la transacción confirma 'ok', escribe una entrada pública en la bitácora (#Combate).
 */
export async function endMyTurn(
  cid: string,
  expectedKey: string
): Promise<'ok' | 'stale' | 'forbidden'> {
  if (!isFirebaseConfigured()) {
    throw new Error('Requiere iniciar sesión con cuenta.');
  }

  const campaign = campaignStore.getCampaign(cid);
  const status = normalizeStatus(campaign?.status);
  if (!canPerform('playerWrite', 'player', status)) {
    return 'forbidden';
  }

  const uid = userStore.getCurrentUser()?.id || '';
  if (!uid) return 'forbidden';

  const { db } = await getFirebase();
  const fs = await import('firebase/firestore');
  const ref = fs.doc(db, 'campaigns', cid, 'combat', 'current');

  let combatantName = 'Aventurero';

  const result = await fs.runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const combat = snap.exists() ? (snap.data() as Combat) : undefined;
    if (!combat || turnKey(combat) !== expectedKey) return 'stale' as const;
    if (!canEndTurn(combat, uid)) return 'forbidden' as const;

    const currentCombatant = combat.combatants[combat.turnIndex];
    if (currentCombatant?.name) {
      combatantName = currentCombatant.name;
    }

    const next = peekNext(combat);
    if (!next) return 'stale' as const;

    tx.update(ref, {
      turnIndex: next.index,
      round: next.round,
      updatedAt: Date.now(),
    });
    return 'ok' as const;
  });

  if (result === 'ok') {
    journalStore.addEntry({
      title: `${combatantName} terminó su turno`,
      content: `${combatantName} terminó su turno.`,
      tags: ['#Combate'],
      sessionNumber: campaign?.sessionNumber || 1,
      campaignId: cid,
      authorName: combatantName,
      isDmOnly: false,
    });
  }

  return result;
}

/**
 * Avanza al siguiente turno en orden cíclico.
 * DECISION (FC-4): En modo nube el DM también escribe el turno con transacción y escritura parcial
 * (`turnIndex`, `round`, `updatedAt`) para no pisarse con el avance de un jugador.
 */
export async function advanceTurn(cid: string): Promise<void> {
  if (!checkCanPlay(cid)) {
    throw new Error('La partida no está activa (está pausada o terminada).');
  }

  if (isFirebaseConfigured()) {
    const { db } = await getFirebase();
    const fs = await import('firebase/firestore');
    const ref = fs.doc(db, 'campaigns', cid, 'combat', 'current');

    await fs.runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const combat = snap.exists() ? (snap.data() as Combat) : undefined;
      if (!combat || !combat.active) return;
      const next = peekNext(combat);
      if (!next) return;
      tx.update(ref, {
        turnIndex: next.index,
        round: next.round,
        updatedAt: Date.now(),
      });
    });
    return;
  }

  const current = getCurrentCombat(cid);
  if (!current || !current.active) return;

  const updated = nextTurn(current);
  await saveCombat(cid, updated);
}

/**
 * Retrocede al turno previo.
 * DECISION (FC-4): Usa transacción y escritura parcial en modo nube.
 */
export async function previousTurn(cid: string): Promise<void> {
  if (!checkCanPlay(cid)) {
    throw new Error('La partida no está activa (está pausada o terminada).');
  }

  if (isFirebaseConfigured()) {
    const { db } = await getFirebase();
    const fs = await import('firebase/firestore');
    const ref = fs.doc(db, 'campaigns', cid, 'combat', 'current');

    await fs.runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const combat = snap.exists() ? (snap.data() as Combat) : undefined;
      if (!combat || !combat.active || combat.combatants.length === 0) return;
      const updated = prevTurn(combat);
      if (updated.turnIndex === combat.turnIndex && updated.round === combat.round) return;
      tx.update(ref, {
        turnIndex: updated.turnIndex,
        round: updated.round,
        updatedAt: Date.now(),
      });
    });
    return;
  }

  const current = getCurrentCombat(cid);
  if (!current || !current.active) return;

  const updated = prevTurn(current);
  await saveCombat(cid, updated);
}

/**
 * Duplica un combatiente generando copias secuenciales e independientes (RF-03).
 */
export async function duplicateCombatantInCombat(
  cid: string,
  combatantId: string,
  count: number = 1
): Promise<void> {
  const current = getCurrentCombat(cid);
  if (!current) return;

  const updated = duplicateCombatant(current, combatantId, count);
  await saveCombat(cid, updated);
}
