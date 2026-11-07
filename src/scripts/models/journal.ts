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
  isPrivate?: boolean;       // Personal character note, not shared across campaign
  isDmOnly?: boolean;        // DM-only secret note
  characterId?: string;      // ID of character author
  campaignId?: string;       // ID of campaign (or null if standalone)
  authorName?: string;       // Name of character or DM
  diceRoll?: {
    formula: string;
    result: number;
    breakdown?: string;
  };
}
