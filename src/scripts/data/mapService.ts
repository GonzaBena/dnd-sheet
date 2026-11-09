// src/scripts/data/mapService.ts
// Gestión de mapas tácticos del VTT (campaigns/{cid}/maps/{mid}).
//
// DECISION (F2-3): La lista de mapas la lee solo el DM con getDocs (lectura puntual sin listener).
// El mapa activo usa un único onSnapshot que se desuscribe al cambiar de mapa.

import type { MapDoc, GridConfig } from '../models/map.ts';
import { campaignStore } from '../state/campaignStore.ts';
import { normalizeStatus, canPerform } from '../vtt/sessionStatus.ts';
import { getFirebase, isFirebaseConfigured } from '../firebase/client.ts';

const LOCAL_MAPS_KEY_PREFIX = 'dnd_maps_';

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

function checkCanPrepare(cid: string): void {
  const campaign = campaignStore.getCampaign(cid);
  const status = normalizeStatus(campaign?.status);
  if (!canPerform('dmPrepare', 'dm', status)) {
    throw new Error('No puedes preparar mapas con la partida en el estado actual.');
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
