// tests/rules/hp_transaction_concurrency.test.mjs
// Transacción de PG (src/scripts/data/hpTransaction.ts) con dos clientes reales escribiendo a la vez
// contra el emulador de Firestore y las reglas reales. Corre con `pnpm test:rules` (requiere Java).
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import * as fs from 'firebase/firestore';

const { runHpTransaction } = await import('../../src/scripts/data/hpTransaction.ts');

fs.setLogLevel('silent');

const PROJECT_ID = 'demo-dnd-sheet';
const DM = 'uid-dm';
const PLAYER = 'uid-player';
const STRANGER = 'uid-stranger';
const CID = 'camp-hp';
const CHAR = 'char-hp';

let env;
const db = (uid) => env.authenticatedContext(uid).firestore();

async function seed({ status = 'active', hp = { current: 50, max: 100, temp: 0 } } = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const sdb = ctx.firestore();
    await fs.setDoc(fs.doc(sdb, 'campaigns', CID), {
      id: CID, name: 'PG', creatorId: DM, dmId: DM, memberUserIds: [DM, PLAYER], status, createdAt: 1,
    });
    await fs.setDoc(fs.doc(sdb, 'characters', CHAR), {
      id: CHAR, userId: PLAYER, campaignId: CID, name: 'Lyra', hp, inspiration: false, level: 3, updatedAt: 1,
    });
  });
}

async function readChar() {
  let data;
  await env.withSecurityRulesDisabled(async (ctx) => {
    data = (await fs.getDoc(fs.doc(ctx.firestore(), 'characters', CHAR))).data();
  });
  return data;
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

test('DM y jugadora escriben a la vez: el resultado es exactamente la suma de todos los cambios', async () => {
  await seed();
  const dmDb = db(DM);
  const playerDb = db(PLAYER);
  const playerDeltas = [-1, -1, -1, -2, -3, -1, -1, -2];
  const dmDeltas = [+1, -4, +2, +1, -1, +3];
  const ops = [
    ...playerDeltas.map((amount) => () => runHpTransaction(fs, playerDb, CHAR, { kind: 'delta', amount })),
    ...dmDeltas.map((amount) => () => runHpTransaction(fs, dmDb, CHAR, { kind: 'delta', amount })),
  ];
  // Intercalados y todos en paralelo.
  ops.sort(() => Math.random() - 0.5);
  const results = await Promise.all(ops.map((run) => run()));

  const expected = 50 + [...playerDeltas, ...dmDeltas].reduce((a, b) => a + b, 0);
  const doc = await readChar();
  assert.equal(doc.hp.current, expected);
  assert.equal(doc.hpRev, ops.length, 'cada cambio incrementó hpRev una vez');

  // Cada transacción vio un estado distinto (serializadas en el servidor) y los revs son 1..N.
  const revs = results.map((r) => r.rev).sort((a, b) => a - b);
  assert.deepEqual(revs, Array.from({ length: ops.length }, (_, i) => i + 1));
  // Encadenando before → after por rev se reconstruye la historia completa sin huecos.
  const byRev = [...results].sort((a, b) => a.rev - b.rev);
  for (let i = 1; i < byRev.length; i++) {
    assert.equal(byRev[i].before.current, byRev[i - 1].after.current, `el rev ${byRev[i].rev} partió del valor del rev anterior`);
  }
});

test('clamp con PG temporales bajo concurrencia: el daño consume temporales y nunca baja de 0', async () => {
  await seed({ hp: { current: 3, max: 10, temp: 2 } });
  const runs = [
    ...[1, 2, 3].map(() => runHpTransaction(fs, db(PLAYER), CHAR, { kind: 'delta', amount: -1 })),
    ...[1, 2, 3, 4].map(() => runHpTransaction(fs, db(DM), CHAR, { kind: 'delta', amount: -1 })),
  ];
  await Promise.all(runs);
  const doc = await readChar();
  assert.deepEqual(doc.hp, { current: 0, max: 10, temp: 0 }, '7 de daño: 2 a temporales, 3 a actuales y el resto se pierde en 0');
});

test('curación concurrente no supera el máximo', async () => {
  await seed({ hp: { current: 95, max: 100, temp: 0 } });
  await Promise.all([
    runHpTransaction(fs, db(PLAYER), CHAR, { kind: 'delta', amount: 3 }),
    runHpTransaction(fs, db(DM), CHAR, { kind: 'delta', amount: 4 }),
    runHpTransaction(fs, db(DM), CHAR, { kind: 'delta', amount: 4 }),
  ]);
  assert.equal((await readChar()).hp.current, 100);
});

test('un cambio que no modifica nada no escribe ni incrementa hpRev', async () => {
  await seed({ hp: { current: 100, max: 100, temp: 0 } });
  const res = await runHpTransaction(fs, db(DM), CHAR, { kind: 'delta', amount: 5 });
  assert.equal(res.rev, 0);
  const doc = await readChar();
  assert.equal(doc.hpRev, undefined);
  assert.equal(doc.updatedAt, 1);
});

test('con la partida en pausa la transacción del DM es rechazada y el documento no cambia', async () => {
  await seed({ status: 'paused' });
  await assert.rejects(
    runHpTransaction(fs, db(DM), CHAR, { kind: 'delta', amount: -5 }),
    (err) => err.code === 'permission-denied'
  );
  assert.equal((await readChar()).hp.current, 50);
  // La jugadora sí puede cambiar su propia ficha.
  await runHpTransaction(fs, db(PLAYER), CHAR, { kind: 'delta', amount: -5 });
  assert.equal((await readChar()).hp.current, 45);
});

test('alguien ajeno a la campaña no puede cambiar los PG', async () => {
  await seed();
  await assert.rejects(runHpTransaction(fs, db(STRANGER), CHAR, { kind: 'delta', amount: -1 }));
  assert.equal((await readChar()).hp.current, 50);
});

test('un guardado general del dueño en paralelo no pisa los PG escritos por transacción', async () => {
  await seed();
  const playerDb = db(PLAYER);
  await Promise.all([
    runHpTransaction(fs, db(DM), CHAR, { kind: 'delta', amount: -10 }),
    fs.updateDoc(fs.doc(playerDb, 'characters', CHAR), { level: 4, updatedAt: 99 }),
    runHpTransaction(fs, playerDb, CHAR, { kind: 'delta', amount: -5 }),
  ]);
  const doc = await readChar();
  assert.equal(doc.hp.current, 35);
  assert.equal(doc.level, 4);
});

test('el DM no puede saltear la transacción escribiendo un PG calculado sin hpRev', async () => {
  await seed();
  await assertFails(fs.updateDoc(fs.doc(db(DM), 'characters', CHAR), { hp: { current: 1, max: 100, temp: 0 }, updatedAt: 2 }));
});
