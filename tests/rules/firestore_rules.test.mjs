// tests/rules/firestore_rules.test.mjs
// Corre contra el emulador de Firestore: `pnpm test:rules` (requiere Java).
import test, { before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, deleteField, writeBatch,
  collection, query, where, arrayUnion, setLogLevel,
} from 'firebase/firestore';

// Los rechazos esperados de assertFails llenan la consola de PERMISSION_DENIED.
setLogLevel('silent');

const PROJECT_ID = 'demo-dnd-sheet';
let env;

const DM = 'uid-dm';
const PLAYER = 'uid-player';
const OTHER = 'uid-other';
const STRANGER = 'uid-stranger';
const CID = 'camp-1';
const CODE = 'ABC2345';

const db = (uid) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

function baseCampaign(overrides = {}) {
  return {
    id: CID,
    name: 'Maldición de Strahd',
    creatorId: DM,
    dmId: DM,
    dmName: 'DM',
    memberUserIds: [DM, PLAYER, OTHER],
    inviteCode: CODE,
    status: 'active',
    createdAt: 1,
    ...overrides,
  };
}

function character(id, userId, campaignId = CID) {
  return {
    id, userId, campaignId, name: id,
    hp: { current: 10, max: 20, temp: 0 },
    inspiration: false,
    level: 3,
    sessionContext: campaignId ? { campaignName: 'Strahd', sessionNumber: 1 } : undefined,
  };
}

function entry(id, authorUid, visibility) {
  return { id, authorUid, visibility, campaignId: CID, title: id, content: '...', timestamp: Date.now(), tags: [] };
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
    const c = baseCampaign();
    await setDoc(doc(fs, 'campaigns', CID), c);
    await setDoc(doc(fs, 'invites', CODE), { campaignId: CID, createdBy: DM, createdAt: 1 });
    const strip = (o) => JSON.parse(JSON.stringify(o));
    await setDoc(doc(fs, 'characters', 'char-player'), strip(character('char-player', PLAYER)));
    await setDoc(doc(fs, 'characters', 'char-other'), strip(character('char-other', OTHER)));
    await setDoc(doc(fs, 'characters', 'char-stranger'), strip(character('char-stranger', STRANGER, null)));
    await setDoc(doc(fs, 'campaigns', CID, 'journal', 'party-1'), entry('party-1', PLAYER, 'party'));
    await setDoc(doc(fs, 'campaigns', CID, 'journal', 'dm-1'), entry('dm-1', DM, 'dm'));
    await setDoc(doc(fs, 'campaigns', CID, 'journal', 'player-1'), entry('player-1', PLAYER, 'player'));
    await setDoc(doc(fs, 'campaigns', CID, 'journal', 'todm-1'), entry('todm-1', PLAYER, 'to_dm'));
  });
});

// ------------------------------------------------------------------ auth y perfiles

test('sin sesión no se lee nada', async () => {
  await assertFails(getDoc(doc(anon(), 'campaigns', CID)));
  await assertFails(getDoc(doc(anon(), 'characters', 'char-player')));
  await assertFails(getDoc(doc(anon(), 'users', DM)));
});

test('cada uno edita solo su perfil y sin campos extra', async () => {
  await assertSucceeds(setDoc(doc(db(PLAYER), 'users', PLAYER), { name: 'Elena' }));
  await assertFails(setDoc(doc(db(PLAYER), 'users', DM), { name: 'Hackeado' }));
  await assertFails(setDoc(doc(db(PLAYER), 'users', PLAYER), { name: 'Elena', role: 'admin' }));
  await assertSucceeds(getDoc(doc(db(STRANGER), 'users', PLAYER)));
});

test('las notas personales son privadas', async () => {
  const note = { id: 'n1', authorUid: PLAYER, visibility: 'player', title: 'x', content: 'y', timestamp: 1, tags: [] };
  await assertSucceeds(setDoc(doc(db(PLAYER), 'users', PLAYER, 'notes', 'n1'), note));
  await assertFails(getDoc(doc(db(DM), 'users', PLAYER, 'notes', 'n1')));
  await assertFails(setDoc(doc(db(DM), 'users', PLAYER, 'notes', 'n2'), { ...note, authorUid: DM }));
});

// ------------------------------------------------------------------ campañas

test('un no miembro no puede leer ni listar la campaña', async () => {
  await assertFails(getDoc(doc(db(STRANGER), 'campaigns', CID)));
  await assertSucceeds(getDoc(doc(db(PLAYER), 'campaigns', CID)));
  await assertSucceeds(getDocs(query(collection(db(PLAYER), 'campaigns'), where('memberUserIds', 'array-contains', PLAYER))));
  await assertFails(getDocs(collection(db(STRANGER), 'campaigns')));
});

test('crear campaña: quien crea es DM y único miembro, con su invitación en el mismo batch', async () => {
  const fs = db(STRANGER);
  const ok = writeBatch(fs);
  ok.set(doc(fs, 'campaigns', 'nueva'), { id: 'nueva', name: 'N', creatorId: STRANGER, dmId: STRANGER, memberUserIds: [STRANGER], inviteCode: 'ZZZ2345' });
  ok.set(doc(fs, 'invites', 'ZZZ2345'), { campaignId: 'nueva', createdBy: STRANGER, createdAt: 1 });
  await assertSucceeds(ok.commit());

  await assertFails(setDoc(doc(fs, 'campaigns', 'otra'), { name: 'X', creatorId: STRANGER, dmId: STRANGER, memberUserIds: [STRANGER, PLAYER] }));
  await assertFails(setDoc(doc(fs, 'campaigns', 'otra2'), { name: 'X', creatorId: STRANGER, dmId: PLAYER, memberUserIds: [STRANGER] }));
  // No se puede crear una invitación que apunte a una campaña ajena.
  await assertFails(setDoc(doc(fs, 'invites', 'HIJACK2'), { campaignId: CID, createdBy: STRANGER, createdAt: 1 }));
});

test('un jugador no puede cambiar el DM ni editar la campaña', async () => {
  await assertFails(updateDoc(doc(db(PLAYER), 'campaigns', CID), { dmId: PLAYER }));
  await assertFails(updateDoc(doc(db(PLAYER), 'campaigns', CID), { name: 'Mía' }));
  await assertSucceeds(updateDoc(doc(db(DM), 'campaigns', CID), { name: 'Strahd II', dmId: PLAYER }));
});

test('el DM no puede asignar como DM a alguien que no es miembro', async () => {
  await assertFails(updateDoc(doc(db(DM), 'campaigns', CID), { dmId: STRANGER }));
});

test('unirse con código válido agrega solo al usuario', async () => {
  await assertSucceeds(updateDoc(doc(db(STRANGER), 'campaigns', CID), { memberUserIds: arrayUnion(STRANGER), joinedWith: CODE }));
});

test('unirse con código inválido, viejo o sumando a otros falla', async () => {
  await seed(async (fs) => {
    await setDoc(doc(fs, 'invites', 'OLD2345'), { campaignId: CID, createdBy: DM, createdAt: 0 });
  });
  await assertFails(updateDoc(doc(db(STRANGER), 'campaigns', CID), { memberUserIds: arrayUnion(STRANGER), joinedWith: 'NOPE234' }));
  await assertFails(updateDoc(doc(db(STRANGER), 'campaigns', CID), { memberUserIds: arrayUnion(STRANGER), joinedWith: 'OLD2345' }));
  await assertFails(updateDoc(doc(db(STRANGER), 'campaigns', CID), { memberUserIds: arrayUnion(STRANGER, 'uid-amigo'), joinedWith: CODE }));
  await assertFails(updateDoc(doc(db(STRANGER), 'campaigns', CID), { memberUserIds: arrayUnion(STRANGER), joinedWith: CODE, dmId: STRANGER }));
});

test('las invitaciones se leen por código pero no se listan', async () => {
  await assertSucceeds(getDoc(doc(db(STRANGER), 'invites', CODE)));
  await assertFails(getDocs(collection(db(STRANGER), 'invites')));
});

test('abandonar: el jugador solo se quita a sí mismo', async () => {
  await assertFails(updateDoc(doc(db(PLAYER), 'campaigns', CID), { memberUserIds: [DM] }));
  await assertSucceeds(updateDoc(doc(db(PLAYER), 'campaigns', CID), { memberUserIds: [DM, OTHER] }));
});

test('borrar: si el creador está en la mesa solo él; si se fue, el DM', async () => {
  await assertFails(deleteDoc(doc(db(PLAYER), 'campaigns', CID)));
  await assertSucceeds(deleteDoc(doc(db(DM), 'campaigns', CID)));

  await seed(async (fs) => {
    await setDoc(doc(fs, 'campaigns', 'camp-2'), baseCampaign({ id: 'camp-2', creatorId: 'uid-creador-ido', dmId: PLAYER, memberUserIds: [PLAYER, OTHER] }));
  });
  await assertFails(deleteDoc(doc(db(OTHER), 'campaigns', 'camp-2')));
  await assertSucceeds(deleteDoc(doc(db(PLAYER), 'campaigns', 'camp-2')));
});

// ------------------------------------------------------------------ personajes

test('el dueño edita su ficha; otro jugador no', async () => {
  await assertSucceeds(updateDoc(doc(db(PLAYER), 'characters', 'char-player'), { level: 4 }));
  await assertFails(updateDoc(doc(db(OTHER), 'characters', 'char-player'), { level: 20 }));
  await assertFails(updateDoc(doc(db(PLAYER), 'characters', 'char-player'), { userId: OTHER }));
});

test('los miembros leen las fichas de su campaña; un extraño no', async () => {
  await assertSucceeds(getDoc(doc(db(OTHER), 'characters', 'char-player')));
  await assertSucceeds(getDocs(query(collection(db(DM), 'characters'), where('campaignId', '==', CID))));
  await assertFails(getDoc(doc(db(STRANGER), 'characters', 'char-player')));
  await assertFails(getDoc(doc(db(PLAYER), 'characters', 'char-stranger')));
});

test('no se puede crear una ficha a nombre de otro ni en una campaña ajena', async () => {
  await assertSucceeds(setDoc(doc(db(STRANGER), 'characters', 'nuevo'), { userId: STRANGER, campaignId: null, name: 'N' }));
  await assertFails(setDoc(doc(db(STRANGER), 'characters', 'nuevo-2'), { userId: PLAYER, campaignId: null, name: 'N' }));
  await assertFails(setDoc(doc(db(STRANGER), 'characters', 'nuevo-3'), { userId: STRANGER, campaignId: CID, name: 'N' }));
});

test('el DM ajusta PG e inspiración pero no el resto de la ficha', async () => {
  await assertSucceeds(updateDoc(doc(db(DM), 'characters', 'char-player'), { hp: { current: 20, max: 20, temp: 0 }, inspiration: true, updatedAt: 2 }));
  await assertFails(updateDoc(doc(db(DM), 'characters', 'char-player'), { level: 20 }));
  await assertFails(updateDoc(doc(db(DM), 'characters', 'char-stranger'), { inspiration: true }));
});

test('el dueño escribe recursos, efectos e imagen de objetos; el DM no (Spec 07)', async () => {
  const sheet = {
    resources: [{ id: 'wildShape', name: 'Forma Salvaje', max: 2, used: 1, rechargeOn: 'shortRest' }],
    activeEffects: [{ id: 'e1', name: 'Bendición', sourceType: 'spell', duration: { kind: 'rounds', remaining: 2 }, modifiers: [], appliedAt: 1 }],
    effectsLastRound: { campaignId: CID, round: 2 },
    inventory: [{ id: 'i1', name: 'Anillo', quantity: 1, category: 'gear', custom: true, imageUrl: 'https://example.com/a.png' }],
  };
  await assertSucceeds(updateDoc(doc(db(PLAYER), 'characters', 'char-player'), sheet));
  await assertFails(updateDoc(doc(db(DM), 'characters', 'char-player'), { activeEffects: [] }));
  await assertFails(updateDoc(doc(db(DM), 'characters', 'char-player'), { resources: [] }));
  // Regresión: el DM sigue pudiendo escribir PG e inspiración.
  await assertSucceeds(updateDoc(doc(db(DM), 'characters', 'char-player'), { hp: { current: 5, max: 20, temp: 0 }, inspiration: true, updatedAt: 4 }));
});

test('el dueño escribe inventario, competencias y CA; el DM no (Spec 08)', async () => {
  const owner = db(PLAYER);
  const dm = db(DM);
  const ref = (d) => doc(d, 'characters', 'char-player');
  await assertSucceeds(updateDoc(ref(owner), { inventory: [{ id: 'e1', name: 'Espada larga', quantity: 1, category: 'weapon', equipped: true, slot: 'mainHand' }] }));
  await assertSucceeds(updateDoc(ref(owner), { proficiencies: { armor: ['light'], weapons: ['martial'] } }));
  await assertSucceeds(updateDoc(ref(owner), { armorClass: 17 }));
  await assertFails(updateDoc(ref(dm), { inventory: [] }));
  await assertFails(updateDoc(ref(dm), { proficiencies: { armor: [], weapons: [] } }));
  await assertFails(updateDoc(ref(dm), { armorClass: 30 }));
  // Regresión: el DM sigue pudiendo escribir PG, inspiración y updatedAt.
  await assertSucceeds(updateDoc(ref(dm), { hp: { current: 7, max: 20, temp: 0 }, inspiration: false, updatedAt: 5 }));
});

test('DM o creador pueden desvincular la ficha de un jugador (campaignId → null)', async () => {
  await assertSucceeds(updateDoc(doc(db(DM), 'characters', 'char-player'), { campaignId: null, sessionContext: deleteField(), updatedAt: 3 }));
  await assertFails(updateDoc(doc(db(OTHER), 'characters', 'char-player'), { campaignId: null }));
});

// ------------------------------------------------------------------ diario

test('party: lo leen todos los miembros', async () => {
  await assertSucceeds(getDoc(doc(db(OTHER), 'campaigns', CID, 'journal', 'party-1')));
  await assertSucceeds(getDocs(query(collection(db(OTHER), 'campaigns', CID, 'journal'), where('visibility', '==', 'party'))));
  await assertFails(getDoc(doc(db(STRANGER), 'campaigns', CID, 'journal', 'party-1')));
});

test('dm: solo el DM la lee y la crea', async () => {
  await assertSucceeds(getDoc(doc(db(DM), 'campaigns', CID, 'journal', 'dm-1')));
  await assertFails(getDoc(doc(db(PLAYER), 'campaigns', CID, 'journal', 'dm-1')));
  await assertFails(getDocs(query(collection(db(PLAYER), 'campaigns', CID, 'journal'), where('visibility', '==', 'dm'))));
  await assertFails(setDoc(doc(db(PLAYER), 'campaigns', CID, 'journal', 'dm-2'), entry('dm-2', PLAYER, 'dm')));
  await assertSucceeds(setDoc(doc(db(DM), 'campaigns', CID, 'journal', 'dm-3'), entry('dm-3', DM, 'dm')));
});

test('player: solo la lee su autor, ni el DM ni otro jugador', async () => {
  await assertSucceeds(getDoc(doc(db(PLAYER), 'campaigns', CID, 'journal', 'player-1')));
  await assertFails(getDoc(doc(db(DM), 'campaigns', CID, 'journal', 'player-1')));
  await assertFails(getDoc(doc(db(OTHER), 'campaigns', CID, 'journal', 'player-1')));
  await assertSucceeds(getDocs(query(
    collection(db(PLAYER), 'campaigns', CID, 'journal'),
    where('visibility', '==', 'player'),
    where('authorUid', '==', PLAYER)
  )));
  // Pedir las notas de jugador de otro autor se rechaza entera.
  await assertFails(getDocs(query(collection(db(OTHER), 'campaigns', CID, 'journal'), where('visibility', '==', 'player'))));
});

test('to_dm: lo leen su autor y el DM, no el resto de la mesa', async () => {
  await assertSucceeds(getDoc(doc(db(PLAYER), 'campaigns', CID, 'journal', 'todm-1')));
  await assertSucceeds(getDoc(doc(db(DM), 'campaigns', CID, 'journal', 'todm-1')));
  await assertFails(getDoc(doc(db(OTHER), 'campaigns', CID, 'journal', 'todm-1')));
  // Queries tal como las hace la app.
  await assertSucceeds(getDocs(query(collection(db(DM), 'campaigns', CID, 'journal'), where('visibility', '==', 'to_dm'))));
  await assertSucceeds(getDocs(query(
    collection(db(OTHER), 'campaigns', CID, 'journal'),
    where('visibility', '==', 'to_dm'),
    where('authorUid', '==', OTHER)
  )));
  await assertFails(getDocs(query(collection(db(OTHER), 'campaigns', CID, 'journal'), where('visibility', '==', 'to_dm'))));
  // Cualquier miembro puede escribirle al DM.
  await assertSucceeds(setDoc(doc(db(OTHER), 'campaigns', CID, 'journal', 'todm-2'), entry('todm-2', OTHER, 'to_dm')));
  await assertFails(setDoc(doc(db(STRANGER), 'campaigns', CID, 'journal', 'todm-3'), entry('todm-3', STRANGER, 'to_dm')));
});

test('no se puede escribir a nombre de otro ni pasar una nota a "dm" sin ser DM', async () => {
  await assertFails(setDoc(doc(db(OTHER), 'campaigns', CID, 'journal', 'fake'), entry('fake', PLAYER, 'party')));
  await assertFails(updateDoc(doc(db(PLAYER), 'campaigns', CID, 'journal', 'player-1'), { visibility: 'dm' }));
  await assertSucceeds(updateDoc(doc(db(PLAYER), 'campaigns', CID, 'journal', 'player-1'), { visibility: 'party' }));
  await assertFails(setDoc(doc(db(STRANGER), 'campaigns', CID, 'journal', 'x'), entry('x', STRANGER, 'party')));
});

test('borrado: el DM modera party y dm, pero no las notas de jugador', async () => {
  await assertSucceeds(deleteDoc(doc(db(DM), 'campaigns', CID, 'journal', 'party-1')));
  await assertFails(deleteDoc(doc(db(DM), 'campaigns', CID, 'journal', 'player-1')));
  await assertFails(deleteDoc(doc(db(OTHER), 'campaigns', CID, 'journal', 'dm-1')));
  await assertSucceeds(deleteDoc(doc(db(PLAYER), 'campaigns', CID, 'journal', 'player-1')));
});

// ------------------------------------------------------------------ eventos del DM

test('solo el DM crea eventos y los miembros los leen', async () => {
  const ev = { id: 'e1', campaignId: CID, type: 'dice_roll', timestamp: Date.now(), dmName: 'DM', payload: {} };
  await assertSucceeds(setDoc(doc(db(DM), 'campaigns', CID, 'dm_events', 'e1'), ev));
  await assertFails(setDoc(doc(db(PLAYER), 'campaigns', CID, 'dm_events', 'e2'), { ...ev, id: 'e2' }));
  await assertSucceeds(getDoc(doc(db(PLAYER), 'campaigns', CID, 'dm_events', 'e1')));
  await assertFails(getDoc(doc(db(STRANGER), 'campaigns', CID, 'dm_events', 'e1')));
});
