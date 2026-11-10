// tests/rules/combat_turn_rules.test.mjs
// Pruebas de reglas de seguridad de Firestore para Fase C — Terminar mi turno (T-66, RF-72).
// Corre contra el emulador: `pnpm test:rules`.
import test, { before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, setLogLevel } from 'firebase/firestore';

setLogLevel('silent');

const PROJECT_ID = 'demo-dnd-sheet';
let env;

const DM = 'uid-dm';
const PLAYER_A = 'uid-player-a';
const PLAYER_B = 'uid-player-b';
const STRANGER = 'uid-stranger';
const CID = 'camp-combat-turn-fasec';

const fsDb = (uid) => env.authenticatedContext(uid).firestore();
const combatRef = (uid) => doc(fsDb(uid), 'campaigns', CID, 'combat', 'current');

function baseCombat(overrides = {}) {
  return {
    active: true,
    round: 1,
    turnIndex: 0,
    combatants: [
      {
        id: 'c-a',
        name: 'Thorin',
        initiative: 18,
        hp: 30,
        maxHp: 30,
        conditions: [],
        isPlayer: true,
        hiddenHp: false,
        ownerUid: PLAYER_A,
      },
      {
        id: 'c-b',
        name: 'Elena',
        initiative: 14,
        hp: 24,
        maxHp: 24,
        conditions: [],
        isPlayer: true,
        hiddenHp: false,
        ownerUid: PLAYER_B,
      },
      {
        id: 'c-goblin',
        name: 'Goblin',
        initiative: 10,
        hp: 7,
        maxHp: 7,
        conditions: [],
        isPlayer: false,
        hiddenHp: true,
      },
    ],
    updatedAt: 1000,
    ...overrides,
  };
}

async function seedFirestore(fn) {
  await env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));
}

before(async () => {
  const [fsHost, fsPort] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');

  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      host: fsHost,
      port: Number(fsPort),
    },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();

  await seedFirestore(async (fs) => {
    await setDoc(doc(fs, 'campaigns', CID), {
      id: CID,
      name: 'Mesa Viva Combate',
      creatorId: DM,
      dmId: DM,
      dmName: 'DM',
      memberUserIds: [DM, PLAYER_A, PLAYER_B],
      inviteCode: 'FASEC123',
      status: 'active',
      createdAt: 1,
    });
    await setDoc(doc(fs, 'campaigns', CID, 'combat', 'current'), baseCombat());
  });
});

test('T-66 (1): Jugador A, en su turno (índice 0), avanza a 1 en la misma ronda', async () => {
  await assertSucceeds(
    updateDoc(combatRef(PLAYER_A), {
      turnIndex: 1,
      round: 1,
      updatedAt: 2000,
    })
  );
  const snap = await getDoc(combatRef(DM));
  if (snap.data().turnIndex !== 1 || snap.data().round !== 1) {
    throw new Error('El turno no avanzó a índice 1 ronda 1');
  }
});

test('T-66 (2): Jugador A, en su turno siendo el último de la lista, vuelve a 0 con ronda +1', async () => {
  await seedFirestore(async (fs) => {
    await setDoc(
      doc(fs, 'campaigns', CID, 'combat', 'current'),
      baseCombat({
        turnIndex: 2,
        round: 3,
        combatants: [
          { id: 'c-b', name: 'Elena', initiative: 18, hp: 20, maxHp: 20, conditions: [], isPlayer: true, hiddenHp: false, ownerUid: PLAYER_B },
          { id: 'c-goblin', name: 'Goblin', initiative: 12, hp: 7, maxHp: 7, conditions: [], isPlayer: false, hiddenHp: true },
          { id: 'c-a', name: 'Thorin', initiative: 8, hp: 30, maxHp: 30, conditions: [], isPlayer: true, hiddenHp: false, ownerUid: PLAYER_A },
        ],
      })
    );
  });

  await assertSucceeds(
    updateDoc(combatRef(PLAYER_A), {
      turnIndex: 0,
      round: 4,
      updatedAt: 2000,
    })
  );
});

test('T-66 (3): Jugador A, siendo el último, NO puede volver a 0 sin sumar ronda', async () => {
  await seedFirestore(async (fs) => {
    await setDoc(
      doc(fs, 'campaigns', CID, 'combat', 'current'),
      baseCombat({
        turnIndex: 2,
        round: 3,
        combatants: [
          { id: 'c-b', name: 'Elena', initiative: 18, hp: 20, maxHp: 20, conditions: [], isPlayer: true, hiddenHp: false, ownerUid: PLAYER_B },
          { id: 'c-goblin', name: 'Goblin', initiative: 12, hp: 7, maxHp: 7, conditions: [], isPlayer: false, hiddenHp: true },
          { id: 'c-a', name: 'Thorin', initiative: 8, hp: 30, maxHp: 30, conditions: [], isPlayer: true, hiddenHp: false, ownerUid: PLAYER_A },
        ],
      })
    );
  });

  await assertFails(
    updateDoc(combatRef(PLAYER_A), {
      turnIndex: 0,
      round: 3,
      updatedAt: 2000,
    })
  );
});

test('T-66 (4): Jugador A NO puede avanzar de 0 a 2 (saltear un combatiente)', async () => {
  await assertFails(
    updateDoc(combatRef(PLAYER_A), {
      turnIndex: 2,
      round: 1,
      updatedAt: 2000,
    })
  );
});

test('T-66 (5): Jugador A NO puede retroceder el turno', async () => {
  await seedFirestore(async (fs) => {
    await setDoc(
      doc(fs, 'campaigns', CID, 'combat', 'current'),
      baseCombat({
        turnIndex: 1,
        round: 2,
        combatants: [
          { id: 'c-b', name: 'Elena', initiative: 18, hp: 20, maxHp: 20, conditions: [], isPlayer: true, hiddenHp: false, ownerUid: PLAYER_B },
          { id: 'c-a', name: 'Thorin', initiative: 14, hp: 30, maxHp: 30, conditions: [], isPlayer: true, hiddenHp: false, ownerUid: PLAYER_A },
          { id: 'c-goblin', name: 'Goblin', initiative: 10, hp: 7, maxHp: 7, conditions: [], isPlayer: false, hiddenHp: true },
        ],
      })
    );
  });

  await assertFails(
    updateDoc(combatRef(PLAYER_A), {
      turnIndex: 0,
      round: 2,
      updatedAt: 2000,
    })
  );
});

test('T-66 (6): Jugador A NO puede avanzar y además cambiar combatants (PG)', async () => {
  const modified = baseCombat();
  modified.combatants[0].hp = 999;

  await assertFails(
    updateDoc(combatRef(PLAYER_A), {
      turnIndex: 1,
      round: 1,
      combatants: modified.combatants,
      updatedAt: 2000,
    })
  );
});

test('T-66 (7): Jugador A NO puede avanzar cuando el turno es de B', async () => {
  await seedFirestore(async (fs) => {
    await updateDoc(doc(fs, 'campaigns', CID, 'combat', 'current'), { turnIndex: 1 });
  });

  await assertFails(
    updateDoc(combatRef(PLAYER_A), {
      turnIndex: 2,
      round: 1,
      updatedAt: 2000,
    })
  );
});

test('T-66 (8): Jugador A NO puede avanzar cuando el turno es del goblin (sin ownerUid)', async () => {
  await seedFirestore(async (fs) => {
    await updateDoc(doc(fs, 'campaigns', CID, 'combat', 'current'), { turnIndex: 2 });
  });

  await assertFails(
    updateDoc(combatRef(PLAYER_A), {
      turnIndex: 0,
      round: 2,
      updatedAt: 2000,
    })
  );
});

test('T-66 (9): Jugador A NO puede avanzar con la partida paused o ended', async () => {
  await seedFirestore(async (fs) => {
    await updateDoc(doc(fs, 'campaigns', CID), { status: 'paused' });
  });

  await assertFails(
    updateDoc(combatRef(PLAYER_A), {
      turnIndex: 1,
      round: 1,
      updatedAt: 2000,
    })
  );

  await seedFirestore(async (fs) => {
    await updateDoc(doc(fs, 'campaigns', CID), { status: 'ended' });
  });

  await assertFails(
    updateDoc(combatRef(PLAYER_A), {
      turnIndex: 1,
      round: 1,
      updatedAt: 2000,
    })
  );
});

test('T-66 (10): Jugador A NO puede avanzar con active: false (combate terminado)', async () => {
  await seedFirestore(async (fs) => {
    await updateDoc(doc(fs, 'campaigns', CID, 'combat', 'current'), { active: false });
  });

  await assertFails(
    updateDoc(combatRef(PLAYER_A), {
      turnIndex: 1,
      round: 1,
      updatedAt: 2000,
    })
  );
});

test('T-66 (11): Extraño (no miembro) NO puede avanzar aunque su uid coincida', async () => {
  await seedFirestore(async (fs) => {
    const c = baseCombat();
    c.combatants[0].ownerUid = STRANGER;
    await setDoc(doc(fs, 'campaigns', CID, 'combat', 'current'), c);
  });

  await assertFails(
    updateDoc(combatRef(STRANGER), {
      turnIndex: 1,
      round: 1,
      updatedAt: 2000,
    })
  );
});

test('T-66 (12): DM escribe el documento completo con la partida active (regla existente)', async () => {
  const nextDoc = baseCombat({ round: 2, turnIndex: 2, updatedAt: 3000 });
  nextDoc.combatants[2].hp = 3;
  await assertSucceeds(setDoc(combatRef(DM), nextDoc));
});
