// tests/rules/handout_rules.test.mjs
// Reglas de campaigns/{cid}/handouts (T-52, RF-41). Corre contra el emulador: `pnpm test:rules`.
import test, { before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, query, where, orderBy, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-dnd-sheet';
let env;

const DM = 'uid-dm';
const PLAYER = 'uid-player';
const STRANGER = 'uid-stranger';

const CID_ACTIVE = 'camp-active';
const CID_PAUSED = 'camp-paused';
const CID_ENDED = 'camp-ended';

const db = (uid) => env.authenticatedContext(uid).firestore();
const hRef = (uid, cid, id) => doc(db(uid), 'campaigns', cid, 'handouts', id);

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

const text = (o = {}) => ({ kind: 'text', title: 'Carta', body: 'Querido héroe…', sentAt: null, createdAt: 1, ...o });
const image = (o = {}) => ({ kind: 'image', title: 'Mapa', imageUrl: 'https://example.com/m.png', sentAt: null, createdAt: 1, ...o });

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
      await setDoc(doc(fs, 'campaigns', cid, 'handouts', 'draft'), text());
      await setDoc(doc(fs, 'campaigns', cid, 'handouts', 'sent'), text({ title: 'Enviado', sentAt: 5 }));
    }
  });
});

test('el jugador no lee un borrador y sí uno enviado', async () => {
  await assertFails(getDoc(hRef(PLAYER, CID_ACTIVE, 'draft')));
  await assertSucceeds(getDoc(hRef(PLAYER, CID_ACTIVE, 'sent')));
});

test('el jugador lista solo los enviados con where(sentAt != null); listar todo falla', async () => {
  const col = collection(db(PLAYER), 'campaigns', CID_ACTIVE, 'handouts');
  const snap = await assertSucceeds(getDocs(query(col, where('sentAt', '!=', null), orderBy('sentAt', 'desc'))));
  if (snap.docs.length !== 1 || snap.docs[0].id !== 'sent') throw new Error('Debía listar solo el handout enviado');
  await assertFails(getDocs(col));
});

test('el DM lee borradores y enviados; un extraño no lee nada', async () => {
  await assertSucceeds(getDoc(hRef(DM, CID_ACTIVE, 'draft')));
  await assertSucceeds(getDocs(collection(db(DM), 'campaigns', CID_ACTIVE, 'handouts')));
  await assertFails(getDoc(hRef(STRANGER, CID_ACTIVE, 'sent')));
});

test('el jugador no crea, edita ni borra handouts', async () => {
  await assertFails(setDoc(hRef(PLAYER, CID_ACTIVE, 'p1'), text()));
  await assertFails(updateDoc(hRef(PLAYER, CID_ACTIVE, 'sent'), { title: 'x' }));
  await assertFails(deleteDoc(hRef(PLAYER, CID_ACTIVE, 'sent')));
});

test('el DM envía en active y no en paused', async () => {
  await assertSucceeds(updateDoc(hRef(DM, CID_ACTIVE, 'draft'), { sentAt: 10 }));
  await assertFails(updateDoc(hRef(DM, CID_PAUSED, 'draft'), { sentAt: 10 }));
  // crear ya enviado también cuenta como jugar
  await assertSucceeds(setDoc(hRef(DM, CID_ACTIVE, 'n1'), text({ sentAt: 10 })));
  await assertFails(setDoc(hRef(DM, CID_PAUSED, 'n1'), text({ sentAt: 10 })));
});

test('el DM crea y edita borradores en paused, y borra; en ended no escribe', async () => {
  await assertSucceeds(setDoc(hRef(DM, CID_PAUSED, 'n1'), text()));
  await assertSucceeds(updateDoc(hRef(DM, CID_PAUSED, 'draft'), { title: 'Otro' }));
  await assertSucceeds(deleteDoc(hRef(DM, CID_PAUSED, 'draft')));
  await assertFails(setDoc(hRef(DM, CID_ENDED, 'n1'), text()));
  await assertFails(updateDoc(hRef(DM, CID_ENDED, 'draft'), { title: 'Otro' }));
  await assertFails(deleteDoc(hRef(DM, CID_ENDED, 'draft')));
  await assertSucceeds(getDoc(hRef(DM, CID_ENDED, 'draft')));
});

test('reenviar (cambiar sentAt) requiere active; editar un enviado sin cambiar sentAt solo requiere preparar', async () => {
  await assertSucceeds(updateDoc(hRef(DM, CID_ACTIVE, 'sent'), { sentAt: 99 }));
  await assertFails(updateDoc(hRef(DM, CID_PAUSED, 'sent'), { sentAt: 99 }));
  await assertSucceeds(updateDoc(hRef(DM, CID_PAUSED, 'sent'), { title: 'Corregido' }));
});

test('createdAt no se puede cambiar', async () => {
  await assertFails(updateDoc(hRef(DM, CID_ACTIVE, 'draft'), { createdAt: 2 }));
});

test('límites: título 120, texto 5000, imagen https de hasta 2048 y obligatoria en kind image', async () => {
  const d = (id) => hRef(DM, CID_ACTIVE, id);
  await assertSucceeds(setDoc(d('ok1'), text({ title: 't'.repeat(120), body: 'b'.repeat(5000) })));
  await assertFails(setDoc(d('t'), text({ title: 't'.repeat(121) })));
  await assertFails(setDoc(d('empty'), text({ title: '' })));
  await assertFails(setDoc(d('b'), text({ body: 'b'.repeat(5001) })));
  await assertSucceeds(setDoc(d('img'), image()));
  await assertFails(setDoc(d('http'), image({ imageUrl: 'http://example.com/m.png' })));
  await assertFails(setDoc(d('long'), image({ imageUrl: 'https://e.com/' + 'a'.repeat(2040) })));
  await assertFails(setDoc(d('nourl'), { kind: 'image', title: 'Mapa', sentAt: null, createdAt: 1 }));
  await assertFails(setDoc(d('kind'), text({ kind: 'video' })));
  await assertFails(setDoc(d('nosent'), { kind: 'text', title: 'x', body: 'y', createdAt: 1 }));
});
