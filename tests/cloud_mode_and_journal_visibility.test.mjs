// tests/cloud_mode_and_journal_visibility.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

if (typeof globalThis.window === 'undefined') {
  const listeners = new Map();
  globalThis.window = {
    addEventListener: (type, cb) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(cb);
    },
    removeEventListener: (type, cb) => {
      listeners.set(type, (listeners.get(type) || []).filter(fn => fn !== cb));
    },
    dispatchEvent: (event) => {
      (listeners.get(event.type) || []).forEach(cb => cb(event));
      return true;
    },
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    }
  };
}
if (typeof globalThis.CustomEvent === 'undefined') {
  globalThis.CustomEvent = globalThis.window.CustomEvent;
}
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
}

const { journalStore, getEntryVisibility } = await import('../src/scripts/state/journalStore.ts');
const { campaignStore } = await import('../src/scripts/state/campaignStore.ts');
const { userStore } = await import('../src/scripts/state/userStore.ts');
const { diffDocs } = await import('../src/scripts/data/cloudTypes.ts');
const { generateInviteCode, normalizeInviteCode } = await import('../src/scripts/utils/ids.ts');

test('visibilidad: party, dm y player (y compatibilidad con isPrivate)', () => {
  assert.equal(getEntryVisibility({}), 'party');
  assert.equal(getEntryVisibility({ isDmOnly: true }), 'dm');
  assert.equal(getEntryVisibility({ isPlayerOnly: true, characterId: 'c1' }), 'player');
  assert.equal(getEntryVisibility({ isForDm: true, characterId: 'c1' }), 'to_dm');
  // Datos viejos: privado con personaje = nota de jugador, sin personaje = nota del DM.
  assert.equal(getEntryVisibility({ isPrivate: true, characterId: 'c1' }), 'player');
  assert.equal(getEntryVisibility({ isPrivate: true }), 'dm');
});

test('vista de un personaje: ve party y sus notas de jugador, nunca las de DM ni las de otro', () => {
  journalStore.resetToDefault();
  const party = journalStore.addEntry({ sessionNumber: 1, title: 'Party', content: '', tags: [], characterId: 'elena' });
  const mine = journalStore.addEntry({ sessionNumber: 1, title: 'Mía', content: '', tags: [], isPlayerOnly: true, characterId: 'elena' });
  const other = journalStore.addEntry({ sessionNumber: 1, title: 'De Marcos', content: '', tags: [], isPlayerOnly: true, characterId: 'marcos' });
  const dm = journalStore.addEntry({ sessionNumber: 1, title: 'Secreto DM', content: '', tags: [], isDmOnly: true, authorName: 'Dungeon Master' });
  const toDm = journalStore.addEntry({ sessionNumber: 1, title: 'Para el DM', content: '', tags: [], isForDm: true, characterId: 'elena' });
  const otherToDm = journalStore.addEntry({ sessionNumber: 1, title: 'Marcos al DM', content: '', tags: [], isForDm: true, characterId: 'marcos' });

  const elenaView = journalStore.getEntries('elena').map(e => e.id);
  assert.ok(elenaView.includes(party.id));
  assert.ok(elenaView.includes(mine.id));
  assert.ok(!elenaView.includes(other.id), 'no ve la nota de jugador de otro');
  assert.ok(!elenaView.includes(dm.id), 'no ve las notas del DM');
  assert.ok(elenaView.includes(toDm.id), 've su propio mensaje al DM');
  assert.ok(!elenaView.includes(otherToDm.id), 'no ve el mensaje al DM de otro jugador');

  // Vista del DM (sin filtro de personaje): recibe los mensajes de todos.
  const dmView = journalStore.getEntries().map(e => e.id);
  assert.ok(dmView.includes(toDm.id) && dmView.includes(otherToDm.id));

  const publicIds = journalStore.getPublicCampaignEntries().map(e => e.id);
  assert.deepEqual(publicIds.filter(id => [party.id, mine.id, other.id, dm.id, toDm.id].includes(id)), [party.id]);
});

test('log() acepta visibilidad (antes el flag privado del DM se ignoraba)', () => {
  const e = journalStore.log('Nota DM', 'x', ['#Mundo'], undefined, { visibility: 'dm', authorName: 'Dungeon Master' });
  assert.equal(e.isDmOnly, true);
  assert.equal(getEntryVisibility(e), 'dm');
});

test('log() de hitos/hazañas no corrompe diceRoll y asigna milestone.bannerText correctamente', () => {
  // Caso 1: Pasado en options { bannerText }
  const e1 = journalStore.log('⭐ Hito 1', 'Completado', ['#Hito'], undefined, { bannerText: '¡Nivel Superado!' });
  assert.equal(e1.diceRoll, undefined, 'diceRoll no debe definirse');
  assert.equal(e1.milestone?.bannerText, '¡Nivel Superado!');

  // Caso 2: Pasado legacy en 4to argumento como { bannerText }
  const e2 = journalStore.log('⭐ Hito 2', 'Completado', ['#Hito'], { bannerText: '¡Victoria!' });
  assert.equal(e2.diceRoll, undefined, 'diceRoll no debe definirse cuando era bannerText legacy');
  assert.equal(e2.milestone?.bannerText, '¡Victoria!');
});

test('visibilidad para jugador con authorUid ve sus notas to_dm y party de otros jugadores', () => {
  journalStore.resetToDefault();
  const partyOther = journalStore.addEntry({ sessionNumber: 1, title: 'Party de Bob', content: '', tags: [], characterId: 'bob-char', authorUid: 'uid-bob' });
  const toDmBob = journalStore.addEntry({ sessionNumber: 1, title: 'Bob al DM', content: '', tags: [], isForDm: true, characterId: 'bob-char', authorUid: 'uid-bob' });
  const toDmAlice = journalStore.addEntry({ sessionNumber: 1, title: 'Alice al DM', content: '', tags: [], isForDm: true, characterId: 'alice-char', authorUid: 'uid-alice' });
  const dmSecret = journalStore.addEntry({ sessionNumber: 1, title: 'Secreto del DM', content: '', tags: [], isDmOnly: true, authorName: 'Dungeon Master' });

  // Vista de Alice como jugadora (no DM)
  const aliceEntries = journalStore.getEntries('alice-char', 'uid-alice', false);
  const aliceIds = aliceEntries.map(e => e.id);
  assert.ok(aliceIds.includes(partyOther.id), 'Alice ve la nota pública de Bob');
  assert.ok(aliceIds.includes(toDmAlice.id), 'Alice ve su propio mensaje al DM');
  assert.ok(!aliceIds.includes(toDmBob.id), 'Alice NO ve el mensaje privado de Bob al DM');
  assert.ok(!aliceIds.includes(dmSecret.id), 'Alice NO ve el secreto del DM');

  // Vista del DM
  const dmEntries = journalStore.getEntries(undefined, 'uid-dm', true);
  const dmIds = dmEntries.map(e => e.id);
  assert.ok(dmIds.includes(partyOther.id));
  assert.ok(dmIds.includes(toDmBob.id), 'El DM ve el mensaje de Bob');
  assert.ok(dmIds.includes(toDmAlice.id), 'El DM ve el mensaje de Alice');
  assert.ok(dmIds.includes(dmSecret.id), 'El DM ve su propio secreto');
});

test('diffDocs: crea, actualiza solo campos cambiados, borra y detecta claves eliminadas', () => {
  const synced = new Map([
    ['a', JSON.stringify({ id: 'a', name: 'A', hp: 10, extra: 1 })],
    ['b', JSON.stringify({ id: 'b', name: 'B' })],
  ]);
  const next = [
    { id: 'a', name: 'A', hp: 7 },
    { id: 'c', name: 'C' },
  ];
  const changes = diffDocs(synced, next, (x) => ({ ...x }));
  assert.deepEqual(changes.creates, [{ id: 'c', data: { id: 'c', name: 'C' } }]);
  assert.deepEqual(changes.updates, [{ id: 'a', fields: { hp: 7 }, removedKeys: ['extra'] }]);
  assert.deepEqual(changes.deletes, ['b']);
});

test('códigos de invitación: sin caracteres ambiguos y normalizables', () => {
  const code = generateInviteCode();
  assert.equal(code.length, 7);
  assert.match(code, /^[A-HJ-NP-Z2-9]+$/);
  assert.equal(normalizeInviteCode(' abc-23 45 '), 'ABC2345');
});

test('modo nube: los cambios de los stores se convierten en escrituras mínimas', () => {
  const writes = { campaigns: [], characters: [], dmEvents: [] };
  userStore.enterCloudMode({ id: 'uid-dm', name: 'DM', email: '' });
  campaignStore.attachCloud({
    applyCampaignChanges: (c) => writes.campaigns.push(c),
    applyCharacterChanges: (c) => writes.characters.push(c),
    isCharacterPending: () => false,
    sendDmEvent: (e) => writes.dmEvents.push(e),
  });

  // Snapshot inicial de la nube: no genera escrituras.
  campaignStore.applyRemoteCampaigns([{
    id: 'camp-1', name: 'Strahd', description: '', imageUrl: '', creatorId: 'uid-dm', dmId: 'uid-dm', dmName: 'DM',
    memberUserIds: ['uid-dm', 'uid-player'], setting: '', sessionNumber: 3, weather: '', location: '', status: 'active',
    createdAt: 1, inviteCode: 'ABC2345',
  }]);
  campaignStore.applyRemoteCharacters('campaign:camp-1', [{
    id: 'char-1', userId: 'uid-player', campaignId: 'camp-1', name: 'Elena', hp: { current: 5, max: 20, temp: 0 }, inspiration: false,
  }]);
  assert.equal(writes.campaigns.length, 0);
  assert.equal(writes.characters.length, 0);
  assert.deepEqual(campaignStore.getCampaign('camp-1').characterIds, ['char-1'], 'characterIds se deriva de las fichas');

  // El DM cura al jugador: solo viaja `hp`.
  const char = campaignStore.getCharacter('char-1');
  char.hp.current = 20;
  campaignStore.saveCharacter(char);
  assert.equal(writes.characters.length, 1);
  assert.deepEqual(writes.characters[0].updates, [{ id: 'char-1', fields: { hp: { current: 20, max: 20, temp: 0 } }, removedKeys: [] }]);

  // Editar la campaña: solo los campos tocados, nunca characterIds.
  campaignStore.updateCampaign('camp-1', { sessionNumber: 4 });
  assert.deepEqual(writes.campaigns.at(-1).updates, [{ id: 'camp-1', fields: { sessionNumber: 4 }, removedKeys: [] }]);

  // Crear campaña en la nube: quien crea es DM y único miembro, con código de invitación.
  const created = campaignStore.createCampaign({ name: 'Nueva', memberUserIds: ['uid-dm', 'uid-x'], dmId: 'uid-x' });
  assert.deepEqual(created.memberUserIds, ['uid-dm']);
  assert.equal(created.dmId, 'uid-dm');
  assert.ok(created.inviteCode);
  const createWrite = writes.campaigns.at(-1).creates[0];
  assert.equal(createWrite.id, created.id);
  assert.ok(!('characterIds' in createWrite.data));

  // Regenerar el código.
  const newCode = campaignStore.regenerateInviteCode(created.id);
  assert.deepEqual(writes.campaigns.at(-1).updates[0].fields, { inviteCode: newCode });

  // Eventos del DM salen por la nube.
  campaignStore.sendDmEvent('camp-1', { campaignId: 'camp-1', type: 'dice_roll', dmName: 'DM', payload: {} });
  assert.equal(writes.dmEvents.length, 1);

  // La ficha por defecto de un dispositivo nuevo no crea documentos.
  const before = writes.characters.length;
  window.dispatchEvent(new CustomEvent('character-updated', { detail: { character: { id: 'atlas', name: 'Atlas', userId: 'uid-dm' } } }));
  assert.equal(writes.characters.length, before);

  campaignStore.detachCloud();
  userStore.exitCloudMode();
});

test('getPublicCampaignEntries filtra por campaña y visibilidad pública', () => {
  journalStore.resetToDefault();
  journalStore.addEntry({ sessionNumber: 1, title: 'Party Camp A', content: '', tags: [], campaignId: 'camp-A' });
  journalStore.addEntry({ sessionNumber: 1, title: 'Private Camp A', content: '', tags: [], isPlayerOnly: true, campaignId: 'camp-A' });
  journalStore.addEntry({ sessionNumber: 1, title: 'Party Camp B', content: '', tags: [], campaignId: 'camp-B' });

  const entriesA = journalStore.getPublicCampaignEntries('camp-A');
  assert.equal(entriesA.length, 1);
  assert.equal(entriesA[0].title, 'Party Camp A');

  const entriesB = journalStore.getPublicCampaignEntries('camp-B');
  assert.equal(entriesB.length, 1);
  assert.equal(entriesB[0].title, 'Party Camp B');
});
