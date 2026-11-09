export type JournalTag =
  | '#Combate'
  | '#Botín'
  | '#Pista'
  | '#NPC'
  | '#Tirada'
  | '#Descanso'
  | '#Magia'
  | '#Hito'
  | '#Configuración';

export interface JournalEntry {
  id: string;
  timestamp: number;
  sessionNumber: number;
  timeAgoText?: string;
  title: string;
  content: string;
  tags: (JournalTag | string)[];
  isSecret?: boolean;
  /** @deprecated usar isPlayerOnly / isDmOnly. Se mantiene para leer datos viejos. */
  isPrivate?: boolean;
  isDmOnly?: boolean;        // Solo la ve el DM de la campaña
  isPlayerOnly?: boolean;    // Solo la ve el jugador que la escribió (ni el DM)
  isForDm?: boolean;         // Mensaje al DM: lo ven el jugador que lo escribió y el DM
  authorUid?: string;        // uid de Firebase Auth del autor (modo nube)
  characterId?: string;      // ID of character author
  campaignId?: string;       // ID of campaign (or null if standalone)
  authorName?: string;       // Name of character or DM
  diceRoll?: {
    formula: string;
    result: number;
    breakdown?: string;
  };
}

/** Visibilidad tal como se guarda en Firestore (campo `visibility`). */
export type JournalVisibility = 'party' | 'dm' | 'player' | 'to_dm';
