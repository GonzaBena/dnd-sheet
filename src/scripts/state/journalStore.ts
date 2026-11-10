import type { JournalEntry, JournalTag, JournalVisibility } from '../models/journal.ts';
import { defaultJournal } from '../data/defaultJournal.ts';
import type { JournalCloudWriter } from '../data/cloudTypes.ts';
import { isFirebaseConfigured } from '../firebase/client.ts';
import { campaignStore } from './campaignStore.ts';

const JOURNAL_STORAGE_KEY = 'dnd_session_journal_v1';
const MAX_JOURNAL_ENTRIES = 150;

function formatLogTime(timestamp: number): string {
  const d = new Date(timestamp);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

/**
 * Tipos de entrada:
 * - party: la ve toda la mesa.
 * - dm: solo el DM de la campaña.
 * - player: solo el jugador que la escribió (ni el DM).
 * - to_dm: mensaje al DM, lo ven el jugador que lo escribió y el DM.
 * `isPrivate` es el flag viejo: si venía de un personaje era una nota del jugador, si no, del DM.
 */
export function getEntryVisibility(entry: Pick<JournalEntry, 'isDmOnly' | 'isPlayerOnly' | 'isForDm' | 'isPrivate' | 'characterId'>): JournalVisibility {
  if (entry.isDmOnly) return 'dm';
  if (entry.isForDm) return 'to_dm';
  if (entry.isPlayerOnly) return 'player';
  if (entry.isPrivate) return entry.characterId ? 'player' : 'dm';
  return 'party';
}

export function withVisibility<T extends JournalEntry>(entry: T, visibility: JournalVisibility): T {
  const next = {
    ...entry,
    isDmOnly: visibility === 'dm',
    isPlayerOnly: visibility === 'player',
    isForDm: visibility === 'to_dm',
  };
  delete (next as any).isPrivate;
  return next;
}

/**
 * Determina si un usuario puede eliminar una entrada del diario.
 * - DM: puede moderar entradas de la mesa ('party'), notas de DM ('dm') y mensajes recibidos ('to_dm'),
 *       pero NUNCA las notas personales de un jugador ('player').
 * - Jugador: solo puede eliminar sus propias notas (autor coincidente).
 */
export function canUserDeleteEntry(
  entry: Pick<JournalEntry, 'isDmOnly' | 'isPlayerOnly' | 'isForDm' | 'isPrivate' | 'characterId' | 'authorUid'>,
  userId?: string,
  isDm?: boolean
): boolean {
  const visibility = getEntryVisibility(entry);
  if (isDm) {
    return visibility !== 'player';
  }
  if (!userId) return false;
  return entry.authorUid === userId;
}

class JournalStoreManager {
  private entries: JournalEntry[];
  private channel: any = null;
  private cloud: JournalCloudWriter | null = null;
  private remoteScopes = new Map<string, JournalEntry[]>();
  private readonly cloudExpected = isFirebaseConfigured();

  constructor() {
    this.entries = this.loadFromStorage();
    this.initBroadcastChannel();
  }

  private initBroadcastChannel() {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel('dnd_journal_bus_v1');
        if (typeof (this.channel as any).unref === 'function') {
          (this.channel as any).unref();
        }
        this.channel.onmessage = (event: MessageEvent) => {
          if (!this.cloud && event.data?.type === 'journal-sync' && Array.isArray(event.data.entries)) {
            this.entries = event.data.entries;
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('journal-updated', {
                detail: { entries: this.entries }
              }));
            }
          }
        };
      } catch (_) {}
    }
  }

  private loadFromStorage(): JournalEntry[] {
    if (typeof window === 'undefined') {
      return defaultJournal;
    }
    if (this.cloudExpected) return [];
    try {
      const saved = localStorage.getItem(JOURNAL_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Error loading journal from localStorage, using default', e);
    }
    return defaultJournal;
  }

  /**
   * Con un personaje: lo que ve ese jugador (party + sus notas de jugador + sus mensajes al DM).
   * Sin personaje / DM: todo lo que el DM puede ver (party + notas de DM + todos los mensajes to_dm).
   */
  public getEntries(
    filterForCharacterId?: string,
    currentUserId?: string,
    isDm = (!filterForCharacterId && !currentUserId)
  ): JournalEntry[] {
    if (!filterForCharacterId && isDm) {
      return this.entries;
    }
    return this.entries.filter(e => {
      const visibility = getEntryVisibility(e);
      if (visibility === 'party') return true;
      if (isDm && (visibility === 'dm' || visibility === 'to_dm')) return true;
      if (visibility === 'to_dm') {
        if (currentUserId && e.authorUid === currentUserId) return true;
        if (filterForCharacterId && e.characterId === filterForCharacterId) return true;
        return isDm;
      }
      if (visibility === 'player') {
        if (currentUserId && e.authorUid) {
          return e.authorUid === currentUserId;
        }
        return !filterForCharacterId || !e.characterId || e.characterId === filterForCharacterId;
      }
      return false; // entradas de DM: nunca en la vista de un personaje si no es DM
    });
  }

  public getPublicCampaignEntries(campaignId?: string): JournalEntry[] {
    const activeCid = campaignId || campaignStore.getActiveCampaignId();
    return this.entries.filter(e => {
      if (getEntryVisibility(e) !== 'party') return false;
      if (activeCid) {
        return e.campaignId === activeCid;
      }
      return !e.campaignId;
    });
  }

  // ---- Modo nube ----

  public attachCloud(writer: JournalCloudWriter) {
    this.cloud = writer;
    this.remoteScopes.clear();
    this.entries = [];
    this.notify(false);
  }

  public detachCloud() {
    this.cloud = null;
    this.remoteScopes.clear();
    this.entries = this.loadFromStorage();
    this.notify(false);
  }

  public isCloudMode(): boolean {
    return this.cloud !== null;
  }

  /** Cada listener de Firestore (party, mis notas, DM, notas sin campaña) reemplaza su porción. */
  public applyRemoteEntries(scope: string, entries: JournalEntry[] | null) {
    if (!this.cloud) return;
    if (entries === null) {
      this.remoteScopes.delete(scope);
    } else {
      this.remoteScopes.set(scope, entries);
    }
    const byId = new Map<string, JournalEntry>();
    for (const list of this.remoteScopes.values()) {
      for (const e of list) byId.set(e.id, e);
    }
    this.entries = Array.from(byId.values()).sort((a, b) => b.timestamp - a.timestamp);
    this.notify(false);
  }

  private notify(broadcast: boolean) {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('journal-updated', {
        detail: { entries: this.entries }
      }));
    }
    if (broadcast && this.channel) {
      try {
        this.channel.postMessage({ type: 'journal-sync', entries: this.entries });
      } catch (_) {}
    }
  }

  private saveAndNotify(broadcast = true) {
    if (this.cloud || this.cloudExpected) {
      // En la nube cada entrada es un documento; acá solo se refresca la vista.
      this.notify(false);
      return;
    }
    if (this.entries.length > MAX_JOURNAL_ENTRIES) {
      this.entries = this.entries.slice(0, MAX_JOURNAL_ENTRIES);
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(this.entries));
      window.dispatchEvent(new CustomEvent('journal-updated', {
        detail: { entries: this.entries }
      }));
    }
    if (broadcast && this.channel) {
      try {
        this.channel.postMessage({ type: 'journal-sync', entries: this.entries });
      } catch (_) {}
    }
  }

  public addEntry(entryData: Omit<JournalEntry, 'id' | 'timestamp'> & { timestamp?: number }): JournalEntry {
    const ts = entryData.timestamp || Date.now();
    const activeCampId = campaignStore.getActiveCampaignId() || undefined;
    const newEntry: JournalEntry = {
      ...entryData,
      campaignId: entryData.campaignId || activeCampId,
      id: `entry-${ts}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: ts,
      timeAgoText: entryData.timeAgoText || formatLogTime(ts),
    };
    this.entries.unshift(newEntry);
    this.saveAndNotify();
    this.cloud?.addEntry(newEntry);
    return newEntry;
  }

  public log(
    title: string,
    content: string,
    tags: (JournalTag | string)[],
    diceRollOrOptions?: JournalEntry['diceRoll'] | { bannerText?: string; visibility?: JournalVisibility; authorName?: string; characterId?: string; milestone?: { bannerText?: string } },
    options: { visibility?: JournalVisibility; authorName?: string; characterId?: string; bannerText?: string; milestone?: { bannerText?: string } } = {}
  ): JournalEntry {
    let actualDiceRoll: JournalEntry['diceRoll'] | undefined = undefined;
    let actualOptions = { ...options };

    if (diceRollOrOptions) {
      if ('formula' in diceRollOrOptions && 'result' in diceRollOrOptions) {
        actualDiceRoll = diceRollOrOptions as JournalEntry['diceRoll'];
      } else {
        actualOptions = { ...actualOptions, ...(diceRollOrOptions as any) };
      }
    }

    const milestoneBanner = actualOptions.bannerText || actualOptions.milestone?.bannerText;

    return this.addEntry({
      sessionNumber: 15,
      title,
      content,
      tags,
      diceRoll: actualDiceRoll,
      milestone: milestoneBanner ? { bannerText: milestoneBanner } : undefined,
      isDmOnly: actualOptions.visibility === 'dm' || undefined,
      isPlayerOnly: actualOptions.visibility === 'player' || undefined,
      authorName: actualOptions.authorName,
      characterId: actualOptions.characterId
    });
  }

  public deleteEntry(id: string) {
    const entry = this.entries.find(e => e.id === id);
    this.entries = this.entries.filter(e => e.id !== id);
    this.saveAndNotify();
    if (entry) this.cloud?.deleteEntry(entry);
  }

  public resetToDefault() {
    // En la nube el diario es compartido: reiniciar la ficha no borra las entradas de la mesa.
    if (this.cloud) return;
    this.entries = JSON.parse(JSON.stringify(defaultJournal));
    this.saveAndNotify();
  }
}

export const journalStore = new JournalStoreManager();
