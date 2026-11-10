// tests/rules/tokens_live_rules.test.mjs
// Pruebas de reglas de seguridad de Firestore y RTDB para Fase 3 (Tokens en vivo).
// Corre contra los emuladores: `pnpm test:rules`.
import test, { before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, setLogLevel } from 'firebase/firestore';
import { ref, get, set, remove } from 'firebase/database';

setLogLevel('silent');

const PROJECT_ID = 'demo-dnd-sheet';
let env;

const DM = 'uid-dm';
const PLAYER = 'uid-player';
const OTHER = 'uid-other';
const STRANGER = 'uid-stranger';
const CID = 'camp-tokens-fase3';
const MID = 'm1';
const ROOM = 'room-tokens-fase3';

const fsDb = (uid) => env.authenticatedContext(uid).firestore();
const rtdbDb = (uid) => env.authenticatedContext(uid).database();

const mapRef = (uid) => doc(fsDb(uid), 'campaigns', CID, 'maps', MID);
const liveRef = (uid, tid) => ref(rtdbDb(uid), `rooms/${ROOM}/live/${MID}/${tid}`);

function makeToken(name, ownerUid, x = 0, y = 0, color = '#3b82f6') {
  return { name, x, y, size: 1, ownerUid, color };
}

function baseMap(overrides = {}) {
  return {
    name: 'Cripta Olvidada',
    imageUrl: 'https://example.com/map.png',
    imageWidth: 1000,
    imageHeight: 800,
    grid: { size: 50, offsetX: 0, offsetY: 0, visible: true },
    tokens: {
      't-player': makeToken('Elena', PLAYER, 50, 50),
      't-other': makeToken('Brom', OTHER, 100, 100),
      't-dm': makeToken('Lich', null, 200, 200),
    },
    fogRevealed: [],
    updatedAt: 1,
    ...overrides,
  };
}

function playerMove(tokenId, x, y, by = PLAYER) {
  return {
    [`tokens.${tokenId}.x`]: x,
    [`tokens.${tokenId}.y`]: y,
    lastMove: { tokenId, by, at: Date.now() },
    updatedAt: Date.now(),
  };
}

async function seedFirestore(fn) {
  await env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));
}

async function seedRtdb(fn) {
  await env.withSecurityRulesDisabled(async (ctx) => fn(ctx.database()));
}

before(async () => {
  const [fsHost, fsPort] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
  const [dbHost, dbPort] = (process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000').split(':');

  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      host: fsHost,
      port: Number(fsPort),
    },
    database: {
      rules: readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8'),
      host: dbHost,
      port: Number(dbPort),
    },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearDatabase();

  // Semilla de Firestore
  await seedFirestore(async (fs) => {
    await setDoc(doc(fs, 'campaigns', CID), {
      id: CID,
      name: 'VTT Tokens',
      creatorId: DM,
      dmId: DM,
      dmName: 'DM',
      memberUserIds: [DM, PLAYER, OTHER],
      inviteCode: 'F3TOKENS',
      status: 'active',
      liveRoomId: ROOM,
      createdAt: 1,
    });
    await setDoc(doc(fs, 'campaigns', CID, 'maps', MID), baseMap());
  });

  // Semilla de RTDB
  await seedRtdb(async (db) => {
    await set(ref(db, `rooms/${ROOM}`), {
      meta: { dm: DM, cid: CID },
      members: { [DM]: true, [PLAYER]: true, [OTHER]: true },
      status: 'active',
      tokenOwners: { [MID]: { 't-player': PLAYER, 't-other': OTHER } },
      live: { [MID]: { 't-other': { x: 100, y: 100, by: OTHER } } },
    });
  });
});

// ============================================================================
// Pruebas de Reglas de Firestore
// ============================================================================

test('F3-FS: Jugador mueve su propio token con lastMove en active', async () => {
  await assertSucceeds(updateDoc(mapRef(PLAYER), playerMove('t-player', 150, 200)));
  const snap = await getDoc(mapRef(DM));
  const t = snap.data().tokens['t-player'];
  if (t.x !== 150 || t.y !== 200) throw new Error('Posición no actualizada');
});

test('F3-FS: DM mueve token sin dueño (t-dm) con lastMove en active', async () => {
  await assertSucceeds(updateDoc(mapRef(DM), playerMove('t-dm', 250, 300, DM)));
});

test('F3-FS: DM mueve token de un jugador (t-player) con lastMove en active', async () => {
  await assertSucceeds(updateDoc(mapRef(DM), playerMove('t-player', 300, 350, DM)));
});

test('F3-FS: DM mueve token incluso si el mapa no tiene fogRevealed en Firestore', async () => {
  await seedFirestore(async (fs) => {
    const withoutFog = baseMap();
    delete withoutFog.fogRevealed;
    await setDoc(doc(fs, 'campaigns', CID, 'maps', 'm-no-fog'), withoutFog);
  });
  const mNoFog = (uid) => doc(fsDb(uid), 'campaigns', CID, 'maps', 'm-no-fog');
  await assertSucceeds(updateDoc(mNoFog(DM), playerMove('t-dm', 120, 140, DM)));
});

test('F3-FS: Jugador NO puede mover token si la partida está paused', async () => {
  await seedFirestore(async (fs) => {
    await updateDoc(doc(fs, 'campaigns', CID), { status: 'paused' });
  });
  await assertFails(updateDoc(mapRef(PLAYER), playerMove('t-player', 150, 200)));
});

test('F3-FS: Jugador NO puede mover token ajeno ni con lastMove falso (criterio 3)', async () => {
  // Intentar mover token de otro jugador
  await assertFails(updateDoc(mapRef(PLAYER), playerMove('t-other', 200, 200)));
  // Intentar mover token del DM
  await assertFails(updateDoc(mapRef(PLAYER), playerMove('t-dm', 200, 200)));
  // Intentar engañar apuntando lastMove a su token pero modificando otro
  await assertFails(
    updateDoc(mapRef(PLAYER), {
      'tokens.t-other.x': 300,
      lastMove: { tokenId: 't-player', by: PLAYER, at: 1 },
      updatedAt: 1,
    })
  );
});

test('F3-FS: Jugador NO puede mover dos tokens a la vez en una sola escritura', async () => {
  await assertFails(
    updateDoc(mapRef(PLAYER), {
      ...playerMove('t-player', 150, 150),
      'tokens.t-other.x': 300,
    })
  );
});

test('F3-FS: Jugador NO puede modificar name, size, ownerUid ni color de su token', async () => {
  const lm = { tokenId: 't-player', by: PLAYER, at: 1 };
  await assertFails(updateDoc(mapRef(PLAYER), { 'tokens.t-player.name': 'Hacker', lastMove: lm, updatedAt: 2 }));
  await assertFails(updateDoc(mapRef(PLAYER), { 'tokens.t-player.size': 2, lastMove: lm, updatedAt: 2 }));
  await assertFails(updateDoc(mapRef(PLAYER), { 'tokens.t-player.ownerUid': OTHER, lastMove: lm, updatedAt: 2 }));
  await assertFails(updateDoc(mapRef(PLAYER), { 'tokens.t-player.color': '#000000', lastMove: lm, updatedAt: 2 }));
});

test('F3-FS: Jugador NO puede agregar ni borrar tokens del mapa', async () => {
  await assertFails(
    updateDoc(mapRef(PLAYER), {
      'tokens.t-nuevo': makeToken('Clon', PLAYER),
      lastMove: { tokenId: 't-nuevo', by: PLAYER, at: 1 },
      updatedAt: 2,
    })
  );
  await assertFails(
    updateDoc(mapRef(PLAYER), {
      'tokens.t-player': null,
      updatedAt: 2,
    })
  );
});

test('F3-FS: DM en paused NO puede escribir lastMove (F0B-4, F3-2)', async () => {
  await seedFirestore(async (fs) => {
    await updateDoc(doc(fs, 'campaigns', CID), { status: 'paused' });
  });

  // El DM en paused puede preparar (cambiar name o agregar token)
  await assertSucceeds(
    updateDoc(mapRef(DM), {
      name: 'Cripta (Pausada)',
      updatedAt: 2,
    })
  );

  // Pero NO puede escribir lastMove (lo bloquean las reglas F0B-4)
  await assertFails(
    updateDoc(mapRef(DM), {
      'tokens.t-dm.x': 350,
      'tokens.t-dm.y': 350,
      lastMove: { tokenId: 't-dm', by: DM, at: 2 },
      updatedAt: 2,
    })
  );
});

// ============================================================================
// Pruebas de Reglas de RTDB
// ============================================================================

test('F3-RTDB: Dueño del token y DM escriben en live con active', async () => {
  await assertSucceeds(set(liveRef(PLAYER, 't-player'), { x: 60, y: 70, by: PLAYER }));
  await assertSucceeds(set(liveRef(DM, 't-dm'), { x: 210, y: 220, by: DM }));
  await assertSucceeds(set(liveRef(DM, 't-player'), { x: 80, y: 90, by: DM }));
});

test('F3-RTDB: Falla si by no coincide con el auth.uid', async () => {
  await assertFails(set(liveRef(PLAYER, 't-player'), { x: 60, y: 70, by: OTHER }));
  await assertFails(set(liveRef(PLAYER, 't-player'), { x: 60, y: 70, by: DM }));
});

test('F3-RTDB: Falla con campos extra en el nodo live', async () => {
  await assertFails(set(liveRef(PLAYER, 't-player'), { x: 60, y: 70, by: PLAYER, extra: 123 }));
  await assertFails(set(liveRef(PLAYER, 't-player'), { x: '60', y: 70, by: PLAYER }));
});

test('F3-RTDB: Jugador no puede escribir en live de tokens ajenos', async () => {
  await assertFails(set(liveRef(PLAYER, 't-other'), { x: 10, y: 10, by: PLAYER }));
  await assertFails(set(liveRef(PLAYER, 't-dm'), { x: 10, y: 10, by: PLAYER }));
});

test('F3-RTDB: Con la partida paused o ended nadie escribe en live', async () => {
  await seedRtdb(async (db) => {
    await set(ref(db, `rooms/${ROOM}/status`), 'paused');
  });

  await assertFails(set(liveRef(PLAYER, 't-player'), { x: 10, y: 10, by: PLAYER }));
  await assertFails(set(liveRef(DM, 't-dm'), { x: 10, y: 10, by: DM }));

  await seedRtdb(async (db) => {
    await set(ref(db, `rooms/${ROOM}/status`), 'ended');
  });

  await assertFails(set(liveRef(PLAYER, 't-player'), { x: 10, y: 10, by: PLAYER }));
});

test('F3-RTDB: Borrar el propio nodo live funciona también en paused (evitar nodos colgados)', async () => {
  await assertSucceeds(set(liveRef(PLAYER, 't-player'), { x: 10, y: 20, by: PLAYER }));

  // Pausar partida
  await seedRtdb(async (db) => {
    await set(ref(db, `rooms/${ROOM}/status`), 'paused');
  });

  // Borrar el nodo propio debe seguir permitido
  await assertSucceeds(remove(liveRef(PLAYER, 't-player')));
});

test('F3-RTDB: Jugador NO puede borrar el nodo live de otro usuario', async () => {
  await assertFails(remove(liveRef(PLAYER, 't-other')));
});
