// src/scripts/state/campaignStore.ts
import type { Campaign, DmEvent } from '../models/campaign.ts';
import type { CharacterData } from '../models/character.ts';
import { defaultCharacter } from '../data/defaultCharacter.ts';
import { getRandomCharacterAvatar, isBrokenAvatarUrl, sanitizeAvatarUrl, CHARACTER_PRESET_IMAGES } from '../data/characterAvatars.ts';
import { generateInviteCode } from '../utils/ids.ts';
import { isFirebaseConfigured } from '../firebase/client.ts';
import { diffDocs, hasChanges, toPlain, type CampaignCloudWriter } from '../data/cloudTypes.ts';
import { normalizeStatus } from '../vtt/sessionStatus.ts';
import { userStore } from './userStore.ts';

const CAMPAIGNS_STORAGE_KEY = 'dnd_campaigns_v1';
const ALL_CHARACTERS_STORAGE_KEY = 'dnd_all_characters_v1';
const ACTIVE_CAMPAIGN_KEY = 'dnd_active_campaign_id_v1';

export { CHARACTER_PRESET_IMAGES, getRandomCharacterAvatar, isBrokenAvatarUrl, sanitizeAvatarUrl };

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

/** Campos que no se guardan en Firestore: `characterIds` se deriva de los personajes. */
function serializeCampaign(c: Campaign): Record<string, any> {
  const { characterIds, isCurrentUserDm, ...rest } = c as any;
  return toPlain(rest);
}

function serializeCharacter(c: CharacterData): Record<string, any> {
  const { updatedAt, ...rest } = c as any;
  return toPlain(rest);
}

class CampaignStoreManager {
  private campaigns: Campaign[] = [];
  private characters: CharacterData[] = [];
  private activeCampaignId: string | null = null;
  private channel: any = null;

  // ---- Modo nube ----
  private cloud: CampaignCloudWriter | null = null;
  private syncedCampaigns = new Map<string, string>();
  private syncedCharacters = new Map<string, string>();
  private remoteCharacterScopes = new Map<string, CharacterData[]>();
  private campaignsLoaded = false;
  private charactersLoaded = false;
  /** Campaña activa guardada en localStorage, que se valida cuando llegan las campañas de la nube. */
  private storedActiveCampaignId: string | null = null;
  /**
   * Con Firebase configurado los datos vienen de la nube: antes del login no se lee ni se pisa
   * localStorage (ahí quedan los datos viejos que se importan en el primer login).
   */
  private readonly cloudExpected = isFirebaseConfigured();

  constructor() {
    this.campaigns = this.loadCampaigns();
    this.characters = this.loadCharacters();
    this.activeCampaignId = this.loadActiveCampaignId();
    this.initBroadcastChannel();
    if (typeof window !== 'undefined') {
      window.addEventListener('character-updated', ((e: CustomEvent<{ character: CharacterData }>) => {
        const char = e.detail?.character;
        if (!char) return;
        // En la nube la ficha activa solo se guarda si es un personaje propio ya existente:
        // así la ficha por defecto de un dispositivo nuevo no crea documentos fantasma.
        if (this.cloud) {
          const known = this.getCharacter(char.id);
          if (!known || !this.isCharacterOwner(known)) return;
        }
        this.saveCharacter(char);
      }) as EventListener);
    }
  }

  private initBroadcastChannel() {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel('dnd_campaign_bus_v1');
        if (typeof (this.channel as any).unref === 'function') {
          (this.channel as any).unref();
        }
        this.channel.onmessage = (event: MessageEvent) => {
          const data = event.data;
          if (!data || !data.type) return;
          // En la nube las pestañas comparten la cache de Firestore; el bus local solo sirve offline.
          if (this.cloud && data.type !== 'active-campaign-sync') return;

          if (data.type === 'campaigns-sync' && Array.isArray(data.campaigns)) {
            this.campaigns = data.campaigns;
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('campaigns-updated', { detail: { campaigns: this.campaigns } }));
            }
          } else if (data.type === 'characters-sync' && Array.isArray(data.characters)) {
            this.characters = data.characters;
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('all-characters-updated', { detail: { characters: this.characters } }));
            }
          } else if (data.type === 'active-campaign-sync') {
            this.activeCampaignId = data.campaignId;
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('active-campaign-changed', {
                detail: {
                  campaignId: data.campaignId,
                  campaign: this.getActiveCampaign()
                }
              }));
            }
          } else if (data.type === 'dm-event' && data.detail) {
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('dm-event-received', { detail: data.detail }));
            }
          }
        };
      } catch (_) {}
    }
  }

  private loadCampaigns(): Campaign[] {
    if (typeof window === 'undefined') return DEFAULT_CAMPAIGNS;
    if (this.cloudExpected) return [];
    try {
      const saved = localStorage.getItem(CAMPAIGNS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const legacyCampaignsCleanKey = 'dnd_legacy_campaigns_cleaned_v2';
          if (!localStorage.getItem(legacyCampaignsCleanKey)) {
            const legacyCampIds = new Set(['barovia-strahd', 'phandelver-mine', 'avernus-descent']);
            const cleaned = parsed
              .filter((c: any) => !legacyCampIds.has(c.id))
              .map((c: any) => ({ ...c, status: normalizeStatus(c.status) }));
            localStorage.setItem(legacyCampaignsCleanKey, 'true');
            this.persistCampaigns(cleaned);
            return cleaned;
          }
          return parsed.map((c: any) => ({ ...c, status: normalizeStatus(c.status) }));
        }
      }
    } catch (e) {
      console.warn('[CampaignStore] Failed to load campaigns from storage', e);
    }
    return DEFAULT_CAMPAIGNS;
  }

  private loadCharacters(): CharacterData[] {
    if (typeof window === 'undefined') return SEED_CHARACTERS;
    if (this.cloudExpected) return [];
    try {
      const saved = localStorage.getItem(ALL_CHARACTERS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          if (parsed.length === 0) {
            return [];
          }
          const legacyCharsCleanKey = 'dnd_legacy_chars_cleaned_v2';
          if (!localStorage.getItem(legacyCharsCleanKey)) {
            const legacyCharIds = new Set([
              'elysian-ventosombra', 'morgana-espinaoscura', 'thorin-rompehierro',
              'liara-hojaargenta', 'varis-galanodel', 'bryan-martillofirme',
              'kaeroc-cuernonegro', 'selene-sombraluna', 'grommash-el-feroz', 'geralt-vagabundo'
            ]);
            let cleaned = parsed.filter((c: any) => !legacyCharIds.has(c.id));
            if (!cleaned.some(c => c.id === 'atlas' || c.name === 'Atlas')) {
              cleaned = [...SEED_CHARACTERS, ...cleaned];
            }
            cleaned.forEach((c: any) => {
              if (isBrokenAvatarUrl(c.avatarUrl)) {
                c.avatarUrl = getRandomCharacterAvatar();
              }
            });
            localStorage.setItem(legacyCharsCleanKey, 'true');
            this.persistCharacters(cleaned);
            return cleaned;
          }
          let hasBroken = false;
          parsed.forEach((c: any) => {
            if (isBrokenAvatarUrl(c.avatarUrl)) {
              c.avatarUrl = getRandomCharacterAvatar();
              hasBroken = true;
            }
          });
          if (hasBroken) {
            this.persistCharacters(parsed);
          }
          return parsed;
        }
      }
    } catch (e) {
      console.warn('[CampaignStore] Failed to load characters from storage', e);
    }
    return SEED_CHARACTERS;
  }

  private loadActiveCampaignId(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      const saved = localStorage.getItem(ACTIVE_CAMPAIGN_KEY);
      this.storedActiveCampaignId = saved && saved !== 'none' ? saved : null;
      if (saved !== null && saved !== 'none') {
        if (this.campaigns.some(c => c.id === saved)) return saved;
      }
    } catch (_) {}
    return null;
  }

  public seedLegacyFixtures() {
    userStore.seedLegacyFixtures();
    if (typeof window !== 'undefined') {
      localStorage.setItem('dnd_legacy_campaigns_cleaned_v2', 'true');
      localStorage.setItem('dnd_legacy_chars_cleaned_v2', 'true');
    }
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

  // ---------------------------------------------------------------------------
  // Modo nube: los arrays en memoria siguen siendo la vista que lee la UI; las mutaciones
  // se convierten en un diff contra lo último sincronizado y los snapshots de Firestore
  // reemplazan los arrays.
  // ---------------------------------------------------------------------------

  public isCloudMode(): boolean {
    return this.cloud !== null;
  }

  public attachCloud(writer: CampaignCloudWriter) {
    this.cloud = writer;
    this.syncedCampaigns.clear();
    this.syncedCharacters.clear();
    this.remoteCharacterScopes.clear();
    this.campaignsLoaded = false;
    this.charactersLoaded = false;
    this.campaigns = [];
    this.characters = [];
    this.activeCampaignId = null;
    this.emitCampaigns();
    this.emitCharacters();
  }

  public detachCloud() {
    this.cloud = null;
    this.syncedCampaigns.clear();
    this.syncedCharacters.clear();
    this.remoteCharacterScopes.clear();
    this.campaigns = this.loadCampaigns();
    this.characters = this.loadCharacters();
    this.activeCampaignId = this.loadActiveCampaignId();
    this.emitCampaigns();
    this.emitCharacters();
  }

  public hasLoadedCampaigns(): boolean {
    return !this.cloud || this.campaignsLoaded;
  }

  public hasLoadedCharacters(): boolean {
    return !this.cloud || this.charactersLoaded;
  }

  public applyRemoteCampaigns(remote: Campaign[]) {
    if (!this.cloud) return;
    const previousStatuses = new Map(this.campaigns.map(c => [c.id, c.status]));
    this.syncedCampaigns = new Map(remote.map(c => [c.id, JSON.stringify(serializeCampaign(c))]));
    this.campaigns = remote
      .map(c => ({
        ...c,
        status: normalizeStatus(c.status),
        memberUserIds: c.memberUserIds || [],
        characterIds: []
      }))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    this.refreshCharacterIds();
    this.campaignsLoaded = true;

    for (const c of this.campaigns) {
      const prev = previousStatuses.get(c.id);
      if (prev && prev !== c.status && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('session-status-changed', {
          detail: { campaignId: c.id, status: c.status }
        }));
      }
    }

    const previousActive = this.activeCampaignId;
    if (this.activeCampaignId && !this.getCampaign(this.activeCampaignId)) {
      this.activeCampaignId = null;
    }
    if (!this.activeCampaignId && this.storedActiveCampaignId && this.getCampaign(this.storedActiveCampaignId)) {
      this.activeCampaignId = this.storedActiveCampaignId;
    }
    this.scheduleRemoteEmit(true, false);
    if (previousActive !== this.activeCampaignId) {
      this.emitActiveCampaign();
    }
  }

  /** `scope` identifica el listener: 'mine' o 'campaign:{id}'. `null` lo da de baja. */
  public applyRemoteCharacters(scope: string, remote: CharacterData[] | null) {
    if (!this.cloud) return;
    if (scope === 'mine' && remote !== null) this.charactersLoaded = true;
    if (remote === null) {
      this.remoteCharacterScopes.delete(scope);
    } else {
      this.remoteCharacterScopes.set(scope, remote);
    }

    const local = new Map(this.characters.map(c => [c.id, c]));
    const merged = new Map<string, CharacterData>();
    for (const list of this.remoteCharacterScopes.values()) {
      for (const c of list) {
        this.syncedCharacters.set(c.id, JSON.stringify(serializeCharacter(c)));
        // Si hay una escritura local pendiente (debounce), la versión local manda.
        const pendingLocal = this.cloud.isCharacterPending(c.id) ? local.get(c.id) : undefined;
        merged.set(c.id, pendingLocal || c);
      }
    }
    for (const id of Array.from(this.syncedCharacters.keys())) {
      if (!merged.has(id)) this.syncedCharacters.delete(id);
    }
    this.characters = Array.from(merged.values());
    this.refreshCharacterIds();
    this.scheduleRemoteEmit(true, true);
  }

  private pendingEmit: { campaigns: boolean; characters: boolean } | null = null;

  /**
   * Agrupa las emisiones provocadas por snapshots remotos: varios snapshots seguidos producen un
   * solo re-render. Re-renders constantes reemplazan el DOM entre touchstart y click y en móvil
   * el toque se perdía.
   */
  private scheduleRemoteEmit(campaigns: boolean, characters: boolean) {
    if (typeof window === 'undefined') return;
    if (this.pendingEmit) {
      this.pendingEmit.campaigns ||= campaigns;
      this.pendingEmit.characters ||= characters;
      return;
    }
    this.pendingEmit = { campaigns, characters };
    setTimeout(() => {
      const pending = this.pendingEmit;
      this.pendingEmit = null;
      if (!pending) return;
      if (pending.characters) this.emitCharacters();
      if (pending.campaigns) this.emitCampaigns();
    }, 50);
  }

  private refreshCharacterIds() {
    for (const camp of this.campaigns) {
      camp.characterIds = this.characters.filter(c => c.campaignId === camp.id).map(c => c.id);
    }
  }

  private emitCampaigns() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('campaigns-updated', { detail: { campaigns: this.campaigns } }));
    }
  }

  private emitCharacters() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('all-characters-updated', { detail: { characters: this.characters } }));
    }
  }

  private emitActiveCampaign() {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('active-campaign-changed', {
        detail: { campaignId: this.activeCampaignId, campaign: this.getActiveCampaign() }
      }));
    }
  }

  private persistCampaigns(campaigns: Campaign[], broadcast = true) {
    this.campaigns = campaigns;
    if (this.cloud) {
      const changes = diffDocs(this.syncedCampaigns, campaigns, serializeCampaign);
      if (hasChanges(changes)) {
        for (const c of changes.creates) this.syncedCampaigns.set(c.id, JSON.stringify(c.data));
        for (const u of changes.updates) {
          const camp = campaigns.find(c => c.id === u.id);
          if (camp) this.syncedCampaigns.set(u.id, JSON.stringify(serializeCampaign(camp)));
        }
        for (const id of changes.deletes) this.syncedCampaigns.delete(id);
        this.cloud.applyCampaignChanges(changes);
      }
      this.refreshCharacterIds();
      this.emitCampaigns();
      return;
    }
    if (this.cloudExpected) {
      this.emitCampaigns();
      return;
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem(CAMPAIGNS_STORAGE_KEY, JSON.stringify(this.campaigns));
      window.dispatchEvent(new CustomEvent('campaigns-updated', { detail: { campaigns: this.campaigns } }));
    }
    if (broadcast && this.channel) {
      try {
        this.channel.postMessage({ type: 'campaigns-sync', campaigns: this.campaigns });
      } catch (_) {}
    }
  }

  private persistCharacters(chars: CharacterData[], broadcast = true) {
    this.characters = chars;
    if (this.cloud) {
      const changes = diffDocs(this.syncedCharacters, chars, serializeCharacter);
      if (hasChanges(changes)) {
        for (const c of changes.creates) this.syncedCharacters.set(c.id, JSON.stringify(c.data));
        for (const u of changes.updates) {
          const char = chars.find(c => c.id === u.id);
          if (char) this.syncedCharacters.set(u.id, JSON.stringify(serializeCharacter(char)));
        }
        for (const id of changes.deletes) this.syncedCharacters.delete(id);
        this.cloud.applyCharacterChanges(changes);
      }
      this.emitCharacters();
      return;
    }
    if (this.cloudExpected) {
      this.emitCharacters();
      return;
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem(ALL_CHARACTERS_STORAGE_KEY, JSON.stringify(this.characters));
      window.dispatchEvent(new CustomEvent('all-characters-updated', { detail: { characters: this.characters } }));
    }
    if (broadcast && this.channel) {
      try {
        this.channel.postMessage({ type: 'characters-sync', characters: this.characters });
      } catch (_) {}
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

  public setActiveCampaign(campaignId: string | null, broadcast = true) {
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
    if (broadcast && this.channel) {
      try {
        this.channel.postMessage({ type: 'active-campaign-sync', campaignId });
      } catch (_) {}
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
    // En la nube las Security Rules exigen que quien crea sea DM y único miembro;
    // el resto se suma con el código de invitación.
    if (this.cloud) {
      data = { ...data, memberUserIds: [currentUserId], dmId: currentUserId };
    }
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
      // DECISION: nuevas campañas nacen en 'paused' (F0B-1)
      status: data.status ? normalizeStatus(data.status) : 'paused',
      statusChangedAt: Date.now(),
      characterIds: data.characterIds || [],
      createdAt: Date.now(),
      ...(this.cloud ? { inviteCode: generateInviteCode() } : {})
    };

    const next = [newCampaign, ...this.campaigns];
    this.persistCampaigns(next);
    this.setActiveCampaign(newCampaign.id);
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
   * Crea un personaje nuevo asignándole una imagen aleatoria de /characters/
   * para evitar cualquier ruptura de imagen.
   */
  public createCharacter(data: Partial<CharacterData> = {}, targetCampaignId: string | null = null): CharacterData {
    const currentUser = userStore.getCurrentUser();

    if (targetCampaignId) {
      const existing = this.getMyCharacterForCampaign(targetCampaignId, currentUser.id);
      if (existing) {
        throw new Error(`El usuario ya tiene un personaje (${existing.name}) en esta campaña. No se permite más de un personaje por usuario en la misma campaña.`);
      }
    }

    const base = JSON.parse(JSON.stringify(defaultCharacter)) as CharacterData;
    const name = data.name || 'Nuevo Aventurero Independiente';
    const baseSlug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const newId = `${baseSlug}-${Math.random().toString(36).substr(2, 6)}`;

    const avatarUrl = data.avatarUrl && !isBrokenAvatarUrl(data.avatarUrl)
      ? data.avatarUrl
      : getRandomCharacterAvatar();

    const newChar: CharacterData = {
      ...base,
      ...data,
      id: data.id || newId,
      campaignId: targetCampaignId,
      userId: currentUser.id,
      playerName: currentUser.name,
      avatarUrl,
      name,
    };

    if (targetCampaignId) {
      const targetCamp = this.getCampaign(targetCampaignId);
      if (targetCamp) {
        newChar.sessionContext = {
          campaignName: targetCamp.name,
          sessionNumber: targetCamp.sessionNumber,
          weather: targetCamp.weather,
          location: targetCamp.location
        };
      }
    } else {
      newChar.sessionContext = {
        campaignName: 'Aventura Independiente',
        sessionNumber: 1,
        weather: 'Despejado',
        location: 'Tierras Salvajes'
      };
    }

    this.saveCharacter(newChar);
    return newChar;
  }

  /**
   * Clones a character to a target campaign (or standalone if targetCampaignId is null),
   * generating a new unique independent ID and ensuring changes do not affect original.
   * Assigns ownership of the new clone to the current active user.
   */
  public cloneCharacter(characterId: string, targetCampaignId: string | null, newName?: string): CharacterData {
    const isTemplate = characterId === '__template__';
    const original = (characterId && characterId !== '__template__' ? this.getCharacter(characterId) : null) || defaultCharacter;
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

    // Si es una plantilla nueva o el avatar original está roto o vacío, asignar uno aleatorio de /characters/
    if (isTemplate || isBrokenAvatarUrl(cloned.avatarUrl)) {
      cloned.avatarUrl = getRandomCharacterAvatar();
    }

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

  /** Nuevo código de invitación; el anterior deja de funcionar. Solo DM o creador. */
  public regenerateInviteCode(campaignId: string): string | null {
    if (!this.cloud || !this.canUserManageMembers(campaignId)) return null;
    const inviteCode = generateInviteCode();
    this.updateCampaign(campaignId, { inviteCode });
    return inviteCode;
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
    }
    if (this.channel) {
      try {
        this.channel.postMessage({ type: 'dm-event', detail: fullEvent });
      } catch (_) {}
    }
    this.cloud?.sendDmEvent(fullEvent);
  }
}

export const campaignStore = new CampaignStoreManager();
