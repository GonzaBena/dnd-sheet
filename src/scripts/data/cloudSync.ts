// src/scripts/data/cloudSync.ts
// Conecta los stores con Firestore cuando hay sesión de Firebase Auth.
//
// Colecciones:
//   users/{uid}                         perfil público (nombre, avatar)
//   users/{uid}/notes/{entryId}         diario de personajes sin campaña
//   campaigns/{id}                      campaña (memberUserIds, dmId, creatorId, inviteCode…)
//   campaigns/{id}/journal/{entryId}    diario con visibility 'party' | 'dm' | 'player'
//   campaigns/{id}/dm_events/{eventId}  tiradas e hitos del DM en vivo
//   invites/{code}                      { campaignId } para unirse con código
//   (RTDB) rooms/{liveRoomId}           sala en vivo del VTT, ver roomService.ts
//   characters/{id}                     ficha completa (userId = dueño, campaignId)
import type { Firestore, Unsubscribe } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import type { Campaign, DmEvent } from '../models/campaign.ts';
import type { CharacterData } from '../models/character.ts';
import type { JournalEntry, JournalVisibility } from '../models/journal.ts';
import type { AppUser } from '../models/user.ts';
import { campaignStore } from '../state/campaignStore.ts';
import { characterStore } from '../state/characterStore.ts';
import { journalStore, getEntryVisibility, withVisibility } from '../state/journalStore.ts';
import { userStore } from '../state/userStore.ts';
import { recalculateCharacter } from '../dnd/calculations.ts';
import { getFirebase, isFirebaseConfigured } from '../firebase/client.ts';
import { onAuthChange, signOut as authSignOut, deleteCurrentUser, toAppUser } from '../firebase/authService.ts';
import { normalizeInviteCode, slugify } from '../utils/ids.ts';
import { defaultCharacter } from '../data/defaultCharacter.ts';
import { toPlain, type DocChanges } from './cloudTypes.ts';
import { migrateLocalData } from './migrateLocalData.ts';
import { startRoomSync } from './roomService.ts';
import { runHpTransaction, type HpTransactionResult } from './hpTransaction.ts';
import type { HpOp } from '../dnd/hp.ts';

export type CloudSessionState = 'local' | 'loading' | 'signed-out' | 'ready';

const CHARACTER_DEBOUNCE_MS = 120;
/** Sin respuesta del servidor en este tiempo, el cambio de PG se da por fallido y se revierte. */
const HP_TRANSACTION_TIMEOUT_MS = 10000;
const DM_EVENT_WINDOW_MS = 45000;
const JOURNAL_LIMIT = 150;
const READY_SAFETY_MS = 20000;
const BASE_SUBSCRIBE_TIMEOUT_MS = 20000;

type Fs = typeof import('firebase/firestore');

interface PendingCharacterWrite {
  fields: Record<string, any>;
  removedKeys: Set<string>;
  timer: ReturnType<typeof setTimeout>;
}

class CloudSession {
  public state: CloudSessionState = 'loading';
  private started = false;
  private readyPromise: Promise<void>;
  private resolveReady!: () => void;

  private db: Firestore | null = null;
  private fs: Fs | null = null;
  private uid: string | null = null;

  private baseUnsubs: Unsubscribe[] = [];
  private campaignUnsubs = new Map<string, Unsubscribe[]>();
  private journalUnsubs: Unsubscribe[] = [];
  private journalKey = '';
  private inviteCodes = new Map<string, string>();
  private knownProfiles = new Set<string>();
  private pendingCharacters = new Map<string, PendingCharacterWrite>();
  private inFlightCharacters = new Map<string, number>();
  private lastLocalWriteAt = new Map<string, number>();
  private seenDmEvents = new Set<string>();

  private isCharacterWritePending(id: string): boolean {
    if (this.pendingCharacters.has(id)) return true;
    if ((this.inFlightCharacters.get(id) || 0) > 0) return true;
    return false;
  }

  constructor() {
    this.readyPromise = new Promise(resolve => {
      this.resolveReady = resolve;
    });
  }

  /** Se resuelve en modo local enseguida, o cuando hay sesión y llegaron los primeros datos. */
  public ready(): Promise<void> {
    this.start();
    if (this.state === 'ready' || this.state === 'signed-out' || this.state === 'local') {
      return Promise.resolve();
    }
    return new Promise(resolve => {
      const handler = (e: any) => {
        const s = e.detail?.state;
        if (s === 'ready' || s === 'signed-out' || s === 'local') {
          if (typeof window !== 'undefined') {
            window.removeEventListener('cloud-session-changed', handler);
          }
          resolve();
        }
      };
      if (typeof window !== 'undefined') {
        window.addEventListener('cloud-session-changed', handler);
      } else {
        resolve();
      }
    });
  }

  public isCloud(): boolean {
    return isFirebaseConfigured();
  }

  /** uid de Firebase Auth en modo nube; null en modo local o sin sesión. */
  public getUid(): string | null {
    return this.uid;
  }

  public start() {
    if (this.started) return;
    this.started = true;

    if (!isFirebaseConfigured()) {
      this.setState('local');
      this.resolveReady();
      return;
    }

    // Red de seguridad única y larga: sólo libera a quien espera, no cambia el estado de la sesión
    // (pasar a 'signed-out' por timeout mostraba el login y dejaba las vistas vacías).
    setTimeout(() => {
      if (this.state === 'loading') {
        console.warn('[CloudSync] ready() liberado por seguridad tras 20s sin completar la carga.');
        this.resolveReady();
      }
    }, READY_SAFETY_MS);

    onAuthChange(user => {
      if (user) {
        try {
          localStorage.setItem('dnd_cloud_authed', '1');
          localStorage.removeItem('dnd_demo_mode');
        } catch (_) {}
        this.handleSignIn(user).catch(err => {
          console.error('[CloudSync] Error al iniciar la sesión en la nube', err);
          this.reportError(err);
          this.setState('ready');
          this.resolveReady();
        });
      } else if (this.uid) {
        // Cerró sesión en otra pestaña: se recarga para limpiar todo el estado en memoria.
        try {
          localStorage.removeItem('dnd_cloud_authed');
          localStorage.removeItem('dnd_demo_mode');
        } catch (_) {}
        window.location.reload();
      } else {
        try {
          localStorage.removeItem('dnd_cloud_authed');
        } catch (_) {}
        this.setState('signed-out');
        this.resolveReady();
      }
    }).catch(err => {
      console.error('[CloudSync] No se pudo inicializar Firebase', err);
      this.reportError(err);
      try {
        localStorage.removeItem('dnd_cloud_authed');
      } catch (_) {}
      this.setState('signed-out');
      this.resolveReady();
    });
  }

  public async signOut() {
    try {
      localStorage.removeItem('dnd_cloud_authed');
      localStorage.removeItem('dnd_demo_mode');
    } catch (_) {}
    this.flushCharacters();
    await authSignOut();
    window.location.reload();
  }

  public async deleteAccount(): Promise<void> {
    const uid = this.uid;
    if (!uid) return;
    this.flushCharacters();

    try {
      localStorage.removeItem('dnd_cloud_authed');
      localStorage.removeItem('dnd_demo_mode');
    } catch (_) {}

    // 1. Borrar perfil en Firestore si está disponible
    if (this.db && this.fs) {
      try {
        const userRef = this.fs.doc(this.db, 'users', uid);
        await this.fs.deleteDoc(userRef);
      } catch (err) {
        console.warn('[CloudSync] No se pudo borrar el perfil en Firestore:', err);
      }
    }

    // 2. Borrar credenciales de Firebase Auth
    await deleteCurrentUser();

    // 3. Limpiar almacenamiento local
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}

    // 4. Redirigir a inicio
    window.location.href = '/';
  }

  // ---------------------------------------------------------------------------
  // Sesión
  // ---------------------------------------------------------------------------

  private async handleSignIn(user: User) {
    if (this.uid === user.uid) {
      try {
        localStorage.setItem('dnd_cloud_authed', '1');
        localStorage.removeItem('dnd_demo_mode');
      } catch (_) {}
      if (this.state !== 'ready') {
        this.setState('ready');
      }
      this.resolveReady();
      return;
    }
    this.setState('loading');

    try {
      const { db } = await getFirebase();
      this.db = db;
      this.fs = await import('firebase/firestore');
      this.uid = user.uid;

      const me = await this.ensureProfile(user).catch(err => {
        console.warn('[CloudSync] No se pudo sincronizar perfil en Firestore, usando fallback local', err);
        return toAppUser(user);
      });
      userStore.enterCloudMode(me);
      this.knownProfiles.add(me.id);

      campaignStore.attachCloud({
        applyCampaignChanges: changes => this.writeCampaignChanges(changes),
        applyCharacterChanges: changes => this.writeCharacterChanges(changes),
        isCharacterPending: id => this.isCharacterWritePending(id),
        sendDmEvent: event => this.writeDmEvent(event),
        mutateHp: (id, op) => this.mutateCharacterHp(id, op),
      });
      journalStore.attachCloud({
        addEntry: entry => this.writeJournalEntry(entry),
        deleteEntry: entry => this.removeJournalEntry(entry),
      });

      const migration = await migrateLocalData(db, me).catch(err => {
        console.error('[CloudSync] Falló la importación de datos locales', err);
        this.reportError(err);
        return null;
      });

      this.bindStoreEvents();
      await this.subscribeBase();
      // Sala RTDB del VTT (/rooms/{liveRoomId}) de cada campaña donde el usuario es DM.
      startRoomSync(() => this.uid);

      const myRemoteChars = campaignStore.getAllCharacters().filter(c => campaignStore.isCharacterOwner(c, me.id));
      if (myRemoteChars.length === 0) {
        let charToUpload = characterStore.get();
        if (!charToUpload || !charToUpload.name) {
          charToUpload = defaultCharacter;
        }
        const newCharId = `char-${me.id.substring(0, 6)}-${slugify(charToUpload.name, 'atlas')}-${Math.random().toString(36).substring(2, 6)}`;
        const uploadedChar: CharacterData = {
          ...toPlain(charToUpload),
          id: newCharId,
          userId: me.id,
          playerName: me.name,
          campaignId: null,
          updatedAt: Date.now(),
        };
        try {
          const charRef = this.fs!.doc(this.db!, 'characters', newCharId);
          await this.fs!.setDoc(charRef, toPlain(uploadedChar));
          characterStore.loadCharacter(uploadedChar, true);
        } catch (e) {
          console.warn('[CloudSync] No se pudo guardar personaje inicial en Firestore', e);
        }
      } else if (migration?.activeCharacter) {
        characterStore.loadCharacter(migration.activeCharacter, true);
      } else {
        const active = characterStore.get();
        if (active?.id && !this.isCharacterWritePending(active.id)) {
          const remote = campaignStore.getCharacter(active.id);
          if (remote && campaignStore.isCharacterOwner(remote)) {
            const next = recalculateCharacter(toPlain(remote));
            if (JSON.stringify(stripVolatile(next)) !== JSON.stringify(stripVolatile(active))) {
              characterStore.loadCharacter(next, true);
            }
          }
        }
      }
      if (migration && (migration.campaigns || migration.characters || migration.entries)) {
        window.dispatchEvent(new CustomEvent('cloud-migration-done', { detail: migration }));
      }
    } catch (err) {
      console.error('[CloudSync] Error durante handleSignIn', err);
      this.reportError(err);
    } finally {
      this.setState('ready');
      this.resolveReady();
    }
  }

  private async ensureProfile(user: User): Promise<AppUser> {
    const fs = this.fs!;
    const ref = fs.doc(this.db!, 'users', user.uid);
    // Timeout seguro de 3s para evitar bloqueos si la red es inestable
    const snap = await Promise.race([
      fs.getDoc(ref),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Profile getDoc timeout')), 3000)),
    ]).catch(() => null);

    const existing = snap && snap.exists() ? (snap.data() as any) : null;
    const me = toAppUser(user, existing ? { name: existing.name, avatarUrl: existing.avatarUrl } : undefined);
    // El email no se guarda en el perfil público (lo pueden leer otros jugadores).
    const profile: Record<string, any> = { name: me.name };
    if (me.avatarUrl) profile.avatarUrl = me.avatarUrl;
    if (!existing) profile.createdAt = Date.now();
    if (!existing || existing.name !== profile.name || existing.avatarUrl !== profile.avatarUrl) {
      fs.setDoc(ref, profile, { merge: true }).catch(err => {
        console.warn('[CloudSync] No se pudo guardar perfil actualizado', err);
      });
    }
    return me;
  }

  private setState(state: CloudSessionState) {
    this.state = state;
    window.dispatchEvent(new CustomEvent('cloud-session-changed', { detail: { state } }));
  }

  private reportError(err: any) {
    let message = err?.message || String(err);
    if (err?.code === 'permission-denied') {
      message = 'No tenés permiso para hacer ese cambio. Se restauró la última versión guardada.';
    } else if (err?.code === 'unavailable') {
      message = 'Sin conexión: los cambios se guardan localmente y se suben al reconectar.';
    }
    window.dispatchEvent(new CustomEvent('cloud-error', { detail: { message, code: err?.code } }));
  }

  // ---------------------------------------------------------------------------
  // Lecturas (listeners)
  // ---------------------------------------------------------------------------

  private subscribeBase(): Promise<void> {
    const fs = this.fs!;
    const db = this.db!;
    const uid = this.uid!;

    let campaignsLoaded = false;
    let charactersLoaded = false;
    return new Promise(resolve => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve();
      };

      const maybeResolve = () => {
        if (campaignsLoaded && charactersLoaded) finish();
      };

      // Sólo como último recurso (sin red ni caché): resolvemos para no congelar la carga.
      // Los snapshots seguirán actualizando la UI en vivo.
      const timeoutId = setTimeout(() => {
        console.warn('[CloudSync] subscribeBase timeout alcanzado, procediendo con datos disponibles');
        finish();
      }, BASE_SUBSCRIBE_TIMEOUT_MS);

      this.baseUnsubs.push(fs.onSnapshot(
        fs.query(fs.collection(db, 'campaigns'), fs.where('memberUserIds', 'array-contains', uid)),
        snap => {
          try {
            const campaigns = snap.docs.map(d => ({ ...(d.data() as Campaign), id: d.id }));
            this.inviteCodes = new Map(campaigns.filter(c => c.inviteCode).map(c => [c.id, c.inviteCode!]));
            campaignStore.applyRemoteCampaigns(campaigns);
            this.syncCampaignListeners(campaigns.map(c => c.id));
            this.loadProfiles(campaigns.flatMap(c => c.memberUserIds || []));
            this.syncJournalListeners();
          } catch (e) {
            console.error('[CloudSync] Error procesando snapshot de campaigns', e);
          } finally {
            campaignsLoaded = true;
            maybeResolve();
          }
        },
        err => {
          console.error('[CloudSync] campaigns listener', err);
          this.reportError(err);
          campaignsLoaded = true;
          maybeResolve();
        }
      ));

      this.baseUnsubs.push(fs.onSnapshot(
        fs.query(fs.collection(db, 'characters'), fs.where('userId', '==', uid)),
        snap => {
          try {
            campaignStore.applyRemoteCharacters('mine', snap.docs.map(d => this.toCharacter(d)));
          } catch (e) {
            console.error('[CloudSync] Error procesando snapshot de characters', e);
          } finally {
            charactersLoaded = true;
            maybeResolve();
          }
        },
        err => {
          console.error('[CloudSync] characters listener', err);
          this.reportError(err);
          charactersLoaded = true;
          maybeResolve();
        }
      ));

      // Notas de personajes sin campaña.
      this.baseUnsubs.push(fs.onSnapshot(
        fs.query(fs.collection(db, 'users', uid, 'notes'), fs.orderBy('timestamp', 'desc'), fs.limit(JOURNAL_LIMIT)),
        snap => {
          try {
            journalStore.applyRemoteEntries('notes', snap.docs.map(d => this.toEntry(d)));
          } catch (e) {
            console.error('[CloudSync] Error procesando snapshot de notes', e);
          }
        },
        err => console.warn('[CloudSync] notes listener', err)
      ));
    });
  }

  /** Por cada campaña: personajes de la mesa y eventos del DM. */
  private syncCampaignListeners(campaignIds: string[]) {
    const fs = this.fs!;
    const db = this.db!;
    const wanted = new Set(campaignIds);

    for (const [cid, unsubs] of this.campaignUnsubs) {
      if (!wanted.has(cid)) {
        unsubs.forEach(u => u());
        this.campaignUnsubs.delete(cid);
        campaignStore.applyRemoteCharacters(`campaign:${cid}`, null);
      }
    }

    for (const cid of wanted) {
      if (this.campaignUnsubs.has(cid)) continue;
      const unsubs: Unsubscribe[] = [];

      unsubs.push(fs.onSnapshot(
        fs.query(fs.collection(db, 'characters'), fs.where('campaignId', '==', cid)),
        snap => {
          campaignStore.applyRemoteCharacters(`campaign:${cid}`, snap.docs.map(d => this.toCharacter(d)));
          this.loadProfiles(snap.docs.map(d => (d.data() as any).userId).filter(Boolean));
        },
        err => console.warn(`[CloudSync] characters of ${cid}`, err)
      ));

      const since = Date.now() - DM_EVENT_WINDOW_MS;
      unsubs.push(fs.onSnapshot(
        fs.query(
          fs.collection(db, 'campaigns', cid, 'dm_events'),
          fs.where('timestamp', '>', since),
          fs.orderBy('timestamp', 'asc')
        ),
        snap => {
          for (const change of snap.docChanges()) {
            if (change.type !== 'added') continue;
            // Las escrituras propias ya se despacharon localmente en campaignStore.sendDmEvent.
            if (change.doc.metadata.hasPendingWrites) continue;
            const event = change.doc.data() as DmEvent;
            if (this.seenDmEvents.has(change.doc.id)) continue;
            this.seenDmEvents.add(change.doc.id);
            if (Date.now() - (event.timestamp || 0) < DM_EVENT_WINDOW_MS) {
              window.dispatchEvent(new CustomEvent('dm-event-received', { detail: event }));
            }
          }
        },
        err => console.warn(`[CloudSync] dm_events of ${cid}`, err)
      ));

      this.campaignUnsubs.set(cid, unsubs);
    }
  }

  /**
   * Diario de la campaña activa. Las rules no filtran resultados, así que cada query
   * tiene que pedir solo lo que el usuario puede leer.
   */
  private syncJournalListeners() {
    if (!this.fs || !this.db || !this.uid) return;
    const fs = this.fs;
    const db = this.db;
    const uid = this.uid;
    const cid = campaignStore.getActiveCampaignId();
    const camp = cid ? campaignStore.getCampaign(cid) : null;
    const isDm = cid ? campaignStore.isCurrentUserDm(cid) : false;
    const key = camp ? `${cid}:${isDm}` : '';
    if (key === this.journalKey) return;

    this.journalUnsubs.forEach(u => u());
    this.journalUnsubs = [];
    journalStore.applyRemoteEntries('party', null);
    journalStore.applyRemoteEntries('player', null);
    journalStore.applyRemoteEntries('dm', null);
    journalStore.applyRemoteEntries('to_dm', null);

    if (!camp || !cid) {
      this.journalKey = '';
      return;
    }
    this.journalKey = key;

    const col = fs.collection(db, 'campaigns', cid, 'journal');
    const listen = (scope: string, q: any) => {
      this.journalUnsubs.push(fs.onSnapshot(
        q,
        (snap: any) => journalStore.applyRemoteEntries(scope, snap.docs.map((d: any) => this.toEntry(d, cid))),
        (err: any) => console.warn(`[CloudSync] journal ${scope}`, err)
      ));
    };

    // Consultas sin orderBy a nivel Firestore para no exigir composite indexes en producción.
    // journalStore ordena cronológicamente en memoria con sort por timestamp.
    listen('party', fs.query(col, fs.where('visibility', '==', 'party')));
    listen('player', fs.query(col, fs.where('visibility', '==', 'player'), fs.where('authorUid', '==', uid)));
    if (isDm) {
      listen('dm', fs.query(col, fs.where('visibility', '==', 'dm')));
      // El DM recibe los mensajes de todos los jugadores de la campaña.
      listen('to_dm', fs.query(col, fs.where('visibility', '==', 'to_dm')));
    } else {
      listen('to_dm', fs.query(col, fs.where('visibility', '==', 'to_dm'), fs.where('authorUid', '==', uid)));
    }
  }

  private async loadProfiles(uids: string[]) {
    const fs = this.fs!;
    const missing = Array.from(new Set(uids)).filter(id => id && !this.knownProfiles.has(id));
    if (missing.length === 0) return;
    missing.forEach(id => this.knownProfiles.add(id));
    const profiles = await Promise.all(missing.map(async id => {
      try {
        const snap = await fs.getDoc(fs.doc(this.db!, 'users', id));
        const data = snap.exists() ? (snap.data() as any) : {};
        return { id, name: data.name || 'Aventurero', email: '', avatarUrl: data.avatarUrl } as AppUser;
      } catch (_) {
        this.knownProfiles.delete(id);
        return null;
      }
    }));
    userStore.upsertProfiles(profiles.filter(Boolean) as AppUser[]);
  }

  private bindStoreEvents() {
    window.addEventListener('active-campaign-changed', () => {
      this.syncCampaignListeners(campaignStore.getCampaigns().map(c => c.id));
      this.syncJournalListeners();
    });
    window.addEventListener('campaigns-updated', () => {
      this.syncCampaignListeners(campaignStore.getCampaigns().map(c => c.id));
      this.syncJournalListeners();
    });

    // Si la ficha activa cambió en otro dispositivo (o el DM le ajustó los PG), se recarga.
    window.addEventListener('all-characters-updated', () => {
      const active = characterStore.get();
      if (!active?.id || this.isCharacterWritePending(active.id)) return;
      const remote = campaignStore.getCharacter(active.id);
      if (!remote || !campaignStore.isCharacterOwner(remote)) return;
      const next = recalculateCharacter(toPlain(remote));
      if (JSON.stringify(stripVolatile(next)) !== JSON.stringify(stripVolatile(active))) {
        characterStore.loadCharacter(next, true);
      }
    });

    window.addEventListener('beforeunload', () => this.flushCharacters());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flushCharacters();
    });
  }

  private toCharacter(d: any): CharacterData {
    const data = d.data() as any;
    return { ...data, id: d.id } as CharacterData;
  }

  private toEntry(d: any, defaultCampaignId?: string): JournalEntry {
    const data = d.data() as any;
    const visibility: JournalVisibility = data.visibility || 'party';
    const { visibility: _v, ...rest } = data;
    const campaignId = data.campaignId || defaultCampaignId || (d.ref?.parent?.parent?.id) || undefined;
    return withVisibility({ ...rest, campaignId, id: d.id } as JournalEntry, visibility);
  }

  // ---------------------------------------------------------------------------
  // Escrituras
  // ---------------------------------------------------------------------------

  private writeCampaignChanges(changes: DocChanges) {
    const fs = this.fs!;
    const db = this.db!;
    const uid = this.uid!;
    // Las fichas pendientes van primero: al borrar una campaña el DM desvincula personajes
    // y esa regla necesita que la campaña todavía exista.
    this.flushCharacters();

    // Un batch por campaña para que un rechazo de las rules no arrastre a las demás.
    for (const { id, data } of changes.creates) {
      const batch = fs.writeBatch(db);
      batch.set(fs.doc(db, 'campaigns', id), data);
      if (data.inviteCode) {
        batch.set(fs.doc(db, 'invites', data.inviteCode), { campaignId: id, createdBy: uid, createdAt: Date.now() });
        this.inviteCodes.set(id, data.inviteCode);
      }
      this.commit(batch, `create:campaigns/${id}`);
    }

    for (const { id, fields, removedKeys } of changes.updates) {
      const batch = fs.writeBatch(db);
      const payload: Record<string, any> = { ...fields };
      removedKeys.forEach(k => { payload[k] = fs.deleteField(); });
      batch.update(fs.doc(db, 'campaigns', id), payload);
      if (fields.inviteCode) {
        const previous = this.inviteCodes.get(id);
        batch.set(fs.doc(db, 'invites', fields.inviteCode), { campaignId: id, createdBy: uid, createdAt: Date.now() });
        if (previous && previous !== fields.inviteCode) batch.delete(fs.doc(db, 'invites', previous));
        this.inviteCodes.set(id, fields.inviteCode);
      }
      this.commit(batch, `update:campaigns/${id}`);
    }

    for (const id of changes.deletes) {
      const batch = fs.writeBatch(db);
      const code = this.inviteCodes.get(id);
      if (code) batch.delete(fs.doc(db, 'invites', code));
      batch.delete(fs.doc(db, 'campaigns', id));
      this.inviteCodes.delete(id);
      this.commit(batch, `delete:campaigns/${id}`);
    }
  }

  private writeCharacterChanges(changes: DocChanges) {
    const fs = this.fs!;
    const db = this.db!;

    for (const { id, data } of changes.creates) {
      this.flushCharacter(id);
      fs.setDoc(fs.doc(db, 'characters', id), { ...data, updatedAt: Date.now() }).catch(err => this.onWriteError(err, `create:characters/${id}`));
    }

    // Los cambios de la ficha (cada click de PG, etc.) se agrupan con debounce por personaje.
    for (const { id, fields, removedKeys } of changes.updates) {
      const known = campaignStore.getCharacter(id);
      const isOwner = !known || !known.userId || known.userId === this.uid || (this.uid && known.userId === 'user-me');
      let effectiveFields = fields;
      let effectiveRemoved = removedKeys;
      // Sobre fichas ajenas el DM solo puede escribir la inspiración por esta vía (los PG van por mutateHp).
      if (!isOwner && fields.campaignId !== null) {
        effectiveFields = {};
        if ('inspiration' in fields) effectiveFields.inspiration = fields.inspiration;
        effectiveRemoved = [];
        if (Object.keys(effectiveFields).length === 0) continue;
      }

      const pending = this.pendingCharacters.get(id);
      if (pending) clearTimeout(pending.timer);
      const merged: PendingCharacterWrite = pending || { fields: {}, removedKeys: new Set(), timer: undefined as any };
      Object.assign(merged.fields, effectiveFields);
      Object.keys(effectiveFields).forEach(k => merged.removedKeys.delete(k));
      effectiveRemoved.forEach(k => {
        merged.removedKeys.add(k);
        delete merged.fields[k];
      });
      merged.timer = setTimeout(() => this.flushCharacter(id), CHARACTER_DEBOUNCE_MS);
      this.pendingCharacters.set(id, merged);
    }

    for (const id of changes.deletes) {
      const pending = this.pendingCharacters.get(id);
      if (pending) clearTimeout(pending.timer);
      this.pendingCharacters.delete(id);
      fs.deleteDoc(fs.doc(db, 'characters', id)).catch(err => this.onWriteError(err, `delete:characters/${id}`));
    }
  }

  private flushCharacter(id: string) {
    const pending = this.pendingCharacters.get(id);
    if (!pending || !this.fs || !this.db) return;
    clearTimeout(pending.timer);
    this.pendingCharacters.delete(id);
    const fs = this.fs;
    const now = Date.now();
    this.lastLocalWriteAt.set(id, now);
    this.inFlightCharacters.set(id, (this.inFlightCharacters.get(id) || 0) + 1);
    const payload: Record<string, any> = { ...pending.fields, updatedAt: now };
    pending.removedKeys.forEach(k => { payload[k] = fs.deleteField(); });
    fs.updateDoc(fs.doc(this.db, 'characters', id), payload)
      .catch(err => this.onWriteError(err, `update:characters/${id}`))
      .finally(() => {
        const cur = (this.inFlightCharacters.get(id) || 1) - 1;
        if (cur <= 0) this.inFlightCharacters.delete(id);
        else this.inFlightCharacters.set(id, cur);
      });
  }

  private flushCharacters() {
    Array.from(this.pendingCharacters.keys()).forEach(id => this.flushCharacter(id));
  }

  /**
   * Cambio de PG atómico (ver hpTransaction.ts). Si falla, avisa con un mensaje específico de PG
   * (el genérico de "sin conexión" promete reintentar, y una transacción no se encola offline).
   */
  private async mutateCharacterHp(id: string, op: HpOp): Promise<HpTransactionResult> {
    if (!this.fs || !this.db) {
      const err = new Error('La sincronización en la nube no está lista.');
      this.reportHpError(err);
      throw err;
    }
    try {
      // Sin red una transacción no se encola (a diferencia de updateDoc): se rechaza enseguida
      // para no dejar un valor optimista que nunca se va a guardar.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw Object.assign(new Error('Sin conexión.'), { code: 'unavailable' });
      }
      return await withTimeout(runHpTransaction(this.fs, this.db, id, op), HP_TRANSACTION_TIMEOUT_MS);
    } catch (err) {
      console.error('[CloudSync] Cambio de PG rechazado', err);
      this.reportHpError(err);
      throw err;
    }
  }

  private reportHpError(err: any) {
    let message: string;
    if (err?.code === 'permission-denied') {
      message = 'No tenés permiso para cambiar estos PG (¿la partida está en pausa?). Se restauró el valor anterior.';
    } else if (err?.code === 'unavailable' || err?.code === 'failed-precondition' || err?.code === 'deadline-exceeded') {
      message = 'Sin conexión: el cambio de PG no se guardó y se restauró el valor anterior.';
    } else {
      message = `No se pudo guardar el cambio de PG (${err?.message || err}). Se restauró el valor anterior.`;
    }
    window.dispatchEvent(new CustomEvent('cloud-error', { detail: { message, code: err?.code } }));
  }

  private writeDmEvent(event: DmEvent) {
    if (!this.fs || !this.db) return;
    const camp = campaignStore.getCampaign(event.campaignId);
    if (!camp || camp.status !== 'active') return;
    this.seenDmEvents.add(event.id);
    this.fs.setDoc(this.fs.doc(this.db, 'campaigns', event.campaignId, 'dm_events', event.id), toPlain(event))
      .catch(err => console.warn(`[CloudSync] No se pudo emitir dm_event [${event.campaignId}/${event.id}]`, err));
  }

  private writeJournalEntry(entry: JournalEntry) {
    if (!this.fs || !this.db || !this.uid) return;
    const fs = this.fs;
    const campaignId = entry.campaignId || campaignStore.getActiveCampaignId();
    let visibility = getEntryVisibility(entry);

    if (campaignId && campaignStore.getCampaign(campaignId)) {
      const camp = campaignStore.getCampaign(campaignId)!;
      const isDm = campaignStore.isCurrentUserDm(campaignId);
      const isActive = camp.status === 'active';

      // En Firestore (firestore.rules), la creación de entradas en /campaigns/{cid}/journal
      // exige canPlay() (partida 'active') para los jugadores.
      // Si la partida está pausada o terminada:
      // - El DM solo puede escribir notas secretas (visibility == 'dm') o eventos de sistema (status).
      // - Las entradas 'party' (como cambios de equipo, descansos, etc.) no se pueden escribir en la bitácora
      //   remota de la mesa hasta que la partida esté activa.
      if (!isActive) {
        if (!isDm) return;
        if (visibility !== 'dm' && (entry as any).systemEvent !== 'status') return;
      }

      // Solo el DM puede escribir entradas 'dm'; si no lo es, queda como nota de jugador.
      if (visibility === 'dm' && !isDm) visibility = 'player';
      // Un "mensaje al DM" escrito por el propio DM es una nota de DM.
      if (visibility === 'to_dm' && isDm) visibility = 'dm';
      const data = { ...toPlain(withVisibility(entry, visibility)), campaignId, authorUid: this.uid, visibility };
      delete (data as any).isDmOnly;
      delete (data as any).isPlayerOnly;
      delete (data as any).isForDm;
      fs.setDoc(fs.doc(this.db, 'campaigns', campaignId, 'journal', entry.id), data).catch(err => {
        console.warn(`[CloudSync] No se pudo guardar entrada en bitácora [journal:${campaignId}/${entry.id}]`, err);
      });
    } else {
      // Sin campaña no hay DM: lo restringido queda como nota personal.
      if (visibility !== 'party') visibility = 'player';
      const data = { ...toPlain(withVisibility(entry, visibility)), authorUid: this.uid, visibility };
      delete (data as any).isDmOnly;
      delete (data as any).isPlayerOnly;
      delete (data as any).isForDm;
      delete (data as any).campaignId;
      fs.setDoc(fs.doc(this.db, 'users', this.uid, 'notes', entry.id), data).catch(err => {
        console.warn(`[CloudSync] No se pudo guardar nota personal [notes:${this.uid}/${entry.id}]`, err);
      });
    }
  }

  private removeJournalEntry(entry: JournalEntry) {
    if (!this.fs || !this.db || !this.uid) return;
    const campaignId = entry.campaignId || campaignStore.getActiveCampaignId();
    if (campaignId && campaignStore.getCampaign(campaignId)) {
      const camp = campaignStore.getCampaign(campaignId);
      const isDm = camp ? campaignStore.isCurrentUserDm(campaignId) : false;
      const isActive = camp ? camp.status === 'active' : false;
      if (!isActive && !isDm) return;
    }
    const ref = campaignId && campaignStore.getCampaign(campaignId)
      ? this.fs.doc(this.db, 'campaigns', campaignId, 'journal', entry.id)
      : this.fs.doc(this.db, 'users', this.uid, 'notes', entry.id);
    this.fs.deleteDoc(ref).catch(err => {
      console.warn(`[CloudSync] No se pudo eliminar entrada en bitácora [delete:${campaignId ? `journal:${campaignId}` : `notes:${this.uid}`}/${entry.id}]`, err);
    });
  }

  private commit(batch: { commit(): Promise<void> }, context?: string) {
    batch.commit().catch(err => this.onWriteError(err, context));
  }

  private onWriteError(err: any, context?: string) {
    console.error(`[CloudSync] Escritura rechazada${context ? ` [${context}]` : ''}`, err);
    this.reportError(err);
  }

  // ---------------------------------------------------------------------------
  // Invitaciones
  // ---------------------------------------------------------------------------

  /** Devuelve el id de la campaña a la que se unió. */
  public async joinByInvite(rawCode: string): Promise<{ campaignId: string; alreadyMember: boolean }> {
    await this.ready();
    if (!this.fs || !this.db || !this.uid) {
      throw new Error('Las invitaciones solo funcionan con la sincronización en la nube activa.');
    }
    const fs = this.fs;
    const code = normalizeInviteCode(rawCode);
    if (!code) throw new Error('Ingresá un código de invitación.');

    const invite = await fs.getDoc(fs.doc(this.db, 'invites', code)).catch(() => null);
    if (!invite || !invite.exists()) {
      throw new Error('El código no existe o fue regenerado por el DM.');
    }
    const campaignId = (invite.data() as any).campaignId as string;

    if (campaignStore.getCampaign(campaignId)) {
      return { campaignId, alreadyMember: true };
    }

    await fs.updateDoc(fs.doc(this.db, 'campaigns', campaignId), {
      memberUserIds: fs.arrayUnion(this.uid),
      joinedWith: code,
    });
    await waitFor(() => Boolean(campaignStore.getCampaign(campaignId)), 'campaigns-updated', 8000);
    return { campaignId, alreadyMember: false };
  }
}

/** La configuración de paneles es por dispositivo: no fuerza recargar la ficha. */
function stripVolatile(char: any) {
  const { updatedAt, layoutConfig, hpRev, ...rest } = char || {};
  return rest;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(Object.assign(new Error('El servidor no respondió a tiempo.'), { code: 'deadline-exceeded' }));
    }, ms);
    promise.then(
      v => { clearTimeout(timer); resolve(v); },
      e => { clearTimeout(timer); reject(e); }
    );
  });
}

function waitFor(check: () => boolean, eventName: string, timeoutMs: number): Promise<void> {
  if (check()) return Promise.resolve();
  return new Promise(resolve => {
    const done = () => {
      clearTimeout(timer);
      window.removeEventListener(eventName, onEvent);
      resolve();
    };
    const onEvent = () => { if (check()) done(); };
    const timer = setTimeout(done, timeoutMs);
    window.addEventListener(eventName, onEvent);
  });
}

export const cloudSession = new CloudSession();

/**
 * uid del usuario logueado (= userStore.getCurrentUser().id en modo nube). Los servicios del VTT
 * lo usan para no depender de userStore. Esperar `cloudSession.ready()` antes de llamarla.
 */
export function getCurrentUid(): string | null {
  return cloudSession.getUid();
}
