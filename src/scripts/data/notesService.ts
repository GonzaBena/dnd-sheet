// src/scripts/data/notesService.ts
// Notas privadas del DM (campaigns/{cid}/notes/{noteId}). Solo el DM las lee y escribe (ver firestore.rules).
//
// DECISION (F5-1): sin Firebase configurado se usa localStorage (mismo criterio que combatService).
// DECISION (F5-2): las notas nunca se exponen en /partida; este servicio solo lo usa el panel del DM.

import type { DmNote } from '../models/dmNote.ts';
import { DM_NOTE_LIMITS } from '../models/dmNote.ts';
import { getFirebase, isFirebaseConfigured } from '../firebase/client.ts';

const LOCAL_PREFIX = 'dnd_notes_';

export type NotePatch = Partial<Pick<DmNote, 'title' | 'body'>>;

/** Recorta título y cuerpo a los límites que validan las reglas, para no recibir PERMISSION_DENIED. */
export function clampNote(patch: NotePatch): NotePatch {
  const out: NotePatch = {};
  if (patch.title !== undefined) out.title = patch.title.slice(0, DM_NOTE_LIMITS.maxTitleLength);
  if (patch.body !== undefined) out.body = patch.body.slice(0, DM_NOTE_LIMITS.maxBodyLength);
  return out;
}

/** Ordena por updatedAt descendente (más reciente primero). */
export function sortNotes(notes: DmNote[]): DmNote[] {
  return [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
}

function readLocal(cid: string): DmNote[] {
  try {
    const raw = localStorage.getItem(LOCAL_PREFIX + cid);
    return raw ? (JSON.parse(raw) as DmNote[]) : [];
  } catch {
    return [];
  }
}

function writeLocal(cid: string, notes: DmNote[]): void {
  try {
    localStorage.setItem(LOCAL_PREFIX + cid, JSON.stringify(notes));
  } catch (e) {
    console.warn('[notesService] No se pudo guardar localmente:', e);
  }
  window.dispatchEvent(new CustomEvent('dm-notes-updated', { detail: { cid } }));
}

export function subscribeNotes(cid: string, cb: (notes: DmNote[]) => void): () => void {
  if (!isFirebaseConfigured()) {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail?.cid === cid) cb(sortNotes(readLocal(cid)));
    };
    window.addEventListener('dm-notes-updated', handler);
    cb(sortNotes(readLocal(cid)));
    return () => window.removeEventListener('dm-notes-updated', handler);
  }

  let cancelled = false;
  let unsub: (() => void) | null = null;
  getFirebase()
    .then(async ({ db }) => {
      const fs = await import('firebase/firestore');
      if (cancelled) return;
      const q = fs.query(fs.collection(db, 'campaigns', cid, 'notes'), fs.orderBy('updatedAt', 'desc'));
      unsub = fs.onSnapshot(
        q,
        (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as Omit<DmNote, 'id'>), id: d.id }))),
        (err) => console.warn('[notesService] onSnapshot error:', err)
      );
      if (cancelled) unsub();
    })
    .catch((err) => console.warn('[notesService] No se pudo suscribir:', err));

  return () => {
    cancelled = true;
    unsub?.();
  };
}

export async function createNote(cid: string, data: { title: string; body: string }): Promise<string> {
  const clean = clampNote(data) as { title: string; body: string };
  const note = { title: clean.title, body: clean.body, updatedAt: Date.now() };

  if (!isFirebaseConfigured()) {
    const id = `note_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    writeLocal(cid, [...readLocal(cid), { id, ...note }]);
    return id;
  }
  const { db } = await getFirebase();
  const fs = await import('firebase/firestore');
  const ref = await fs.addDoc(fs.collection(db, 'campaigns', cid, 'notes'), note);
  return ref.id;
}

export async function updateNote(cid: string, id: string, patch: NotePatch): Promise<void> {
  const data = { ...clampNote(patch), updatedAt: Date.now() };

  if (!isFirebaseConfigured()) {
    writeLocal(cid, readLocal(cid).map((n) => (n.id === id ? { ...n, ...data } : n)));
    return;
  }
  const { db } = await getFirebase();
  const fs = await import('firebase/firestore');
  await fs.updateDoc(fs.doc(db, 'campaigns', cid, 'notes', id), data);
}

export async function deleteNote(cid: string, id: string): Promise<void> {
  if (!isFirebaseConfigured()) {
    writeLocal(cid, readLocal(cid).filter((n) => n.id !== id));
    return;
  }
  const { db } = await getFirebase();
  const fs = await import('firebase/firestore');
  await fs.deleteDoc(fs.doc(db, 'campaigns', cid, 'notes', id));
}
