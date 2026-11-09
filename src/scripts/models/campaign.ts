// src/scripts/models/campaign.ts

export interface CampaignCharacterSummary {
  id: string;
  campaignId: string | null;
  userId?: string;
  name: string;
  race: string;
  className: string;
  subclass?: string;
  level: number;
  avatarUrl: string;
  hp: {
    current: number;
    max: number;
    temp?: number;
  };
  armorClass: number;
  playerName?: string;
  inspiration?: boolean;
  passivePerception?: number;
}

export type SessionStatus = 'active' | 'paused' | 'ended';

export interface Campaign {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  creatorId: string;
  dmId: string;
  dmName: string;
  isCurrentUserDm?: boolean;
  memberUserIds: string[];
  setting: string;
  sessionNumber: number;
  weather: string;
  location: string;
  status: SessionStatus;
  statusChangedAt?: number;
  characterIds: string[];
  createdAt: number;
  /** Código para unirse (modo nube). Solo lo ven los miembros. */
  inviteCode?: string;
  /** Mapa que ven los jugadores en la vista de partida (VTT). */
  activeMapId?: string;
  /** Id secreto de la sala en Realtime Database (/rooms/{liveRoomId}). Lo genera el DM. */
  liveRoomId?: string;
}

export interface DmEvent {
  id: string;
  campaignId: string;
  type: 'dice_roll' | 'milestone' | 'session_update';
  timestamp: number;
  dmName: string;
  payload: {
    title?: string;
    description?: string;
    diceRoll?: {
      formula: string;
      result: number;
      isSecret?: boolean;
    };
    milestone?: {
      bannerText: string;
      title: string;
      description: string;
    };
    sessionContext?: {
      sessionNumber?: number;
      weather?: string;
      location?: string;
    };
  };
}
