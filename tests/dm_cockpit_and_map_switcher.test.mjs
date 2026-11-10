// tests/dm_cockpit_and_map_switcher.test.mjs
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

const { MapStageController } = await import('../src/scripts/vtt/mapStage.ts');
const { campaignStore } = await import('../src/scripts/state/campaignStore.ts');
const { userStore } = await import('../src/scripts/state/userStore.ts');
const {
  createMap,
  listMaps,
  listMapsForDm,
  setActiveMap,
} = await import('../src/scripts/data/mapService.ts');

// Mock simple de Konva para pruebas unitarias sin canvas nativo
class MockKonvaNode {
  constructor(config = {}) {
    this._config = { ...config };
    this._width = config.width || 800;
    this._height = config.height || 600;
    this._x = config.x || 0;
    this._y = config.y || 0;
    this._scaleX = 1;
    this._scaleY = 1;
  }
  width(w) { if (w !== undefined) this._width = w; return this._width; }
  height(h) { if (h !== undefined) this._height = h; return this._height; }
  x(v) { if (v !== undefined) this._x = v; return this._x; }
  y(v) { if (v !== undefined) this._y = v; return this._y; }
  scaleX(v) { if (v !== undefined) this._scaleX = v; return this._scaleX; }
  scaleY(v) { if (v !== undefined) this._scaleY = v; return this._scaleY; }
  scale(obj) {
    if (obj) {
      if (obj.x !== undefined) this._scaleX = obj.x;
      if (obj.y !== undefined) this._scaleY = obj.y;
    }
    return { x: this._scaleX, y: this._scaleY };
  }
  position(obj) {
    if (obj) {
      if (obj.x !== undefined) this._x = obj.x;
      if (obj.y !== undefined) this._y = obj.y;
    }
    return { x: this._x, y: this._y };
  }
  add() {}
  on() {}
  destroy() {}
  destroyChildren() {}
  getChildren() { return []; }
  batchDraw() {}
  opacity(v) { if (v !== undefined) this._opacity = v; return this._opacity; }
  getContent() { return { style: {}, addEventListener: () => {} }; }
  points(p) { if (p !== undefined) this._points = p; return this._points; }
  radius(r) { if (r !== undefined) this._radius = r; return this._radius; }
  stroke() {}
  strokeWidth() {}
  dash() {}
  fill() {}
  visible(v) { if (v !== undefined) this._visible = v; return this._visible; }
}

const MockKonva = {
  Stage: MockKonvaNode,
  Layer: MockKonvaNode,
  Group: MockKonvaNode,
  Image: MockKonvaNode,
  Shape: MockKonvaNode,
  Rect: MockKonvaNode,
  Line: MockKonvaNode,
  Circle: MockKonvaNode,
  hitOnDragEnabled: true,
};

const DM_USER = { id: 'user-me', name: 'Gonzo (Tú)' };
let currentCid = '';

beforeEach(() => {
  localStorage.clear();
  userStore.setCurrentUser(DM_USER);

  const camp = campaignStore.createCampaign({
    name: 'Campaña Pruebas VTT',
    creatorId: DM_USER.id,
    dmId: DM_USER.id,
    dmName: DM_USER.name,
    memberUserIds: [DM_USER.id],
    status: 'active',
  });
  currentCid = camp.id;
  campaignStore.setActiveCampaign(currentCid);
});

test('1. MapStageController maneja ciclo de modos de cuadrícula (alto contraste / sutil / oculta)', () => {
  const container = {
    clientWidth: 1000,
    clientHeight: 800,
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const controller = new MapStageController(container, MockKonva, { mode: 'dm' });

  // Modo inicial por defecto debe ser alto contraste
  assert.equal(controller.getGridMode(), 'high-contrast', 'El modo inicial debe ser high-contrast');

  // Primer ciclo: pasa a 'subtle'
  const mode2 = controller.cycleGridMode();
  assert.equal(mode2, 'subtle', 'El primer ciclo debe pasar a subtle');
  assert.equal(controller.getGridMode(), 'subtle');

  // Segundo ciclo: pasa a 'hidden'
  const mode3 = controller.cycleGridMode();
  assert.equal(mode3, 'hidden', 'El segundo ciclo debe pasar a hidden');
  assert.equal(controller.getGridMode(), 'hidden');

  // Tercer ciclo: regresa a 'high-contrast'
  const mode4 = controller.cycleGridMode();
  assert.equal(mode4, 'high-contrast', 'El tercer ciclo debe regresar a high-contrast');
  assert.equal(controller.getGridMode(), 'high-contrast');

  controller.destroy();
});

test('2. mapService permite crear múltiples mapas y conmutar el mapa activo en tiempo real', async () => {
  // Crear dos mapas en la campaña
  const m1Id = await createMap(currentCid, {
    name: 'Cripta Olvidada',
    imageUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23',
    imageWidth: 2000,
    imageHeight: 1500,
    grid: { size: 70, offsetX: 0, offsetY: 0, visible: true },
  });

  const m2Id = await createMap(currentCid, {
    name: 'Bosque de Niebla',
    imageUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb',
    imageWidth: 2400,
    imageHeight: 1800,
    grid: { size: 64, offsetX: 10, offsetY: 10, visible: true },
  });

  // Listar mapas
  const maps = await listMaps(currentCid);
  assert.ok(maps.length >= 2, 'Deben existir al menos 2 mapas en la campaña');
  assert.ok(maps.some((m) => m.id === m1Id));
  assert.ok(maps.some((m) => m.id === m2Id));

  // Alias listMapsForDm
  const dmList = await listMapsForDm(currentCid);
  assert.equal(dmList.length, maps.length, 'listMapsForDm debe retornar la misma lista');

  // Activar el primer mapa
  await setActiveMap(currentCid, m1Id);
  let camp = campaignStore.getCampaign(currentCid);
  assert.equal(camp?.activeMapId, m1Id, 'El mapa activo debe ser m1Id');

  // Conmutar al segundo mapa
  await setActiveMap(currentCid, m2Id);
  camp = campaignStore.getCampaign(currentCid);
  assert.equal(camp?.activeMapId, m2Id, 'El mapa activo debe conmutar a m2Id');

  // Desactivar mapa (null)
  await setActiveMap(currentCid, null);
  camp = campaignStore.getCampaign(currentCid);
  assert.equal(camp?.activeMapId, undefined, 'El mapa activo debe ser nulo o indefinido al desactivar');
});

test('3. Resolución de roles DM en la campaña', () => {
  const currentDm = userStore.getCurrentUser();
  const isDmTrue = campaignStore.isCurrentUserDm(currentCid);

  const playerUser = userStore.createUser('Jugador Dos', 'player2@dnd.local');
  userStore.setCurrentUser(playerUser.id);
  const isDmFalse = campaignStore.isCurrentUserDm(currentCid);

  assert.equal(isDmTrue, true, 'El usuario creador/DM debe ser detectado como DM');
  assert.equal(isDmFalse, false, 'Un jugador no debe ser detectado como DM');

  // Restaurar usuario DM
  userStore.setCurrentUser(currentDm.id);
});

test('4. MapStageController soporta color y opacidad personalizados de cuadrícula', () => {
  const container = {
    clientWidth: 1000,
    clientHeight: 800,
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  const controller = new MapStageController(container, MockKonva, { mode: 'dm' });

  controller.setGrid({
    size: 50,
    offsetX: 5,
    offsetY: 5,
    visible: true,
    color: '#3b82f6',
    opacity: 0.8,
  });

  const grid = controller.getGrid();
  assert.equal(grid.size, 50);
  assert.equal(grid.color, '#3b82f6');
  assert.equal(grid.opacity, 0.8);

  controller.destroy();
});

test('5. Verificación estática de plantillas de combate, gestor de mapas y grimorio DM', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');

  // 5.1 CombatTracker: foto del combatiente y 2 filas de botones centradas
  const ctContent = fs.readFileSync(path.resolve('src/components/dm/CombatTracker.astro'), 'utf-8');
  assert.ok(
    ctContent.includes('<!-- Avatar del combatiente -->'),
    'CombatTracker debe renderizar el avatar del combatiente'
  );
  assert.ok(
    ctContent.includes('onerror="this.onerror=null;this.src=\'/characters/ch-1.avif\';"'),
    'CombatTracker debe incluir fallback seguro de avatar'
  );
  assert.ok(
    ctContent.includes('id="dm-active-combat-controls"') &&
      ctContent.includes('flex flex-col items-center justify-center gap-2'),
    'Botones de combate deben estar centrados en 2 filas con flex flex-col items-center'
  );
  assert.ok(
    ctContent.includes('<span>Oponente</span>') && !ctContent.includes('<span>+ Oponente</span>'),
    'Botón oponente debe tener etiqueta limpia sin duplicar el signo +'
  );

  // 5.2 MapManager: controles de opacidad y color de grilla
  const mmContent = fs.readFileSync(path.resolve('src/components/dm/MapManager.astro'), 'utf-8');
  assert.ok(mmContent.includes('id="dm-grid-color"'), 'MapManager debe incluir input de color de grilla');
  assert.ok(mmContent.includes('id="dm-grid-opacity"'), 'MapManager debe incluir slider de opacidad de grilla');
  assert.ok(mmContent.includes('active-map-changed'), 'MapManager debe escuchar el evento active-map-changed');

  // 5.3 DmControlGrimoire: orden de layout [titulo, dados], [mapa, combate], [MapManager], [miembros], [bitacora]
  const grContent = fs.readFileSync(path.resolve('src/components/dm/DmControlGrimoire.astro'), 'utf-8');
  assert.ok(
    grContent.includes('<!-- [titulo, titulo, dados] -->'),
    'Grimorio debe agrupar titulo y dados en el encabezado'
  );
  assert.ok(
    grContent.includes('<!-- [mapa,mapa,combate] -->'),
    'Grimorio debe organizar mapa y combate en fila de 2 columnas'
  );
  assert.ok(
    grContent.includes('<!-- [editar mapas] (FULL WIDTH) -->'),
    'Grimorio debe colocar MapManager en su propia fila completa'
  );
  assert.ok(
    !grContent.includes('masonry-layout-2'),
    'Grimorio no debe usar masonry-layout-2 en la bitácora'
  );
  assert.ok(
    grContent.includes('grid grid-cols-1 md:grid-cols-2 gap-4" id="grimoire-journal-feed"'),
    'Bitácora debe usar grid responsive limpio estándar'
  );
});
