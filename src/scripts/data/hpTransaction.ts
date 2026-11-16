// src/scripts/data/hpTransaction.ts
// Escritura atómica de PG: lee el valor del servidor, aplica la operación y escribe solo `hp`,
// `hpRev` y `updatedAt`. Dos clientes que cambian los PG a la vez se serializan en el servidor
// (Firestore reintenta la transacción si el documento cambió), así ningún cambio se pierde.
//
// `hpRev` crece en cada escritura de PG: los clientes lo usan para descartar snapshots más
// viejos que el último valor que ya confirmaron.
//
// Recibe el módulo `firebase/firestore` por parámetro para no cargar el SDK en el bundle inicial
// (cloudSync lo importa de forma dinámica) y para poder usarlo desde los tests con el emulador.
import type { Firestore } from 'firebase/firestore';
import { applyHpOp, normalizeHp, sameHp, type HitPoints, type HpOp } from '../dnd/hp.ts';

type Fs = Pick<typeof import('firebase/firestore'), 'doc' | 'runTransaction'>;

export interface HpTransactionResult {
  before: HitPoints;
  after: HitPoints;
  /** hpRev del documento tras la operación (sin cambios si la operación no modificó nada). */
  rev: number;
}

/**
 * Reintentos ante `permission-denied`. Con dos clientes escribiendo a la vez, el emulador de Firestore
 * rechaza a veces la transacción del DM con "evaluation error" en todas las reglas (no pudo evaluar
 * `resource` mientras otra transacción tenía el documento tomado), en vez de devolver ABORTED para que
 * el SDK reintente. Una transacción rechazada no aplica nada, así que reintentar es seguro; un rechazo
 * real (partida en pausa, no es su campaña) vuelve a fallar y se informa igual.
 */
const DENIED_RETRIES = 2;

export async function runHpTransaction(
  fs: Fs,
  db: Firestore,
  characterId: string,
  op: HpOp,
  now: () => number = Date.now
): Promise<HpTransactionResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await runOnce(fs, db, characterId, op, now);
    } catch (err: any) {
      if (err?.code !== 'permission-denied' || attempt >= DENIED_RETRIES) throw err;
      await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1) + Math.random() * 150));
    }
  }
}

function runOnce(
  fs: Fs,
  db: Firestore,
  characterId: string,
  op: HpOp,
  now: () => number
): Promise<HpTransactionResult> {
  const ref = fs.doc(db, 'characters', characterId);
  return fs.runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('La ficha ya no existe.');
    const data = snap.data() as { hp?: Partial<HitPoints>; hpRev?: number };
    const before = normalizeHp(data.hp);
    const after = applyHpOp(before, op);
    const currentRev = Number(data.hpRev) || 0;
    if (sameHp(before, after) && sameHp(data.hp, before)) {
      return { before, after, rev: currentRev };
    }
    const rev = currentRev + 1;
    tx.update(ref, { hp: after, hpRev: rev, updatedAt: now() });
    return { before, after, rev };
  }, { maxAttempts: 10 });
}
