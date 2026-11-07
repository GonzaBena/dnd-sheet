// src/scripts/state/campaignStore.ts
import type { Campaign, DmEvent } from '../models/campaign.ts';
import type { CharacterData } from '../models/character.ts';
import { defaultCharacter } from '../data/defaultCharacter.ts';
import { generateCharacterSyncId, syncManager } from '../sync/syncManager.ts';
import { userStore } from './userStore.ts';

const CAMPAIGNS_STORAGE_KEY = 'dnd_campaigns_v1';
const ALL_CHARACTERS_STORAGE_KEY = 'dnd_all_characters_v1';
const ACTIVE_CAMPAIGN_KEY = 'dnd_active_campaign_id_v1';

export const CAMPAIGN_PRESET_IMAGES = [
  {
    name: 'Castillo Gótico (Barovia)',
    url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: 'Mina y Mazmorra Olvidada',
    url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: 'Infierno y Cenizas (Averno)',
    url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: 'Bosque Místico Élfico',
    url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: 'Ciudad Portuaria & Taberna',
    url: 'https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=1200&q=80',
  },
  {
    name: 'Desierto y Ruinas Antiguas',
    url: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?auto=format&fit=crop&w=1200&q=80',
  }
];

export const DEFAULT_CAMPAIGNS: Campaign[] = [];

export const LEGACY_TEST_CAMPAIGNS: Campaign[] = [
  {
    id: 'barovia-strahd',
    name: 'Maldición de Strahd',
    description: 'Bajo nubes de tormenta perpetuas, el amo de Ravenloft observa el Valle de Barovia. La niebla os atrapa y el Conde os invita a su cena fúnebre.',
    imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80',
    creatorId: 'user-raven',
    dmId: 'user-raven',
    dmName: 'Lord Raven',
    memberUserIds: ['user-me', 'user-raven', 'user-elena', 'user-marcos', 'user-sofia'],
    setting: 'Gothic Horror • Tierras de Barovia',
    sessionNumber: 15,
    weather: 'Niebla Espesa / Anochecer, -2°C',
    location: 'Valle de Barovia - Castillo Ravenloft',
    status: 'active',
    characterIds: ['elysian-ventosombra', 'morgana-espinaoscura', 'thorin-rompehierro', 'liara-hojaargenta'],
    createdAt: 1714500000000
  },
  {
    id: 'phandelver-mine',
    name: 'La Mina Perdida de Phandelver',
    description: 'Contratados por el enano Gundren Buscarroca para escoltar un cargamento de suministros a Phandalin. Peligrosos trasgos y secretos de la Ola del Eco aguardan.',
    imageUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1200&q=80',
    creatorId: 'user-gundren',
    dmId: 'user-gundren',
    dmName: 'Gundren Buscarroca',
    memberUserIds: ['user-me', 'user-gundren', 'user-elena'],
    setting: 'Costa de la Espada • Phandalin',
    sessionNumber: 4,
    weather: 'Lluvia ligera otoñal',
    location: 'Caverna de la Ola del Eco',
    status: 'active',
    characterIds: ['varis-galanodel', 'bryan-martillofirme'],
    createdAt: 1715000000000
  },
  {
    id: 'avernus-descent',
    name: 'Descenso al Averno',
    description: 'La sagrada ciudad de Elturel ha sido arrastrada a las profundidades del primer círculo del infierno. Una cruzada desesperada en máquinas de guerra infernales.',
    imageUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=1200&q=80',
    creatorId: 'user-me',
    dmId: 'user-me',
    dmName: 'Gonzo (Tú)',
    memberUserIds: ['user-me', 'user-elena', 'user-marcos', 'user-sofia'],
    setting: 'Planos Infernales • Primer Círculo',
    sessionNumber: 8,
    weather: 'Tormenta de Fuego y Azufre',
    location: 'Ribera del Río Estigia - Fuerte de los Nudillos',
    status: 'active',
    characterIds: ['kaeroc-cuernonegro', 'selene-sombraluna', 'grommash-el-feroz'],
    createdAt: 1715500000000
  }
];

// Initial roster characters across campaigns - Only Atlas kept for the user!
export const SEED_CHARACTERS: CharacterData[] = [
  {
    ...JSON.parse(JSON.stringify(defaultCharacter)),
    id: 'atlas',
    campaignId: null,
    userId: 'user-me',
    name: 'Atlas',
    playerName: 'Gonzo (Tú)',
  }
];

export const LEGACY_TEST_CHARACTERS: CharacterData[] = [
  // Character 1: Elysian (Main in Barovia)
  {
    ...JSON.parse(JSON.stringify(defaultCharacter)),
    id: 'elysian-ventosombra',
    campaignId: 'barovia-strahd',
    userId: 'user-me',
    name: 'Elysian Ventosombra',
    playerName: 'Gonzo (Tú)',
  },
  // Character 2: Morgana (in Barovia)
  {
    ...JSON.parse(JSON.stringify(defaultCharacter)),
    id: 'morgana-espinaoscura',
    campaignId: 'barovia-strahd',
    userId: 'user-elena',
    name: 'Morgana Espinaoscura',
    title: 'Hechicera del Ocaso Umbrío',
    race: 'Humana',
    className: 'Maga',
    subclass: 'Nigromancia',
    level: 5,
    avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=400&q=80',
    playerName: 'Elena V.',
    hp: { current: 32, max: 32, temp: 0 },
    armorClass: 13,
  },
  // Character 3: Thorin (in Barovia)
  {
    ...JSON.parse(JSON.stringify(defaultCharacter)),
    id: 'thorin-rompehierro',
    campaignId: 'barovia-strahd',
    userId: 'user-marcos',
    name: 'Thorin Rompehierro',
    title: 'Defensor de Mithral Hall',
    race: 'Enano de las Colinas',
    className: 'Guerrero',
    subclass: 'Maestro de Batalla',
    level: 5,
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
    playerName: 'Marcos R.',
    hp: { current: 52, max: 52, temp: 5 },
    armorClass: 18,
  },
  // Character 4: Liara (in Barovia)
  {
    ...JSON.parse(JSON.stringify(defaultCharacter)),
    id: 'liara-hojaargenta',
    campaignId: 'barovia-strahd',
    userId: 'user-sofia',
    name: 'Liara Hojaargenta',
    title: 'Suma Clériga del Alba',
    race: 'Alta Elfa',
    className: 'Clériga',
    subclass: 'Dominio de la Vida',
    level: 5,
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
    playerName: 'Sofía M.',
    hp: { current: 38, max: 38, temp: 0 },
    armorClass: 17,
  },
  // Phandelver characters
  {
    ...JSON.parse(JSON.stringify(defaultCharacter)),
    id: 'varis-galanodel',
    campaignId: 'phandelver-mine',
    userId: 'user-me',
    name: 'Varis Galanodel',
    title: 'Bardo del Colegio del Saber',
    race: 'Semielfo',
    className: 'Bardo',
    subclass: 'Colegio del Saber',
    level: 3,
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
    playerName: 'Gonzo (Tú)',
    hp: { current: 24, max: 24, temp: 0 },
    armorClass: 14,
  },
  {
    ...JSON.parse(JSON.stringify(defaultCharacter)),
    id: 'bryan-martillofirme',
    campaignId: 'phandelver-mine',
    userId: 'user-elena',
    name: 'Bryan Martillofirme',
    title: 'Paladín del Voto de Devoción',
    race: 'Humano',
    className: 'Paladín',
    subclass: 'Voto de Devoción',
    level: 3,
    avatarUrl: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=400&q=80',
    playerName: 'Elena V.',
    hp: { current: 28, max: 28, temp: 0 },
    armorClass: 18,
  },
  // Avernus characters (User is DM here!)
  {
    ...JSON.parse(JSON.stringify(defaultCharacter)),
    id: 'kaeroc-cuernonegro',
    campaignId: 'avernus-descent',
    userId: 'user-marcos',
    name: 'Kaeroc Cuernonegro',
    title: 'Pactante de la Espada Maligna',
    race: 'Tiefling',
    className: 'Brujo',
    subclass: 'Patrón Infernal',
    level: 7,
    avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&q=80',
    playerName: 'Marcos R.',
    hp: { current: 45, max: 58, temp: 8 },
    armorClass: 15,
  },
  {
    ...JSON.parse(JSON.stringify(defaultCharacter)),
    id: 'selene-sombraluna',
    campaignId: 'avernus-descent',
    userId: 'user-sofia',
    name: 'Selene Sombraluna',
    title: 'Espía de la Corte de las Sombras',
    race: 'Elfa de los Bosques',
    className: 'Pícara',
    subclass: 'Asesino',
    level: 7,
    avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80',
    playerName: 'Sofía M.',
    hp: { current: 49, max: 49, temp: 0 },
    armorClass: 16,
  },
  {
    ...JSON.parse(JSON.stringify(defaultCharacter)),
    id: 'grommash-el-feroz',
    campaignId: 'avernus-descent',
    userId: 'user-elena',
    name: 'Grommash el Feroz',
    title: 'Furia de las Tierras Yermas',
    race: 'Semiorco',
    className: 'Bárbaro',
    subclass: 'Camino del Berserker',
    level: 7,
    avatarUrl: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=400&q=80',
    playerName: 'Elena V.',
    hp: { current: 68, max: 79, temp: 0 },
    armorClass: 16,
  },
  // Standalone Character (Sin Campaña)
  {
    ...JSON.parse(JSON.stringify(defaultCharacter)),
    id: 'geralt-vagabundo',
    campaignId: null,
    userId: 'user-me',
    name: 'Geralt el Errante',
    title: 'Cazador de Bestias y Mercenario Libre',
    race: 'Humano Mutado',
    className: 'Explorador',
    subclass: 'Cazador Monstruoso',
    level: 6,
    avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=400&q=80',
    playerName: 'Gonzo (Tú)',
    hp: { current: 54, max: 54, temp: 0 },
    armorClass: 16,
  }
];

class CampaignStoreManager {
  private campaigns: Campaign[] = [];
  private characters: CharacterData[] = [];
  private activeCampaignId: string | null = null;

  constructor() {
    this.campaigns = this.loadCampaigns();
    this.characters = this.loadCharacters();
    this.activeCampaignId = this.loadActiveCampaignId();
    if (typeof window !== 'undefined') {
      window.addEventListener('character-updated', ((e: CustomEvent<{ character: CharacterData }>) => {
        if (e.detail?.character) {
          this.saveCharacter(e.detail.character);
        }
      }) as EventListener);
    }
  }

  private loadCampaigns(): Campaign[] {
    if (typeof window === 'undefined') return DEFAULT_CAMPAIGNS;
    try {
      const saved = localStorage.getItem(CAMPAIGNS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Clean all created/demo campaigns as requested
          this.persistCampaigns([]);
          return [];
        }
      }
    } catch (e) {
      console.warn('[CampaignStore] Failed to load campaigns from storage', e);
    }
    this.persistCampaigns(DEFAULT_CAMPAIGNS);
    return DEFAULT_CAMPAIGNS;
  }

  private loadCharacters(): CharacterData[] {
    if (typeof window === 'undefined') return SEED_CHARACTERS;
    try {
      const saved = localStorage.getItem(ALL_CHARACTERS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Keep only Atlas (or migrate user's character to Atlas)
          const myChar = parsed.find((c: CharacterData) => c.id === 'atlas' || c.name === 'Atlas') ||
                         parsed.find((c: CharacterData) => c.userId === 'user-me' || c.id === 'elysian-ventosombra');
          if (myChar) {
            myChar.id = 'atlas';
            myChar.name = 'Atlas';
            myChar.userId = 'user-me';
            myChar.campaignId = null;
            myChar.playerName = 'Gonzo (Tú)';
            const finalChars = [myChar];
            this.persistCharacters(finalChars);
            return finalChars;
          }
        }
      }
    } catch (e) {
      console.warn('[CampaignStore] Failed to load characters from storage', e);
    }
    this.persistCharacters(SEED_CHARACTERS);
    return SEED_CHARACTERS;
  }

  private loadActiveCampaignId(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      const saved = localStorage.getItem(ACTIVE_CAMPAIGN_KEY);
      if (saved !== null && saved !== 'none') {
        if (this.campaigns.some(c => c.id === saved)) return saved;
      }
    } catch (_) {}
    return null;
  }

  public seedLegacyFixtures() {
    userStore.seedLegacyFixtures();
    this.campaigns = JSON.parse(JSON.stringify(LEGACY_TEST_CAMPAIGNS));
    this.characters = JSON.parse(JSON.stringify(LEGACY_TEST_CHARACTERS));
    this.activeCampaignId = 'barovia-strahd';
    if (typeof window !== 'undefined') {
      localStorage.setItem(CAMPAIGNS_STORAGE_KEY, JSON.stringify(this.campaigns));
      localStorage.setItem(ALL_CHARACTERS_STORAGE_KEY, JSON.stringify(this.characters));
      localStorage.setItem(ACTIVE_CAMPAIGN_KEY, this.activeCampaignId);
      window.dispatchEvent(new CustomEvent('campaigns-updated', { detail: { campaigns: this.campaigns } }));
    }
  }

  private persistCampaigns(campaigns: Campaign[]) {
    this.campaigns = campaigns;
    if (typeof window !== 'undefined') {
      localStorage.setItem(CAMPAIGNS_STORAGE_KEY, JSON.stringify(this.campaigns));
      window.dispatchEvent(new CustomEvent('campaigns-updated', { detail: { campaigns: this.campaigns } }));
    }
  }

  private persistCharacters(chars: CharacterData[]) {
    this.characters = chars;
    if (typeof window !== 'undefined') {
      localStorage.setItem(ALL_CHARACTERS_STORAGE_KEY, JSON.stringify(this.characters));
      window.dispatchEvent(new CustomEvent('all-characters-updated', { detail: { characters: this.characters } }));
    }
  }

  public getCampaigns(): Campaign[] {
    return this.campaigns;
  }

  public getCampaign(id: string): Campaign | undefined {
    return this.campaigns.find(c => c.id === id);
  }

  public getActiveCampaignId(): string | null {
    return this.activeCampaignId;
  }

  public getActiveCampaign(): Campaign | null {
    if (!this.activeCampaignId) return null;
    return this.getCampaign(this.activeCampaignId) || null;
  }

  public setActiveCampaign(campaignId: string | null) {
    this.activeCampaignId = campaignId;
    if (typeof window !== 'undefined') {
      localStorage.setItem(ACTIVE_CAMPAIGN_KEY, campaignId || 'none');
      window.dispatchEvent(new CustomEvent('active-campaign-changed', {
        detail: {
          campaignId,
          campaign: this.getActiveCampaign()
        }
      }));
    }
  }

  public createCampaign(data: Partial<Campaign>): Campaign {
    const id = (data.name || 'campaña')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') + '-' + Math.random().toString(36).substr(2, 4);

    const currentUserId = userStore.getCurrentUser().id;
    const creatorId = currentUserId;
    let memberUserIds = data.memberUserIds && data.memberUserIds.length > 0
      ? [...data.memberUserIds]
      : [currentUserId];
    if (!memberUserIds.includes(currentUserId)) {
      memberUserIds.push(currentUserId);
    }

    // A campaign cannot exist without a DM.
    // When created, if only 1 user exists in the campaign, that user must be the DM.
    // Otherwise, it defaults to creator (or specified dmId if member).
    let dmUserId = data.dmId || currentUserId;
    if (memberUserIds.length === 1) {
      dmUserId = memberUserIds[0];
    }
    if (!memberUserIds.includes(dmUserId)) {
      memberUserIds.push(dmUserId);
    }
    const dmUser = userStore.getUser(dmUserId);
    const dmName = dmUser ? dmUser.name : (data.dmName || 'Dungeon Master');

    const newCampaign: Campaign = {
      id,
      name: data.name || 'Nueva Campaña',
      description: data.description || 'Sin descripción.',
      imageUrl: data.imageUrl || CAMPAIGN_PRESET_IMAGES[0].url,
      creatorId,
      dmId: dmUserId,
      dmName: dmName,
      memberUserIds: memberUserIds,
      setting: data.setting || 'Fantasía Medieval',
      sessionNumber: data.sessionNumber || 1,
      weather: data.weather || 'Despejado',
      location: data.location || 'Posada del Aventurero',
      status: data.status || 'active',
      characterIds: data.characterIds || [],
      createdAt: Date.now()
    };

    const next = [newCampaign, ...this.campaigns];
    this.persistCampaigns(next);
    return newCampaign;
  }

  public updateCampaign(id: string, updates: Partial<Campaign>) {
    const index = this.campaigns.findIndex(c => c.id === id);
    if (index === -1) return;
    this.campaigns[index] = { ...this.campaigns[index], ...updates };
    this.persistCampaigns([...this.campaigns]);
  }

  /**
   * Ensures the campaign always has a valid DM.
   * If only 1 member remains, that user must be the DM.
   * If the DM has left or was removed, reassigns to creator (if present) or first available member.
   */
  public autoReassignDm(camp: Campaign) {
    if (!camp.memberUserIds || camp.memberUserIds.length === 0) return;

    if (camp.memberUserIds.length === 1) {
      camp.dmId = camp.memberUserIds[0];
      const dmUser = userStore.getUser(camp.dmId);
      camp.dmName = dmUser ? dmUser.name : 'Dungeon Master';
      return;
    }

    if (!camp.memberUserIds.includes(camp.dmId)) {
      if (camp.creatorId && camp.memberUserIds.includes(camp.creatorId)) {
        camp.dmId = camp.creatorId;
      } else {
        camp.dmId = camp.memberUserIds[0];
      }
      const dmUser = userStore.getUser(camp.dmId);
      camp.dmName = dmUser ? dmUser.name : 'Dungeon Master';
    }
  }

  /**
   * Only the creator of the campaign or the DM can manage/remove members.
   */
  public canUserManageMembers(campaignId: string, userId?: string): boolean {
    const camp = this.getCampaign(campaignId);
    if (!camp) return false;
    const currentUserId = userId || userStore.getCurrentUser().id;
    return currentUserId === camp.creatorId || currentUserId === camp.dmId;
  }

  /**
   * Deletion authority rule:
   * - If creator is still a member of the campaign, ONLY the creator can delete it.
   * - If the creator has left the campaign, the DM inherits the control to close/delete it.
   */
  public canUserDeleteCampaign(campaignId: string, userId?: string): boolean {
    const camp = this.getCampaign(campaignId);
    if (!camp) return false;
    const currentUserId = userId || userStore.getCurrentUser().id;
    const isCreatorMember = camp.memberUserIds.includes(camp.creatorId);
    if (isCreatorMember) {
      return currentUserId === camp.creatorId;
    }
    return currentUserId === camp.dmId;
  }

  /**
   * Removes a member user from the campaign. Only creator or DM can perform this.
   * Characters belonging to the removed user are turned into independent standalone characters.
   */
  public removeCampaignMember(campaignId: string, memberUserId: string, requesterUserId?: string): boolean {
    const reqId = requesterUserId || userStore.getCurrentUser().id;
    if (!this.canUserManageMembers(campaignId, reqId)) {
      throw new Error('Solo el creador o el DM de la campaña pueden quitar a un usuario de la misma.');
    }
    const camp = this.getCampaign(campaignId);
    if (!camp) return false;

    // Remove user from members
    camp.memberUserIds = camp.memberUserIds.filter(id => id !== memberUserId);

    // Unlink any characters belonging to this user in this campaign
    this.characters.forEach(char => {
      if (char.campaignId === campaignId && this.isCharacterOwner(char, memberUserId)) {
        char.campaignId = null;
        char.sessionContext = undefined;
        camp.characterIds = camp.characterIds.filter(cid => cid !== char.id);
      }
    });

    this.autoReassignDm(camp);
    this.persistCharacters([...this.characters]);
    this.updateCampaign(campaignId, {
      dmId: camp.dmId,
      dmName: camp.dmName,
      memberUserIds: camp.memberUserIds,
      characterIds: camp.characterIds
    });
    return true;
  }

  /**
   * Voluntary departure: a user leaves the campaign.
   * Their character becomes standalone.
   * If creator leaves, the DM retains control to manage/close.
   * If DM leaves, DM is automatically reassigned.
   * If 0 members remain, the campaign is deleted.
   */
  public leaveCampaign(campaignId: string, userId?: string): boolean {
    const currentUserId = userId || userStore.getCurrentUser().id;
    const camp = this.getCampaign(campaignId);
    if (!camp) return false;

    camp.memberUserIds = camp.memberUserIds.filter(id => id !== currentUserId);

    // Unlink leaving user's characters
    this.characters.forEach(char => {
      if (char.campaignId === campaignId && this.isCharacterOwner(char, currentUserId)) {
        char.campaignId = null;
        char.sessionContext = undefined;
        camp.characterIds = camp.characterIds.filter(cid => cid !== char.id);
      }
    });

    if (camp.memberUserIds.length === 0) {
      this.deleteCampaign(campaignId, currentUserId);
      return true;
    }

    this.autoReassignDm(camp);
    this.persistCharacters([...this.characters]);
    this.updateCampaign(campaignId, {
      dmId: camp.dmId,
      dmName: camp.dmName,
      memberUserIds: camp.memberUserIds,
      characterIds: camp.characterIds
    });
    return true;
  }

  public deleteCampaign(id: string, requesterUserId?: string) {
    const camp = this.getCampaign(id);
    if (camp) {
      const reqId = requesterUserId || userStore.getCurrentUser().id;
      if (camp.memberUserIds.length > 0 && !this.canUserDeleteCampaign(id, reqId)) {
        throw new Error('No tienes permisos para cerrar o eliminar esta campaña.');
      }
    }

    const next = this.campaigns.filter(c => c.id !== id);
    // Unlink characters belonging to this campaign to make them standalone
    this.characters.forEach(char => {
      if (char.campaignId === id) {
        char.campaignId = null;
        char.sessionContext = undefined;
      }
    });
    this.persistCharacters([...this.characters]);
    this.persistCampaigns(next);

    if (this.activeCampaignId === id) {
      this.setActiveCampaign(next.length > 0 ? next[0].id : null);
    }
  }

  public getAllCharacters(): CharacterData[] {
    return this.characters;
  }

  public getCharacter(id: string): CharacterData | undefined {
    return this.characters.find(c => c.id === id);
  }

  public getCharactersForCampaign(campaignId: string): CharacterData[] {
    return this.characters.filter(c => c.campaignId === campaignId);
  }

  public getStandaloneCharacters(): CharacterData[] {
    return this.characters.filter(c => !c.campaignId);
  }

  public saveCharacter(char: CharacterData) {
    if (!char.userId) {
      char.userId = userStore.getCurrentUser().id;
    }

    // Rule: una campaña no puede tener 2 personajes del mismo usuario
    if (char.campaignId) {
      const existing = this.characters.find(c =>
        c.id !== char.id &&
        c.campaignId === char.campaignId &&
        this.isCharacterOwner(c, char.userId)
      );
      if (existing) {
        throw new Error(`El usuario ya tiene un personaje asignado en esta campaña (${existing.name}). Una campaña no permite múltiples personajes del mismo usuario.`);
      }
    }

    const index = this.characters.findIndex(c => c.id === char.id);
    if (index >= 0) {
      this.characters[index] = { ...char };
    } else {
      this.characters.push({ ...char });
    }
    // Update characterIds and memberUserIds in campaign if attached
    if (char.campaignId) {
      const camp = this.getCampaign(char.campaignId);
      if (camp) {
        let changed = false;
        if (!camp.characterIds.includes(char.id)) {
          camp.characterIds.push(char.id);
          changed = true;
        }
        if (!camp.memberUserIds.includes(char.userId)) {
          camp.memberUserIds.push(char.userId);
          changed = true;
        }
        if (changed) {
          this.updateCampaign(camp.id, {
            characterIds: camp.characterIds,
            memberUserIds: camp.memberUserIds
          });
        }
      }
    }
    this.persistCharacters([...this.characters]);
  }

  /**
   * Checks whether a character belongs to the given user (or active user).
   */
  public isCharacterOwner(char: CharacterData | { id: string; userId?: string; playerName?: string }, userId?: string): boolean {
    const currentUserId = userId || userStore.getCurrentUser().id;
    if (char.userId) {
      return char.userId === currentUserId;
    }
    if (char.playerName) {
      const u = userStore.getUser(currentUserId);
      if (u && (char.playerName.includes(u.name) || (currentUserId === 'user-me' && (char.playerName.includes('Tú') || char.playerName.includes('Gonzo'))))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Finds the character belonging to the current user (or specified user) in a campaign.
   */
  public getMyCharacterForCampaign(campaignId: string, userId?: string): CharacterData | undefined {
    const currentUserId = userId || userStore.getCurrentUser().id;
    const chars = this.getCharactersForCampaign(campaignId);
    return chars.find(c => this.isCharacterOwner(c, currentUserId));
  }

  /**
   * Finds standalone characters belonging to the current user (or specified user).
   */
  public getMyStandaloneCharacters(userId?: string): CharacterData[] {
    const currentUserId = userId || userStore.getCurrentUser().id;
    return this.getStandaloneCharacters().filter(c => this.isCharacterOwner(c, currentUserId));
  }

  /**
   * Clones a character to a target campaign (or standalone if targetCampaignId is null),
   * generating a new unique independent ID and ensuring changes do not affect original.
   * Assigns ownership of the new clone to the current active user.
   */
  public cloneCharacter(characterId: string, targetCampaignId: string | null, newName?: string): CharacterData {
    const original = this.getCharacter(characterId) || defaultCharacter;
    const currentUser = userStore.getCurrentUser();

    // Check if target campaign already has a character for current user
    if (targetCampaignId) {
      const existing = this.getMyCharacterForCampaign(targetCampaignId, currentUser.id);
      if (existing) {
        throw new Error(`El usuario ya tiene un personaje (${existing.name}) en esta campaña. No se permite más de un personaje por usuario en la misma campaña.`);
      }
    }

    const cloned = JSON.parse(JSON.stringify(original)) as CharacterData;

    // Generate independent ID
    const baseSlug = (newName || original.name || 'personaje')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const newId = `${baseSlug}-${Math.random().toString(36).substr(2, 6)}`;

    cloned.id = newId;
    cloned.campaignId = targetCampaignId;
    cloned.userId = currentUser.id;
    cloned.playerName = currentUser.name;
    if (newName) cloned.name = newName;

    // Update session context if target campaign exists
    if (targetCampaignId) {
      const targetCamp = this.getCampaign(targetCampaignId);
      if (targetCamp) {
        cloned.sessionContext = {
          campaignName: targetCamp.name,
          sessionNumber: targetCamp.sessionNumber,
          weather: targetCamp.weather,
          location: targetCamp.location
        };
      }
    }

    this.saveCharacter(cloned);
    return cloned;
  }

  public deleteCharacter(characterId: string) {
    const next = this.characters.filter(c => c.id !== characterId);
    // Remove from campaign lists
    this.campaigns.forEach(camp => {
      if (camp.characterIds.includes(characterId)) {
        camp.characterIds = camp.characterIds.filter(id => id !== characterId);
      }
    });
    this.persistCampaigns([...this.campaigns]);
    this.persistCharacters(next);
  }

  public isCurrentUserDm(campaignId?: string): boolean {
    const id = campaignId || this.activeCampaignId;
    if (!id) return false;
    const camp = this.getCampaign(id);
    if (!camp) return false;
    const currentUser = userStore.getCurrentUser();
    if (camp.dmId) {
      return camp.dmId === currentUser.id;
    }
    // Backward compatibility fallback for legacy data cached in localStorage
    if ((camp as any).isCurrentUserDm && currentUser.id === 'user-me') {
      return true;
    }
    const dmName = camp.dmName || (camp as any).dm || '';
    if (dmName.includes('Tú') || (currentUser.name && dmName.includes(currentUser.name))) {
      return currentUser.id === 'user-me';
    }
    return false;
  }

  public setCampaignDm(campaignId: string, userId: string) {
    const user = userStore.getUser(userId);
    if (!user) return;
    const camp = this.getCampaign(campaignId);
    const members = camp?.memberUserIds ? [...camp.memberUserIds] : [];
    if (!members.includes(userId)) members.push(userId);
    this.updateCampaign(campaignId, {
      dmId: userId,
      dmName: user.name,
      memberUserIds: members
    });
  }

  public getCampaignMembers(campaignId: string) {
    const camp = this.getCampaign(campaignId);
    const allUsers = userStore.getUsers();
    if (!camp || !camp.memberUserIds) return allUsers;
    return allUsers.filter(u => camp.memberUserIds.includes(u.id));
  }

  /**
   * Broadcasts a real-time event from the DM (dice roll, milestone, etc.)
   */
  public sendDmEvent(campaignId: string, event: Omit<DmEvent, 'id' | 'timestamp'>) {
    const fullEvent: DmEvent = {
      ...event,
      id: `dmevent-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: Date.now()
    };
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dm-event-received', { detail: fullEvent }));
      try {
        syncManager.pushDmEventToRemote(fullEvent);
      } catch (_) {}
    }
  }
}

export const campaignStore = new CampaignStoreManager();
