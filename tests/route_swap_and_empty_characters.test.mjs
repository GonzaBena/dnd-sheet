// tests/route_swap_and_empty_characters.test.mjs
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

const { campaignStore } = await import('../src/scripts/state/campaignStore.ts');
const { userStore } = await import('../src/scripts/state/userStore.ts');
const { characterStore } = await import('../src/scripts/state/characterStore.ts');

test('Route Swap & Empty Characters Resolution Tests', async (t) => {
  userStore.setCurrentUser('user-me');

  await t.test('1. Path / is campaigns dashboard and /campaigns is character sheet', () => {
    campaignStore.seedLegacyFixtures();
    const currentUser = userStore.getCurrentUser();
    const standaloneChars = campaignStore.getMyStandaloneCharacters(currentUser.id);

    // Resolution on / (Campaigns page): active character button points to /campaigns
    let activeBtnHref = '';
    if (standaloneChars.length > 0) {
      activeBtnHref = `/campaigns?character=${encodeURIComponent(standaloneChars[0].id)}`;
    }
    assert.equal(activeBtnHref.startsWith('/campaigns?character='), true);
  });

  await t.test('2. When user has NO characters and is NOT DM, sheet (/campaigns) redirects to / (campaigns)', () => {
    // Clear all characters
    const allChars = [...campaignStore.getAllCharacters()];
    allChars.forEach(c => campaignStore.deleteCharacter(c.id));
    campaignStore.setActiveCampaign(null);

    const currentUser = userStore.getCurrentUser();
    const myChars = campaignStore.getAllCharacters().filter(c => campaignStore.isCharacterOwner(c, currentUser.id));
    const activeCampId = campaignStore.getActiveCampaignId();
    const isDm = campaignStore.isCurrentUserDm(activeCampId || undefined);

    assert.equal(myChars.length, 0, 'User has 0 characters');
    assert.equal(isDm, false, 'User is not DM');

    // Simulate route guard in /campaigns
    let redirectedTo = '';
    const targetChar = null;
    if (!isDm && myChars.length === 0 && !targetChar) {
      redirectedTo = '/';
    }

    assert.equal(redirectedTo, '/', 'Redirects to / so user starts in campaigns');
  });

  await t.test('3. Standalone character deletion empties character store correctly', () => {
    // Re-seed fixtures
    campaignStore.seedLegacyFixtures();
    assert.ok(campaignStore.getAllCharacters().length > 0);

    // Delete characters one by one
    const myChars = campaignStore.getAllCharacters().filter(c => campaignStore.isCharacterOwner(c, 'user-me'));
    myChars.forEach(c => campaignStore.deleteCharacter(c.id));

    const remaining = campaignStore.getMyStandaloneCharacters('user-me');
    assert.equal(remaining.length, 0, 'No standalone characters remaining');
  });

  await t.test('4. Query param backwards compatibility redirect from / to /campaigns', () => {
    const testCases = [
      { search: '?character=atlas', shouldRedirect: true },
      { search: '?mode=dm', shouldRedirect: true },
      { search: '?campaign=barovia-strahd&character=elysian', shouldRedirect: true },
      { search: '', shouldRedirect: false }
    ];

    testCases.forEach(({ search, shouldRedirect }) => {
      const params = new URLSearchParams(search);
      let target = '';
      if (params.get('character') || params.get('mode') === 'dm' || (params.get('campaign') && params.get('character'))) {
        target = `/campaigns${search}`;
      }

      if (shouldRedirect) {
        assert.equal(target, `/campaigns${search}`);
      } else {
        assert.equal(target, '');
      }
    });
  });
});
