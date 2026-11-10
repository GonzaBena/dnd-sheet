// tests/rules/rtdb_rules.test.mjs
// Reglas de Realtime Database (database.rules.json). Corre contra el emulador: `pnpm test:rules`.
//
// Cómo leer database.rules.json (JSON no admite comentarios, por eso se explica acá):
// - Todo vive bajo /rooms/{roomId}. El roomId es secreto y está en campaigns/{cid}.liveRoomId,
//   que solo leen los miembros de la campaña (ver src/scripts/data/roomService.ts).
// - RTDB no tiene funciones ni macros, así que estas expresiones aparecen expandidas en cada regla:
//     <DM>      = root.child('rooms/' + $room + '/meta/dm').val() === auth.uid
//     <miembro> = root.child('rooms/' + $room + '/members/' + auth.uid).exists()
// - meta = { dm, cid }: la crea una sola vez quien queda como DM; después solo el DM la borra.
// - members/{uid} = true y tokenOwners/{mid}/{tid} = uid: los escribe solo el DM.
// - status: lo escribe solo el DM ('active' | 'paused' | 'ended').
// - live/{mid}/{tid} = { x, y, by }: escribir requiere partida 'active' y ser el DM o el dueño
//   del token (según tokenOwners). Borrar lo puede hacer quien lo escribió o el DM en cualquier
//   estado, para no dejar nodos colgados al pausar. El DM puede borrar live/{mid} entero.
// - presence/{uid}: cada uno escribe solo la suya, si es DM o miembro.
// - Los .read están en cada hijo (nunca en /rooms/{roomId}): leer la sala entera no está permitido.
import test, { before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { ref, get, set, update, remove } from 'firebase/database';

const PROJECT_ID = 'demo-dnd-sheet';
let env;

const DM = 'uid-dm';
const PLAYER = 'uid-player';
const OTHER = 'uid-other';
const STRANGER = 'uid-stranger';
const ROOM = 'room-secret-1234567';

const rtdb = (uid) => env.authenticatedContext(uid).database();
const anon = () => env.unauthenticatedContext().database();
const at = (uid, path) => ref(rtdb(uid), `rooms/${ROOM}/${path}`);

async function seed(fn) {
  await env.withSecurityRulesDisabled(async (ctx) => fn(ctx.database()));
}

async function setStatus(status) {
  await seed(async (db) => set(ref(db, `rooms/${ROOM}/status`), status));
}

before(async () => {
  const [host, port] = (process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000').split(':');
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: { rules: readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8'), host, port: Number(port) },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearDatabase();
  await seed(async (db) => set(ref(db, `rooms/${ROOM}`), {
    meta: { dm: DM, cid: 'camp-vtt' },
    members: { [DM]: true, [PLAYER]: true, [OTHER]: true },
    status: 'active',
    tokenOwners: { m1: { 't-player': PLAYER, 't-other': OTHER } },
    live: { m1: { 't-other': { x: 1, y: 1, by: OTHER } } },
  }));
});

// ------------------------------------------------------------------ live

test('el jugador escribe la posición en vivo de su token', async () => {
  await assertSucceeds(set(at(PLAYER, 'live/m1/t-player'), { x: 10, y: 20, by: PLAYER }));
});

test('el jugador borra su propio nodo live, también con la partida pausada', async () => {
  await assertSucceeds(set(at(PLAYER, 'live/m1/t-player'), { x: 10, y: 20, by: PLAYER }));
  await assertSucceeds(remove(at(PLAYER, 'live/m1/t-player')));
  await assertSucceeds(set(at(PLAYER, 'live/m1/t-player'), { x: 10, y: 20, by: PLAYER }));
  await setStatus('paused');
  await assertSucceeds(remove(at(PLAYER, 'live/m1/t-player')));
});

test('el jugador no borra el nodo live que escribió otro', async () => {
  await assertFails(remove(at(PLAYER, 'live/m1/t-other')));
});

test('el DM escribe live de cualquier token y puede limpiar un mapa entero', async () => {
  await assertSucceeds(set(at(DM, 'live/m1/t-player'), { x: 5, y: 5, by: DM }));
  await assertSucceeds(set(at(DM, 'live/m1/t-goblin'), { x: 5, y: 5, by: DM }));
  await assertSucceeds(remove(at(DM, 'live/m1')));
});

test('los miembros leen live; un extraño o sin sesión no', async () => {
  await assertSucceeds(get(at(PLAYER, 'live')));
  await assertSucceeds(get(at(DM, 'live/m1')));
  await assertFails(get(at(STRANGER, 'live')));
  await assertFails(get(ref(anon(), `rooms/${ROOM}/live`)));
});

test('nadie lee la sala entera de una vez', async () => {
  await assertFails(get(ref(rtdb(PLAYER), `rooms/${ROOM}`)));
  await assertFails(get(ref(rtdb(STRANGER), 'rooms')));
});

test('el jugador no mueve tokens ajenos ni sin dueño', async () => {
  await assertFails(set(at(PLAYER, 'live/m1/t-other'), { x: 1, y: 1, by: PLAYER }));
  await assertFails(set(at(PLAYER, 'live/m1/t-goblin'), { x: 1, y: 1, by: PLAYER }));
});

test('by tiene que ser el propio usuario', async () => {
  await assertFails(set(at(PLAYER, 'live/m1/t-player'), { x: 1, y: 1, by: OTHER }));
});

test('sin campos extra y con coordenadas numéricas', async () => {
  await assertFails(set(at(PLAYER, 'live/m1/t-player'), { x: 1, y: 1, by: PLAYER, hp: 99 }));
  await assertFails(set(at(PLAYER, 'live/m1/t-player'), { x: '1', y: 1, by: PLAYER }));
  await assertFails(set(at(PLAYER, 'live/m1/t-player'), { x: 1, by: PLAYER }));
});

test('con la partida pausada o terminada nadie escribe en live', async () => {
  await setStatus('paused');
  await assertFails(set(at(PLAYER, 'live/m1/t-player'), { x: 1, y: 1, by: PLAYER }));
  await assertFails(set(at(DM, 'live/m1/t-player'), { x: 1, y: 1, by: DM }));
  await setStatus('ended');
  await assertFails(set(at(PLAYER, 'live/m1/t-player'), { x: 1, y: 1, by: PLAYER }));
});

test('un extraño no escribe en live aunque conozca el roomId', async () => {
  await assertFails(set(at(STRANGER, 'live/m1/t-player'), { x: 1, y: 1, by: STRANGER }));
});

// ------------------------------------------------------------------ meta, members, status, tokenOwners

test('un extraño no se apropia de una sala existente', async () => {
  await assertFails(set(at(STRANGER, 'meta'), { dm: STRANGER, cid: 'camp-vtt' }));
  await assertFails(set(at(PLAYER, 'meta'), { dm: PLAYER, cid: 'camp-vtt' }));
  await assertFails(set(at(STRANGER, 'meta/dm'), STRANGER));
});

test('el DM crea una sala nueva a su nombre, pero no a nombre de otro', async () => {
  await assertSucceeds(set(ref(rtdb(DM), 'rooms/room-nueva/meta'), { dm: DM, cid: 'camp-vtt' }));
  await assertFails(set(ref(rtdb(DM), 'rooms/room-otra/meta'), { dm: PLAYER, cid: 'camp-vtt' }));
  await assertFails(set(ref(rtdb(DM), 'rooms/room-mala/meta'), { dm: DM }));
  await assertFails(set(ref(rtdb(DM), 'rooms/room-extra/meta'), { dm: DM, cid: 'c', extra: 1 }));
});

test('el DM no transfiere la meta a otro usuario', async () => {
  await assertFails(set(at(DM, 'meta'), { dm: PLAYER, cid: 'camp-vtt' }));
});

test('los miembros leen la meta; un extraño no', async () => {
  await assertSucceeds(get(at(PLAYER, 'meta')));
  await assertSucceeds(get(at(DM, 'meta/dm')));
  await assertFails(get(at(STRANGER, 'meta')));
});

test('solo el DM escribe members y tokenOwners', async () => {
  await assertSucceeds(update(at(DM, 'members'), { [STRANGER]: true, [OTHER]: null }));
  await assertSucceeds(set(at(DM, 'tokenOwners/m1/t-nuevo'), PLAYER));
  await assertFails(set(at(PLAYER, 'members/uid-amigo'), true));
  await assertFails(set(at(PLAYER, 'members/' + PLAYER), null));
  await assertFails(set(at(PLAYER, 'tokenOwners/m1/t-other'), PLAYER));
  await assertFails(set(at(STRANGER, 'members/' + STRANGER), true));
});

test('members solo admite true', async () => {
  await assertFails(set(at(DM, 'members/' + STRANGER), 'si'));
});

test('solo el DM cambia el estado y solo a valores válidos', async () => {
  await assertSucceeds(set(at(DM, 'status'), 'paused'));
  await assertFails(set(at(DM, 'status'), 'completed'));
  await assertFails(set(at(PLAYER, 'status'), 'active'));
  await assertSucceeds(get(at(PLAYER, 'status')));
  await assertFails(get(at(STRANGER, 'status')));
});

// ------------------------------------------------------------------ presence

test('cada uno escribe solo su presencia', async () => {
  const p = (name) => ({ name, online: true, lastSeen: Date.now() });
  await assertSucceeds(set(at(PLAYER, `presence/${PLAYER}`), p('Elena')));
  await assertSucceeds(set(at(DM, `presence/${DM}`), p('DM')));
  await assertFails(set(at(PLAYER, `presence/${OTHER}`), p('Brom')));
  await assertFails(set(at(STRANGER, `presence/${STRANGER}`), p('Intruso')));
  await assertFails(set(at(PLAYER, `presence/${PLAYER}`), { name: 'Elena', online: 'si', lastSeen: 1 }));
  await assertSucceeds(get(at(OTHER, 'presence')));
  await assertFails(get(at(STRANGER, 'presence')));
});

test('presencia: el usuario pasa a offline con update y no toca la de otro (T-51a)', async () => {
  await assertSucceeds(set(at(PLAYER, `presence/${PLAYER}`), { name: 'Elena', online: true, lastSeen: 1 }));
  await assertSucceeds(update(at(PLAYER, `presence/${PLAYER}`), { online: false, lastSeen: 2 }));
  await assertFails(update(at(PLAYER, `presence/${OTHER}`), { online: false, lastSeen: 2 }));
  await assertFails(get(at(STRANGER, `presence/${PLAYER}`)));
});

// ------------------------------------------------------------------ pings (T-51b)

const ping = (by, extra = {}) => ({ x: 100, y: 200, by, at: Date.now(), ...extra });

test('el miembro pinguea en active y no en paused', async () => {
  await assertSucceeds(set(at(PLAYER, 'pings/m1/p1'), ping(PLAYER)));
  await assertSucceeds(set(at(DM, 'pings/m1/p2'), ping(DM)));
  await setStatus('paused');
  await assertFails(set(at(PLAYER, 'pings/m1/p3'), ping(PLAYER)));
  await setStatus('ended');
  await assertFails(set(at(PLAYER, 'pings/m1/p3'), ping(PLAYER)));
});

test('no se borra ni se pisa el ping de otro; el propio sí, también en pausa', async () => {
  await assertSucceeds(set(at(PLAYER, 'pings/m1/p1'), ping(PLAYER)));
  await assertFails(remove(at(OTHER, 'pings/m1/p1')));
  await assertFails(remove(at(DM, 'pings/m1/p1')));
  await assertFails(set(at(OTHER, 'pings/m1/p1'), ping(OTHER)));
  await setStatus('paused');
  await assertSucceeds(remove(at(PLAYER, 'pings/m1/p1')));
});

test('el ping exige by propio, coordenadas numéricas y sin campos extra', async () => {
  await assertFails(set(at(PLAYER, 'pings/m1/p1'), ping(OTHER)));
  await assertFails(set(at(PLAYER, 'pings/m1/p1'), ping(PLAYER, { x: 'a' })));
  await assertFails(set(at(PLAYER, 'pings/m1/p1'), { x: 1, y: 1, by: PLAYER }));
  await assertFails(set(at(PLAYER, 'pings/m1/p1'), ping(PLAYER, { extra: 1 })));
});

test('los pings los leen los miembros; un extraño no ni escribe', async () => {
  await assertSucceeds(set(at(PLAYER, 'pings/m1/p1'), ping(PLAYER)));
  await assertSucceeds(get(at(OTHER, 'pings/m1')));
  await assertFails(get(at(STRANGER, 'pings/m1')));
  await assertFails(set(at(STRANGER, 'pings/m1/p2'), ping(STRANGER)));
});
