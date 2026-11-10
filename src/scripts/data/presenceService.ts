// src/scripts/data/presenceService.ts
// Presencia de los miembros de la sala (T-51a, RF-42).
//
//   /rooms/{roomId}/presence/{uid} = { name, online, lastSeen }
//
// DECISION (F5-7): se registra onDisconnect ANTES de marcar online, para que una caída justo
// después de conectar no deje al usuario "conectado" para siempre.
// DECISION (D1): el SDK de Firebase se carga dinámicamente con import().

import { getFirebase, isFirebaseConfigured } from '../firebase/client.ts';

export interface PresenceEntry {
  uid: string;
  name: string;
  online: boolean;
  lastSeen: number;
}

/** Texto "visto hace X" para un usuario desconectado. Función pura. */
export function formatLastSeen(lastSeen: number, now = Date.now()): string {
  const min = Math.floor(Math.max(0, now - lastSeen) / 60000);
  if (min < 1) return 'visto hace un momento';
  if (min < 60) return `visto hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `visto hace ${h} h`;
  return `visto hace ${Math.floor(h / 24)} d`;
}

/** Convierte el snapshot crudo del nodo presence en una lista ordenada (en línea primero, luego por nombre). */
export function normalizePresence(raw: unknown): PresenceEntry[] {
  if (!raw || typeof raw !== 'object') return [];
  const out: PresenceEntry[] = [];
  for (const [uid, v] of Object.entries(raw as Record<string, any>)) {
    if (!v || typeof v.name !== 'string') continue;
    out.push({ uid, name: v.name, online: v.online === true, lastSeen: Number(v.lastSeen) || 0 });
  }
  return out.sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
}

/**
 * Marca al usuario como conectado mientras haya conexión a RTDB. Devuelve `leave()`,
 * que lo marca desconectado (llamarlo en `pagehide`).
 */
export function joinPresence(roomId: string, uid: string, name: string): () => void {
  if (!isFirebaseConfigured() || !roomId || !uid) return () => {};

  let cancelled = false;
  let cleanup: (() => void) | null = null;
  let offlineWrite: (() => Promise<void>) | null = null;
  const safeName = (name || 'Aventurero').slice(0, 80);

  getFirebase()
    .then(async ({ rtdb }) => {
      if (cancelled) return;
      const db = await import('firebase/database');
      const myRef = db.ref(rtdb, `rooms/${roomId}/presence/${uid}`);
      const connRef = db.ref(rtdb, '.info/connected');

      // DECISION (F5-12): siempre se escribe el objeto COMPLETO ({ name, online, lastSeen }), nunca un update parcial.
      // Las reglas validan que existan los tres campos sobre el resultado final; con el nodo todavía inexistente
      // (primera conexión), un update parcial sin `name` se rechaza con PERMISSION_DENIED.
      offlineWrite = () => db.set(myRef, { name: safeName, online: false, lastSeen: Date.now() });

      const off = db.onValue(connRef, async (snap) => {
        if (snap.val() !== true || cancelled) return;
        try {
          await db.onDisconnect(myRef).set({ name: safeName, online: false, lastSeen: db.serverTimestamp() });
          await db.set(myRef, { name: safeName, online: true, lastSeen: db.serverTimestamp() });
        } catch (err) {
          // Causas posibles: el uid no está en rooms/{roomId}/members (lo sincroniza el navegador del DM)
          // o las reglas RTDB desplegadas no coinciden con database.rules.json.
          console.warn(`[presenceService] No se pudo registrar la presencia de ${uid} en la sala ${roomId}:`, err);
        }
      });
      cleanup = off;
      if (cancelled) off();
    })
    .catch((err) => console.warn('[presenceService] Sin conexión a RTDB:', err));

  return () => {
    if (cancelled) return;
    cancelled = true;
    cleanup?.();
    void offlineWrite?.().catch(() => {});
  };
}

/** Escucha el nodo presence completo. Devuelve la función para cancelar. */
export function subscribePresence(roomId: string, cb: (list: PresenceEntry[]) => void): () => void {
  if (!isFirebaseConfigured() || !roomId) return () => {};

  let cancelled = false;
  let off: (() => void) | null = null;
  getFirebase()
    .then(async ({ rtdb }) => {
      if (cancelled) return;
      const db = await import('firebase/database');
      off = db.onValue(
        db.ref(rtdb, `rooms/${roomId}/presence`),
        (snap) => cb(normalizePresence(snap.val())),
        (err) => console.warn('[presenceService] onValue error:', err)
      );
      if (cancelled) off();
    })
    .catch((err) => console.warn('[presenceService] No se pudo suscribir:', err));

  return () => {
    cancelled = true;
    off?.();
  };
}
