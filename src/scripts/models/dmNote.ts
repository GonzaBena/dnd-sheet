// src/scripts/models/dmNote.ts
// Notas privadas del DM: campaigns/{cid}/notes/{noteId}.

export interface DmNote {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
}

export const DM_NOTE_LIMITS = {
  maxTitleLength: 120,
  maxBodyLength: 20000,
} as const;
