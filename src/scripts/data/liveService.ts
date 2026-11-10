// src/scripts/data/liveService.ts
// Servicio en tiempo real para sincronización de tokens durante el arrastre (RTDB).
//
//   /rooms/{roomId}/live/{mid}/{tid} = { x, y, by }
//
// DECISION (F3-4): onDisconnect().remove() se registra al empezar cada arrastre sobre el nodo live
// de ese token. Al soltar se cancela con onDisconnect().cancel() después de borrar el nodo.
// DECISION (D1): El SDK de Firebase se carga dinámicamente con import().

import { getFirebase, isFirebaseConfigured } from '../firebase/client.ts';
import { throttle, type ThrottledFunction } from '../utils/throttle.ts';

export interface LivePublisher {
  start(): Promise<void>;
  move(x: number, y: number): void;
  end(): Promise<void>;
}

export interface RemoteLivePosition {
  x: number;
  y: number;
  by: string;
}

/**
 * Crea un publicador para emitir la posición de un token mientras se arrastra en la sala RTDB.
 */
export function createLivePublisher(
  roomId: string,
  mid: string,
  tid: string,
  uid: string
): LivePublisher {
  if (!isFirebaseConfigured() || !roomId || !mid || !tid) {
    // Fallback local sin Firebase
    return {
      async start() {},
      move(_x: number, _y: number) {},
      async end() {},
    };
  }

  let dbRef: any = null;
  let disconnectHandler: any = null;
  let isStarted = false;

  const pushMove = throttle(async (x: number, y: number) => {
    if (!isStarted || !dbRef) return;
    try {
      const db = await import('firebase/database');
      await db.set(dbRef, {
        x: Math.round(x),
        y: Math.round(y),
        by: uid,
      });
    } catch (err) {
      console.warn('[liveService] Error enviando posición live:', err);
    }
  }, 50);

  return {
    async start() {
      isStarted = true;
      try {
        const { rtdb } = await getFirebase();
        const db = await import('firebase/database');
        dbRef = db.ref(rtdb, `rooms/${roomId}/live/${mid}/${tid}`);
        disconnectHandler = db.onDisconnect(dbRef);
        await disconnectHandler.remove();
      } catch (err) {
        console.warn('[liveService] Error iniciando publicador live (onDisconnect):', err);
      }
    },

    move(x: number, y: number) {
      if (!isStarted) return;
      pushMove(x, y);
    },

    async end() {
      isStarted = false;
      pushMove.cancel();

      if (dbRef) {
        try {
          const db = await import('firebase/database');
          await db.remove(dbRef);
        } catch (err) {
          console.warn('[liveService] Error borrando nodo live:', err);
        }

        if (disconnectHandler) {
          try {
            await disconnectHandler.cancel();
          } catch (_) {}
          disconnectHandler = null;
        }
        dbRef = null;
      }
    },
  };
}

/**
 * Se suscribe a los cambios de posición en vivo de tokens en el mapa.
 * Ignora las actualizaciones generadas por el propio usuario (`by === uid`).
 */
export function subscribeLive(
  roomId: string,
  mid: string,
  uid: string,
  callback: (tid: string, pos: { x: number; y: number } | null) => void
): () => void {
  if (!isFirebaseConfigured() || !roomId || !mid) {
    return () => {};
  }

  let isCancelled = false;
  let cleanupFns: Array<() => void> = [];

  getFirebase()
    .then(async ({ rtdb }) => {
      if (isCancelled) return;
      const db = await import('firebase/database');
      const liveMidRef = db.ref(rtdb, `rooms/${roomId}/live/${mid}`);

      const handleUpsert = (snapshot: any) => {
        if (isCancelled) return;
        const tid = snapshot.key;
        if (!tid) return;
        const val = snapshot.val() as RemoteLivePosition | null;
        if (!val) {
          callback(tid, null);
          return;
        }
        // Ignorar movimientos propios
        if (val.by === uid) return;
        if (typeof val.x === 'number' && typeof val.y === 'number') {
          callback(tid, { x: val.x, y: val.y });
        }
      };

      const handleRemoved = (snapshot: any) => {
        if (isCancelled) return;
        const tid = snapshot.key;
        const val = snapshot.val() as RemoteLivePosition | null;
        // Si el nodo eliminado pertenecía al propio usuario local, ignorar para evitar revertir el movimiento local
        if (val && val.by === uid) {
          return;
        }
        if (tid) {
          callback(tid, null);
        }
      };

      const unChildAdded = db.onChildAdded(liveMidRef, handleUpsert);
      const unChildChanged = db.onChildChanged(liveMidRef, handleUpsert);
      const unChildRemoved = db.onChildRemoved(liveMidRef, handleRemoved);

      cleanupFns.push(() => {
        db.off(liveMidRef, 'child_added', unChildAdded);
        db.off(liveMidRef, 'child_changed', unChildChanged);
        db.off(liveMidRef, 'child_removed', unChildRemoved);
      });

      if (isCancelled) {
        cleanupFns.forEach((fn) => fn());
        cleanupFns = [];
      }
    })
    .catch((err) => {
      console.warn('[liveService] Error suscribiéndose a live tokens:', err);
    });

  return () => {
    isCancelled = true;
    cleanupFns.forEach((fn) => fn());
    cleanupFns = [];
  };
}
