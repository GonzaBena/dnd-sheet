// src/scripts/data/handoutService.ts
// Handouts del DM a los jugadores (T-52, RF-41): campaigns/{cid}/handouts/{hid}.
//
// DECISION (F5-13): el DM prepara borradores (sentAt: null) que los jugadores no leen hasta enviarlos.
// DECISION (F5-15): sin Firebase configurado se usa localStorage (mismo criterio que notesService).
// DECISION (F5-16): reenviar un handout vuelve a poner sentAt = ahora, así se les abre otra vez a los jugadores.
// DECISION (D9): las imágenes van por URL https; no hay subida de archivos.

import type { Handout } from '../models/handout.ts';
import { getFirebase, isFirebaseConfigured } from '../firebase/client.ts';
import { campaignStore } from '../state/campaignStore.ts';
import { normalizeStatus, canPerform } from '../vtt/sessionStatus.ts';
import { buildDraftDoc, validateHandoutDraft, sentHandouts, type HandoutDraft } from '../vtt/handouts.ts';

const LOCAL_PREFIX = 'dnd_handouts_';

function readLocal(cid: string): Handout[] {
  try {
    const raw = localStorage.getItem(LOCAL_PREFIX + cid);
    return raw ? (JSON.parse(raw) as Handout[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(cid: string, list: Handout[]): void {
  try {
    localStorage.setItem(LOCAL_PREFIX + cid, JSON.stringify(list));
  } catch (e) {
    console.warn('[handoutService] No se pudo guardar localmente:', e);
  }
  window.dispatchEvent(new CustomEvent('handouts-updated', { detail: { cid } }));
}

function sortForDm(list: Handout[]): Handout[] {
  return [...list].sort((a, b) => b.createdAt - a.createdAt);
}

/** El DM ve todos (borradores primero por fecha); el jugador solo los enviados. */
export function subscribeHandouts(cid: string, isDm: boolean, cb: (list: Handout[]) => void): () => void {
  const project = (list: Handout[]) => (isDm ? sortForDm(list) : sentHandouts(list));

  if (!isFirebaseConfigured()) {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail?.cid === cid) cb(project(readLocal(cid)));
    };
    window.addEventListener('handouts-updated', handler);
    cb(project(readLocal(cid)));
    return () => window.removeEventListener('handouts-updated', handler);
  }

  let cancelled = false;
  let unsub: (() => void) | null = null;
  getFirebase()
    .then(async ({ db }) => {
      const fs = await import('firebase/firestore');
      if (cancelled) return;
      const col = fs.collection(db, 'campaigns', cid, 'handouts');
      // El jugador DEBE filtrar por sentAt != null: las reglas deniegan listar la colección entera.
      const q = isDm
        ? fs.query(col, fs.orderBy('createdAt', 'desc'))
        : fs.query(col, fs.where('sentAt', '!=', null), fs.orderBy('sentAt', 'desc'));
      unsub = fs.onSnapshot(
        q,
        (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as Omit<Handout, 'id'>), id: d.id }))),
        (err) => console.warn('[handoutService] onSnapshot error:', err)
      );
      if (cancelled) unsub();
    })
    .catch((err) => console.warn('[handoutService] No se pudo suscribir:', err));

  return () => {
    cancelled = true;
    unsub?.();
  };
}

export async function createHandout(cid: string, draft: HandoutDraft): Promise<string> {
  const error = validateHandoutDraft(draft);
  if (error) throw new Error(error);
  const data = buildDraftDoc(draft);

  if (!isFirebaseConfigured()) {
    const id = `handout_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    writeLocal(cid, [...readLocal(cid), { id, ...data }]);
    return id;
  }
  const { db } = await getFirebase();
  const fs = await import('firebase/firestore');
  const ref = await fs.addDoc(fs.collection(db, 'campaigns', cid, 'handouts'), data);
  return ref.id;
}

/** Envía (o reenvía) un handout a los jugadores. Solo con la partida activa (cuenta como jugar). */
export async function sendHandout(cid: string, id: string): Promise<void> {
  const status = normalizeStatus(campaignStore.getCampaign(cid)?.status);
  if (!canPerform('dmPlay', 'dm', status)) {
    throw new Error('La partida no está en curso. Iniciá o reanudá la sesión para enviar handouts.');
  }
  const sentAt = Date.now();

  if (!isFirebaseConfigured()) {
    writeLocal(cid, readLocal(cid).map((h) => (h.id === id ? { ...h, sentAt } : h)));
    return;
  }
  const { db } = await getFirebase();
  const fs = await import('firebase/firestore');
  await fs.updateDoc(fs.doc(db, 'campaigns', cid, 'handouts', id), { sentAt });
}

export async function deleteHandout(cid: string, id: string): Promise<void> {
  if (!isFirebaseConfigured()) {
    writeLocal(cid, readLocal(cid).filter((h) => h.id !== id));
    return;
  }
  const { db } = await getFirebase();
  const fs = await import('firebase/firestore');
  await fs.deleteDoc(fs.doc(db, 'campaigns', cid, 'handouts', id));
}
