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
import { onAuthChange, signOut as authSignOut, toAppUser } from '../firebase/authService.ts';
import { normalizeInviteCode } from '../utils/ids.ts';
import { toPlain, type DocChanges } from './cloudTypes.ts';
import { migrateLocalData } from './migrateLocalData.ts';
import { startRoomSync } from './roomService.ts';

export type CloudSessionState = 'local' | 'loading' | 'signed-out' | 'ready';

const CHARACTER_DEBOUNCE_MS = 400;
const DM_EVENT_WINDOW_MS = 45000;
const JOURNAL_LIMIT = 150;

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
  private seenDmEvents = new Set<string>();

  constructor() {
    this.readyPromise = new Promise(resolve => {
      this.resolveReady = resolve;
    });
  }

  /** Se resuelve en modo local enseguida, o cuando hay sesión y llegaron los primeros datos. */
  public ready(): Promise<void> {
    this.start();
    return this.readyPromise;
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

    onAuthChange(user => {
      if (user) {
        this.handleSignIn(user).catch(err => {
          console.error('[CloudSync] Error al iniciar la sesión en la nube', err);
          this.reportError(err);
        });
      } else if (this.uid) {
        // Cerró sesión en otra pestaña: se recarga para limpiar todo el estado en memoria.
        window.location.reload();
      } else {
        this.setState('signed-out');
      }
    }).catch(err => {
      console.error('[CloudSync] No se pudo inicializar Firebase', err);
      this.reportError(err);
      this.setState('signed-out');
    });
  }

  public async signOut() {
    this.flushCharacters();
    await authSignOut();
    window.location.reload();
  }

  // ---------------------------------------------------------------------------
  // Sesión
  // ---------------------------------------------------------------------------

  private async handleSignIn(user: User) {
    if (this.uid === user.uid) return;
    this.setState('loading');
    const { db } = await getFirebase();
    this.db = db;
    this.fs = await import('firebase/firestore');
    this.uid = user.uid;

    const me = await this.ensureProfile(user);
    userStore.enterCloudMode(me);
    this.knownProfiles.add(me.id);

    campaignStore.attachCloud({
      applyCampaignChanges: changes => this.writeCampaignChanges(changes),
      applyCharacterChanges: changes => this.writeCharacterChanges(changes),
      isCharacterPending: id => this.pendingCharacters.has(id),
      sendDmEvent: event => this.writeDmEvent(event),
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

    await this.subscribeBase();
    this.bindStoreEvents();
    // Sala RTDB del VTT (/rooms/{liveRoomId}) de cada campaña donde el usuario es DM.
    startRoomSync(() => this.uid);

    if (migration?.activeCharacter) {
      characterStore.loadCharacter(migration.activeCharacter);
    }
    if (migration && (migration.campaigns || migration.characters || migration.entries)) {
      window.dispatchEvent(new CustomEvent('cloud-migration-done', { detail: migration }));
    }

    this.setState('ready');
    this.resolveReady();
  }

  private async ensureProfile(user: User): Promise<AppUser> {
    const fs = this.fs!;
    const ref = fs.doc(this.db!, 'users', user.uid);
    const snap = await fs.getDoc(ref);
    const existing = snap.exists() ? (snap.data() as any) : null;
    const me = toAppUser(user, existing ? { name: existing.name, avatarUrl: existing.avatarUrl } : undefined);
    // El email no se guarda en el perfil público (lo pueden leer otros jugadores).
    const profile: Record<string, any> = { name: me.name };
    if (me.avatarUrl) profile.avatarUrl = me.avatarUrl;
    if (!existing) profile.createdAt = Date.now();
    if (!existing || existing.name !== profile.name || existing.avatarUrl !== profile.avatarUrl) {
      await fs.setDoc(ref, profile, { merge: true });
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
      const maybeResolve = () => {
        if (campaignsLoaded && charactersLoaded) resolve();
      };

      this.baseUnsubs.push(fs.onSnapshot(
        fs.query(fs.collection(db, 'campaigns'), fs.where('memberUserIds', 'array-contains', uid)),
        snap => {
          const campaigns = snap.docs.map(d => ({ ...(d.data() as Campaign), id: d.id }));
          this.inviteCodes = new Map(campaigns.filter(c => c.inviteCode).map(c => [c.id, c.inviteCode!]));
          campaignStore.applyRemoteCampaigns(campaigns);
          this.syncCampaignListeners(campaigns.map(c => c.id));
          this.loadProfiles(campaigns.flatMap(c => c.memberUserIds || []));
          this.syncJournalListeners();
          campaignsLoaded = true;
          maybeResolve();
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
          campaignStore.applyRemoteCharacters('mine', snap.docs.map(d => this.toCharacter(d)));
          charactersLoaded = true;
          maybeResolve();
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
        snap => journalStore.applyRemoteEntries('notes', snap.docs.map(d => this.toEntry(d))),
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
    const fs = this.fs!;
    const db = this.db!;
    const uid = this.uid!;
    const cid = campaignStore.getActiveCampaignId();
    const isDm = cid ? campaignStore.isCurrentUserDm(cid) : false;
    const key = cid ? `${cid}:${isDm}` : '';
    if (key === this.journalKey) return;

    this.journalUnsubs.forEach(u => u());
    this.journalUnsubs = [];
    journalStore.applyRemoteEntries('party', null);
    journalStore.applyRemoteEntries('player', null);
    journalStore.applyRemoteEntries('dm', null);
    journalStore.applyRemoteEntries('to_dm', null);
    this.journalKey = key;
    if (!cid || !campaignStore.getCampaign(cid)) return;

    const col = fs.collection(db, 'campaigns', cid, 'journal');
    const listen = (scope: string, q: any) => {
      this.journalUnsubs.push(fs.onSnapshot(
        q,
        (snap: any) => journalStore.applyRemoteEntries(scope, snap.docs.map((d: any) => this.toEntry(d))),
        (err: any) => console.warn(`[CloudSync] journal ${scope}`, err)
      ));
    };

    listen('party', fs.query(col, fs.where('visibility', '==', 'party'), fs.orderBy('timestamp', 'desc'), fs.limit(JOURNAL_LIMIT)));
    listen('player', fs.query(col, fs.where('visibility', '==', 'player'), fs.where('authorUid', '==', uid), fs.orderBy('timestamp', 'desc'), fs.limit(JOURNAL_LIMIT)));
    if (isDm) {
      listen('dm', fs.query(col, fs.where('visibility', '==', 'dm'), fs.orderBy('timestamp', 'desc'), fs.limit(JOURNAL_LIMIT)));
      // El DM recibe los mensajes de todos los jugadores.
      listen('to_dm', fs.query(col, fs.where('visibility', '==', 'to_dm'), fs.orderBy('timestamp', 'desc'), fs.limit(JOURNAL_LIMIT)));
    } else {
      listen('to_dm', fs.query(col, fs.where('visibility', '==', 'to_dm'), fs.where('authorUid', '==', uid), fs.orderBy('timestamp', 'desc'), fs.limit(JOURNAL_LIMIT)));
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
    window.addEventListener('active-campaign-changed', () => this.syncJournalListeners());
    window.addEventListener('campaigns-updated', () => this.syncJournalListeners());

    // Si la ficha activa cambió en otro dispositivo (o el DM le ajustó los PG), se recarga.
    window.addEventListener('all-characters-updated', () => {
      const active = characterStore.get();
      if (!active?.id || this.pendingCharacters.has(active.id)) return;
      const remote = campaignStore.getCharacter(active.id);
      if (!remote || !campaignStore.isCharacterOwner(remote)) return;
      const next = recalculateCharacter(toPlain(remote));
      if (JSON.stringify(stripVolatile(next)) !== JSON.stringify(stripVolatile(active))) {
        characterStore.loadCharacter(next);
      }
    });

    window.addEventListener('beforeunload', () => this.flushCharacters());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flushCharacters();
    });
  }

  private toCharacter(d: any): CharacterData {
    const data = d.data() as any;
    delete data.updatedAt;
    return { ...data, id: d.id } as CharacterData;
  }

  private toEntry(d: any): JournalEntry {
    const data = d.data() as any;
    const visibility: JournalVisibility = data.visibility || 'party';
    const { visibility: _v, ...rest } = data;
    return withVisibility({ ...rest, id: d.id } as JournalEntry, visibility);
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
      this.commit(batch);
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
      this.commit(batch);
    }

    for (const id of changes.deletes) {
      const batch = fs.writeBatch(db);
      const code = this.inviteCodes.get(id);
      if (code) batch.delete(fs.doc(db, 'invites', code));
      batch.delete(fs.doc(db, 'campaigns', id));
      this.inviteCodes.delete(id);
      this.commit(batch);
    }
  }

  private writeCharacterChanges(changes: DocChanges) {
    const fs = this.fs!;
    const db = this.db!;

    for (const { id, data } of changes.creates) {
      this.flushCharacter(id);
      fs.setDoc(fs.doc(db, 'characters', id), { ...data, updatedAt: Date.now() }).catch(err => this.onWriteError(err));
    }

    // Los cambios de la ficha (cada click de PG, etc.) se agrupan con debounce por personaje.
    for (const { id, fields, removedKeys } of changes.updates) {
      const pending = this.pendingCharacters.get(id);
      if (pending) clearTimeout(pending.timer);
      const merged: PendingCharacterWrite = pending || { fields: {}, removedKeys: new Set(), timer: undefined as any };
      Object.assign(merged.fields, fields);
      Object.keys(fields).forEach(k => merged.removedKeys.delete(k));
      removedKeys.forEach(k => {
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
      fs.deleteDoc(fs.doc(db, 'characters', id)).catch(err => this.onWriteError(err));
    }
  }

  private flushCharacter(id: string) {
    const pending = this.pendingCharacters.get(id);
    if (!pending || !this.fs || !this.db) return;
    clearTimeout(pending.timer);
    this.pendingCharacters.delete(id);
    const fs = this.fs;
    const payload: Record<string, any> = { ...pending.fields, updatedAt: Date.now() };
    pending.removedKeys.forEach(k => { payload[k] = fs.deleteField(); });
    fs.updateDoc(fs.doc(this.db, 'characters', id), payload).catch(err => this.onWriteError(err));
  }

  private flushCharacters() {
    Array.from(this.pendingCharacters.keys()).forEach(id => this.flushCharacter(id));
  }

  private writeDmEvent(event: DmEvent) {
    if (!this.fs || !this.db) return;
    this.seenDmEvents.add(event.id);
    this.fs.setDoc(this.fs.doc(this.db, 'campaigns', event.campaignId, 'dm_events', event.id), toPlain(event))
      .catch(err => this.onWriteError(err));
  }

  private writeJournalEntry(entry: JournalEntry) {
    if (!this.fs || !this.db || !this.uid) return;
    const fs = this.fs;
    const campaignId = entry.campaignId || campaignStore.getActiveCampaignId();
    let visibility = getEntryVisibility(entry);

    if (campaignId && campaignStore.getCampaign(campaignId)) {
      const isDm = campaignStore.isCurrentUserDm(campaignId);
      // Solo el DM puede escribir entradas 'dm'; si no lo es, queda como nota de jugador.
      if (visibility === 'dm' && !isDm) visibility = 'player';
      // Un "mensaje al DM" escrito por el propio DM es una nota de DM.
      if (visibility === 'to_dm' && isDm) visibility = 'dm';
      const data = { ...toPlain(withVisibility(entry, visibility)), campaignId, authorUid: this.uid, visibility };
      delete (data as any).isDmOnly;
      delete (data as any).isPlayerOnly;
      delete (data as any).isForDm;
      fs.setDoc(fs.doc(this.db, 'campaigns', campaignId, 'journal', entry.id), data).catch(err => this.onWriteError(err));
    } else {
      // Sin campaña no hay DM: lo restringido queda como nota personal.
      if (visibility !== 'party') visibility = 'player';
      const data = { ...toPlain(withVisibility(entry, visibility)), authorUid: this.uid, visibility };
      delete (data as any).isDmOnly;
      delete (data as any).isPlayerOnly;
      delete (data as any).isForDm;
      delete (data as any).campaignId;
      fs.setDoc(fs.doc(this.db, 'users', this.uid, 'notes', entry.id), data).catch(err => this.onWriteError(err));
    }
  }

  private removeJournalEntry(entry: JournalEntry) {
    if (!this.fs || !this.db || !this.uid) return;
    const ref = entry.campaignId
      ? this.fs.doc(this.db, 'campaigns', entry.campaignId, 'journal', entry.id)
      : this.fs.doc(this.db, 'users', this.uid, 'notes', entry.id);
    this.fs.deleteDoc(ref).catch(err => this.onWriteError(err));
  }

  private commit(batch: { commit(): Promise<void> }) {
    batch.commit().catch(err => this.onWriteError(err));
  }

  private onWriteError(err: any) {
    console.error('[CloudSync] Escritura rechazada', err);
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
  const { updatedAt, layoutConfig, ...rest } = char || {};
  return rest;
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
