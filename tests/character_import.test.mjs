// tests/character_import.test.mjs
// Importar una ficha JSON: el archivo aporta el contenido, nunca la identidad (id, dueño, campaña).
import test from 'node:test';
import assert from 'node:assert/strict';

// Mock del navegador con listeners reales: el guardado depende de 'character-updated'.
if (typeof globalThis.window === 'undefined') {
  const listeners = new Map();
  globalThis.window = {
    addEventListener: (type, cb) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(cb);
    },
    removeEventListener: (type, cb) => {
      if (listeners.has(type)) listeners.set(type, listeners.get(type).filter(fn => fn !== cb));
    },
    dispatchEvent: (event) => {
      (listeners.get(event.type) || []).forEach(cb => cb(event));
      return true;
    },
    location: { href: 'http://localhost:4321/campaigns', search: '' },
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
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
const { characterStore } = await import('../src/scripts/state/characterStore.ts');
const { userStore } = await import('../src/scripts/state/userStore.ts');

/** Ficha exportada desde otro lado: id, dueño y campaña ajenos. */
function foreignExport(name = 'Brienna la Importada') {
  const base = JSON.parse(JSON.stringify(characterStore.get()));
  return JSON.stringify({
    ...base,
    id: 'id-de-otro-dispositivo',
    userId: 'uid-de-otra-cuenta',
    playerName: 'Otra persona',
    campaignId: 'campana-ajena',
    name,
  });
}

test('Importar JSON sobre una ficha propia conserva su identidad (modo local)', () => {
  campaignStore.seedLegacyFixtures();
  userStore.setCurrentUser('user-me');
  const geralt = campaignStore.getCharacter('geralt-vagabundo');
  characterStore.loadCharacter(geralt);

  assert.equal(characterStore.importJson(foreignExport()), true);

  const active = characterStore.get();
  assert.equal(active.id, 'geralt-vagabundo', 'mantiene el id de la ficha abierta');
  assert.equal(active.userId, 'user-me', 'mantiene el dueño');
  assert.equal(active.campaignId, null, 'mantiene la campaña');
  assert.equal(active.name, 'Brienna la Importada', 'toma el contenido del JSON');
  assert.equal(campaignStore.getCharacter('geralt-vagabundo').name, 'Brienna la Importada', 'queda guardada en el roster');
  assert.equal(campaignStore.getCharacter('id-de-otro-dispositivo'), undefined, 'no adopta el id del archivo');
});

test('Importar JSON sin ficha propia abierta crea un personaje nuevo sin campaña (modo local)', () => {
  campaignStore.seedLegacyFixtures();
  userStore.setCurrentUser('user-me');
  // Ficha ajena abierta: no se puede sobrescribir.
  characterStore.loadCharacter(campaignStore.getCharacter('morgana-espinaoscura'));

  assert.equal(characterStore.importJson(foreignExport('Nueva Heroína')), true);

  const active = characterStore.get();
  assert.notEqual(active.id, 'morgana-espinaoscura');
  assert.notEqual(active.id, 'id-de-otro-dispositivo');
  assert.equal(active.userId, 'user-me');
  assert.equal(active.campaignId, null);
  assert.equal(active.name, 'Nueva Heroína');
  assert.equal(campaignStore.getCharacter(active.id)?.name, 'Nueva Heroína', 'el nuevo personaje queda en el roster');
  assert.equal(campaignStore.getCharacter('morgana-espinaoscura').name, 'Morgana Espinaoscura', 'la ficha ajena no cambia');
});

test('JSON inválido no modifica la ficha', () => {
  const before = characterStore.get().id;
  assert.equal(characterStore.importJson('{"sin":"stats"}'), false);
  assert.equal(characterStore.importJson('no es json'), false);
  assert.equal(characterStore.get().id, before);
});

test('Modo nube: la importación llega a Firestore en los dos casos', () => {
  userStore.setCurrentUser('user-me');
  const writes = [];
  campaignStore.attachCloud({
    applyCampaignChanges: () => {},
    applyCharacterChanges: (changes) => writes.push(changes),
    isCharacterPending: () => false,
    sendDmEvent: () => {},
  });
  const mine = { ...JSON.parse(JSON.stringify(characterStore.get())), id: 'mi-ficha-nube', userId: 'user-me', campaignId: null, name: 'Mi Ficha' };
  campaignStore.applyRemoteCharacters('mine', [mine]);

  // 1) Ficha propia abierta: se actualiza ese mismo documento.
  characterStore.loadCharacter(campaignStore.getCharacter('mi-ficha-nube'));
  writes.length = 0;
  assert.equal(characterStore.importJson(foreignExport('Importada en la nube')), true);
  const updated = writes.flatMap(w => w.updates.map(u => u.id));
  assert.ok(updated.includes('mi-ficha-nube'), 'se escribe sobre la ficha propia');
  assert.ok(!writes.some(w => w.creates.some(c => c.id === 'id-de-otro-dispositivo')), 'no crea el id del archivo');

  // 2) Ficha por defecto de una cuenta nueva (no está en la nube): se crea un documento nuevo.
  characterStore.loadCharacter({ ...mine, id: 'atlas', userId: undefined, name: 'Atlas' });
  writes.length = 0;
  assert.equal(characterStore.importJson(foreignExport('Primera Ficha')), true);
  const created = writes.flatMap(w => w.creates);
  assert.equal(created.length, 1, 'crea exactamente un personaje');
  assert.equal(created[0].data.userId, 'user-me', 'con el uid de la sesión (lo exigen las reglas)');
  assert.equal(created[0].data.campaignId, null);
  assert.equal(created[0].data.name, 'Primera Ficha');

  campaignStore.detachCloud();
});
