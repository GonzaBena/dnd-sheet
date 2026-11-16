// tests/hp_sync_and_combat_persistence.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

const lsStore = new Map();
const mockLocalStorage = {
  getItem: (k) => (lsStore.has(k) ? lsStore.get(k) : null),
  setItem: (k, v) => lsStore.set(k, String(v)),
  removeItem: (k) => lsStore.delete(k),
  clear: () => lsStore.clear(),
};
Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  configurable: true,
  writable: true,
});

if (typeof globalThis.window === 'undefined') {
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
}
if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = globalThis.window.CustomEvent;
}

const { defaultCharacter } = await import('../src/scripts/data/defaultCharacter.ts');
const { characterStore } = await import('../src/scripts/state/characterStore.ts');
const { campaignStore } = await import('../src/scripts/state/campaignStore.ts');
const { journalStore } = await import('../src/scripts/state/journalStore.ts');
const { userStore } = await import('../src/scripts/state/userStore.ts');
const {
  startCombat,
  getCurrentCombat,
  applyDamageToCombatant,
  syncCombatWithLiveCharacters,
} = await import('../src/scripts/data/combatService.ts');

test('Regresión Bug 1: Jugadora se resta 5 PG (8 -> 3) con partida en vivo y doble listener (mine + campaign) sin rebotar a 8/8', () => {
  journalStore.resetToDefault();
  const writes = { campaigns: [], characters: [], dmEvents: [] };
  const pendingSet = new Set();

  userStore.enterCloudMode({ id: 'uid-jugadora', name: 'Jugadora', email: '' });
  campaignStore.attachCloud({
    applyCampaignChanges: (c) => writes.campaigns.push(c),
    applyCharacterChanges: (c) => {
      writes.characters.push(c);
      c.updates.forEach((u) => pendingSet.add(u.id));
    },
    isCharacterPending: (id) => pendingSet.has(id),
    sendDmEvent: (e) => writes.dmEvents.push(e),
  });

  // 1. Estado inicial: campaña en vivo y personaje con 8/8 PG en ambos scopes ('mine' y 'campaign:camp-live')
  campaignStore.applyRemoteCampaigns([
    {
      id: 'camp-live',
      name: 'Partida en Vivo',
      description: '',
      imageUrl: '',
      creatorId: 'uid-dm',
      dmId: 'uid-dm',
      dmName: 'DM',
      memberUserIds: ['uid-dm', 'uid-jugadora'],
      setting: 'Reinos Olvidados',
      sessionNumber: 1,
      weather: 'Despejado',
      location: 'Mazmorra',
      status: 'active',
      createdAt: 1000,
    },
  ]);
  campaignStore.setActiveCampaign('camp-live');

  const initialRemoteChar = {
    ...JSON.parse(JSON.stringify(defaultCharacter)),
    id: 'char-jugadora',
    userId: 'uid-jugadora',
    campaignId: 'camp-live',
    name: 'Lyra',
    className: 'Mago',
    race: 'Elfo',
    level: 1,
    hp: { current: 8, max: 8, temp: 0 },
    inspiration: false,
    updatedAt: 1000,
  };

  campaignStore.applyRemoteCharacters('mine', [initialRemoteChar]);
  campaignStore.applyRemoteCharacters('campaign:camp-live', [initialRemoteChar]);

  // Cargar el personaje en characterStore desde remoto (no debe disparar escritura a la nube)
  characterStore.loadCharacter(campaignStore.getCharacter('char-jugadora'), true);
  assert.equal(writes.characters.length, 0, 'loadCharacter(..., true) no debe generar escrituras remotas');
  assert.equal(characterStore.get().hp.current, 8);

  // 2. La jugadora pulsa -5 PG desde su ficha
  characterStore.modifyHp(-5);
  assert.equal(characterStore.get().hp.current, 3, 'El PG en characterStore baja a 3');
  assert.equal(campaignStore.getCharacter('char-jugadora').hp.current, 3, 'El PG en campaignStore baja a 3');
  assert.equal(writes.characters.length, 1, 'Se encola 1 escritura de actualización de PG');

  const logEntries = journalStore.getEntries('char-jugadora', 'uid-jugadora', false);
  assert.ok(logEntries.some((e) => e.title.includes('Daño recibido: 5 PG')), 'La bitácora registra «Daño recibido: 5 PG»');

  // 3. Mientras el cambio está pendiente/en vuelo, llega un snapshot viejo en 'campaign:camp-live' con hp: 8
  campaignStore.applyRemoteCharacters('campaign:camp-live', [
    {
      ...initialRemoteChar,
      hp: { current: 8, max: 8, temp: 0 },
      updatedAt: 1000,
    },
  ]);
  assert.equal(campaignStore.getCharacter('char-jugadora').hp.current, 3, 'Snapshot viejo mientras está pendiente no pisa el 3');
  assert.equal(characterStore.get().hp.current, 3, 'characterStore sigue en 3');

  // 4. Termina el flush a Firestore (isCharacterPending pasa a false) y llega primero el snapshot de 'mine' (hp: 3, updatedAt: 2000)
  // mientras 'campaign:camp-live' todavía tenía hp: 8 (updatedAt: 1000)
  pendingSet.delete('char-jugadora');
  campaignStore.applyRemoteCharacters('mine', [
    {
      ...initialRemoteChar,
      hp: { current: 3, max: 8, temp: 0 },
      updatedAt: 2000,
    },
  ]);

  assert.equal(
    campaignStore.getCharacter('char-jugadora').hp.current,
    3,
    'El segundo scope viejo (updatedAt 1000) NO debe pisar al primero (updatedAt 2000)'
  );
  assert.equal(characterStore.get().hp.current, 3, 'El valor permanece en 3/8 y nunca vuelve a 8/8');

  // 5. Incluso si el segundo listener dispara tarde con el snapshot viejo (updatedAt: 1000), se ignora por tener menor updatedAt
  campaignStore.applyRemoteCharacters('campaign:camp-live', [
    {
      ...initialRemoteChar,
      hp: { current: 8, max: 8, temp: 0 },
      updatedAt: 1000,
    },
  ]);
  assert.equal(campaignStore.getCharacter('char-jugadora').hp.current, 3, 'Snapshot tardío con menor updatedAt no revierte PG a 8');
  assert.equal(characterStore.get().hp.current, 3, 'Sigue firme en 3/8');

  campaignStore.detachCloud();
  userStore.exitCloudMode();
});

test('Regresión Bug 2: Botones -5, -1, +1, +5 del DM sobre personajes en Combate y Grimorio persisten y no se revierten', async () => {
  localStorage.clear();
  const me = userStore.getCurrentUser();
  const camp = campaignStore.createCampaign({
    name: 'Averno DM Test',
    setting: 'Planos Infernales',
    dmName: me.name,
    status: 'active',
  });
  const cid = camp.id;
  campaignStore.setActiveCampaign(cid);

  const hero = {
    ...JSON.parse(JSON.stringify(defaultCharacter)),
    id: 'hero-dm-test',
    userId: 'uid-player-2',
    campaignId: cid,
    name: 'Kaelen',
    hp: { current: 20, max: 20, temp: 0 },
  };
  campaignStore.saveCharacter(hero);
  characterStore.loadCharacter(hero, true);

  await startCombat(cid, [
    {
      id: `pc-${hero.id}`,
      name: hero.name,
      initiative: 18,
      hp: 20,
      maxHp: 20,
      ac: 16,
      conditions: [],
      isPlayer: true,
      hiddenHp: false,
      characterId: hero.id,
      ownerUid: hero.userId,
    },
    {
      id: 'npc-imp-1',
      name: 'Diablillo',
      initiative: 12,
      hp: 15,
      maxHp: 15,
      ac: 13,
      conditions: [],
      isPlayer: false,
      hiddenHp: false,
    },
  ]);

  // Caso A: El DM pulsa -5 en el CombatTracker sobre el personaje jugador
  let combatSeenInListener = null;
  let charHpSeenDuringCombatEvent = null;
  const onCombatUpdated = (e) => {
    if (e.detail?.cid === cid) {
      combatSeenInListener = e.detail.combat;
      // Simular exactamente lo que hace CombatTracker.renderCombatantsList: leer liveChar de campaignStore
      const liveChar = campaignStore.getCharacter(hero.id);
      charHpSeenDuringCombatEvent = liveChar?.hp?.current;
    }
  };
  window.addEventListener('combat-updated', onCombatUpdated);

  await applyDamageToCombatant(cid, `pc-${hero.id}`, -5);
  window.removeEventListener('combat-updated', onCombatUpdated);

  assert.equal(
    charHpSeenDuringCombatEvent,
    15,
    'Cuando combat-updated dispara, campaignStore YA tiene 15 PG para que CombatTracker no lo pise con 20'
  );
  assert.equal(combatSeenInListener.combatants.find((c) => c.id === `pc-${hero.id}`).hp, 15);
  assert.equal(campaignStore.getCharacter(hero.id).hp.current, 15);
  assert.equal(characterStore.get().hp.current, 15);

  // Caso B: El DM pulsa -1 en el CombatTracker
  await applyDamageToCombatant(cid, `pc-${hero.id}`, -1);
  assert.equal(getCurrentCombat(cid).combatants.find((c) => c.id === `pc-${hero.id}`).hp, 14);
  assert.equal(campaignStore.getCharacter(hero.id).hp.current, 14);
  assert.equal(characterStore.get().hp.current, 14);

  // Caso C: El DM pulsa -5 desde la tarjeta del Grimorio / DmPanelModal y sincroniza con el combate
  const fresh = JSON.parse(JSON.stringify(campaignStore.getCharacter(hero.id)));
  fresh.hp.current = Math.max(0, Math.min(fresh.hp.max, fresh.hp.current - 5));
  campaignStore.saveCharacter(fresh);
  await syncCombatWithLiveCharacters(cid);

  assert.equal(campaignStore.getCharacter(hero.id).hp.current, 9);
  assert.equal(getCurrentCombat(cid).combatants.find((c) => c.id === `pc-${hero.id}`).hp, 9);
  assert.equal(characterStore.get().hp.current, 9);
});

test('Regresión Bug 3: El daño realizado por los jugadores a oponentes en combate persiste en combatService y localStorage', async () => {
  localStorage.clear();
  const me = userStore.getCurrentUser();
  const camp = campaignStore.createCampaign({
    name: 'Barovia Combat Test',
    setting: 'Ravenloft',
    dmName: me.name,
    status: 'active',
  });
  const cid = camp.id;
  campaignStore.setActiveCampaign(cid);

  await startCombat(cid, [
    {
      id: 'pc-elysian',
      name: 'Elysian Ventosombra',
      initiative: 19,
      hp: 42,
      maxHp: 48,
      ac: 16,
      conditions: [],
      isPlayer: true,
      hiddenHp: false,
      characterId: 'elysian-strahd',
    },
    {
      id: 'npc-vampire-spawn',
      name: 'Engendro Vampírico',
      initiative: 14,
      hp: 30,
      maxHp: 30,
      ac: 15,
      conditions: [],
      isPlayer: false,
      hiddenHp: false,
    },
  ]);

  // El jugador causa 8 puntos de daño al Engendro Vampírico
  await applyDamageToCombatant(cid, 'npc-vampire-spawn', -8);

  const combatAfterHit1 = getCurrentCombat(cid);
  const enemyAfterHit1 = combatAfterHit1.combatants.find((c) => c.id === 'npc-vampire-spawn');
  assert.equal(enemyAfterHit1.hp, 22, 'El oponente baja de 30 a 22 PG');

  // Verificar que persiste en localStorage (simulando recarga)
  const storedRaw = localStorage.getItem(`dnd_combat_${cid}`);
  assert.ok(storedRaw, 'El estado del combate se guarda en localStorage');
  const storedCombat = JSON.parse(storedRaw);
  assert.equal(storedCombat.combatants.find((c) => c.id === 'npc-vampire-spawn').hp, 22, 'El daño persiste tras recargar');

  // El jugador causa otros 10 puntos de daño con un conjuro
  await applyDamageToCombatant(cid, 'npc-vampire-spawn', -10);
  assert.equal(getCurrentCombat(cid).combatants.find((c) => c.id === 'npc-vampire-spawn').hp, 12, 'El oponente baja de 22 a 12 PG');
});
