// src/scripts/data/mapService.ts
// Gestión de mapas tácticos del VTT (campaigns/{cid}/maps/{mid}).
//
// DECISION (F2-3): La lista de mapas la lee solo el DM con getDocs (lectura puntual sin listener).
// El mapa activo usa un único onSnapshot que se desuscribe al cambiar de mapa.

import type { MapDoc, GridConfig, Token, FogShape, DmOnly } from '../models/map.ts';
import { MAP_LIMITS } from '../models/map.ts';
import { campaignStore } from '../state/campaignStore.ts';
import { userStore } from '../state/userStore.ts';
import { normalizeStatus, canPerform } from '../vtt/sessionStatus.ts';
import { getFirebase, isFirebaseConfigured } from '../firebase/client.ts';
import { newTokenId } from '../vtt/tokens.ts';
import { appendFog } from '../vtt/fog.ts';
import { ensureRoom } from './roomService.ts';

const LOCAL_MAPS_KEY_PREFIX = 'dnd_maps_';
const LOCAL_DM_ONLY_KEY_PREFIX = 'dnd_dm_only_';

export interface CreateMapData {
  name: string;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  grid: GridConfig;
}

export type UpdateMapConfigPatch = Partial<
  Pick<MapDoc, 'name' | 'imageUrl' | 'imageWidth' | 'imageHeight' | 'grid'>
>;

// ---------------------------------------------------------------------------
// Ayudas para modo local / offline
// ---------------------------------------------------------------------------

function getStorage(): Storage | null {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
    if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  } catch (_) {}
  return null;
}

function dispatchEvent(name: string, detail: any): void {
  const target: any = typeof window !== 'undefined' ? window : globalThis;
  if (target && typeof target.dispatchEvent === 'function') {
    const EventClass = (typeof window !== 'undefined' && window.CustomEvent) || globalThis.CustomEvent;
    if (EventClass) {
      target.dispatchEvent(new EventClass(name, { detail }));
    }
  }
}

function addListener(name: string, handler: EventListener): void {
  const target: any = typeof window !== 'undefined' ? window : globalThis;
  if (target && typeof target.addEventListener === 'function') {
    target.addEventListener(name, handler);
  }
}

function removeListener(name: string, handler: EventListener): void {
  const target: any = typeof window !== 'undefined' ? window : globalThis;
  if (target && typeof target.removeEventListener === 'function') {
    target.removeEventListener(name, handler);
  }
}

function getLocalMaps(cid: string): MapDoc[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(LOCAL_MAPS_KEY_PREFIX + cid);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn('[mapService] Error leyendo mapas locales:', e);
    return [];
  }
}

function saveLocalMaps(cid: string, maps: MapDoc[]): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(LOCAL_MAPS_KEY_PREFIX + cid, JSON.stringify(maps));
    dispatchEvent('maps-updated', { cid });
  } catch (e) {
    console.warn('[mapService] Error guardando mapas locales:', e);
  }
}

function getLocalDmOnly(cid: string, mid: string): DmOnly {
  const storage = getStorage();
  if (!storage) return { secretTokens: {} };
  try {
    const raw = storage.getItem(LOCAL_DM_ONLY_KEY_PREFIX + cid + '_' + mid);
    return raw ? JSON.parse(raw) : { secretTokens: {} };
  } catch (e) {
    return { secretTokens: {} };
  }
}

function saveLocalDmOnly(cid: string, mid: string, data: DmOnly): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(LOCAL_DM_ONLY_KEY_PREFIX + cid + '_' + mid, JSON.stringify(data));
    dispatchEvent('dm-only-updated', { cid, mid, dmOnly: data });
  } catch (e) {
    console.warn('[mapService] Error guardando dmOnly local:', e);
  }
}

function sanitizeToken(token: Token): Record<string, any> {
  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(token)) {
    if (v !== undefined) {
      clean[k] = v;
    }
  }
  return clean;
}

function checkCanPrepare(cid: string): void {
  const campaign = campaignStore.getCampaign(cid);
  const status = normalizeStatus(campaign?.status);
  if (!canPerform('dmPrepare', 'dm', status)) {
    throw new Error('No puedes preparar mapas con la partida en el estado actual.');
  }
}

function checkCanPlayDm(cid: string): void {
  const campaign = campaignStore.getCampaign(cid);
  const status = normalizeStatus(campaign?.status);
  if (!canPerform('dmPlay', 'dm', status)) {
    throw new Error('Solo se puede editar la niebla con la partida activa.');
  }
}

// ---------------------------------------------------------------------------
// Operaciones del DM
// ---------------------------------------------------------------------------

/**
 * Crea un nuevo mapa en la campaña.
 */
export async function createMap(cid: string, data: CreateMapData): Promise<string> {
  checkCanPrepare(cid);

  const mid = `map-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
  const now = Date.now();

  const newDoc: MapDoc = {
    id: mid,
    name: data.name.trim(),
    imageUrl: data.imageUrl.trim(),
    imageWidth: data.imageWidth,
    imageHeight: data.imageHeight,
    grid: data.grid,
    tokens: {},
    fogRevealed: [],
    updatedAt: now,
  };

  // Guardar siempre de inmediato en caché local para respuesta instantánea
  const maps = getLocalMaps(cid);
  maps.push(newDoc);
  saveLocalMaps(cid, maps);

  if (isFirebaseConfigured()) {
    try {
      const { db } = await getFirebase();
      const fs = await import('firebase/firestore');
      const { id, ...docData } = newDoc;
      await fs.setDoc(fs.doc(db, 'campaigns', cid, 'maps', mid), docData);
    } catch (err) {
      console.warn('[mapService] Aviso: no se pudo sincronizar nuevo mapa en Firestore:', err);
    }
  }

  return mid;
}

/**
 * Lista todos los mapas de la campaña (F2-3: lectura puntual con getDocs, sin listener permanente).
 */
export async function listMaps(cid: string): Promise<MapDoc[]> {
  const localMaps = getLocalMaps(cid);

  if (isFirebaseConfigured()) {
    try {
      const { db } = await getFirebase();
      const fs = await import('firebase/firestore');
      const snap = await fs.getDocs(fs.collection(db, 'campaigns', cid, 'maps'));
      const remoteMaps: MapDoc[] = [];
      snap.forEach((docSnap) => {
        remoteMaps.push({
          id: docSnap.id,
          ...(docSnap.data() as Omit<MapDoc, 'id'>),
        });
      });
      if (remoteMaps.length > 0) {
        remoteMaps.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        saveLocalMaps(cid, remoteMaps);
        return remoteMaps;
      }
    } catch (err) {
      console.warn('[mapService] Error listando mapas desde Firestore, usando local fallback:', err);
    }
  }

  return localMaps;
}

export const listMapsForDm = listMaps;

/**
 * Actualiza la configuración de grilla, imagen o nombre de un mapa.
 */
export async function updateMapConfig(
  cid: string,
  mid: string,
  patch: UpdateMapConfigPatch
): Promise<void> {
  checkCanPrepare(cid);

  const now = Date.now();

  // Actualizar inmediatamente en local
  const maps = getLocalMaps(cid);
  const idx = maps.findIndex((m) => m.id === mid);
  if (idx !== -1) {
    maps[idx] = { ...maps[idx], ...patch, updatedAt: now };
    saveLocalMaps(cid, maps);
    dispatchEvent('map-updated', { cid, mid, map: maps[idx] });
  }

  if (isFirebaseConfigured()) {
    try {
      const { db } = await getFirebase();
      const fs = await import('firebase/firestore');
      await fs.updateDoc(fs.doc(db, 'campaigns', cid, 'maps', mid), {
        ...patch,
        updatedAt: now,
      });
    } catch (err) {
      console.warn('[mapService] Aviso: error actualizando mapa en Firestore:', err);
    }
  }
}

/**
 * Elimina un mapa de la campaña. No permite eliminar el mapa activo.
 */
export async function deleteMap(cid: string, mid: string): Promise<void> {
  checkCanPrepare(cid);

  const campaign = campaignStore.getCampaign(cid);
  if (campaign?.activeMapId === mid) {
    throw new Error('No se puede eliminar el mapa activo. Selecciona otro mapa antes de borrarlo.');
  }

  const maps = getLocalMaps(cid).filter((m) => m.id !== mid);
  saveLocalMaps(cid, maps);
  const storage = getStorage();
  if (storage) {
    try {
      storage.removeItem(LOCAL_DM_ONLY_KEY_PREFIX + cid + '_' + mid);
    } catch (_) {}
  }

  if (isFirebaseConfigured()) {
    try {
      const { db } = await getFirebase();
      const fs = await import('firebase/firestore');

      try {
        await fs.deleteDoc(fs.doc(db, 'campaigns', cid, 'maps', mid, 'private', 'dmOnly'));
      } catch (_) {}

      await fs.deleteDoc(fs.doc(db, 'campaigns', cid, 'maps', mid));
    } catch (err) {
      console.warn('[mapService] Aviso: error eliminando mapa en Firestore:', err);
    }
  }
}

/**
 * Establece o quita el mapa activo de la campaña.
 */
export async function setActiveMap(cid: string, mid: string | null): Promise<void> {
  checkCanPrepare(cid);

  campaignStore.updateCampaign(cid, { activeMapId: mid ?? undefined });

  if (isFirebaseConfigured()) {
    try {
      const { db } = await getFirebase();
      const fs = await import('firebase/firestore');
      await fs.updateDoc(fs.doc(db, 'campaigns', cid), {
        activeMapId: mid ? mid : fs.deleteField(),
      });
    } catch (err) {
      console.warn('[mapService] Error sincronizando activeMapId en Firestore:', err);
    }
  }

  dispatchEvent('active-map-changed', { cid, mid });
}

// ---------------------------------------------------------------------------
// Gestión de Tokens en el Mapa (Fase 3: T-30, T-34)
// ---------------------------------------------------------------------------

async function getRoomIdForCampaign(cid: string): Promise<string | null> {
  const campaign = campaignStore.getCampaign(cid);
  if (!campaign) return null;
  if (campaign.liveRoomId) return campaign.liveRoomId;
  try {
    return await ensureRoom(campaign);
  } catch (_) {
    return null;
  }
}

/**
 * Añade un nuevo token al mapa (solo DM).
 * Registra en Firestore y en RTDB (rooms/{roomId}/tokenOwners/{mid}/{tid}) si tiene dueño.
 */
export async function addToken(
  cid: string,
  mid: string,
  token: Token,
  specifiedId?: string
): Promise<string> {
  checkCanPrepare(cid);

  const tid = specifiedId || newTokenId();
  const now = Date.now();

  const cleanToken: Record<string, any> = {};
  for (const [k, v] of Object.entries(token)) {
    if (v !== undefined) {
      cleanToken[k] = v;
    }
  }

  // Actualizar caché local
  const maps = getLocalMaps(cid);
  const idx = maps.findIndex((m) => m.id === mid);
  if (idx !== -1) {
    if (!maps[idx].tokens) maps[idx].tokens = {};
    maps[idx].tokens[tid] = cleanToken as Token;
    maps[idx].updatedAt = now;
    saveLocalMaps(cid, maps);
    dispatchEvent('map-updated', { cid, mid, map: maps[idx] });
  }

  // Firestore
  if (isFirebaseConfigured()) {
    try {
      const { db } = await getFirebase();
      const fs = await import('firebase/firestore');
      await fs.updateDoc(fs.doc(db, 'campaigns', cid, 'maps', mid), {
        [`tokens.${tid}`]: cleanToken,
        updatedAt: now,
      });
    } catch (err) {
      console.warn('[mapService] Error guardando token en Firestore:', err);
      throw err;
    }
  }

  // RTDB tokenOwners si tiene dueño asignado
  if (isFirebaseConfigured() && token.ownerUid) {
    try {
      const roomId = await getRoomIdForCampaign(cid);
      if (roomId) {
        const { rtdb } = await getFirebase();
        const rtdbSdk = await import('firebase/database');
        await rtdbSdk.set(
          rtdbSdk.ref(rtdb, `rooms/${roomId}/tokenOwners/${mid}/${tid}`),
          token.ownerUid
        );
      }
    } catch (err) {
      console.warn('[mapService] Error sincronizando tokenOwners en RTDB:', err);
    }
  }

  return tid;
}

/**
 * Actualiza propiedades de un token existente (solo DM).
 * Si cambia ownerUid, actualiza o borra en RTDB tokenOwners.
 */
export async function updateToken(
  cid: string,
  mid: string,
  tid: string,
  patch: Partial<Token>
): Promise<void> {
  checkCanPrepare(cid);

  const now = Date.now();

  // Actualizar caché local
  const maps = getLocalMaps(cid);
  const idx = maps.findIndex((m) => m.id === mid);
  if (idx !== -1 && maps[idx].tokens && maps[idx].tokens[tid]) {
    const updated = { ...maps[idx].tokens[tid] };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) {
        delete (updated as any)[k];
      } else {
        (updated as any)[k] = v;
      }
    }
    maps[idx].tokens[tid] = updated;
    maps[idx].updatedAt = now;
    saveLocalMaps(cid, maps);
    dispatchEvent('map-updated', { cid, mid, map: maps[idx] });
  }

  // Firestore con field paths
  if (isFirebaseConfigured()) {
    try {
      const { db } = await getFirebase();
      const fs = await import('firebase/firestore');
      const updatePayload: Record<string, any> = { updatedAt: now };
      for (const [key, val] of Object.entries(patch)) {
        if (val === undefined) {
          updatePayload[`tokens.${tid}.${key}`] = fs.deleteField();
        } else {
          updatePayload[`tokens.${tid}.${key}`] = val;
        }
      }
      await fs.updateDoc(fs.doc(db, 'campaigns', cid, 'maps', mid), updatePayload);
    } catch (err) {
      console.warn('[mapService] Error actualizando token en Firestore:', err);
      throw err;
    }
  }

  // Sincronizar dueño en RTDB si cambió
  if (isFirebaseConfigured() && patch.ownerUid !== undefined) {
    try {
      const roomId = await getRoomIdForCampaign(cid);
      if (roomId) {
        const { rtdb } = await getFirebase();
        const rtdbSdk = await import('firebase/database');
        const ref = rtdbSdk.ref(rtdb, `rooms/${roomId}/tokenOwners/${mid}/${tid}`);
        if (patch.ownerUid) {
          await rtdbSdk.set(ref, patch.ownerUid);
        } else {
          await rtdbSdk.remove(ref);
        }
      }
    } catch (err) {
      console.warn('[mapService] Error actualizando tokenOwners en RTDB:', err);
    }
  }
}

/**
 * Elimina un token del mapa (solo DM).
 * Limpia Firestore y los nodos correspondientes en RTDB (tokenOwners y live).
 */
export async function removeToken(cid: string, mid: string, tid: string): Promise<void> {
  checkCanPrepare(cid);

  const now = Date.now();

  // Actualizar caché local
  const maps = getLocalMaps(cid);
  const idx = maps.findIndex((m) => m.id === mid);
  if (idx !== -1 && maps[idx].tokens && maps[idx].tokens[tid]) {
    delete maps[idx].tokens[tid];
    maps[idx].updatedAt = now;
    saveLocalMaps(cid, maps);
    dispatchEvent('map-updated', { cid, mid, map: maps[idx] });
  }

  // Firestore deleteField()
  if (isFirebaseConfigured()) {
    try {
      const { db } = await getFirebase();
      const fs = await import('firebase/firestore');
      await fs.updateDoc(fs.doc(db, 'campaigns', cid, 'maps', mid), {
        [`tokens.${tid}`]: fs.deleteField(),
        updatedAt: now,
      });
    } catch (err) {
      console.warn('[mapService] Error eliminando token en Firestore:', err);
      throw err;
    }
  }

  // RTDB: limpiar tokenOwners y live
  if (isFirebaseConfigured()) {
    try {
      const roomId = await getRoomIdForCampaign(cid);
      if (roomId) {
        const { rtdb } = await getFirebase();
        const rtdbSdk = await import('firebase/database');
        await Promise.all([
          rtdbSdk.remove(rtdbSdk.ref(rtdb, `rooms/${roomId}/tokenOwners/${mid}/${tid}`)),
          rtdbSdk.remove(rtdbSdk.ref(rtdb, `rooms/${roomId}/live/${mid}/${tid}`)),
        ]);
      }
    } catch (err) {
      console.warn('[mapService] Error limpiando token en RTDB:', err);
    }
  }
}

/**
 * Reconcilia los dueños de tokens en RTDB con el documento de mapa (solo DM).
 */
export async function reconcileTokenOwners(
  cid: string,
  mid: string,
  map: MapDoc
): Promise<void> {
  if (!isFirebaseConfigured()) return;
  try {
    const roomId = await getRoomIdForCampaign(cid);
    if (!roomId) return;
    const { rtdb } = await getFirebase();
    const rtdbSdk = await import('firebase/database');
    const owners: Record<string, string> = {};
    for (const [tid, tok] of Object.entries(map.tokens || {})) {
      if (tok.ownerUid) {
        owners[tid] = tok.ownerUid;
      }
    }
    await rtdbSdk.set(rtdbSdk.ref(rtdb, `rooms/${roomId}/tokenOwners/${mid}`), owners);
  } catch (err) {
    console.warn('[mapService] Error conciliando tokenOwners en RTDB:', err);
  }
}

/**
 * Confirma el movimiento definitivo de un token en Firestore tras soltarlo.
 * DECISION (F3-2): El DM también escribe lastMove al mover. Así el bloqueo de paused
 * de F0B-4 aplica a sus movimientos legítimos.
 */
export async function commitTokenMove(
  cid: string,
  mid: string,
  tid: string,
  x: number,
  y: number
): Promise<void> {
  const campaign = campaignStore.getCampaign(cid);
  const status = normalizeStatus(campaign?.status);
  if (status !== 'active') {
    throw new Error('Solo se pueden mover tokens con la partida iniciada (active).');
  }

  const now = Date.now();
  let currentUid = '';

  if (isFirebaseConfigured()) {
    try {
      const { auth } = await getFirebase();
      currentUid = auth?.currentUser?.uid || '';
    } catch (_) {}
  }
  if (!currentUid) {
    const user = typeof window !== 'undefined' ? userStore.getCurrentUser() : null;
    currentUid = user?.id || campaignStore.getDmId() || 'local-user';
  }

  // 1. Actualizar caché local
  const maps = getLocalMaps(cid);
  const idx = maps.findIndex((m) => m.id === mid);
  const previousToken = idx !== -1 && maps[idx].tokens?.[tid] ? { ...maps[idx].tokens[tid] } : null;
  const previousLastMove = idx !== -1 ? maps[idx].lastMove : undefined;

  if (idx !== -1 && maps[idx].tokens && maps[idx].tokens[tid]) {
    maps[idx].tokens[tid].x = x;
    maps[idx].tokens[tid].y = y;
    maps[idx].lastMove = { tokenId: tid, by: currentUid, at: now };
    maps[idx].updatedAt = now;
    saveLocalMaps(cid, maps);
    dispatchEvent('map-updated', { cid, mid, map: maps[idx] });
  }

  // 2. Escritura atómica en Firestore con lastMove (F0-1, F3-2)
  if (isFirebaseConfigured()) {
    try {
      const { db, auth } = await getFirebase();
      const uid = auth?.currentUser?.uid || currentUid;
      const fs = await import('firebase/firestore');
      await fs.updateDoc(fs.doc(db, 'campaigns', cid, 'maps', mid), {
        [`tokens.${tid}.x`]: x,
        [`tokens.${tid}.y`]: y,
        lastMove: { tokenId: tid, by: uid, at: now },
        updatedAt: now,
      });
    } catch (err) {
      if (idx !== -1 && maps[idx].tokens && maps[idx].tokens[tid] && previousToken) {
        maps[idx].tokens[tid] = previousToken;
        maps[idx].lastMove = previousLastMove;
        saveLocalMaps(cid, maps);
        dispatchEvent('map-updated', { cid, mid, map: maps[idx] });
      }
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Gestión de Niebla de Guerra (Fase 4: T-40, T-41)
// ---------------------------------------------------------------------------

/**
 * Añade una forma a la niebla de guerra del mapa (solo DM con partida active).
 * Retorna { warn: boolean } indicando si se superaron las 450 formas.
 */
export async function addFogShape(
  cid: string,
  mid: string,
  current: FogShape[],
  shape: FogShape
): Promise<{ warn: boolean }> {
  checkCanPlayDm(cid);

  const res = appendFog(current, shape, MAP_LIMITS.maxFogShapes);
  if (res.rejected) {
    throw new Error('Se alcanzó el límite máximo de 500 formas de niebla.');
  }

  const now = Date.now();

  // Actualizar caché local
  const maps = getLocalMaps(cid);
  const idx = maps.findIndex((m) => m.id === mid);
  if (idx !== -1) {
    maps[idx].fogRevealed = res.list;
    maps[idx].updatedAt = now;
    saveLocalMaps(cid, maps);
    dispatchEvent('map-updated', { cid, mid, map: maps[idx] });
  }

  if (isFirebaseConfigured()) {
    try {
      const { db } = await getFirebase();
      const fs = await import('firebase/firestore');
      await fs.updateDoc(fs.doc(db, 'campaigns', cid, 'maps', mid), {
        fogRevealed: res.list,
        updatedAt: now,
      });
    } catch (err) {
      console.warn('[mapService] Error guardando niebla en Firestore:', err);
      throw err;
    }
  }

  return { warn: res.warn };
}

/**
 * Reemplaza completamente la lista de niebla ("Cubrir todo" con [] o "Revelar todo").
 * Solo DM con partida active.
 */
export async function setFog(
  cid: string,
  mid: string,
  list: FogShape[]
): Promise<void> {
  checkCanPlayDm(cid);

  if (list.length > MAP_LIMITS.maxFogShapes) {
    throw new Error('La lista de niebla excede el límite máximo de 500 formas.');
  }

  const now = Date.now();

  const maps = getLocalMaps(cid);
  const idx = maps.findIndex((m) => m.id === mid);
  if (idx !== -1) {
    maps[idx].fogRevealed = list;
    maps[idx].updatedAt = now;
    saveLocalMaps(cid, maps);
    dispatchEvent('map-updated', { cid, mid, map: maps[idx] });
  }

  if (isFirebaseConfigured()) {
    try {
      const { db } = await getFirebase();
      const fs = await import('firebase/firestore');
      await fs.updateDoc(fs.doc(db, 'campaigns', cid, 'maps', mid), {
        fogRevealed: list,
        updatedAt: now,
      });
    } catch (err) {
      console.warn('[mapService] Error actualizando niebla en Firestore:', err);
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Gestión de Tokens Ocultos / Secretos (Fase 4: T-42, T-43, RF-24)
// ---------------------------------------------------------------------------

/**
 * Oculta un token visible, moviéndolo atómicamente a maps/{mid}/private/dmOnly (solo DM).
 * Limpia tokenOwners y live en RTDB (RF-24, F4-5).
 * // DECISION: F4-4 Los tokens visibles bajo la niebla se ven tapados en la UI, pero para
 * ocultar datos reales al jugador se mueven a private/dmOnly (RF-24).
 * // DECISION: F4-5 Ocultar y revelar se hacen con writeBatch atómico entre tokens y secretTokens.
 */
export async function hideToken(
  cid: string,
  mid: string,
  tid: string,
  token: Token
): Promise<void> {
  checkCanPrepare(cid);

  const clean = sanitizeToken(token);
  const now = Date.now();

  // 1. Caché local
  const maps = getLocalMaps(cid);
  const idx = maps.findIndex((m) => m.id === mid);
  if (idx !== -1 && maps[idx].tokens?.[tid]) {
    delete maps[idx].tokens[tid];
    maps[idx].updatedAt = now;
    saveLocalMaps(cid, maps);
    dispatchEvent('map-updated', { cid, mid, map: maps[idx] });
  }

  const dmOnly = getLocalDmOnly(cid, mid);
  dmOnly.secretTokens[tid] = clean as Token;
  saveLocalDmOnly(cid, mid, dmOnly);

  // 2. Transacción / Batch atómico en Firestore
  if (isFirebaseConfigured()) {
    try {
      const { db } = await getFirebase();
      const fs = await import('firebase/firestore');
      const batch = fs.writeBatch(db);

      const mapRef = fs.doc(db, 'campaigns', cid, 'maps', mid);
      const dmOnlyRef = fs.doc(db, 'campaigns', cid, 'maps', mid, 'private', 'dmOnly');

      batch.update(mapRef, {
        [`tokens.${tid}`]: fs.deleteField(),
        updatedAt: now,
      });
      batch.set(
        dmOnlyRef,
        {
          secretTokens: { [tid]: clean },
        },
        { merge: true }
      );

      await batch.commit();
    } catch (err) {
      console.warn('[mapService] Error ocultando token en Firestore batch:', err);
      throw err;
    }
  }

  // 3. RTDB: limpiar tokenOwners y live (el token ya no existe para los jugadores)
  if (isFirebaseConfigured()) {
    try {
      const roomId = await getRoomIdForCampaign(cid);
      if (roomId) {
        const { rtdb } = await getFirebase();
        const rtdbSdk = await import('firebase/database');
        await Promise.all([
          rtdbSdk.remove(rtdbSdk.ref(rtdb, `rooms/${roomId}/tokenOwners/${mid}/${tid}`)),
          rtdbSdk.remove(rtdbSdk.ref(rtdb, `rooms/${roomId}/live/${mid}/${tid}`)),
        ]);
      }
    } catch (err) {
      console.warn('[mapService] Error limpiando RTDB tras ocultar token:', err);
    }
  }
}

/**
 * Revela un token oculto, devolviéndolo atómicamente a maps/{mid}.tokens (solo DM).
 * Si tiene dueño, sincroniza tokenOwners en RTDB (RF-24, F4-5).
 */
export async function revealToken(
  cid: string,
  mid: string,
  tid: string,
  token: Token
): Promise<void> {
  checkCanPrepare(cid);

  const clean = sanitizeToken(token);
  const now = Date.now();

  // 1. Caché local
  const dmOnly = getLocalDmOnly(cid, mid);
  if (dmOnly.secretTokens[tid]) {
    delete dmOnly.secretTokens[tid];
    saveLocalDmOnly(cid, mid, dmOnly);
  }

  const maps = getLocalMaps(cid);
  const idx = maps.findIndex((m) => m.id === mid);
  if (idx !== -1) {
    if (!maps[idx].tokens) maps[idx].tokens = {};
    maps[idx].tokens[tid] = clean as Token;
    maps[idx].updatedAt = now;
    saveLocalMaps(cid, maps);
    dispatchEvent('map-updated', { cid, mid, map: maps[idx] });
  }

  // 2. Batch atómico en Firestore
  if (isFirebaseConfigured()) {
    try {
      const { db } = await getFirebase();
      const fs = await import('firebase/firestore');
      const batch = fs.writeBatch(db);

      const mapRef = fs.doc(db, 'campaigns', cid, 'maps', mid);
      const dmOnlyRef = fs.doc(db, 'campaigns', cid, 'maps', mid, 'private', 'dmOnly');

      batch.update(mapRef, {
        [`tokens.${tid}`]: clean,
        updatedAt: now,
      });
      batch.update(dmOnlyRef, {
        [`secretTokens.${tid}`]: fs.deleteField(),
      });

      await batch.commit();
    } catch (err) {
      console.warn('[mapService] Error revelando token en Firestore batch:', err);
      throw err;
    }
  }

  // 3. RTDB: restaurar tokenOwners si tiene dueño
  if (isFirebaseConfigured() && token.ownerUid) {
    try {
      const roomId = await getRoomIdForCampaign(cid);
      if (roomId) {
        const { rtdb } = await getFirebase();
        const rtdbSdk = await import('firebase/database');
        await rtdbSdk.set(
          rtdbSdk.ref(rtdb, `rooms/${roomId}/tokenOwners/${mid}/${tid}`),
          token.ownerUid
        );
      }
    } catch (err) {
      console.warn('[mapService] Error restaurando tokenOwners en RTDB tras revelar:', err);
    }
  }
}

/**
 * Crea un token directamente en estado oculto (private/dmOnly).
 */
export async function addSecretToken(
  cid: string,
  mid: string,
  token: Token,
  specifiedId?: string
): Promise<string> {
  checkCanPrepare(cid);

  const tid = specifiedId || newTokenId();
  const clean = sanitizeToken(token);

  const dmOnly = getLocalDmOnly(cid, mid);
  dmOnly.secretTokens[tid] = clean as Token;
  saveLocalDmOnly(cid, mid, dmOnly);

  if (isFirebaseConfigured()) {
    try {
      const { db } = await getFirebase();
      const fs = await import('firebase/firestore');
      const dmOnlyRef = fs.doc(db, 'campaigns', cid, 'maps', mid, 'private', 'dmOnly');
      await fs.setDoc(
        dmOnlyRef,
        {
          secretTokens: { [tid]: clean },
        },
        { merge: true }
      );
    } catch (err) {
      console.warn('[mapService] Error guardando token secreto en Firestore:', err);
      throw err;
    }
  }

  return tid;
}

/**
 * Actualiza propiedades o posición de un token oculto en private/dmOnly (solo DM).
 * DECISION (F4-4): La posición de tokens secretos NUNCA toca el mapa público ni RTDB live.
 */
export async function updateSecretToken(
  cid: string,
  mid: string,
  tid: string,
  patch: Partial<Token>
): Promise<void> {
  checkCanPrepare(cid);

  const dmOnly = getLocalDmOnly(cid, mid);
  if (dmOnly.secretTokens[tid]) {
    const updated = { ...dmOnly.secretTokens[tid] };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) {
        delete (updated as any)[k];
      } else {
        (updated as any)[k] = v;
      }
    }
    dmOnly.secretTokens[tid] = updated;
    saveLocalDmOnly(cid, mid, dmOnly);
  }

  if (isFirebaseConfigured()) {
    try {
      const { db } = await getFirebase();
      const fs = await import('firebase/firestore');
      const updatePayload: Record<string, any> = {};
      for (const [key, val] of Object.entries(patch)) {
        if (val === undefined) {
          updatePayload[`secretTokens.${tid}.${key}`] = fs.deleteField();
        } else {
          updatePayload[`secretTokens.${tid}.${key}`] = val;
        }
      }
      await fs.updateDoc(
        fs.doc(db, 'campaigns', cid, 'maps', mid, 'private', 'dmOnly'),
        updatePayload
      );
    } catch (err) {
      console.warn('[mapService] Error actualizando token secreto en Firestore:', err);
      throw err;
    }
  }
}

/**
 * Elimina definitivamente un token oculto de private/dmOnly.
 */
export async function removeSecretToken(
  cid: string,
  mid: string,
  tid: string
): Promise<void> {
  checkCanPrepare(cid);

  const dmOnly = getLocalDmOnly(cid, mid);
  if (dmOnly.secretTokens[tid]) {
    delete dmOnly.secretTokens[tid];
    saveLocalDmOnly(cid, mid, dmOnly);
  }

  if (isFirebaseConfigured()) {
    try {
      const { db } = await getFirebase();
      const fs = await import('firebase/firestore');
      await fs.updateDoc(fs.doc(db, 'campaigns', cid, 'maps', mid, 'private', 'dmOnly'), {
        [`secretTokens.${tid}`]: fs.deleteField(),
      });
    } catch (err) {
      console.warn('[mapService] Error eliminando token secreto en Firestore:', err);
      throw err;
    }
  }
}

/**
 * Suscripción exclusiva del DM al documento private/dmOnly del mapa activo.
 * // DECISION: F4-3 El DM tiene un segundo onSnapshot sobre private/dmOnly del mapa abierto.
 * Los jugadores nunca llaman a esta función (y las reglas de seguridad les deniegan acceso).
 */
export function subscribeDmOnly(
  cid: string,
  mid: string,
  callback: (dmOnly: DmOnly) => void
): () => void {
  // Emitir valor local de inmediato
  const initialLocal = getLocalDmOnly(cid, mid);
  callback(initialLocal);

  if (isFirebaseConfigured()) {
    let isCancelled = false;
    let fsUnsub: (() => void) | null = null;

    getFirebase()
      .then(async ({ db }) => {
        if (isCancelled) return;
        const fs = await import('firebase/firestore');
        const docRef = fs.doc(db, 'campaigns', cid, 'maps', mid, 'private', 'dmOnly');

        fsUnsub = fs.onSnapshot(
          docRef,
          (snap) => {
            const data: DmOnly = {
              secretTokens: snap.exists() ? ((snap.data() as any).secretTokens || {}) : {},
            };
            saveLocalDmOnly(cid, mid, data);
            callback(data);
          },
          (error) => {
            console.warn(`[mapService] onSnapshot error en dmOnly ${mid}:`, error);
            callback(getLocalDmOnly(cid, mid));
          }
        );

        if (isCancelled && fsUnsub) {
          fsUnsub();
        }
      })
      .catch((err) => {
        console.warn('[mapService] Error suscribiendo a dmOnly:', err);
        callback(getLocalDmOnly(cid, mid));
      });

    return () => {
      isCancelled = true;
      if (fsUnsub) fsUnsub();
    };
  }

  // Manejador local de eventos
  const localHandler = (event: Event) => {
    const customEvent = event as CustomEvent<{ cid: string; mid: string; dmOnly?: DmOnly }>;
    if (customEvent.detail && customEvent.detail.cid === cid && customEvent.detail.mid === mid) {
      callback(customEvent.detail.dmOnly || getLocalDmOnly(cid, mid));
    }
  };

  addListener('dm-only-updated', localHandler as EventListener);

  return () => {
    removeListener('dm-only-updated', localHandler as EventListener);
  };
}

// ---------------------------------------------------------------------------
// Suscripciones en tiempo real
// ---------------------------------------------------------------------------

/**
 * Se suscribe a un mapa específico mediante un único onSnapshot.
 */
export function subscribeMap(
  cid: string,
  mid: string,
  callback: (map: MapDoc | null) => void
): () => void {
  // 1. Emitir inmediatamente el valor local si existe para no bloquear la UI
  const localMap = getLocalMaps(cid).find((m) => m.id === mid) || null;
  if (localMap) {
    callback(localMap);
  }

  if (isFirebaseConfigured()) {
    let isCancelled = false;
    let fsUnsub: (() => void) | null = null;

    getFirebase()
      .then(async ({ db }) => {
        if (isCancelled) return;
        const fs = await import('firebase/firestore');
        const mapDocRef = fs.doc(db, 'campaigns', cid, 'maps', mid);

        fsUnsub = fs.onSnapshot(
          mapDocRef,
          (snap) => {
            if (snap.exists()) {
              const remote = { id: snap.id, ...(snap.data() as Omit<MapDoc, 'id'>) };
              // Actualizar caché local
              const maps = getLocalMaps(cid);
              const idx = maps.findIndex((m) => m.id === mid);
              if (idx !== -1) {
                maps[idx] = remote;
              } else {
                maps.push(remote);
              }
              saveLocalMaps(cid, maps);
              callback(remote);
            } else {
              callback(null);
            }
          },
          (error) => {
            console.warn(`[mapService] onSnapshot error en mapa ${mid}:`, error);
            // Si Firestore falla por falta de sesión o permisos, usar fallback local
            const fallback = getLocalMaps(cid).find((m) => m.id === mid) || null;
            callback(fallback);
          }
        );

        if (isCancelled && fsUnsub) {
          fsUnsub();
        }
      })
      .catch((err) => {
        console.warn('[mapService] Error conectando Firestore para subscribeMap:', err);
        const fallback = getLocalMaps(cid).find((m) => m.id === mid) || null;
        callback(fallback);
      });

    return () => {
      isCancelled = true;
      if (fsUnsub) fsUnsub();
    };
  }

  // Fallback local puro
  if (!localMap) {
    callback(null);
  }

  const localHandler = (event: Event) => {
    const customEvent = event as CustomEvent<{ cid: string; mid?: string; map?: MapDoc }>;
    if (customEvent.detail && customEvent.detail.cid === cid) {
      if (customEvent.detail.mid && customEvent.detail.mid !== mid) {
        return;
      }
      if (customEvent.detail.mid === mid && customEvent.detail.map) {
        callback(customEvent.detail.map);
        return;
      }
      const maps = getLocalMaps(cid);
      callback(maps.find((m) => m.id === mid) || null);
    }
  };

  addListener('map-updated', localHandler as EventListener);
  addListener('maps-updated', localHandler as EventListener);

  return () => {
    removeListener('map-updated', localHandler as EventListener);
    removeListener('maps-updated', localHandler as EventListener);
  };
}

/**
 * Escucha la campaña activa y conmuta automáticamente la suscripción al mapa activo (F2-3, T-23).
 * Cuando el DM cambia activeMapId, cierra la suscripción previa y abre la del nuevo mapa.
 */
export function watchActiveMap(
  cid: string,
  callback: (map: MapDoc | null) => void
): () => void {
  let currentMapUnsub: (() => void) | null = null;
  // IMPORTANTE: Inicializar en undefined para que el primer cambio a null (sin mapa) no se ignore
  let currentActiveMapId: string | null | undefined = undefined;

  function handleActiveMapChange(newActiveMapId: string | null) {
    if (newActiveMapId === currentActiveMapId) return;
    currentActiveMapId = newActiveMapId;

    if (currentMapUnsub) {
      currentMapUnsub();
      currentMapUnsub = null;
    }

    if (currentActiveMapId) {
      currentMapUnsub = subscribeMap(cid, currentActiveMapId, callback);
    } else {
      callback(null);
    }
  }

  // Inicializar con la campaña actual
  const initialCamp = campaignStore.getCampaign(cid);
  handleActiveMapChange(initialCamp?.activeMapId || null);

  // Escuchar cambios de campaña
  const campaignHandler = (event?: Event) => {
    const customEvent = event as CustomEvent<{ cid?: string; mid?: string }>;
    if (customEvent?.detail && customEvent.detail.cid === cid && customEvent.detail.mid !== undefined) {
      handleActiveMapChange(customEvent.detail.mid || null);
      return;
    }
    const camp = campaignStore.getCampaign(cid);
    handleActiveMapChange(camp?.activeMapId || null);
  };

  addListener('campaigns-updated', campaignHandler as EventListener);
  addListener('active-map-changed', campaignHandler as EventListener);
  addListener('active-campaign-changed', campaignHandler as EventListener);

  return () => {
    if (currentMapUnsub) {
      currentMapUnsub();
      currentMapUnsub = null;
    }
    removeListener('campaigns-updated', campaignHandler as EventListener);
    removeListener('active-map-changed', campaignHandler as EventListener);
    removeListener('active-campaign-changed', campaignHandler as EventListener);
  };
}
