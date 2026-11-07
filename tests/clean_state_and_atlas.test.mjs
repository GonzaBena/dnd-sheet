// tests/clean_state_and_atlas.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

// Mock browser environment for node testing
if (typeof globalThis.window === 'undefined') {
  const listeners = new Map();
  globalThis.window = {
    addEventListener: (type, cb) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(cb);
    },
    removeEventListener: (type, cb) => {
      if (listeners.has(type)) {
        listeners.set(type, listeners.get(type).filter(fn => fn !== cb));
      }
    },
    dispatchEvent: (event) => {
      const cbs = listeners.get(event.type) || [];
      cbs.forEach(cb => cb(event));
      return true;
    },
    CustomEvent: class CustomEvent {
      constructor(type, eventInitDict) {
        this.type = type;
        this.detail = eventInitDict?.detail;
      }
    }
  };
}

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear()
  };
}

const { userStore } = await import('../src/scripts/state/userStore.ts');
const { campaignStore } = await import('../src/scripts/state/campaignStore.ts');
const { defaultCharacter } = await import('../src/scripts/data/defaultCharacter.ts');
const { characterStore } = await import('../src/scripts/state/characterStore.ts');

test('Clean state & Atlas character verification', async (t) => {
  await t.test('1. Default character is Atlas and title is Guardián del Cónclave Umbrío', () => {
    assert.equal(defaultCharacter.name, 'Atlas');
    assert.equal(defaultCharacter.id, 'atlas');
    assert.equal(defaultCharacter.title, 'Guardián del Cónclave Umbrío');
    assert.ok(defaultCharacter.features.length >= 3);
  });

  await t.test('2. Only the current user (user-me) exists in userStore', () => {
    const users = userStore.getUsers();
    assert.equal(users.length, 1, 'Only one user exists');
    assert.equal(users[0].id, 'user-me', 'User is user-me (Gonzo)');
    assert.equal(userStore.getCurrentUser().id, 'user-me');
  });

  await t.test('3. No campaigns exist in default state', () => {
    const campaigns = campaignStore.getCampaigns();
    assert.equal(campaigns.length, 0, 'No campaigns exist');
    assert.equal(campaignStore.getActiveCampaignId(), null, 'No active campaign id');
  });

  await t.test('4. Only Atlas exists in characters list and is standalone', () => {
    const allChars = campaignStore.getAllCharacters();
    assert.equal(allChars.length, 1, 'Only 1 character exists in all characters');
    assert.equal(allChars[0].name, 'Atlas', 'Character is Atlas');
    assert.equal(allChars[0].id, 'atlas', 'Character ID is atlas');
    assert.equal(allChars[0].campaignId, null, 'Character is standalone (sin campaña)');
    assert.equal(allChars[0].userId, 'user-me', 'Owned by user-me');
  });

  await t.test('5. characterStore loads Atlas by default', () => {
    const char = characterStore.get();
    assert.equal(char.name, 'Atlas');
    assert.equal(char.id, 'atlas');
  });
});
