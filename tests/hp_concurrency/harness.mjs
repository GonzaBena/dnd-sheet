// tests/hp_concurrency/harness.mjs
// Utilidades para reproducir la carrera de PG entre DM y jugadora contra los emuladores.
//
//   node tests/hp_concurrency/harness.mjs seed      → crea usuarios, campaña en vivo y ficha (PG 20/30)
//   node tests/hp_concurrency/harness.mjs observe   → imprime (JSONL) cada valor de PG que confirma el servidor
//
// Requiere `pnpm emulators` corriendo (auth:9099, firestore:8080, database:9000).
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, onSnapshot, setLogLevel } from 'firebase/firestore';

setLogLevel('silent');

export const PROJECT_ID = 'demo-dnd-sheet';
export const CID = 'camp-hp-race';
export const CHAR_ID = 'pj-lyra';
export const PASSWORD = 'secreto123';
export const DM_EMAIL = 'dm@hp-race.test';
export const PLAYER_EMAIL = 'jugadora@hp-race.test';

const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';

async function ensureUser(email, displayName) {
  const body = JSON.stringify({ email, password: PASSWORD, displayName, returnSecureToken: true });
  const headers = { 'content-type': 'application/json' };
  let res = await fetch(`${AUTH}/accounts:signUp?key=demo-key`, { method: 'POST', headers, body });
  let json = await res.json();
  if (json.error?.message === 'EMAIL_EXISTS') {
    res = await fetch(`${AUTH}/accounts:signInWithPassword?key=demo-key`, { method: 'POST', headers, body });
    json = await res.json();
  }
  if (!json.localId) throw new Error(`No se pudo crear ${email}: ${JSON.stringify(json)}`);
  return json.localId;
}

async function env() {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync('firestore.rules', 'utf8') },
  });
}

async function seed() {
  const dmUid = await ensureUser(DM_EMAIL, 'DM Prueba');
  const playerUid = await ensureUser(PLAYER_EMAIL, 'Jugadora Prueba');
  const { defaultCharacter } = await import('../../src/scripts/data/defaultCharacter.ts');
  const testEnv = await env();
  // El emulador a veces corta el clear si quedan streams de una corrida anterior: reintentar.
  for (let i = 0; ; i++) {
    try { await testEnv.clearFirestore(); break; } catch (err) {
      if (i >= 4) throw err;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  const now = Date.now();
  await testEnv.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users', dmUid), { name: 'DM Prueba' });
    await setDoc(doc(db, 'users', playerUid), { name: 'Jugadora Prueba' });
    await setDoc(doc(db, 'campaigns', CID), {
      id: CID, name: 'Carrera de PG', description: '', imageUrl: '',
      creatorId: dmUid, dmId: dmUid, dmName: 'DM Prueba',
      memberUserIds: [dmUid, playerUid], setting: 'Pruebas', sessionNumber: 1,
      weather: 'Despejado', location: 'Emulador', status: 'active', statusChangedAt: now,
      characterIds: [], createdAt: now, inviteCode: 'HPRACE1',
    });
    const char = JSON.parse(JSON.stringify(defaultCharacter));
    Object.assign(char, {
      id: CHAR_ID, name: 'Lyra', userId: playerUid, playerName: 'Jugadora Prueba', campaignId: CID,
      hp: { current: 20, max: 30, temp: 0 }, updatedAt: now,
    });
    await setDoc(doc(db, 'characters', CHAR_ID), char);
  });
  await testEnv.cleanup();
  console.log(JSON.stringify({ dmUid, playerUid, cid: CID, charId: CHAR_ID }));
}

async function observe() {
  const testEnv = await env();
  let dmUid = null;
  await testEnv.withSecurityRulesDisabled(async ctx => {
    const { getDoc } = await import('firebase/firestore');
    dmUid = (await getDoc(doc(ctx.firestore(), 'campaigns', CID))).data()?.dmId;
  });
  // Cliente independiente (como un tercer dispositivo): solo ve lo que el servidor confirma.
  const db = testEnv.authenticatedContext(dmUid).firestore();
  onSnapshot(doc(db, 'characters', CHAR_ID), snap => {
    const d = snap.data() || {};
    console.log(JSON.stringify({ t: Date.now(), src: 'server', hp: d.hp?.current, temp: d.hp?.temp, updatedAt: d.updatedAt }));
  });
  process.on('SIGTERM', async () => { await testEnv.cleanup(); process.exit(0); });
}

/** Entradas de bitácora de la campaña (para verificar que cada cambio de PG se registra una sola vez). */
async function journal() {
  const testEnv = await env();
  const { getDocs, collection } = await import('firebase/firestore');
  let entries = [];
  await testEnv.withSecurityRulesDisabled(async ctx => {
    const snap = await getDocs(collection(ctx.firestore(), 'campaigns', CID, 'journal'));
    entries = snap.docs.map(d => d.data()).map(e => ({ title: e.title, content: e.content, timestamp: e.timestamp }));
  });
  await testEnv.cleanup();
  console.log(JSON.stringify(entries));
}

const cmd = process.argv[2];
if (cmd === 'seed') await seed();
else if (cmd === 'observe') await observe();
else if (cmd === 'journal') await journal();
else if (cmd) { console.error(`Comando desconocido: ${cmd}`); process.exit(1); }
