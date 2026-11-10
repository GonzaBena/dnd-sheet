// tests/rules/notes_rules.test.mjs
// Reglas de campaigns/{cid}/notes (T-50, RF-40): solo el DM, con canPrepare() para escribir.
// Corre contra el emulador: `pnpm test:rules`.
import test, { before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-dnd-sheet';
let env;

const DM = 'uid-dm';
const PLAYER = 'uid-player';
const STRANGER = 'uid-stranger';

const CID_ACTIVE = 'camp-active';
const CID_PAUSED = 'camp-paused';
const CID_ENDED = 'camp-ended';

const db = (uid) => env.authenticatedContext(uid).firestore();

function baseCampaign(id, status) {
  return {
    id,
    name: `Campaña ${id}`,
    creatorId: DM,
    dmId: DM,
    dmName: 'DM',
    memberUserIds: [DM, PLAYER],
    inviteCode: `CODE-${id}`,
    createdAt: 1,
    status,
  };
}

const note = (overrides = {}) => ({ title: 'Trampa', body: 'Detrás de la puerta', updatedAt: 1, ...overrides });

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
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore();
    for (const [cid, status] of [[CID_ACTIVE, 'active'], [CID_PAUSED, 'paused'], [CID_ENDED, 'ended']]) {
      await setDoc(doc(fs, 'campaigns', cid), baseCampaign(cid, status));
      await setDoc(doc(fs, 'campaigns', cid, 'notes', 'n1'), note());
    }
  });
});

test('el DM lee, lista y crea notas en active', async () => {
  await assertSucceeds(getDoc(doc(db(DM), 'campaigns', CID_ACTIVE, 'notes', 'n1')));
  await assertSucceeds(getDocs(collection(db(DM), 'campaigns', CID_ACTIVE, 'notes')));
  await assertSucceeds(setDoc(doc(db(DM), 'campaigns', CID_ACTIVE, 'notes', 'n2'), note()));
});

test('un jugador no lee, ni lista, ni escribe notas', async () => {
  const p = db(PLAYER);
  await assertFails(getDoc(doc(p, 'campaigns', CID_ACTIVE, 'notes', 'n1')));
  await assertFails(getDocs(collection(p, 'campaigns', CID_ACTIVE, 'notes')));
  await assertFails(setDoc(doc(p, 'campaigns', CID_ACTIVE, 'notes', 'n2'), note()));
  await assertFails(updateDoc(doc(p, 'campaigns', CID_ACTIVE, 'notes', 'n1'), { body: 'x' }));
  await assertFails(deleteDoc(doc(p, 'campaigns', CID_ACTIVE, 'notes', 'n1')));
});

test('un extraño no lee notas', async () => {
  await assertFails(getDoc(doc(db(STRANGER), 'campaigns', CID_ACTIVE, 'notes', 'n1')));
  await assertFails(getDocs(collection(db(STRANGER), 'campaigns', CID_ACTIVE, 'notes')));
});

test('el DM crea en paused y no en ended; en ended solo lee', async () => {
  await assertSucceeds(setDoc(doc(db(DM), 'campaigns', CID_PAUSED, 'notes', 'n2'), note()));
  await assertFails(setDoc(doc(db(DM), 'campaigns', CID_ENDED, 'notes', 'n2'), note()));
  await assertFails(updateDoc(doc(db(DM), 'campaigns', CID_ENDED, 'notes', 'n1'), { body: 'x' }));
  await assertFails(deleteDoc(doc(db(DM), 'campaigns', CID_ENDED, 'notes', 'n1')));
  await assertSucceeds(getDoc(doc(db(DM), 'campaigns', CID_ENDED, 'notes', 'n1')));
});

test('falla con body de más de 20.000 caracteres o título de más de 120', async () => {
  const d = db(DM);
  await assertSucceeds(setDoc(doc(d, 'campaigns', CID_ACTIVE, 'notes', 'ok'), note({ body: 'a'.repeat(20000) })));
  await assertFails(setDoc(doc(d, 'campaigns', CID_ACTIVE, 'notes', 'big'), note({ body: 'a'.repeat(20001) })));
  await assertFails(setDoc(doc(d, 'campaigns', CID_ACTIVE, 'notes', 'long'), note({ title: 't'.repeat(121) })));
});

test('el DM edita y borra en active', async () => {
  await assertSucceeds(updateDoc(doc(db(DM), 'campaigns', CID_ACTIVE, 'notes', 'n1'), { body: 'nuevo', updatedAt: 2 }));
  await assertSucceeds(deleteDoc(doc(db(DM), 'campaigns', CID_ACTIVE, 'notes', 'n1')));
});
