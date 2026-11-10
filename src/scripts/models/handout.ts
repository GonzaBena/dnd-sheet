// src/scripts/models/handout.ts
// Handouts que el DM comparte con los jugadores: campaigns/{cid}/handouts/{hid}.

export type HandoutKind = 'image' | 'text';

export interface Handout {
  id: string;
  kind: HandoutKind;
  title: string;
  body?: string;
  imageUrl?: string;
  /** null = borrador (los jugadores no lo leen). */
  sentAt: number | null;
  /**
   * Destinatarios: [] en borrador (invariante: vacío ⇔ sentAt null), ['*'] = todos los jugadores,
   * o la lista de uids elegidos. Siempre presente para poder filtrar la consulta del jugador.
   */
  recipients: string[];
  createdAt: number;
}

/** Valor de `recipients` que significa "todos los jugadores de la campaña". */
export const RECIPIENTS_ALL = '*';

export const HANDOUT_LIMITS = {
  maxRecipients: 50,
  maxTitleLength: 120,
  maxBodyLength: 5000,
  maxImageUrlLength: 2048,
} as const;
