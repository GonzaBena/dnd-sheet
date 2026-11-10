// src/scripts/data/pingService.ts
// Pings efímeros en el mapa (T-51b, RF-14).
//
//   /rooms/{roomId}/pings/{mid}/{pid} = { x, y, by, at }
//
// DECISION (F5-8): el ping se borra solo a los 3 s (setTimeout) y, si el cliente se cae antes,
// con onDisconnect().remove(). Las reglas solo dejan crear con la partida 'active'.
// DECISION (F5-9): límite de 1 ping por segundo y usuario en el cliente (cuota).

import { getFirebase, isFirebaseConfigured } from '../firebase/client.ts';

export const PING_TTL_MS = 3000;
export const PING_MIN_INTERVAL_MS = 1000;

export interface RemotePing {
  id: string;
  x: number;
  y: number;
  by: string;
  at: number;
}

let lastSentAt = 0;

/** true si pasó al menos 1 s desde el último ping propio. Registra el envío si lo permite. */
export function allowPing(now = Date.now()): boolean {
  if (now - lastSentAt < PING_MIN_INTERVAL_MS) return false;
  lastSentAt = now;
  return true;
}

/** Solo para tests. */
export function resetPingLimiter(): void {
  lastSentAt = 0;
}

/** Envía un ping. Devuelve false si el límite lo bloqueó o no hay Firebase. */
export async function sendPing(roomId: string, mid: string, x: number, y: number, uid: string): Promise<boolean> {
  if (!isFirebaseConfigured() || !roomId || !mid || !uid) return false;
  if (!allowPing()) return false;

  try {
    const { rtdb } = await getFirebase();
    const db = await import('firebase/database');
    const ref = db.push(db.ref(rtdb, `rooms/${roomId}/pings/${mid}`));
    await db.onDisconnect(ref).remove();
    await db.set(ref, { x: Math.round(x), y: Math.round(y), by: uid, at: Date.now() });
    setTimeout(() => {
      db.remove(ref).catch(() => {});
      db.onDisconnect(ref).cancel().catch(() => {});
    }, PING_TTL_MS);
    return true;
  } catch (err) {
    console.warn('[pingService] No se pudo enviar el ping:', err);
    return false;
  }
}

/** Escucha pings nuevos del mapa. Ignora los viejos (más de TTL) que llegan al conectar. */
export function subscribePings(roomId: string, mid: string, cb: (ping: RemotePing) => void): () => void {
  if (!isFirebaseConfigured() || !roomId || !mid) return () => {};

  let cancelled = false;
  let off: (() => void) | null = null;
  getFirebase()
    .then(async ({ rtdb }) => {
      if (cancelled) return;
      const db = await import('firebase/database');
      off = db.onChildAdded(db.ref(rtdb, `rooms/${roomId}/pings/${mid}`), (snap) => {
        const v = snap.val();
        if (!v || typeof v.x !== 'number' || typeof v.y !== 'number' || typeof v.by !== 'string') return;
        const at = Number(v.at) || 0;
        if (at && Date.now() - at > PING_TTL_MS + 2000) return;
        cb({ id: snap.key as string, x: v.x, y: v.y, by: v.by, at });
      });
      if (cancelled) off();
    })
    .catch((err) => console.warn('[pingService] No se pudo suscribir:', err));

  return () => {
    cancelled = true;
    off?.();
  };
}
