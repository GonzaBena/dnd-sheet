// tests/rules/fog_secret_rules.test.mjs
// Pruebas de reglas de seguridad de Firestore y RTDB para Fase 4:
// Niebla de guerra y tokens ocultos (T-40 ... T-43, RF-24, RF-30, RF-31).
// Corre contra los emuladores: `pnpm test:rules`.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  collection,
  writeBatch,
  deleteField,
  setLogLevel,
} from 'firebase/firestore';
import { ref, set } from 'firebase/database';

setLogLevel('silent');

const PROJECT_ID = 'demo-dnd-sheet';
let env;

const DM = 'uid-dm';
const PLAYER = 'uid-player';
const OTHER = 'uid-other';
const STRANGER = 'uid-stranger';
const CID = 'camp-fog-fase4';
const MID = 'm1';
const ROOM = 'room-fog-fase4';

const fsCache = new Map();
const rtdbCache = new Map();

const fsDb = (uid) => {
  const key = uid || '__anon__';
  if (!fsCache.has(key)) {
    fsCache.set(key, uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());
  }
  return fsCache.get(key);
};

const rtdbDb = (uid) => {
  const key = uid || '__anon__';
  if (!rtdbCache.has(key)) {
    rtdbCache.set(key, uid ? env.authenticatedContext(uid).database() : env.unauthenticatedContext().database());
  }
  return rtdbCache.get(key);
};

const mapRef = (uid) => doc(fsDb(uid), 'campaigns', CID, 'maps', MID);
const privateRef = (uid) => doc(fsDb(uid), 'campaigns', CID, 'maps', MID, 'private', 'dmOnly');
const campaignRef = (uid) => doc(fsDb(uid), 'campaigns', CID);

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
      't-dm': makeToken('Goblin', null, 200, 200),
    },
    fogRevealed: [],
    updatedAt: 1,
    ...overrides,
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
  fsCache.clear();
  rtdbCache.clear();
  await env.clearFirestore();
  await env.clearDatabase();

  // 1. Seed Firestore
  await seedFirestore(async (fs) => {
    await setDoc(doc(fs, 'campaigns', CID), {
      id: CID,
      name: 'Mesa de Sombras',
      creatorId: DM,
      dmId: DM,
      dmName: 'Master',
      memberUserIds: [DM, PLAYER, OTHER],
      inviteCode: 'FOG4444',
      status: 'active',
      liveRoomId: ROOM,
      createdAt: 1,
    });

    await setDoc(doc(fs, 'campaigns', CID, 'maps', MID), baseMap());
    await setDoc(doc(fs, 'campaigns', CID, 'maps', MID, 'private', 'dmOnly'), {
      secretTokens: {
        't-lich': makeToken('Lich', null, 500, 500, '#e11d48'),
      },
    });
  });

  // 2. Seed RTDB
  await seedRtdb(async (rtdb) => {
    await set(ref(rtdb, `rooms/${ROOM}`), {
      meta: { dm: DM, cid: CID },
      status: 'active',
      members: {
        [DM]: true,
        [PLAYER]: true,
        [OTHER]: true,
      },
      tokenOwners: {
        [MID]: {
          't-player': PLAYER,
        },
      },
      live: {},
    });
  });
});

// ---------------------------------------------------------------------------
// 1. Aislamiento de lectura y escritura de private/dmOnly (T-43, Criterio 4)
// ---------------------------------------------------------------------------

test('el jugador NO puede leer getDoc de maps/{mid}/private/dmOnly ni listar maps/{mid}/private', async () => {
  await assertFails(getDoc(privateRef(PLAYER)));
  await assertFails(getDocs(collection(fsDb(PLAYER), 'campaigns', CID, 'maps', MID, 'private')));
});

test('un usuario no miembro o sin sesión no puede leer ni escribir private/dmOnly', async () => {
  await assertFails(getDoc(privateRef(STRANGER)));
  await assertFails(setDoc(privateRef(STRANGER), { secretTokens: {} }));
  await assertFails(getDoc(doc(fsDb(''), 'campaigns', CID, 'maps', MID, 'private', 'dmOnly')));
});

test('el DM puede leer y escribir private/dmOnly en active y paused', async () => {
  // En active
  const snap = await assertSucceeds(getDoc(privateRef(DM)));
  assert.equal(snap.exists(), true);
  assert.equal(snap.data().secretTokens['t-lich'].name, 'Lich');

  await assertSucceeds(
    setDoc(
      privateRef(DM),
      { secretTokens: { 't-mimic': makeToken('Mimic', null, 100, 100) } },
      { merge: true }
    )
  );

  // En paused (preparación permitida)
  await seedFirestore(async (fs) => {
    await updateDoc(doc(fs, 'campaigns', CID), { status: 'paused' });
  });

  await assertSucceeds(getDoc(privateRef(DM)));
  await assertSucceeds(
    updateDoc(privateRef(DM), {
      'secretTokens.t-mimic.x': 150,
    })
  );
});

test('el DM NO puede escribir private/dmOnly cuando la partida está ended', async () => {
  await seedFirestore(async (fs) => {
    await updateDoc(doc(fs, 'campaigns', CID), { status: 'ended' });
  });

  // Lectura permitida para consulta
  await assertSucceeds(getDoc(privateRef(DM)));
  // Escritura bloqueada
  await assertFails(
    setDoc(privateRef(DM), { secretTokens: {} })
  );
});

// ---------------------------------------------------------------------------
// 2. Escrituras de Niebla de Guerra (T-40, T-41, F0B-4)
// ---------------------------------------------------------------------------

test('el jugador NO puede escribir fogRevealed en el documento del mapa', async () => {
  await assertFails(
    updateDoc(mapRef(PLAYER), {
      fogRevealed: [{ kind: 'rect', x: 0, y: 0, w: 200, h: 200 }],
      updatedAt: Date.now(),
    })
  );
});

test('el DM escribe fogRevealed con la partida active', async () => {
  const shape = { kind: 'rect', x: 50, y: 50, w: 300, h: 200 };
  await assertSucceeds(
    updateDoc(mapRef(DM), {
      fogRevealed: [shape],
      updatedAt: Date.now(),
    })
  );

  const snap = await getDoc(mapRef(PLAYER));
  assert.equal(snap.data().fogRevealed.length, 1);
  assert.deepEqual(snap.data().fogRevealed[0], shape);
});

test('el DM puede preparar fogRevealed en paused pero NO cuando la partida está ended (F0B-4)', async () => {
  // 1. Paused: permitido preparar niebla
  await seedFirestore(async (fs) => {
    await updateDoc(doc(fs, 'campaigns', CID), { status: 'paused' });
  });

  await assertSucceeds(
    updateDoc(mapRef(DM), {
      fogRevealed: [{ kind: 'rect', x: 0, y: 0, w: 100, h: 100 }],
      updatedAt: Date.now(),
    })
  );

  // 2. Ended: bloqueado
  await seedFirestore(async (fs) => {
    await updateDoc(doc(fs, 'campaigns', CID), { status: 'ended' });
  });

  await assertFails(
    updateDoc(mapRef(DM), {
      fogRevealed: [],
      updatedAt: Date.now(),
    })
  );
});

test('el mapa rechaza más de 500 formas de niebla según validMap()', async () => {
  const shape = { kind: 'rect', x: 0, y: 0, w: 10, h: 10 };

  // 500 formas exactas: permitido
  const shapes500 = Array.from({ length: 500 }, () => shape);
  await assertSucceeds(
    updateDoc(mapRef(DM), {
      fogRevealed: shapes500,
      updatedAt: Date.now(),
    })
  );

  // 501 formas: falla por validMap()
  const shapes501 = Array.from({ length: 501 }, () => shape);
  await assertFails(
    updateDoc(mapRef(DM), {
      fogRevealed: shapes501,
      updatedAt: Date.now(),
    })
  );
});

// ---------------------------------------------------------------------------
// 3. Ocultar y Revelar Tokens Atómicamente con Batch (T-42, RF-24, F4-5)
// ---------------------------------------------------------------------------

test('el DM oculta un token con writeBatch en active y desaparece para el jugador', async () => {
  const batch = writeBatch(fsDb(DM));
  const elenaToken = makeToken('Elena', PLAYER, 50, 50);

  // Mover de maps/{mid}.tokens a private/dmOnly.secretTokens
  batch.update(mapRef(DM), {
    'tokens.t-player': deleteField(),
    updatedAt: Date.now(),
  });
  batch.set(
    privateRef(DM),
    { secretTokens: { 't-player': elenaToken } },
    { merge: true }
  );

  await assertSucceeds(batch.commit());

  // El jugador lee el mapa público: el token t-player ya NO existe en tokens
  const playerSnap = await getDoc(mapRef(PLAYER));
  assert.equal('t-player' in (playerSnap.data().tokens || {}), false);

  // El jugador sigue teniendo denegado leer private/dmOnly donde ahora está el token
  await assertFails(getDoc(privateRef(PLAYER)));

  // El DM lee private/dmOnly y encuentra el token
  const dmSnap = await getDoc(privateRef(DM));
  assert.equal(dmSnap.data().secretTokens['t-player'].name, 'Elena');
});

test('el DM revela un token con writeBatch y reaparece para el jugador', async () => {
  const batch = writeBatch(fsDb(DM));
  const lichToken = makeToken('Lich', null, 500, 500, '#e11d48');

  // Mover de private/dmOnly a maps/{mid}.tokens
  batch.update(mapRef(DM), {
    'tokens.t-lich': lichToken,
    updatedAt: Date.now(),
  });
  batch.update(privateRef(DM), {
    'secretTokens.t-lich': deleteField(),
  });

  await assertSucceeds(batch.commit());

  // El jugador lee el mapa público: el lich ya es visible
  const playerSnap = await getDoc(mapRef(PLAYER));
  assert.equal(playerSnap.data().tokens['t-lich'].name, 'Lich');

  // El DM confirma que ya no está en secretTokens
  const dmSnap = await getDoc(privateRef(DM));
  assert.equal('t-lich' in (dmSnap.data().secretTokens || {}), false);
});

test('el DM puede ocultar y revelar tokens en paused (preparación), pero no en ended', async () => {
  // En paused:
  await seedFirestore(async (fs) => {
    await updateDoc(doc(fs, 'campaigns', CID), { status: 'paused' });
  });

  const batchPaused = writeBatch(fsDb(DM));
  batchPaused.update(mapRef(DM), {
    'tokens.t-goblin': makeToken('Goblin Oculto', null, 100, 100),
    updatedAt: Date.now(),
  });
  await assertSucceeds(batchPaused.commit());

  // En ended:
  await seedFirestore(async (fs) => {
    await updateDoc(doc(fs, 'campaigns', CID), { status: 'ended' });
  });

  const batchEnded = writeBatch(fsDb(DM));
  batchEnded.update(mapRef(DM), {
    'tokens.t-goblin': deleteField(),
    updatedAt: Date.now(),
  });
  await assertFails(batchEnded.commit());
});

// ---------------------------------------------------------------------------
// 4. Aislamiento en RTDB para tokens ocultos (T-42, RF-24)
// ---------------------------------------------------------------------------

test('el jugador NO puede escribir live en RTDB para un token oculto porque no está en tokenOwners', async () => {
  // 't-lich' está oculto en dmOnly y NO tiene entrada en tokenOwners
  await assertFails(
    set(ref(rtdbDb(PLAYER), `rooms/${ROOM}/live/${MID}/t-lich`), {
      x: 300,
      y: 300,
      by: PLAYER,
    })
  );
});
