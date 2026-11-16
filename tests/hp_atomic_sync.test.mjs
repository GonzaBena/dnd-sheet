// tests/hp_atomic_sync.test.mjs
// Capa optimista de PG en modo nube (campaignStore.mutateHp + characterStore):
// valor mostrado = último valor confirmado (hpBase/hpRev) + operaciones propias pendientes.
// Un "servidor" simulado confirma o rechaza cada transacción cuando el test lo decide, para
// cruzar a propósito los cambios de la jugadora con los del DM.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const lsStore = new Map();
const mockLocalStorage = {
  getItem: (k) => (lsStore.has(k) ? lsStore.get(k) : null),
  setItem: (k, v) => lsStore.set(k, String(v)),
  removeItem: (k) => lsStore.delete(k),
  clear: () => lsStore.clear(),
};
Object.defineProperty(globalThis, 'localStorage', { value: mockLocalStorage, configurable: true, writable: true });

const listeners = new Map();
globalThis.window = {
  localStorage: mockLocalStorage,
  addEventListener: (type, cb) => {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(cb);
  },
  removeEventListener: (type, cb) => {
    listeners.set(type, (listeners.get(type) || []).filter((fn) => fn !== cb));
  },
  dispatchEvent: (event) => {
    (listeners.get(event.type) || []).forEach((cb) => cb(event));
    return true;
  },
  CustomEvent: class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  },
};
globalThis.CustomEvent = globalThis.window.CustomEvent;

const { defaultCharacter } = await import('../src/scripts/data/defaultCharacter.ts');
const { characterStore } = await import('../src/scripts/state/characterStore.ts');
const { campaignStore } = await import('../src/scripts/state/campaignStore.ts');
const { journalStore } = await import('../src/scripts/state/journalStore.ts');
const { userStore } = await import('../src/scripts/state/userStore.ts');
const { applyHpOp, normalizeHp } = await import('../src/scripts/dnd/hp.ts');

const CID = 'camp-live';
const CHAR = 'char-lyra';
const PLAYER = 'uid-jugadora';

const flush = () => new Promise((r) => setTimeout(r, 0));

let server;
let writes;
let shownSeries;

/** Estado del documento en el "servidor" y transacciones esperando confirmación. */
function makeServer(hp) {
  return {
    hp: { ...hp },
    rev: 0,
    pending: [],
    /** El otro cliente (DM) cambia los PG directamente en el servidor. */
    applyFromOtherClient(op) {
      this.hp = applyHpOp(this.hp, op);
      this.rev += 1;
    },
    /** Confirma la próxima transacción de este cliente sobre el valor vigente del servidor. */
    async commitNext() {
      const tx = this.pending.shift();
      assert.ok(tx, 'había una transacción pendiente');
      const before = normalizeHp(this.hp);
      const after = applyHpOp(before, tx.op);
      this.rev += 1;
      this.hp = after;
      tx.resolve({ before, after, rev: this.rev });
      await flush();
    },
    async rejectNext(code = 'permission-denied') {
      const tx = this.pending.shift();
      assert.ok(tx, 'había una transacción pendiente');
      tx.reject(Object.assign(new Error(code), { code }));
      await flush();
    },
  };
}

function baseChar() {
  return {
    ...JSON.parse(JSON.stringify(defaultCharacter)),
    id: CHAR,
    userId: PLAYER,
    campaignId: CID,
    name: 'Lyra',
    hp: { current: 10, max: 20, temp: 0 },
    hpRev: 0,
    inspiration: false,
    updatedAt: 1000,
  };
}

/** Snapshot que llega por los listeners de Firestore con el estado actual del servidor. */
function snapshot(overrides = {}, scopes = ['mine', `campaign:${CID}`]) {
  const doc = { ...baseChar(), hp: { ...server.hp }, hpRev: server.rev, updatedAt: 1000 + server.rev, ...overrides };
  for (const scope of scopes) campaignStore.applyRemoteCharacters(scope, [doc]);
}

const shown = () => characterStore.get().hp;
const hpEntries = () => journalStore
  .getEntries(CHAR, PLAYER, false)
  .filter((e) => /Daño recibido|Curación recibida|Puntos de Golpe ajustados/.test(e.title));

beforeEach(() => {
  journalStore.resetToDefault();
  server = makeServer({ current: 10, max: 20, temp: 0 });
  writes = { characters: [] };
  userStore.enterCloudMode({ id: PLAYER, name: 'Jugadora', email: '' });
  campaignStore.attachCloud({
    applyCampaignChanges: () => {},
    applyCharacterChanges: (c) => writes.characters.push(c),
    isCharacterPending: () => false,
    sendDmEvent: () => {},
    mutateHp: (id, op) => new Promise((resolve, reject) => server.pending.push({ id, op, resolve, reject })),
  });
  campaignStore.applyRemoteCampaigns([{
    id: CID, name: 'En vivo', description: '', imageUrl: '', creatorId: 'uid-dm', dmId: 'uid-dm', dmName: 'DM',
    memberUserIds: ['uid-dm', PLAYER], setting: '', sessionNumber: 1, weather: '', location: '', status: 'active', createdAt: 1,
  }]);
  campaignStore.setActiveCampaign(CID);
  snapshot();
  characterStore.loadCharacter(campaignStore.getCharacter(CHAR), true);
  // Registro de cada valor que mostró la ficha, para detectar retrocesos.
  shownSeries = [shown().current];
  window.addEventListener('character-hp-changed', (e) => {
    if (e.detail.id === CHAR) shownSeries.push(e.detail.hp.current);
  });
});

test('la jugadora hace −1 tres veces rápido: se ve al instante, se confirma en orden y la bitácora registra cada golpe una vez', async () => {
  characterStore.modifyHp(-1);
  characterStore.modifyHp(-1);
  characterStore.modifyHp(-1);
  assert.equal(shown().current, 7, 'optimista: 10 − 3');
  assert.equal(campaignStore.getCharacter(CHAR).hp.current, 7);
  assert.equal(server.pending.length, 1, 'las transacciones de un personaje salen de a una, en orden');
  assert.equal(hpEntries().length, 0, 'nada se registra antes de que el servidor confirme');

  await server.commitNext();
  await server.commitNext();
  await server.commitNext();
  assert.equal(server.hp.current, 7);
  assert.equal(shown().current, 7);

  const entries = hpEntries();
  assert.equal(entries.length, 3);
  assert.deepEqual(
    entries.map((e) => e.content.match(/→ (\d+)\//)[1]).sort(),
    ['7', '8', '9'],
    'cada entrada tiene el valor confirmado de ese golpe'
  );
});

test('el DM cambia los PG mientras el −1 de la jugadora está en vuelo: no se pierde ninguno de los dos', async () => {
  characterStore.modifyHp(-1);
  assert.equal(shown().current, 9);

  // El DM hace +1 y el servidor lo confirma antes que la transacción de la jugadora.
  server.applyFromOtherClient({ kind: 'delta', amount: 1 });
  snapshot();
  assert.equal(shown().current, 10, 'base nueva del servidor (11) + −1 pendiente');

  await server.commitNext(); // la transacción de la jugadora se aplica sobre 11
  assert.equal(server.hp.current, 10, 'servidor: 10 − 1 + 1');
  assert.equal(shown().current, 10);

  // Llega tarde un snapshot viejo (rev anterior): no debe hacer retroceder el valor.
  campaignStore.applyRemoteCharacters(`campaign:${CID}`, [{ ...baseChar(), hp: { current: 11, max: 20, temp: 0 }, hpRev: 1 }]);
  assert.equal(shown().current, 10, 'el snapshot con hpRev viejo se ignora');
  snapshot();
  assert.equal(shown().current, 10);
});

test('criterio de aceptación: jugadora −1 ×3 y DM +1 intercalados → resultado = suma de todos los cambios', async () => {
  characterStore.modifyHp(-1); // jugadora
  server.applyFromOtherClient({ kind: 'delta', amount: 1 }); // DM
  characterStore.modifyHp(-1); // jugadora
  snapshot(); // llega el cambio del DM
  await server.commitNext();
  characterStore.modifyHp(-1); // jugadora
  await server.commitNext();
  snapshot({}, [`campaign:${CID}`]);
  await server.commitNext();
  snapshot();

  assert.equal(server.hp.current, 10 - 1 + 1 - 1 - 1, 'servidor');
  assert.equal(shown().current, 8, 'pantalla');
  assert.equal(campaignStore.getCharacter(CHAR).hp.current, 8);
});

test('mientras la jugadora solo resta, la pantalla nunca vuelve a un valor anterior aunque lleguen snapshots intermedios', async () => {
  characterStore.modifyHp(-1);
  characterStore.modifyHp(-1);
  snapshot(); // snapshot sin cambios (por ejemplo, de otro campo) mientras hay dos pendientes
  await server.commitNext();
  snapshot({}, ['mine']);
  characterStore.modifyHp(-1);
  snapshot({}, [`campaign:${CID}`]);
  await server.commitNext();
  await server.commitNext();
  snapshot();

  for (let i = 1; i < shownSeries.length; i++) {
    assert.ok(shownSeries[i] <= shownSeries[i - 1], `retroceso en la serie ${shownSeries.join(' → ')}`);
  }
  assert.equal(shown().current, 7);
});

test('si la transacción es rechazada, la UI vuelve al último valor confirmado y no se registra en la bitácora', async () => {
  const mutation = campaignStore.mutateHp(CHAR, { kind: 'delta', amount: -4 });
  assert.equal(shown().current, 6, 'optimista');
  await server.rejectNext('permission-denied');
  assert.equal(await mutation.done, null);
  assert.equal(shown().current, 10, 'revertido');
  assert.equal(campaignStore.getCharacter(CHAR).hp.current, 10);
  assert.equal(hpEntries().length, 0);
});

test('un rechazo en medio de varias operaciones solo quita la rechazada', async () => {
  characterStore.modifyHp(-1);
  characterStore.modifyHp(-2);
  assert.equal(shown().current, 7);
  await server.commitNext(); // −1 confirmado
  await server.rejectNext('unavailable'); // −2 rechazado
  assert.equal(shown().current, 9);
  assert.equal(server.hp.current, 9);
});

test('el guardado general de la ficha nunca lleva hp ni hpRev', async () => {
  characterStore.modifyHp(-3);
  characterStore.toggleInspiration();
  const updates = writes.characters.flatMap((c) => c.updates);
  assert.ok(updates.some((u) => 'inspiration' in u.fields), 'la inspiración sí se guarda por la vía general');
  for (const u of updates) {
    assert.ok(!('hp' in u.fields) && !('hpRev' in u.fields), `guardado general con PG: ${JSON.stringify(u.fields)}`);
  }
  // Una copia vieja guardada por la UI (p. ej. el botón de inspiración del DM) tampoco pisa los PG mostrados.
  const stale = { ...JSON.parse(JSON.stringify(campaignStore.getCharacter(CHAR))), hp: { current: 10, max: 20, temp: 0 }, inspiration: false };
  campaignStore.saveCharacter(stale);
  assert.equal(campaignStore.getCharacter(CHAR).hp.current, 7);
  await server.commitNext();
  assert.equal(server.hp.current, 7);
});

test('los PG temporales se respetan también en la nube', async () => {
  server.hp = { current: 10, max: 20, temp: 4 };
  server.rev = 1;
  snapshot();
  characterStore.modifyHp(-6);
  assert.deepEqual(shown(), { current: 8, max: 20, temp: 0 });
  await server.commitNext();
  assert.deepEqual(server.hp, { current: 8, max: 20, temp: 0 });
});
