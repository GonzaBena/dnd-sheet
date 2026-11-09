// tests/rules/vtt_firestore.test.mjs
// Reglas de Firestore del VTT (mapas, tokens, combate, notas del DM).
// Corre contra el emulador: `pnpm test:rules` (requiere Java).
import test, { before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, setLogLevel } from 'firebase/firestore';

setLogLevel('silent');

const PROJECT_ID = 'demo-dnd-sheet';
let env;

const DM = 'uid-dm';
const PLAYER = 'uid-player';
const OTHER = 'uid-other';
const STRANGER = 'uid-stranger';
const CID = 'camp-vtt';
const MID = 'm1';

const db = (uid) => env.authenticatedContext(uid).firestore();
const mapRef = (uid) => doc(db(uid), 'campaigns', CID, 'maps', MID);

function token(name, ownerUid, x = 0, y = 0) {
  return { name, x, y, size: 1, ownerUid };
}

function baseMap(overrides = {}) {
  return {
    name: 'Cripta',
    imageUrl: 'https://example.com/cripta.png',
    imageWidth: 1000,
    imageHeight: 800,
    grid: { size: 50, offsetX: 0, offsetY: 0, visible: true },
    tokens: {
      't-player': token('Elena', PLAYER, 50, 50),
      't-other': token('Brom', OTHER, 100, 100),
      't-dm': token('Goblin', null, 200, 200),
    },
    fogRevealed: [],
    updatedAt: 1,
    ...overrides,
  };
}

/** Escritura de un jugador tal como la hará mapService en la Fase 3. */
function move(tokenId, x, y, by = PLAYER) {
  return {
    [`tokens.${tokenId}.x`]: x,
    [`tokens.${tokenId}.y`]: y,
    lastMove: { tokenId, by, at: Date.now() },
    updatedAt: Date.now(),
  };
}

const combat = (n = 1) => ({
  active: true,
  round: 1,
  turnIndex: 0,
  combatants: Array.from({ length: n }, (_, i) => ({
    id: `c${i}`, name: `C${i}`, initiative: 10, hp: 5, maxHp: 5, conditions: [], isPlayer: false, hiddenHp: true,
  })),
  updatedAt: 1,
});

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
    await setDoc(doc(fs, 'campaigns', CID), {
      id: CID, name: 'VTT', creatorId: DM, dmId: DM, dmName: 'DM',
      memberUserIds: [DM, PLAYER, OTHER], inviteCode: 'VTT2345', status: 'active', createdAt: 1,
    });
    await setDoc(doc(fs, 'campaigns', CID, 'maps', MID), baseMap());
    await setDoc(doc(fs, 'campaigns', CID, 'maps', MID, 'private', 'dmOnly'), { secretTokens: { 't-secret': token('Lich', null) } });
    await setDoc(doc(fs, 'campaigns', CID, 'combat', 'current'), combat(2));
    await setDoc(doc(fs, 'campaigns', CID, 'notes', 'n1'), { id: 'n1', title: 'Plan', body: 'El lich está en la cripta', updatedAt: 1 });
  });
});

// ------------------------------------------------------------------ mapas: jugador

test('el jugador mueve x/y de su propio token con lastMove', async () => {
  await assertSucceeds(updateDoc(mapRef(PLAYER), move('t-player', 150, 250)));
  const snap = await getDoc(mapRef(DM));
  const t = snap.data().tokens['t-player'];
  if (t.x !== 150 || t.y !== 250) throw new Error('la posición no se guardó');
});

test('el jugador no mueve tokens ajenos ni del DM', async () => {
  await assertFails(updateDoc(mapRef(PLAYER), move('t-other', 1, 1)));
  await assertFails(updateDoc(mapRef(PLAYER), move('t-dm', 1, 1)));
});

test('lastMove tiene que apuntar al token que realmente cambia', async () => {
  await assertFails(updateDoc(mapRef(PLAYER), {
    'tokens.t-player.x': 10,
    lastMove: { tokenId: 't-other', by: PLAYER, at: 1 },
    updatedAt: 2,
  }));
});

test('lastMove.by tiene que ser el propio jugador', async () => {
  await assertFails(updateDoc(mapRef(PLAYER), move('t-player', 10, 10, OTHER)));
});

test('el jugador no cambia name, size ni ownerUid de su token', async () => {
  const lm = { tokenId: 't-player', by: PLAYER, at: 1 };
  await assertFails(updateDoc(mapRef(PLAYER), { 'tokens.t-player.name': 'Otra', lastMove: lm, updatedAt: 2 }));
  await assertFails(updateDoc(mapRef(PLAYER), { 'tokens.t-player.size': 4, lastMove: lm, updatedAt: 2 }));
  await assertFails(updateDoc(mapRef(PLAYER), { 'tokens.t-player.ownerUid': OTHER, lastMove: lm, updatedAt: 2 }));
});

test('el jugador no toca dos tokens en una sola escritura', async () => {
  await assertFails(updateDoc(mapRef(PLAYER), {
    ...move('t-player', 10, 10),
    'tokens.t-other.x': 999,
  }));
});

test('el jugador no escribe sin lastMove', async () => {
  await assertFails(updateDoc(mapRef(PLAYER), { 'tokens.t-player.x': 10, 'tokens.t-player.y': 10, updatedAt: 2 }));
});

test('el jugador no escribe coordenadas que no son números', async () => {
  await assertFails(updateDoc(mapRef(PLAYER), { ...move('t-player', 10, 10), 'tokens.t-player.x': '10' }));
});

test('el jugador no cambia la niebla ni otros campos del mapa', async () => {
  await assertFails(updateDoc(mapRef(PLAYER), { fogRevealed: [{ kind: 'rect', x: 0, y: 0, w: 100, h: 100 }] }));
  await assertFails(updateDoc(mapRef(PLAYER), { ...move('t-player', 10, 10), fogRevealed: [{ kind: 'rect', x: 0, y: 0, w: 1, h: 1 }] }));
  await assertFails(updateDoc(mapRef(PLAYER), { name: 'Mío' }));
});

test('el jugador no crea ni borra mapas', async () => {
  await assertFails(setDoc(doc(db(PLAYER), 'campaigns', CID, 'maps', 'm2'), baseMap()));
  await assertFails(deleteDoc(mapRef(PLAYER)));
});

test('el jugador no crea un token nuevo a su nombre', async () => {
  await assertFails(updateDoc(mapRef(PLAYER), {
    'tokens.t-nuevo': token('Clon', PLAYER),
    lastMove: { tokenId: 't-nuevo', by: PLAYER, at: 1 },
    updatedAt: 2,
  }));
});

// ------------------------------------------------------------------ mapas: DM y lectura

test('el DM crea, edita cualquier campo y borra mapas', async () => {
  await assertSucceeds(setDoc(doc(db(DM), 'campaigns', CID, 'maps', 'm2'), baseMap({ name: 'Bosque' })));
  await assertSucceeds(updateDoc(mapRef(DM), {
    name: 'Cripta (nivel 2)',
    'tokens.t-other.ownerUid': PLAYER,
    'tokens.t-dm.x': 999,
    fogRevealed: [{ kind: 'rect', x: 0, y: 0, w: 100, h: 100 }],
  }));
  await assertSucceeds(deleteDoc(doc(db(DM), 'campaigns', CID, 'maps', 'm2')));
});

test('el DM no crea un mapa con más de 200 tokens ni con nombre o URL demasiado largos', async () => {
  const tokens = {};
  for (let i = 0; i < 201; i++) tokens[`t${i}`] = token(`T${i}`, null);
  await assertFails(setDoc(doc(db(DM), 'campaigns', CID, 'maps', 'm3'), baseMap({ tokens })));
  await assertFails(setDoc(doc(db(DM), 'campaigns', CID, 'maps', 'm4'), baseMap({ name: 'x'.repeat(81) })));
  await assertFails(setDoc(doc(db(DM), 'campaigns', CID, 'maps', 'm5'), baseMap({ imageUrl: 'https://' + 'x'.repeat(2048) })));
});

test('el DM no crea un mapa con URL no https o tamaño de grilla fuera de rango [8, 512]', async () => {
  await assertFails(setDoc(doc(db(DM), 'campaigns', CID, 'maps', 'm-http'), baseMap({ imageUrl: 'http://example.com/map.png' })));
  await assertFails(setDoc(doc(db(DM), 'campaigns', CID, 'maps', 'm-grid-low'), baseMap({ grid: { size: 7, offsetX: 0, offsetY: 0, visible: true } })));
  await assertFails(setDoc(doc(db(DM), 'campaigns', CID, 'maps', 'm-grid-high'), baseMap({ grid: { size: 513, offsetX: 0, offsetY: 0, visible: true } })));
  await assertSucceeds(setDoc(doc(db(DM), 'campaigns', CID, 'maps', 'm-grid-ok'), baseMap({ grid: { size: 8, offsetX: 0, offsetY: 0, visible: true } })));
  await assertSucceeds(setDoc(doc(db(DM), 'campaigns', CID, 'maps', 'm-grid-ok2'), baseMap({ grid: { size: 512, offsetX: 0, offsetY: 0, visible: true } })));
});

test('los miembros leen mapas y combate', async () => {
  await assertSucceeds(getDoc(mapRef(PLAYER)));
  await assertSucceeds(getDocs(collection(db(OTHER), 'campaigns', CID, 'maps')));
  await assertSucceeds(getDoc(doc(db(PLAYER), 'campaigns', CID, 'combat', 'current')));
});

test('los tokens ocultos (private/dmOnly) solo los ve y escribe el DM', async () => {
  await assertSucceeds(getDoc(doc(db(DM), 'campaigns', CID, 'maps', MID, 'private', 'dmOnly')));
  await assertSucceeds(setDoc(doc(db(DM), 'campaigns', CID, 'maps', MID, 'private', 'dmOnly'), { secretTokens: {} }));
  await assertFails(getDoc(doc(db(PLAYER), 'campaigns', CID, 'maps', MID, 'private', 'dmOnly')));
  await assertFails(setDoc(doc(db(PLAYER), 'campaigns', CID, 'maps', MID, 'private', 'dmOnly'), { secretTokens: {} }));
});

// ------------------------------------------------------------------ combate

test('solo el DM escribe el combate, solo en "current" y con hasta 50 combatientes', async () => {
  await assertSucceeds(setDoc(doc(db(DM), 'campaigns', CID, 'combat', 'current'), combat(50)));
  await assertFails(setDoc(doc(db(DM), 'campaigns', CID, 'combat', 'current'), combat(51)));
  await assertFails(setDoc(doc(db(DM), 'campaigns', CID, 'combat', 'otro'), combat(1)));
  await assertFails(setDoc(doc(db(PLAYER), 'campaigns', CID, 'combat', 'current'), combat(1)));
  await assertFails(updateDoc(doc(db(PLAYER), 'campaigns', CID, 'combat', 'current'), { round: 9 }));
  await assertSucceeds(deleteDoc(doc(db(DM), 'campaigns', CID, 'combat', 'current')));
});

// ------------------------------------------------------------------ notas del DM

test('las notas del DM son privadas', async () => {
  await assertSucceeds(getDoc(doc(db(DM), 'campaigns', CID, 'notes', 'n1')));
  await assertSucceeds(getDocs(collection(db(DM), 'campaigns', CID, 'notes')));
  await assertSucceeds(setDoc(doc(db(DM), 'campaigns', CID, 'notes', 'n2'), { id: 'n2', title: 'T', body: 'B', updatedAt: 1 }));
  await assertSucceeds(deleteDoc(doc(db(DM), 'campaigns', CID, 'notes', 'n2')));

  await assertFails(getDoc(doc(db(PLAYER), 'campaigns', CID, 'notes', 'n1')));
  await assertFails(getDocs(collection(db(PLAYER), 'campaigns', CID, 'notes')));
  await assertFails(setDoc(doc(db(PLAYER), 'campaigns', CID, 'notes', 'n3'), { id: 'n3', title: 'T', body: 'B', updatedAt: 1 }));
  await assertFails(deleteDoc(doc(db(PLAYER), 'campaigns', CID, 'notes', 'n1')));
});

test('las notas del DM respetan los límites de título y cuerpo', async () => {
  await assertFails(setDoc(doc(db(DM), 'campaigns', CID, 'notes', 'n4'), { id: 'n4', title: 'x'.repeat(121), body: '', updatedAt: 1 }));
  await assertFails(setDoc(doc(db(DM), 'campaigns', CID, 'notes', 'n5'), { id: 'n5', title: 'T', body: 'x'.repeat(20001), updatedAt: 1 }));
});

// ------------------------------------------------------------------ extraños

test('un extraño no lee mapas, combate ni notas', async () => {
  await assertFails(getDoc(mapRef(STRANGER)));
  await assertFails(getDocs(collection(db(STRANGER), 'campaigns', CID, 'maps')));
  await assertFails(getDoc(doc(db(STRANGER), 'campaigns', CID, 'combat', 'current')));
  await assertFails(getDoc(doc(db(STRANGER), 'campaigns', CID, 'notes', 'n1')));
  await assertFails(updateDoc(mapRef(STRANGER), move('t-player', 1, 1, STRANGER)));
});
