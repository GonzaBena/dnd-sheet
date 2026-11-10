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
  createdAt: number;
}

export const HANDOUT_LIMITS = {
  maxTitleLength: 120,
  maxBodyLength: 5000,
  maxImageUrlLength: 2048,
} as const;
