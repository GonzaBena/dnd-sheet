// tests/rules/handout_rules.test.mjs
// Reglas de campaigns/{cid}/handouts (T-52, RF-41). Corre contra el emulador: `pnpm test:rules`.
//
// Modelo: recipients = [] en borrador (sentAt null), ['*'] = todos, o los uids elegidos.
// El jugador lee solo si es destinatario; su consulta es where('recipients', 'array-contains-any', ['*', uid]).
import test, { before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, query, where, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-dnd-sheet';
let env;

const DM = 'uid-dm';
const PLAYER = 'uid-player';
const OTHER = 'uid-other';
const STRANGER = 'uid-stranger';

const CID_ACTIVE = 'camp-active';
const CID_PAUSED = 'camp-paused';
const CID_ENDED = 'camp-ended';

const db = (uid) => env.authenticatedContext(uid).firestore();
const hRef = (uid, cid, id) => doc(db(uid), 'campaigns', cid, 'handouts', id);
const mine = (uid, cid) =>
  query(collection(db(uid), 'campaigns', cid, 'handouts'), where('recipients', 'array-contains-any', ['*', uid]));

function baseCampaign(id, status) {
  return {
    id,
    name: `Campaña ${id}`,
    creatorId: DM,
    dmId: DM,
    dmName: 'DM',
    memberUserIds: [DM, PLAYER, OTHER],
    inviteCode: `CODE-${id}`,
    createdAt: 1,
    status,
  };
}

const text = (o = {}) => ({ kind: 'text', title: 'Carta', body: 'Querido héroe…', sentAt: null, recipients: [], createdAt: 1, ...o });
const image = (o = {}) => ({ kind: 'image', title: 'Mapa', imageUrl: 'https://example.com/m.png', sentAt: null, recipients: [], createdAt: 1, ...o });
const sentTo = (recipients, o = {}) => text({ title: 'Enviado', sentAt: 5, recipients, ...o });

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
      await setDoc(doc(fs, 'campaigns', cid, 'handouts', 'sent'), sentTo(['*']));
      await setDoc(doc(fs, 'campaigns', cid, 'handouts', 'onlyPlayer'), sentTo([PLAYER], { title: 'Solo Elena' }));
    }
  });
});

// ------------------------------------------------------------------ lectura

test('el jugador no lee un borrador y sí uno enviado a todos', async () => {
  await assertFails(getDoc(hRef(PLAYER, CID_ACTIVE, 'draft')));
  await assertSucceeds(getDoc(hRef(PLAYER, CID_ACTIVE, 'sent')));
});

test('un handout enviado a un jugador concreto lo lee ese jugador y no otro miembro', async () => {
  await assertSucceeds(getDoc(hRef(PLAYER, CID_ACTIVE, 'onlyPlayer')));
  await assertFails(getDoc(hRef(OTHER, CID_ACTIVE, 'onlyPlayer')));
});

test('el jugador lista solo los suyos con array-contains-any; listar la colección entera falla', async () => {
  const ids = (snap) => snap.docs.map((d) => d.id).sort();
  const p = await assertSucceeds(getDocs(mine(PLAYER, CID_ACTIVE)));
  if (JSON.stringify(ids(p)) !== JSON.stringify(['onlyPlayer', 'sent'])) throw new Error(`Esperaba [onlyPlayer, sent], obtuvo ${ids(p)}`);
  const o = await assertSucceeds(getDocs(mine(OTHER, CID_ACTIVE)));
  if (JSON.stringify(ids(o)) !== JSON.stringify(['sent'])) throw new Error(`Esperaba [sent], obtuvo ${ids(o)}`);
  await assertFails(getDocs(collection(db(PLAYER), 'campaigns', CID_ACTIVE, 'handouts')));
});

test('el DM lee borradores y enviados; un extraño no lee nada', async () => {
  await assertSucceeds(getDoc(hRef(DM, CID_ACTIVE, 'draft')));
  await assertSucceeds(getDocs(collection(db(DM), 'campaigns', CID_ACTIVE, 'handouts')));
  await assertFails(getDoc(hRef(STRANGER, CID_ACTIVE, 'sent')));
  await assertFails(getDocs(mine(STRANGER, CID_ACTIVE)));
});

// ------------------------------------------------------------------ escritura

test('el jugador no crea, edita ni borra handouts', async () => {
  await assertFails(setDoc(hRef(PLAYER, CID_ACTIVE, 'p1'), text()));
  await assertFails(updateDoc(hRef(PLAYER, CID_ACTIVE, 'sent'), { title: 'x' }));
  await assertFails(deleteDoc(hRef(PLAYER, CID_ACTIVE, 'sent')));
});

test('el DM envía en active (a todos o a elegidos) y no en paused', async () => {
  await assertSucceeds(updateDoc(hRef(DM, CID_ACTIVE, 'draft'), { sentAt: 10, recipients: ['*'] }));
  await assertSucceeds(updateDoc(hRef(DM, CID_ACTIVE, 'draft'), { sentAt: 11, recipients: [PLAYER, OTHER] }));
  await assertFails(updateDoc(hRef(DM, CID_PAUSED, 'draft'), { sentAt: 10, recipients: ['*'] }));
  // crear ya enviado también cuenta como jugar
  await assertSucceeds(setDoc(hRef(DM, CID_ACTIVE, 'n1'), sentTo([PLAYER])));
  await assertFails(setDoc(hRef(DM, CID_PAUSED, 'n1'), sentTo([PLAYER])));
});

test('invariante: no se envía sin destinatarios ni hay destinatarios en un borrador', async () => {
  await assertFails(updateDoc(hRef(DM, CID_ACTIVE, 'draft'), { sentAt: 10 })); // recipients sigue []
  await assertFails(updateDoc(hRef(DM, CID_ACTIVE, 'draft'), { sentAt: 10, recipients: [] }));
  await assertFails(updateDoc(hRef(DM, CID_ACTIVE, 'draft'), { recipients: ['*'] })); // sentAt sigue null
  await assertFails(setDoc(hRef(DM, CID_ACTIVE, 'bad'), text({ recipients: [PLAYER] })));
  await assertFails(setDoc(hRef(DM, CID_ACTIVE, 'bad2'), sentTo([])));
  await assertFails(setDoc(hRef(DM, CID_ACTIVE, 'bad3'), { ...text(), recipients: 'todos' }));
  await assertFails(setDoc(hRef(DM, CID_ACTIVE, 'bad4'), sentTo(Array.from({ length: 51 }, (_, i) => `u${i}`))));
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

test('reenviar o cambiar destinatarios requiere active; editar el contenido de un enviado solo requiere preparar', async () => {
  await assertSucceeds(updateDoc(hRef(DM, CID_ACTIVE, 'sent'), { sentAt: 99, recipients: [OTHER] }));
  await assertSucceeds(updateDoc(hRef(DM, CID_ACTIVE, 'sent'), { recipients: [PLAYER] }));
  await assertFails(updateDoc(hRef(DM, CID_PAUSED, 'sent'), { sentAt: 99 }));
  await assertFails(updateDoc(hRef(DM, CID_PAUSED, 'sent'), { recipients: [PLAYER] }));
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
  await assertFails(setDoc(d('nourl'), { kind: 'image', title: 'Mapa', sentAt: null, recipients: [], createdAt: 1 }));
  await assertFails(setDoc(d('kind'), text({ kind: 'video' })));
  await assertFails(setDoc(d('nosent'), { kind: 'text', title: 'x', body: 'y', recipients: [], createdAt: 1 }));
  await assertFails(setDoc(d('norecipients'), { kind: 'text', title: 'x', body: 'y', sentAt: null, createdAt: 1 }));
});
