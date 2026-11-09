// src/scripts/data/roomService.ts
// Espejo en Realtime Database de cada campaña donde el usuario es DM.
//
//   /rooms/{roomId}/meta                     = { dm: uid, cid }
//   /rooms/{roomId}/members/{uid}            = true
//   /rooms/{roomId}/status                   = 'active' | 'paused' | 'ended'   (Fase 0B)
//   /rooms/{roomId}/tokenOwners/{mid}/{tid}  = uid                             (Fase 3)
//   /rooms/{roomId}/live/{mid}/{tid}         = { x, y, by }                    (Fase 3)
//   /rooms/{roomId}/presence/{uid}           = { name, online, lastSeen }
//
// DECISION: la sala vive bajo un id aleatorio guardado en campaigns/{cid}.liveRoomId (D13).
// Las reglas de RTDB no pueden leer Firestore y los ids de campaña (`slug-xxxx`) se pueden
// adivinar: con un id secreto nadie puede crear /rooms/{cid}/meta antes que el DM y quedarse
// con la sala. Solo los miembros leen la campaña, así que solo ellos conocen el roomId.
// Si cambia el DM, el nuevo DM no puede escribir la meta vieja y genera otra sala.
//
// La UI no importa este archivo con firebase/*: el SDK se carga con import() dinámico.
import type { Database } from 'firebase/database';
import type { Campaign } from '../models/campaign.ts';
import { getFirebase, isFirebaseConfigured } from '../firebase/client.ts';
import { campaignStore } from '../state/campaignStore.ts';

type Rtdb = typeof import('firebase/database');

let uidProvider: () => string | null = () => null;
let started = false;
let reconcileTimer: ReturnType<typeof setTimeout> | null = null;

/** Salas ya verificadas en esta sesión (`cid:roomId`), para no releer la meta en cada cambio. */
const verifiedRooms = new Set<string>();
/** Última lista de miembros escrita por sala (`roomId` → uids ordenados). */
const syncedMembers = new Map<string, string>();
/** ensureRoom en curso por campaña: evita crear dos salas si llegan dos eventos seguidos. */
const pendingRooms = new Map<string, Promise<string>>();

async function sdk(): Promise<{ rtdb: Database; db: Rtdb }> {
  const { rtdb } = await getFirebase();
  const db = await import('firebase/database');
  return { rtdb, db };
}

/** Id de 20 caracteres generado en el cliente (mismo formato que las push keys). */
function newRoomId(db: Rtdb, rtdb: Database): string {
  const key = db.push(db.ref(rtdb, 'rooms')).key;
  if (!key) throw new Error('No se pudo generar el id de la sala.');
  return key;
}

/**
 * Devuelve el roomId de la campaña y lo crea si hace falta. Solo la ejecuta el DM.
 * 1. Si `liveRoomId` existe y su meta.dm es el usuario actual, la devuelve.
 * 2. Si no, genera un id, escribe la meta en RTDB y después guarda `liveRoomId` en Firestore.
 */
export function ensureRoom(campaign: Campaign): Promise<string> {
  const pending = pendingRooms.get(campaign.id);
  if (pending) return pending;
  const task = doEnsureRoom(campaign).finally(() => pendingRooms.delete(campaign.id));
  pendingRooms.set(campaign.id, task);
  return task;
}

async function doEnsureRoom(campaign: Campaign): Promise<string> {
  const uid = uidProvider();
  if (!uid) throw new Error('Requiere iniciar sesión con cuenta.');
  if (campaign.dmId !== uid) throw new Error('Solo el DM puede crear la sala de la partida.');

  const { rtdb, db } = await sdk();
  const current = campaign.liveRoomId;

  if (current) {
    if (verifiedRooms.has(`${campaign.id}:${current}`)) return current;
    try {
      const snap = await db.get(db.ref(rtdb, `rooms/${current}/meta/dm`));
      if (snap.val() === uid) {
        verifiedRooms.add(`${campaign.id}:${current}`);
        return current;
      }
    } catch (_) {
      // Sin permiso de lectura: la sala no existe o es de otro DM. Se crea una nueva.
    }
  }

  const roomId = newRoomId(db, rtdb);
  // Primero la meta: así, cuando los jugadores lean liveRoomId, la sala ya tiene dueño.
  await db.set(db.ref(rtdb, `rooms/${roomId}/meta`), { dm: uid, cid: campaign.id });
  verifiedRooms.add(`${campaign.id}:${roomId}`);
  campaignStore.updateCampaign(campaign.id, { liveRoomId: roomId });
  return roomId;
}

/** Deja `/rooms/{roomId}/members` igual a `memberUserIds` (true a los que faltan, null a los que sobran). */
export async function syncRoomMembers(roomId: string, memberUserIds: string[]): Promise<void> {
  const wanted = Array.from(new Set(memberUserIds.filter(Boolean))).sort();
  const key = wanted.join(',');
  if (syncedMembers.get(roomId) === key) return;

  const { rtdb, db } = await sdk();
  const membersRef = db.ref(rtdb, `rooms/${roomId}/members`);
  const snap = await db.get(membersRef);
  const existing = Object.keys((snap.val() as Record<string, true> | null) || {});

  const patch: Record<string, true | null> = {};
  for (const id of wanted) if (!existing.includes(id)) patch[id] = true;
  for (const id of existing) if (!wanted.includes(id)) patch[id] = null;

  if (Object.keys(patch).length > 0) await db.update(membersRef, patch);
  syncedMembers.set(roomId, key);
}

/**
 * Crea o verifica la sala y sincroniza los miembros de cada campaña donde el usuario es DM.
 * Es idempotente: se puede llamar en cada `campaigns-updated`.
 *
 * DECISION: se reconcilian todas las campañas del DM y no solo la activa, para que un jugador
 * que se une a otra mesa quede en la sala sin que el DM tenga que abrirla. Cada sala son unos
 * pocos bytes en RTDB.
 * DECISION: si el jugador se une con código mientras el DM está desconectado, entra a la sala
 * recién cuando el DM abre la app. Es aceptable: sin el DM no hay partida `active`.
 */
export async function reconcileRooms(): Promise<void> {
  const uid = uidProvider();
  if (!uid) return;
  const mine = campaignStore.getCampaigns().filter(c => c.dmId === uid);
  await Promise.all(mine.map(async campaign => {
    try {
      const roomId = await ensureRoom(campaign);
      await syncRoomMembers(roomId, campaign.memberUserIds || []);
    } catch (err) {
      console.warn(`[RoomService] No se pudo sincronizar la sala de ${campaign.id}`, err);
    }
  }));
}

function scheduleReconcile() {
  if (reconcileTimer) clearTimeout(reconcileTimer);
  reconcileTimer = setTimeout(() => {
    reconcileTimer = null;
    reconcileRooms();
  }, 300);
}

/** La llama cloudSync cuando la sesión en la nube está lista. En modo local no hace nada (D10). */
export function startRoomSync(getUid: () => string | null) {
  if (started || typeof window === 'undefined' || !isFirebaseConfigured()) return;
  started = true;
  uidProvider = getUid;
  window.addEventListener('campaigns-updated', scheduleReconcile);
  scheduleReconcile();
}
