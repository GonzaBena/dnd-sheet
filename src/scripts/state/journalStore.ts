import type { JournalEntry, JournalTag } from '../models/journal.ts';
import { defaultJournal } from '../data/defaultJournal.ts';

const JOURNAL_STORAGE_KEY = 'dnd_session_journal_v1';
const MAX_JOURNAL_ENTRIES = 150;

function formatLogTime(timestamp: number): string {
  const d = new Date(timestamp);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

class JournalStoreManager {
  private entries: JournalEntry[];

  constructor() {
    this.entries = this.loadFromStorage();
  }

  private loadFromStorage(): JournalEntry[] {
    if (typeof window === 'undefined') {
      return defaultJournal;
    }
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

  public getEntries(filterForCharacterId?: string): JournalEntry[] {
    if (!filterForCharacterId) {
      return this.entries;
    }
    return this.entries.filter(e => !e.isPrivate || !e.characterId || e.characterId === filterForCharacterId);
  }

  public getPublicCampaignEntries(): JournalEntry[] {
    return this.entries.filter(e => !e.isPrivate);
  }

  public mergeRemoteEntries(remoteEntries: JournalEntry[]) {
    // Preserve local private notes
    const localPrivateNotes = this.entries.filter(e => e.isPrivate);
    // Combine remote public entries with local private notes
    const remoteIds = new Set(remoteEntries.map(r => r.id));
    const merged = [...remoteEntries, ...localPrivateNotes.filter(p => !remoteIds.has(p.id))];
    merged.sort((a, b) => b.timestamp - a.timestamp);
    this.entries = merged;
    this.saveAndNotify();
  }

  private saveAndNotify() {
    if (typeof window !== 'undefined') {
      // Keep up to MAX_JOURNAL_ENTRIES
      if (this.entries.length > MAX_JOURNAL_ENTRIES) {
        this.entries = this.entries.slice(0, MAX_JOURNAL_ENTRIES);
      }
      localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(this.entries));
      window.dispatchEvent(new CustomEvent('journal-updated', {
        detail: { entries: this.entries }
      }));
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
    return newEntry;
  }

  public log(title: string, content: string, tags: (JournalTag | string)[], diceRoll?: JournalEntry['diceRoll']): JournalEntry {
    return this.addEntry({
      sessionNumber: 15,
      title,
      content,
      tags,
      diceRoll
    });
  }

  public deleteEntry(id: string) {
    this.entries = this.entries.filter(e => e.id !== id);
    this.saveAndNotify();
  }

  public resetToDefault() {
    this.entries = JSON.parse(JSON.stringify(defaultJournal));
    this.saveAndNotify();
  }
}

export const journalStore = new JournalStoreManager();
