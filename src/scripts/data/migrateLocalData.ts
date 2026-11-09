// src/scripts/data/migrateLocalData.ts
// Primer login: sube a la cuenta los datos que este navegador tenía en localStorage.
import type { Firestore } from 'firebase/firestore';
import type { Campaign } from '../models/campaign.ts';
import type { CharacterData } from '../models/character.ts';
import type { JournalEntry } from '../models/journal.ts';
import type { AppUser } from '../models/user.ts';
import { defaultJournal } from './defaultJournal.ts';
import { getEntryVisibility, withVisibility } from '../state/journalStore.ts';
import { generateInviteCode, slugify } from '../utils/ids.ts';
import { toPlain } from './cloudTypes.ts';
import { showConfirm } from '../ui/notify.ts';

const KEYS = {
  campaigns: 'dnd_campaigns_v1',
  characters: 'dnd_all_characters_v1',
  journal: 'dnd_session_journal_v1',
  currentUser: 'dnd_current_user_id_v1',
  activeCampaign: 'dnd_active_campaign_id_v1',
  activeCharacter: 'dnd_active_character_v1',
};
const MIGRATION_DONE_KEY = 'dnd_local_migration_done';
const BACKUP_KEYS = [KEYS.campaigns, KEYS.characters, KEYS.journal, 'dnd_users_v1', 'dnd_sync_config_v1'];
const BATCH_LIMIT = 400;

export interface MigrationSummary {
  campaigns: number;
  characters: number;
  entries: number;
  /** Ficha activa de este navegador con su id nuevo, para recargarla sin esperar. */
  activeCharacter?: CharacterData;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (_) {
    return null;
  }
}

function newId(name: string | undefined, fallback: string): string {
  return `${slugify(name, fallback)}-${Math.random().toString(36).substring(2, 8)}`;
}

function backupLocalKeys() {
  for (const key of BACKUP_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) {
      localStorage.setItem(`${key}_backup`, value);
      localStorage.removeItem(key);
    }
  }
}

export async function migrateLocalData(db: Firestore, me: AppUser): Promise<MigrationSummary | null> {
  // Si en este navegador ya se resolvió la migración (completada o descartada), no volver a consultar nunca
  if (typeof window !== 'undefined' && localStorage.getItem(MIGRATION_DONE_KEY)) {
    return null;
  }

  const fs = await import('firebase/firestore');
  const profileRef = fs.doc(db, 'users', me.id);
  // Lectura con timeout de 2.5s para no demorar el inicio de sesión
  const profile = await Promise.race([
    fs.getDoc(profileRef),
    new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Profile check timeout')), 2500)),
  ]).catch(() => null);

  if (profile && profile.exists() && (profile.data() as any).migratedAt) {
    if (typeof window !== 'undefined') localStorage.setItem(MIGRATION_DONE_KEY, 'true');
    return null;
  }

  const markDone = async () => {
    if (typeof window !== 'undefined') localStorage.setItem(MIGRATION_DONE_KEY, 'true');
    await fs.setDoc(profileRef, { migratedAt: Date.now() }, { merge: true }).catch(() => {});
  };

  const localUserId = localStorage.getItem(KEYS.currentUser) || 'user-me';
  const isMine = (ownerId?: string) => !ownerId || ownerId === localUserId;

  const campaigns = (readJson<Campaign[]>(KEYS.campaigns) || [])
    .filter(c => c && (c.dmId === localUserId || c.creatorId === localUserId));
  const characters = (readJson<CharacterData[]>(KEYS.characters) || [])
    .filter(c => c && isMine(c.userId));
  const defaultIds = new Set(defaultJournal.map(e => e.id));
  const entries = (readJson<JournalEntry[]>(KEYS.journal) || [])
    .filter(e => e && !defaultIds.has(e.id));

  if (campaigns.length === 0 && characters.length === 0 && entries.length === 0) {
    await markDone();
    return null;
  }

  const accepted = await showConfirm(
    `• ${campaigns.length} campaña(s) donde sos DM o creador\n` +
    `• ${characters.length} personaje(s)\n` +
    `• ${entries.length} entrada(s) del diario\n\n` +
    `Se guarda una copia local por las dudas.`,
    { title: '¿Importar los datos de este navegador a tu cuenta?', confirmText: 'Importar', cancelText: 'No, empezar de cero' }
  );
  if (!accepted) {
    backupLocalKeys();
    await markDone();
    return null;
  }

  // Los ids locales (p.ej. "atlas") pueden repetirse entre usuarios: se generan nuevos.
  const campaignIdMap = new Map<string, string>();
  const characterIdMap = new Map<string, string>();
  campaigns.forEach(c => campaignIdMap.set(c.id, newId(c.name, 'campana')));
  characters.forEach(c => characterIdMap.set(c.id, newId(c.name, 'personaje')));

  const runBatches = async (ops: ((batch: ReturnType<typeof fs.writeBatch>) => void)[]) => {
    for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
      const batch = fs.writeBatch(db);
      ops.slice(i, i + BATCH_LIMIT).forEach(op => op(batch));
      await batch.commit();
    }
  };

  // 1) Campañas e invitaciones (las rules de personajes y diario necesitan que existan).
  await runBatches(campaigns.map(c => (batch) => {
    const id = campaignIdMap.get(c.id)!;
    const inviteCode = generateInviteCode();
    const { characterIds, isCurrentUserDm, ...rest } = c as any;
    batch.set(fs.doc(db, 'campaigns', id), toPlain({
      ...rest,
      id,
      creatorId: me.id,
      dmId: me.id,
      dmName: me.name,
      memberUserIds: [me.id],
      inviteCode,
    }));
    batch.set(fs.doc(db, 'invites', inviteCode), { campaignId: id, createdBy: me.id, createdAt: Date.now() });
  }));

  // 2) Personajes.
  await runBatches(characters.map(c => (batch) => {
    const id = characterIdMap.get(c.id)!;
    const campaignId = c.campaignId ? campaignIdMap.get(c.campaignId) || null : null;
    const data: any = toPlain({ ...c, id, userId: me.id, playerName: me.name, campaignId });
    if (!campaignId) delete data.sessionContext;
    batch.set(fs.doc(db, 'characters', id), { ...data, updatedAt: Date.now() });
  }));

  // 3) Diario: lo de campañas importadas va a la campaña; el resto, a las notas personales.
  await runBatches(entries.map(e => (batch) => {
    const campaignId = e.campaignId ? campaignIdMap.get(e.campaignId) : undefined;
    const characterId = e.characterId ? characterIdMap.get(e.characterId) || e.characterId : undefined;
    const visibility = getEntryVisibility(e);
    const base: any = toPlain({ ...withVisibility(e, visibility), characterId, authorUid: me.id, visibility });
    delete base.isDmOnly;
    delete base.isPlayerOnly;
    delete base.isForDm;
    if (campaignId) {
      batch.set(fs.doc(db, 'campaigns', campaignId, 'journal', e.id), { ...base, campaignId });
    } else {
      delete base.campaignId;
      batch.set(fs.doc(db, 'users', me.id, 'notes', e.id), base);
    }
  }));

  // Referencias locales que apuntaban a los ids viejos.
  const activeCampaign = localStorage.getItem(KEYS.activeCampaign);
  if (activeCampaign && campaignIdMap.has(activeCampaign)) {
    localStorage.setItem(KEYS.activeCampaign, campaignIdMap.get(activeCampaign)!);
  }
  let activeChar = readJson<CharacterData>(KEYS.activeCharacter);
  if (activeChar && characterIdMap.has(activeChar.id)) {
    activeChar.id = characterIdMap.get(activeChar.id)!;
    activeChar.userId = me.id;
    activeChar.campaignId = activeChar.campaignId ? campaignIdMap.get(activeChar.campaignId) || null : null;
    localStorage.setItem(KEYS.activeCharacter, JSON.stringify(activeChar));
  } else {
    activeChar = null;
  }

  backupLocalKeys();
  await markDone();
  return {
    campaigns: campaigns.length,
    characters: characters.length,
    entries: entries.length,
    activeCharacter: activeChar || undefined,
  };
}
