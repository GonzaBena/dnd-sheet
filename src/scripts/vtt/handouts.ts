// src/scripts/vtt/handouts.ts
// Lógica pura de handouts (T-52, RF-41): validación del borrador y cuál abrir al jugador. Sin DOM ni Firebase.

import type { Handout, HandoutKind } from '../models/handout.ts';
import { HANDOUT_LIMITS } from '../models/handout.ts';

export interface HandoutDraft {
  kind: HandoutKind;
  title: string;
  body?: string;
  imageUrl?: string;
}

/** Devuelve el mensaje de error (en español) o null si el borrador es válido. Espeja firestore.rules. */
export function validateHandoutDraft(d: HandoutDraft): string | null {
  const title = (d.title ?? '').trim();
  if (!title) return 'Poné un título.';
  if (title.length > HANDOUT_LIMITS.maxTitleLength) return `El título admite hasta ${HANDOUT_LIMITS.maxTitleLength} caracteres.`;
  if (d.kind === 'image') {
    const url = (d.imageUrl ?? '').trim();
    if (!url) return 'Pegá la URL de la imagen.';
    if (!/^https:\/\//i.test(url)) return 'La imagen tiene que ser una URL https://.';
    if (url.length > HANDOUT_LIMITS.maxImageUrlLength) return `La URL admite hasta ${HANDOUT_LIMITS.maxImageUrlLength} caracteres.`;
  }
  if (d.kind === 'text') {
    if (!(d.body ?? '').trim()) return 'Escribí el texto del handout.';
  }
  if ((d.body ?? '').length > HANDOUT_LIMITS.maxBodyLength) return `El texto admite hasta ${HANDOUT_LIMITS.maxBodyLength} caracteres.`;
  return null;
}

/** Documento a guardar para un borrador (sin campos vacíos ni del otro tipo). */
export function buildDraftDoc(d: HandoutDraft, now = Date.now()): Omit<Handout, 'id'> {
  const doc: Omit<Handout, 'id'> = { kind: d.kind, title: d.title.trim(), sentAt: null, createdAt: now };
  const body = (d.body ?? '').trim();
  if (d.kind === 'text') doc.body = body;
  if (d.kind === 'image') {
    doc.imageUrl = (d.imageUrl ?? '').trim();
    if (body) doc.body = body; // pie de imagen opcional
  }
  return doc;
}

/** Solo los enviados, el más reciente primero. */
export function sentHandouts(list: Handout[]): Handout[] {
  return list.filter((h) => h.sentAt != null).sort((a, b) => (b.sentAt as number) - (a.sentAt as number));
}

/**
 * Decide qué handout abrir automáticamente al jugador.
 * DECISION (F5-14): la primera vez que un jugador ve la campaña (lastSeen null) no se abre nada: se marca todo
 * lo existente como visto, para no abrirle de golpe handouts viejos. Siguen disponibles en la lista.
 * Si llegan varios nuevos a la vez, se abre el más reciente.
 */
export function pickHandoutToOpen(
  list: Handout[],
  lastSeen: number | null
): { open: Handout | null; nextSeen: number } {
  const sent = sentHandouts(list);
  const newest = sent[0]?.sentAt ?? 0;
  if (lastSeen == null) return { open: null, nextSeen: newest };
  const fresh = sent.filter((h) => (h.sentAt as number) > lastSeen);
  return { open: fresh[0] ?? null, nextSeen: Math.max(lastSeen, newest) };
}
