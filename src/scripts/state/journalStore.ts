import type { JournalEntry, JournalTag, JournalVisibility } from '../models/journal.ts';
import { defaultJournal } from '../data/defaultJournal.ts';
import type { JournalCloudWriter } from '../data/cloudTypes.ts';
import { isFirebaseConfigured } from '../firebase/client.ts';

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
   * Sin personaje: todo lo cargado (vista del DM). En modo nube Firestore ya filtra por permisos,
   * así que acá solo llega lo que el usuario puede leer.
   */
  public getEntries(filterForCharacterId?: string): JournalEntry[] {
    if (!filterForCharacterId) {
      return this.entries;
    }
    return this.entries.filter(e => {
      const visibility = getEntryVisibility(e);
      if (visibility === 'party') return true;
      if (visibility === 'player' || visibility === 'to_dm') return !e.characterId || e.characterId === filterForCharacterId;
      return false; // entradas de DM: nunca en la vista de un personaje
    });
  }

  public getPublicCampaignEntries(): JournalEntry[] {
    return this.entries.filter(e => getEntryVisibility(e) === 'party');
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
    const newEntry: JournalEntry = {
      ...entryData,
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
    diceRoll?: JournalEntry['diceRoll'],
    options: { visibility?: JournalVisibility; authorName?: string; characterId?: string } = {}
  ): JournalEntry {
    return this.addEntry({
      sessionNumber: 15,
      title,
      content,
      tags,
      diceRoll,
      isDmOnly: options.visibility === 'dm' || undefined,
      isPlayerOnly: options.visibility === 'player' || undefined,
      authorName: options.authorName,
      characterId: options.characterId
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
