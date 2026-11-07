import { characterStore } from '../state/characterStore.ts';
import { journalStore } from '../state/journalStore.ts';
import type { CharacterData } from '../models/character.ts';
import type { JournalEntry } from '../models/journal.ts';

export interface SyncConfig {
  enabled: boolean;
  apiKey: string;
  projectId: string;
  campaignId: string;
  characterId: string;
  pin?: string;
}

export type SyncStatusState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SyncStatusEvent {
  state: SyncStatusState;
  message?: string;
  campaignId?: string;
  characterId?: string;
}

const SYNC_CONFIG_KEY = 'dnd_sync_config_v1';

export function generateCharacterSyncId(name?: string): string {
  const base = (name || 'personaje')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'personaje';

  const rand = Math.random().toString(36).substring(2, 6);
  return `${base}-${rand}`;
}

class SyncManager {
  private config: SyncConfig;
  private isSyncingFromRemote = false;
  private unsubscribeCharacter?: () => void;
  private unsubscribeJournal?: () => void;
  private unsubscribeDmEvents?: () => void;
  private app: any = null;
  private db: any = null;
  public currentStatus: SyncStatusState = 'disconnected';
  public currentMessage: string = '';

  constructor() {
    this.config = this.loadConfig();
    this.initListeners();
  }

  private loadConfig(): SyncConfig {
    const defaultCharName = (typeof window !== 'undefined' ? characterStore.get()?.name : '') || 'elysian';
    const fallbackId = generateCharacterSyncId(defaultCharName);

    const envApiKey = (typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_FIREBASE_API_KEY) || '';
    const envProjectId = (typeof import.meta !== 'undefined' && (import.meta as any).env?.PUBLIC_FIREBASE_PROJECT_ID) || '';

    if (typeof window === 'undefined') {
      return {
        enabled: false,
        apiKey: envApiKey,
        projectId: envProjectId,
        campaignId: 'barovia-strahd',
        characterId: fallbackId
      };
    }
    try {
      const saved = localStorage.getItem(SYNC_CONFIG_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!parsed.characterId || !parsed.characterId.trim()) {
          parsed.characterId = fallbackId;
        }
        if (!parsed.apiKey && envApiKey) parsed.apiKey = envApiKey;
        if (!parsed.projectId && envProjectId) parsed.projectId = envProjectId;
        return parsed;
      }
    } catch (e) {
      console.warn('Failed to load sync config', e);
    }
    return {
      enabled: false,
      apiKey: envApiKey,
      projectId: envProjectId,
      campaignId: 'barovia-strahd',
      characterId: fallbackId
    };
  }

  public async saveConfig(newConfig: SyncConfig): Promise<{ success: boolean; message?: string }> {
    this.config = {
      ...newConfig,
      characterId: newConfig.characterId && newConfig.characterId.trim() ? newConfig.characterId.trim() : this.getEffectiveCharacterId()
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(this.config));
      return await this.reconnect();
    }
    return { success: true };
  }

  public getConfig(): SyncConfig {
    return this.config;
  }

  public getEffectiveCharacterId(): string {
    if (this.config.characterId && this.config.characterId.trim()) {
      return this.config.characterId.trim();
    }
    const defaultCharName = (typeof window !== 'undefined' ? characterStore.get()?.name : '') || 'elysian';
    const generated = generateCharacterSyncId(defaultCharName);
    this.config.characterId = generated;
    if (typeof window !== 'undefined') {
      localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(this.config));
    }
    return generated;
  }

  public getShareableSyncUrl(): string {
    if (typeof window === 'undefined') return '';
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('sync_campaign', this.config.campaignId || 'barovia-strahd');
    url.searchParams.set('sync_char', this.getEffectiveCharacterId());
    if (this.config.projectId) url.searchParams.set('sync_proj', this.config.projectId);
    if (this.config.apiKey) url.searchParams.set('sync_api', this.config.apiKey);
    if (this.config.pin) url.searchParams.set('sync_pin', this.config.pin);
    return url.toString();
  }

  public async checkRemoteCharacter(campaignId: string, characterId: string): Promise<{
    exists: boolean;
    characterName?: string;
    hasPin?: boolean;
    error?: string;
  }> {
    if (!this.config.apiKey || !this.config.projectId) {
      return { exists: false };
    }
    try {
      const { initializeApp, getApps } = await import('firebase/app');
      const { getFirestore, initializeFirestore, doc, getDoc } = await import('firebase/firestore');

      const app = getApps().length === 0 ? initializeApp({
        apiKey: this.config.apiKey.trim(),
        projectId: this.config.projectId.trim(),
      }) : getApps()[0];

      let db;
      try {
        db = initializeFirestore(app, { ignoreUndefinedProperties: true });
      } catch (_) {
        db = getFirestore(app);
      }

      const snap = await getDoc(doc(db, 'campaigns', campaignId.trim(), 'characters', characterId.trim()));
      if (snap.exists()) {
        const data = snap.data();
        const remotePin = data?._syncMeta?.pin;
        return {
          exists: true,
          characterName: data.name || 'Desconocido',
          hasPin: !!remotePin
        };
      }
      return { exists: false };
    } catch (e: any) {
      console.warn('[SyncManager] Check remote character error:', e);
      return { exists: false, error: e?.message };
    }
  }

  private updateStatus(state: SyncStatusState, message: string = '') {
    this.currentStatus = state;
    this.currentMessage = message;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent<SyncStatusEvent>('sync-status-changed', {
        detail: {
          state,
          message,
          campaignId: this.config.campaignId,
          characterId: this.getEffectiveCharacterId()
        }
      }));
    }
  }

  private initListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('character-updated', ((e: CustomEvent<{ character: CharacterData }>) => {
      if (this.isSyncingFromRemote || !this.config.enabled) return;
      this.pushCharacterToRemote(e.detail.character);
    }) as EventListener);

    window.addEventListener('journal-updated', ((e: CustomEvent<{ entries: JournalEntry[] }>) => {
      if (this.isSyncingFromRemote || !this.config.enabled) return;
      this.pushJournalToRemote(journalStore.getPublicCampaignEntries());
    }) as EventListener);
  }

  public async reconnect(): Promise<{ success: boolean; message?: string }> {
    if (this.unsubscribeCharacter) this.unsubscribeCharacter();
    if (this.unsubscribeJournal) this.unsubscribeJournal();
    if (this.unsubscribeDmEvents) this.unsubscribeDmEvents();

    if (!this.config.enabled || !this.config.apiKey || !this.config.projectId) {
      this.updateStatus('disconnected', 'Sincronización desactivada (modo local)');
      return { success: true, message: 'Modo local activo' };
    }

    this.updateStatus('connecting', 'Conectando a Firebase...');

    try {
      const { initializeApp, getApps } = await import('firebase/app');
      const { getFirestore, initializeFirestore, doc, onSnapshot } = await import('firebase/firestore');

      this.app = getApps().length === 0 ? initializeApp({
        apiKey: this.config.apiKey.trim(),
        projectId: this.config.projectId.trim(),
      }) : getApps()[0];

      try {
        this.db = initializeFirestore(this.app, {
          ignoreUndefinedProperties: true
        });
      } catch (_) {
        this.db = getFirestore(this.app);
      }

      const campaignId = this.config.campaignId.trim() || 'barovia-strahd';
      const characterId = this.getEffectiveCharacterId();

      // 1. Listen to Character doc in subcollection characters/{characterId}
      const charRef = doc(this.db, 'campaigns', campaignId, 'characters', characterId);
      
      this.unsubscribeCharacter = onSnapshot(charRef, (snapshot) => {
        if (snapshot.exists()) {
          const remoteData = snapshot.data() as any;

          // Check PIN if remote character is protected
          if (remoteData._syncMeta?.pin) {
            const enteredPin = (this.config.pin || '').trim();
            if (remoteData._syncMeta.pin !== enteredPin) {
              this.updateStatus('error', `PIN incorrecto para "${remoteData.name}". Introduce el PIN correcto en Sincronización.`);
              return;
            }
          }

          this.isSyncingFromRemote = true;
          characterStore.importJson(JSON.stringify(remoteData));
          this.isSyncingFromRemote = false;
          this.updateStatus('connected', `Conectado: "${remoteData.name}" [${characterId}]`);
        } else {
          // Document does not exist in Firestore yet: upload local character to initialize room
          console.log(`Document not in Firestore for "${campaignId}/${characterId}". Initializing with local character...`);
          this.pushCharacterToRemote(characterStore.get(), true);
          this.updateStatus('connected', `Ficha "${characterId}" inicializada en "${campaignId}"`);
        }
      }, (error) => {
        console.error('Firestore character onSnapshot error:', error);
        let errorMsg = error.message || 'Error de Firestore';
        if (error.code === 'permission-denied') {
          errorMsg = 'Permiso denegado: habilita "allow read, write: if true;" en las Reglas de Firestore.';
        }
        this.updateStatus('error', errorMsg);
      });

      // 2. Listen to Journal doc (group campaign log)
      const journalRef = doc(this.db, 'campaigns', campaignId, 'journals', 'active');
      this.unsubscribeJournal = onSnapshot(journalRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data && Array.isArray(data.entries)) {
            this.isSyncingFromRemote = true;
            journalStore.mergeRemoteEntries(data.entries);
            this.isSyncingFromRemote = false;
          }
        } else {
          this.pushJournalToRemote(journalStore.getPublicCampaignEntries());
        }
      }, (error) => {
        console.error('Firestore journal onSnapshot error:', error);
      });

      // 3. Listen to DM events doc
      const dmRef = doc(this.db, 'campaigns', campaignId, 'dm_events', 'latest');
      this.unsubscribeDmEvents = onSnapshot(dmRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          if (data && data.timestamp && (Date.now() - data.timestamp < 45000)) {
            window.dispatchEvent(new CustomEvent('dm-event-received', { detail: data }));
          }
        }
      }, (error) => {
        console.warn('Firestore dm_events onSnapshot error:', error);
      });

      return { success: true, message: `Conectado a ${campaignId} [${characterId}]` };
    } catch (err: any) {
      console.error('Failed to initialize Firebase Sync:', err);
      let errorMsg = err?.message || 'Error al conectar con Firebase';
      if (err?.code === 'permission-denied') {
        errorMsg = 'Permiso denegado en Firebase. Revisa las Reglas de Firestore.';
      }
      this.updateStatus('error', errorMsg);
      return { success: false, message: errorMsg };
    }
  }

  private debounceTimer?: any;
  public pushCharacterToRemote(char: CharacterData, immediate = false): Promise<void> {
    if (!this.config.enabled || !this.db) return Promise.resolve();
    
    return new Promise((resolve, reject) => {
      clearTimeout(this.debounceTimer);
      const executePush = async () => {
        try {
          const { doc, setDoc } = await import('firebase/firestore');
          const campaignId = this.config.campaignId.trim() || 'barovia-strahd';
          const characterId = this.getEffectiveCharacterId();

          // Sanitize char into pure JSON (strips undefined fields that crash Firestore)
          const cleanChar = JSON.parse(JSON.stringify(char));
          cleanChar._syncMeta = {
            characterId,
            updatedAt: new Date().toISOString(),
            pin: this.config.pin ? this.config.pin.trim() : undefined
          };

          await setDoc(doc(this.db, 'campaigns', campaignId, 'characters', characterId), cleanChar);
          console.log(`[SyncManager] Character successfully pushed to Firestore (${campaignId}/${characterId}): "${cleanChar.name}"`);
          this.updateStatus('connected', `Sincronizado: "${cleanChar.name}" [${characterId}] (${new Date().toLocaleTimeString()})`);
          resolve();
        } catch (err: any) {
          console.error('[SyncManager] Sync push character failed:', err);
          let errorMsg = err?.message || 'Error al guardar en Firestore';
          if (err?.code === 'permission-denied') {
            errorMsg = 'Permiso denegado: activa "allow read, write: if true;" en las Reglas de Firestore.';
          }
          this.updateStatus('error', errorMsg);
          reject(err);
        }
      };

      if (immediate) {
        executePush();
      } else {
        this.debounceTimer = setTimeout(executePush, 400);
      }
    });
  }

  public pushJournalToRemote(entries: JournalEntry[]): Promise<void> {
    if (!this.config.enabled || !this.db) return Promise.resolve();
    return new Promise(async (resolve, reject) => {
      try {
        const { doc, setDoc } = await import('firebase/firestore');
        const campaignId = this.config.campaignId.trim() || 'barovia-strahd';
        const cleanPayload = JSON.parse(JSON.stringify({ entries }));
        await setDoc(doc(this.db, 'campaigns', campaignId, 'journals', 'active'), cleanPayload);
        resolve();
      } catch (err: any) {
        console.warn('[SyncManager] Sync push journal failed:', err);
        reject(err);
      }
    });
  }

  public async pushDmEventToRemote(event: any): Promise<void> {
    if (!this.config.enabled || !this.db) return;
    try {
      const { doc, setDoc } = await import('firebase/firestore');
      const campaignId = this.config.campaignId.trim() || 'barovia-strahd';
      await setDoc(doc(this.db, 'campaigns', campaignId, 'dm_events', 'latest'), JSON.parse(JSON.stringify(event)));
    } catch (e) {
      console.warn('[SyncManager] Failed to push DM event:', e);
    }
  }

  /**
   * Forces an immediate push of the local character to the remote cloud room.
   */
  public async forcePushLocalToRemote(): Promise<{ success: boolean; message?: string }> {
    if (!this.config.enabled) {
      return { success: false, message: 'La sincronización está desactivada.' };
    }
    try {
      const char = characterStore.get();
      await this.pushCharacterToRemote(char, true);
      const entries = journalStore.getEntries();
      await this.pushJournalToRemote(entries);
      const characterId = this.getEffectiveCharacterId();
      return { success: true, message: `Personaje "${char.name}" [${characterId}] subido a la nube correctamente.` };
    } catch (e: any) {
      return { success: false, message: e?.message || 'Error al subir a la nube.' };
    }
  }

  /**
   * Forces an immediate pull from the remote cloud room to local storage.
   */
  public async forcePullRemoteToLocal(): Promise<{ success: boolean; message?: string }> {
    if (!this.config.enabled || !this.db) {
      return { success: false, message: 'La sincronización no está conectada.' };
    }
    try {
      const { doc, getDoc } = await import('firebase/firestore');
      const campaignId = this.config.campaignId.trim() || 'barovia-strahd';
      const characterId = this.getEffectiveCharacterId();
      const charRef = doc(this.db, 'campaigns', campaignId, 'characters', characterId);
      const snap = await getDoc(charRef);
      if (snap.exists()) {
        const remoteChar = snap.data() as any;

        // Check PIN if remote has PIN
        if (remoteChar._syncMeta?.pin) {
          const enteredPin = (this.config.pin || '').trim();
          if (remoteChar._syncMeta.pin !== enteredPin) {
            return { success: false, message: 'PIN incorrecto para descargar este personaje.' };
          }
        }

        this.isSyncingFromRemote = true;
        characterStore.importJson(JSON.stringify(remoteChar));
        this.isSyncingFromRemote = false;
        return { success: true, message: `Personaje "${remoteChar.name}" [${characterId}] descargado de la nube.` };
      } else {
        return { success: false, message: `No existe el personaje "${characterId}" en la campaña "${campaignId}".` };
      }
    } catch (e: any) {
      return { success: false, message: e?.message || 'Error al descargar de la nube.' };
    }
  }
}

export const syncManager = new SyncManager();
