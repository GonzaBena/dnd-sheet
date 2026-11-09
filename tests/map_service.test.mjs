// tests/map_service.test.mjs
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Configurar mocks de navegador para Node.js ANTES de importar stores y servicios
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
const { userStore } = await import('../src/scripts/state/userStore.ts');
const {
  createMap,
  listMaps,
  updateMapConfig,
  deleteMap,
  setActiveMap,
  subscribeMap,
  watchActiveMap,
} = await import('../src/scripts/data/mapService.ts');

const DM_USER = { id: 'user-dm', name: 'DM Test' };
let currentCid = '';

beforeEach(() => {
  localStorage.clear();
  userStore.setCurrentUser(DM_USER);

  const camp = campaignStore.createCampaign({
    name: 'Campaña Mapas',
    creatorId: DM_USER.id,
    dmId: DM_USER.id,
    dmName: DM_USER.name,
    memberUserIds: [DM_USER.id],
    status: 'active',
  });
  currentCid = camp.id;
  campaignStore.setActiveCampaign(currentCid);
});

test('createMap crea un mapa con ID generado, tokens y niebla vacíos y lo lista en listMaps', async () => {
  const mid = await createMap(currentCid, {
    name: 'Mazmorra Antigua',
    imageUrl: 'https://example.com/map1.png',
    imageWidth: 1200,
    imageHeight: 900,
    grid: { size: 60, offsetX: 10, offsetY: 15, visible: true },
  });

  assert.ok(mid.startsWith('map-'));

  const maps = await listMaps(currentCid);
  assert.equal(maps.length, 1);
  const m = maps[0];
  assert.equal(m.id, mid);
  assert.equal(m.name, 'Mazmorra Antigua');
  assert.equal(m.imageWidth, 1200);
  assert.equal(m.imageHeight, 900);
  assert.deepEqual(m.tokens, {});
  assert.deepEqual(m.fogRevealed, []);
  assert.equal(m.grid.size, 60);
  assert.equal(m.grid.offsetX, 10);
  assert.equal(m.grid.offsetY, 15);
  assert.equal(m.grid.visible, true);
  assert.ok(m.updatedAt > 0);
});

test('updateMapConfig actualiza la cuadrícula y el nombre de un mapa', async () => {
  const mid = await createMap(currentCid, {
    name: 'Original',
    imageUrl: 'https://example.com/map.png',
    imageWidth: 800,
    imageHeight: 600,
    grid: { size: 50, offsetX: 0, offsetY: 0, visible: true },
  });

  await updateMapConfig(currentCid, mid, {
    name: 'Modificado',
    grid: { size: 75, offsetX: 5, offsetY: 5, visible: false },
  });

  const maps = await listMaps(currentCid);
  const m = maps.find((x) => x.id === mid);
  assert.equal(m.name, 'Modificado');
  assert.equal(m.grid.size, 75);
  assert.equal(m.grid.offsetX, 5);
  assert.equal(m.grid.offsetY, 5);
  assert.equal(m.grid.visible, false);
});

test('setActiveMap establece el mapa activo y deleteMap no permite borrar el mapa activo', async () => {
  const m1 = await createMap(currentCid, {
    name: 'Mapa 1',
    imageUrl: 'https://example.com/1.png',
    imageWidth: 1000,
    imageHeight: 1000,
    grid: { size: 50, offsetX: 0, offsetY: 0, visible: true },
  });

  const m2 = await createMap(currentCid, {
    name: 'Mapa 2',
    imageUrl: 'https://example.com/2.png',
    imageWidth: 1000,
    imageHeight: 1000,
    grid: { size: 50, offsetX: 0, offsetY: 0, visible: true },
  });

  await setActiveMap(currentCid, m1);
  const camp = campaignStore.getCampaign(currentCid);
  assert.equal(camp.activeMapId, m1);

  // Intentar borrar el mapa activo debe lanzar error
  await assert.rejects(
    async () => {
      await deleteMap(currentCid, m1);
    },
    /No se puede eliminar el mapa activo/
  );

  // Borrar el mapa no activo sí funciona
  await deleteMap(currentCid, m2);
  const mapsAfter = await listMaps(currentCid);
  assert.equal(mapsAfter.length, 1);
  assert.equal(mapsAfter[0].id, m1);
});

test('subscribeMap recibe el mapa inicial y reacciona a cambios', async () => {
  const mid = await createMap(currentCid, {
    name: 'Sala del Trono',
    imageUrl: 'https://example.com/trono.png',
    imageWidth: 1600,
    imageHeight: 1200,
    grid: { size: 80, offsetX: 0, offsetY: 0, visible: true },
  });

  let receivedMap = null;
  const unsub = subscribeMap(currentCid, mid, (map) => {
    receivedMap = map;
  });

  assert.ok(receivedMap);
  assert.equal(receivedMap.id, mid);
  assert.equal(receivedMap.name, 'Sala del Trono');

  unsub();
});

test('watchActiveMap conmuta al cambiar activeMapId', async () => {
  const m1 = await createMap(currentCid, {
    name: 'Cripta',
    imageUrl: 'https://example.com/cripta.png',
    imageWidth: 1000,
    imageHeight: 800,
    grid: { size: 50, offsetX: 0, offsetY: 0, visible: true },
  });

  const m2 = await createMap(currentCid, {
    name: 'Bosque',
    imageUrl: 'https://example.com/bosque.png',
    imageWidth: 1000,
    imageHeight: 800,
    grid: { size: 50, offsetX: 0, offsetY: 0, visible: true },
  });

  let activeMapSeen = null;
  const unsub = watchActiveMap(currentCid, (map) => {
    activeMapSeen = map;
  });

  // Inicialmente sin mapa activo
  assert.equal(activeMapSeen, null);

  // Activar m1
  await setActiveMap(currentCid, m1);
  assert.equal(activeMapSeen?.id, m1);
  assert.equal(activeMapSeen?.name, 'Cripta');

  // Activar m2
  await setActiveMap(currentCid, m2);
  assert.equal(activeMapSeen?.id, m2);
  assert.equal(activeMapSeen?.name, 'Bosque');

  unsub();
});

test('con la partida ended, createMap falla por permisos de sesión', async () => {
  campaignStore.updateCampaign(currentCid, { status: 'ended' });

  await assert.rejects(
    async () => {
      await createMap(currentCid, {
        name: 'No Permitido',
        imageUrl: 'https://example.com/ended.png',
        imageWidth: 1000,
        imageHeight: 800,
        grid: { size: 50, offsetX: 0, offsetY: 0, visible: true },
      });
    },
    /No puedes preparar mapas/
  );
});

test('watchActiveMap emite null inmediatamente si la campaña no tiene activeMapId (evita spinner infinito)', async () => {
  let initialCallReceived = false;
  let receivedValue = 'not-called';

  const unsub = watchActiveMap(currentCid, (map) => {
    initialCallReceived = true;
    receivedValue = map;
  });

  assert.equal(initialCallReceived, true);
  assert.equal(receivedValue, null);

  unsub();
});
