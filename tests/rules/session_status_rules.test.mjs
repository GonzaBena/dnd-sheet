// tests/rules/session_status_rules.test.mjs
// Pruebas de reglas de Firestore según estado de la sesión (active / paused / ended / legacy / sin campo).
// Corre contra el emulador: `pnpm test:rules` (requiere Java).
import test, { before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-dnd-sheet';
let env;

const DM = 'uid-dm';
const PLAYER = 'uid-player';
const OTHER = 'uid-other';
const STRANGER = 'uid-stranger';

const CID_ACTIVE = 'camp-active';
const CID_PAUSED = 'camp-paused';
const CID_ENDED = 'camp-ended';
const CID_NO_STATUS = 'camp-no-status';
const CID_COMPLETED = 'camp-completed';

const db = (uid) => env.authenticatedContext(uid).firestore();

function baseCampaign(id, status) {
  const c = {
    id,
    name: `Campaña ${id}`,
    creatorId: DM,
    dmId: DM,
    dmName: 'DM',
    memberUserIds: [DM, PLAYER, OTHER],
    inviteCode: `CODE-${id}`,
    createdAt: 1,
  };
  if (status !== undefined) c.status = status;
  return c;
}

function baseMap(cid) {
  return {
    name: 'Mapa',
    imageUrl: 'https://example.com/map.png',
    imageWidth: 1000,
    imageHeight: 800,
    grid: { size: 50, offsetX: 0, offsetY: 0, visible: true },
    tokens: {
      't-player': { name: 'Elena', x: 50, y: 50, size: 1, ownerUid: PLAYER },
    },
    fogRevealed: [],
    updatedAt: 1,
  };
}

function character(id, userId, campaignId) {
  return {
    id,
    userId,
    campaignId,
    name: id,
    hp: { current: 10, max: 20, temp: 0 },
    inspiration: false,
    level: 3,
  };
}

function journalEntry(id, authorUid, visibility, campaignId, systemEvent) {
  const e = {
    id,
    authorUid,
    visibility,
    campaignId,
    title: id,
    content: '...',
    timestamp: Date.now(),
    tags: [],
  };
  if (systemEvent) e.systemEvent = systemEvent;
  return e;
}

async function seed(fn) {
  await env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));
}

before(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host, port: Number(port) },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (fs) => {
    // Campañas en diferentes estados
    await setDoc(doc(fs, 'campaigns', CID_ACTIVE), baseCampaign(CID_ACTIVE, 'active'));
    await setDoc(doc(fs, 'campaigns', CID_PAUSED), baseCampaign(CID_PAUSED, 'paused'));
    await setDoc(doc(fs, 'campaigns', CID_ENDED), baseCampaign(CID_ENDED, 'ended'));
    await setDoc(doc(fs, 'campaigns', CID_NO_STATUS), baseCampaign(CID_NO_STATUS, undefined));
    await setDoc(doc(fs, 'campaigns', CID_COMPLETED), baseCampaign(CID_COMPLETED, 'completed'));

    // Personajes
    await setDoc(doc(fs, 'characters', 'char-active'), character('char-active', PLAYER, CID_ACTIVE));
    await setDoc(doc(fs, 'characters', 'char-paused'), character('char-paused', PLAYER, CID_PAUSED));
    await setDoc(doc(fs, 'characters', 'char-ended'), character('char-ended', PLAYER, CID_ENDED));
    await setDoc(doc(fs, 'characters', 'char-no-status'), character('char-no-status', PLAYER, CID_NO_STATUS));

    // Mapas
    await setDoc(doc(fs, 'campaigns', CID_ACTIVE, 'maps', 'm1'), baseMap(CID_ACTIVE));
    await setDoc(doc(fs, 'campaigns', CID_PAUSED, 'maps', 'm1'), baseMap(CID_PAUSED));
    await setDoc(doc(fs, 'campaigns', CID_ENDED, 'maps', 'm1'), baseMap(CID_ENDED));

    // Entradas iniciales
    await setDoc(doc(fs, 'campaigns', CID_ACTIVE, 'journal', 'init-active'), journalEntry('init-active', PLAYER, 'party', CID_ACTIVE));
    await setDoc(doc(fs, 'campaigns', CID_ENDED, 'journal', 'init-ended'), journalEntry('init-ended', PLAYER, 'party', CID_ENDED));
  });
});

// ------------------------------------------------------------------ Lectura pública

test('lectura: miembros leen campaña, journal party y personajes en active, paused y ended', async () => {
  for (const cid of [CID_ACTIVE, CID_PAUSED, CID_ENDED, CID_NO_STATUS, CID_COMPLETED]) {
    await assertSucceeds(getDoc(doc(db(PLAYER), 'campaigns', cid)));
  }
  await assertSucceeds(getDoc(doc(db(PLAYER), 'campaigns', CID_ENDED, 'journal', 'init-ended')));
  await assertSucceeds(getDoc(doc(db(PLAYER), 'characters', 'char-ended')));
  await assertSucceeds(getDoc(doc(db(PLAYER), 'campaigns', CID_ENDED, 'maps', 'm1')));
});

test('un extraño no lee nada en ningún estado', async () => {
  for (const cid of [CID_ACTIVE, CID_PAUSED, CID_ENDED]) {
    await assertFails(getDoc(doc(db(STRANGER), 'campaigns', cid)));
    await assertFails(getDoc(doc(db(STRANGER), 'campaigns', cid, 'maps', 'm1')));
  }
});

// ------------------------------------------------------------------ Acciones de jugador

test('jugador crea entrada party en journal solo en active', async () => {
  await assertSucceeds(setDoc(doc(db(PLAYER), 'campaigns', CID_ACTIVE, 'journal', 'p-active'), journalEntry('p-active', PLAYER, 'party', CID_ACTIVE)));
  await assertFails(setDoc(doc(db(PLAYER), 'campaigns', CID_PAUSED, 'journal', 'p-paused'), journalEntry('p-paused', PLAYER, 'party', CID_PAUSED)));
  await assertFails(setDoc(doc(db(PLAYER), 'campaigns', CID_ENDED, 'journal', 'p-ended'), journalEntry('p-ended', PLAYER, 'party', CID_ENDED)));
  await assertFails(setDoc(doc(db(PLAYER), 'campaigns', CID_NO_STATUS, 'journal', 'p-no-status'), journalEntry('p-no-status', PLAYER, 'party', CID_NO_STATUS)));
});

test('jugador mueve su token solo en active', async () => {
  const moveData = {
    'tokens.t-player.x': 60,
    'tokens.t-player.y': 60,
    lastMove: { tokenId: 't-player', by: PLAYER, at: 10 },
    updatedAt: 10,
  };
  await assertSucceeds(updateDoc(doc(db(PLAYER), 'campaigns', CID_ACTIVE, 'maps', 'm1'), moveData));
  await assertFails(updateDoc(doc(db(PLAYER), 'campaigns', CID_PAUSED, 'maps', 'm1'), moveData));
  await assertFails(updateDoc(doc(db(PLAYER), 'campaigns', CID_ENDED, 'maps', 'm1'), moveData));
});

test('jugador edita su propia ficha en cualquier estado', async () => {
  await assertSucceeds(updateDoc(doc(db(PLAYER), 'characters', 'char-active'), { level: 4 }));
  await assertSucceeds(updateDoc(doc(db(PLAYER), 'characters', 'char-paused'), { level: 4 }));
  await assertSucceeds(updateDoc(doc(db(PLAYER), 'characters', 'char-ended'), { level: 4 }));
  await assertSucceeds(updateDoc(doc(db(PLAYER), 'characters', 'char-no-status'), { level: 4 }));
});

test('jugador nunca edita la ficha de otro jugador', async () => {
  await assertFails(updateDoc(doc(db(OTHER), 'characters', 'char-active'), { level: 9 }));
});

// ------------------------------------------------------------------ Acciones de DM

test('DM modifica hp de personaje solo en active', async () => {
  const hpMod = { hp: { current: 15, max: 20, temp: 0 }, updatedAt: 5 };
  await assertSucceeds(updateDoc(doc(db(DM), 'characters', 'char-active'), hpMod));
  await assertFails(updateDoc(doc(db(DM), 'characters', 'char-paused'), hpMod));
  await assertFails(updateDoc(doc(db(DM), 'characters', 'char-ended'), hpMod));
  await assertFails(updateDoc(doc(db(DM), 'characters', 'char-no-status'), hpMod));
});

test('DM crea dm_events solo en active', async () => {
  const ev = (cid) => ({ id: 'ev1', campaignId: cid, type: 'dice_roll', timestamp: 1, dmName: 'DM', payload: {} });
  await assertSucceeds(setDoc(doc(db(DM), 'campaigns', CID_ACTIVE, 'dm_events', 'ev1'), ev(CID_ACTIVE)));
  await assertFails(setDoc(doc(db(DM), 'campaigns', CID_PAUSED, 'dm_events', 'ev1'), ev(CID_PAUSED)));
  await assertFails(setDoc(doc(db(DM), 'campaigns', CID_ENDED, 'dm_events', 'ev1'), ev(CID_ENDED)));
});

test('DM crea entrada normal en journal solo en active, pero systemEvent=status en cualquiera', async () => {
  // Entrada normal DM
  await assertSucceeds(setDoc(doc(db(DM), 'campaigns', CID_ACTIVE, 'journal', 'dm-act'), journalEntry('dm-act', DM, 'dm', CID_ACTIVE)));
  await assertFails(setDoc(doc(db(DM), 'campaigns', CID_PAUSED, 'journal', 'dm-pau'), journalEntry('dm-pau', DM, 'dm', CID_PAUSED)));
  await assertFails(setDoc(doc(db(DM), 'campaigns', CID_ENDED, 'journal', 'dm-end'), journalEntry('dm-end', DM, 'dm', CID_ENDED)));

  // Entrada con systemEvent: 'status' (visibilidad party)
  await assertSucceeds(setDoc(doc(db(DM), 'campaigns', CID_ACTIVE, 'journal', 's-act'), journalEntry('s-act', DM, 'party', CID_ACTIVE, 'status')));
  await assertSucceeds(setDoc(doc(db(DM), 'campaigns', CID_PAUSED, 'journal', 's-pau'), journalEntry('s-pau', DM, 'party', CID_PAUSED, 'status')));
  await assertSucceeds(setDoc(doc(db(DM), 'campaigns', CID_ENDED, 'journal', 's-end'), journalEntry('s-end', DM, 'party', CID_ENDED, 'status')));
});

test('DM prepara mapas y notas en active y paused, pero no en ended', async () => {
  const newMap = baseMap(CID_ACTIVE);
  await assertSucceeds(setDoc(doc(db(DM), 'campaigns', CID_ACTIVE, 'maps', 'm2'), newMap));
  await assertSucceeds(setDoc(doc(db(DM), 'campaigns', CID_PAUSED, 'maps', 'm2'), newMap));
  await assertFails(setDoc(doc(db(DM), 'campaigns', CID_ENDED, 'maps', 'm2'), newMap));

  const note = { id: 'n1', title: 'Nota', body: 'Contenido', updatedAt: 1 };
  await assertSucceeds(setDoc(doc(db(DM), 'campaigns', CID_ACTIVE, 'notes', 'n1'), note));
  await assertSucceeds(setDoc(doc(db(DM), 'campaigns', CID_PAUSED, 'notes', 'n1'), note));
  await assertFails(setDoc(doc(db(DM), 'campaigns', CID_ENDED, 'notes', 'n1'), note));
});

test('DM edita detalles de campaña en active y paused, pero no en ended', async () => {
  await assertSucceeds(updateDoc(doc(db(DM), 'campaigns', CID_ACTIVE), { weather: 'Lluvia' }));
  await assertSucceeds(updateDoc(doc(db(DM), 'campaigns', CID_PAUSED), { weather: 'Tormenta' }));
  await assertFails(updateDoc(doc(db(DM), 'campaigns', CID_ENDED), { weather: 'Soleado' }));
});

test('transiciones de estado de campaña', async () => {
  // Desde active -> paused
  await assertSucceeds(updateDoc(doc(db(DM), 'campaigns', CID_ACTIVE), { status: 'paused', statusChangedAt: 10 }));

  // Desde paused -> ended
  await assertSucceeds(updateDoc(doc(db(DM), 'campaigns', CID_PAUSED), { status: 'ended', statusChangedAt: 10 }));

  // Desde ended -> directo a active debe fallar
  await assertFails(updateDoc(doc(db(DM), 'campaigns', CID_ENDED), { status: 'active', statusChangedAt: 20 }));

  // Desde ended -> solo a paused (reabrir)
  await assertSucceeds(updateDoc(doc(db(DM), 'campaigns', CID_ENDED), { status: 'paused', statusChangedAt: 20 }));
});

test('campaña con completed (legado) se comporta como ended', async () => {
  // En completed no se puede escribir clima ni notas
  await assertFails(updateDoc(doc(db(DM), 'campaigns', CID_COMPLETED), { weather: 'Lluvia' }));
  // Pero sí reabrir a paused
  await assertSucceeds(updateDoc(doc(db(DM), 'campaigns', CID_COMPLETED), { status: 'paused', statusChangedAt: 30 }));
});
