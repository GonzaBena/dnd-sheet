// tests/party_log.test.mjs
// Bitácora automática del grupo (RF-43): logPartyEvent y su uso en revealToken / setActiveMap.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Mocks de navegador para Node.js ANTES de importar stores y servicios
const eventTarget = new EventTarget();
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    addEventListener: (type, listener) => eventTarget.addEventListener(type, listener),
    removeEventListener: (type, listener) => eventTarget.removeEventListener(type, listener),
    dispatchEvent: (event) => eventTarget.dispatchEvent(event),
    CustomEvent: class CustomEvent extends Event {
      constructor(type, eventInitDict) {
        super(type);
        this.detail = eventInitDict?.detail;
      }
    },
  };
}
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

const { campaignStore } = await import('../src/scripts/state/campaignStore.ts');
const { journalStore, getEntryVisibility } = await import('../src/scripts/state/journalStore.ts');
const { userStore } = await import('../src/scripts/state/userStore.ts');
const { logPartyEvent } = await import('../src/scripts/data/partyLog.ts');
const { createMap, setActiveMap, addSecretToken, revealToken } = await import('../src/scripts/data/mapService.ts');

// El usuario actual del store es el DM de la campaña de prueba (setCurrentUser solo acepta ids existentes).
let DM_USER;
let cid = '';

const partyEntries = () => journalStore.getPublicCampaignEntries(cid);

async function newMap(name) {
  return createMap(cid, {
    name,
    imageUrl: 'https://example.com/map.png',
    imageWidth: 800,
    imageHeight: 600,
    grid: { size: 50, offsetX: 0, offsetY: 0, visible: true },
  });
}

beforeEach(() => {
  localStorage.clear();
  journalStore.entries = [];
  DM_USER = userStore.getCurrentUser();
  const camp = campaignStore.createCampaign({
    name: 'Campaña Bitácora',
    creatorId: DM_USER.id,
    dmId: DM_USER.id,
    dmName: DM_USER.name,
    memberUserIds: [DM_USER.id],
    status: 'active',
  });
  cid = camp.id;
  campaignStore.setActiveCampaign(cid);
});

test('logPartyEvent escribe una entrada pública del grupo cuando la partida está activa', () => {
  assert.equal(logPartyEvent(cid, 'Aparece Goblin', 'Un goblin.', ['#Mapa']), true);
  const entries = partyEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].title, 'Aparece Goblin');
  assert.equal(entries[0].campaignId, cid);
  assert.equal(getEntryVisibility(entries[0]), 'party');
  assert.deepEqual(entries[0].tags, ['#Mapa']);
});

test('logPartyEvent no escribe ni falla si la partida está pausada o terminada', () => {
  for (const status of ['paused', 'ended']) {
    campaignStore.updateCampaign(cid, { status });
    assert.equal(logPartyEvent(cid, 'X', 'Y', []), false);
  }
  assert.equal(partyEntries().length, 0);
});

test('logPartyEvent no escribe si el usuario no es el DM ni si la campaña no existe', () => {
  campaignStore.updateCampaign(cid, { dmId: 'otro-usuario' });
  assert.equal(logPartyEvent(cid, 'X', 'Y', []), false);
  campaignStore.updateCampaign(cid, { dmId: DM_USER.id });
  assert.equal(logPartyEvent('no-existe', 'X', 'Y', []), false);
  assert.equal(partyEntries().length, 0);
});

test('revealToken registra "Aparece {nombre}" en active', async () => {
  const mid = await newMap('Cueva');
  const tid = await addSecretToken(cid, mid, { name: 'Goblin', x: 10, y: 10, size: 1, ownerUid: null });
  await revealToken(cid, mid, tid, { name: 'Goblin', x: 10, y: 10, size: 1, ownerUid: null });
  assert.deepEqual(partyEntries().map((e) => e.title), ['Aparece Goblin']);
});

test('revealToken en pausa revela el token pero no deja registro', async () => {
  const mid = await newMap('Cueva');
  const tid = await addSecretToken(cid, mid, { name: 'Goblin', x: 10, y: 10, size: 1, ownerUid: null });
  campaignStore.updateCampaign(cid, { status: 'paused' });
  await revealToken(cid, mid, tid, { name: 'Goblin', x: 10, y: 10, size: 1, ownerUid: null });
  assert.equal(partyEntries().length, 0);
});

test('setActiveMap registra "El grupo llega a {mapa}" solo al cambiar de mapa y en active', async () => {
  const m1 = await newMap('Taberna');
  const m2 = await newMap('Cueva del Dragón');

  await setActiveMap(cid, m1);
  await setActiveMap(cid, m1); // mismo mapa: no se repite
  await setActiveMap(cid, m2);
  assert.deepEqual(
    partyEntries().map((e) => e.title).sort(),
    ['El grupo llega a Cueva del Dragón', 'El grupo llega a Taberna']
  );

  journalStore.entries = [];
  campaignStore.updateCampaign(cid, { status: 'paused' });
  await setActiveMap(cid, m1); // preparar en pausa: cambia el mapa sin dejar registro
  assert.equal(partyEntries().length, 0);
  assert.equal(campaignStore.getCampaign(cid).activeMapId, m1);
});

test('desactivar el mapa (null) no registra nada', async () => {
  const m1 = await newMap('Taberna');
  await setActiveMap(cid, m1);
  journalStore.entries = [];
  await setActiveMap(cid, null);
  assert.equal(partyEntries().length, 0);
});
