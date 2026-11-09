// tests/campaign_creation_persistence_and_navbar.test.mjs
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

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) || null,
  setItem: (key, val) => store.set(key, String(val)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear()
};

const { campaignStore } = await import('../src/scripts/state/campaignStore.ts');
const { userStore } = await import('../src/scripts/state/userStore.ts');
const { characterStore } = await import('../src/scripts/state/characterStore.ts');

test('Campaign Creation, Persistence & Navbar Resolution', async (t) => {
  userStore.setCurrentUser('user-me');

  await t.test('1. Creating a campaign activates it and creator is DM', () => {
    const newCamp = campaignStore.createCampaign({
      name: 'La Ciudad Sumergida',
      description: 'Una expedición a las profundidades olvidadas.',
      setting: 'Costa de la Espada',
      dmId: 'user-me'
    });

    assert.ok(newCamp.id, 'Campaign has valid ID');
    assert.equal(newCamp.name, 'La Ciudad Sumergida');
    assert.equal(newCamp.dmId, 'user-me');
    assert.equal(campaignStore.getActiveCampaignId(), newCamp.id, 'New campaign is active');
    assert.equal(campaignStore.isCurrentUserDm(newCamp.id), true, 'User is DM');
  });

  await t.test('2. Top navbar button on campaigns page resolves to DM Grimoire, NOT character sheet', () => {
    const activeCampId = campaignStore.getActiveCampaignId();
    const activeCamp = activeCampId ? campaignStore.getCampaign(activeCampId) : null;
    const isDm = campaignStore.isCurrentUserDm(activeCampId);

    assert.ok(activeCamp, 'Active campaign exists');
    assert.equal(isDm, true, 'User is DM');

    // Simulate navbar logic from index.astro
    let activeBtnTitle = '';
    let activeBtnHref = '';
    let activeBtnIcon = '';

    if (isDm && activeCamp) {
      activeBtnIcon = 'crown';
      activeBtnTitle = `Abrir el Grimorio del Control de ${activeCamp.name}`;
      activeBtnHref = `/campaigns?campaign=${encodeURIComponent(activeCamp.id)}&mode=dm`;
    } else {
      const myChar = campaignStore.getMyCharacterForCampaign(activeCamp.id, 'user-me');
      activeBtnIcon = 'badge';
      activeBtnTitle = myChar ? `Abrir la ficha de ${myChar.name}` : 'Unirse';
      activeBtnHref = myChar ? `/campaigns?campaign=${encodeURIComponent(activeCamp.id)}&character=${myChar.id}` : '#';
    }

    assert.equal(activeBtnIcon, 'crown', 'Navbar shows crown icon');
    assert.equal(activeBtnHref.includes('&mode=dm'), true, 'Points to DM mode');
    assert.equal(activeBtnHref.includes('character='), false, 'Does NOT point to any character sheet');
  });

  await t.test('3. Reloading or navigating preserves created campaigns (never wipes them)', () => {
    // In localStorage, verify CAMPAIGNS_STORAGE_KEY has the created campaign
    const rawSaved = globalThis.localStorage.getItem('dnd_campaigns_v1');
    assert.ok(rawSaved, 'Campaigns are saved in localStorage');
    const parsed = JSON.parse(rawSaved);
    assert.ok(parsed.length >= 1, 'At least 1 campaign exists in localStorage');
    assert.equal(parsed.some(c => c.name === 'La Ciudad Sumergida'), true);

    // Call loadCampaigns via a re-check
    const campaignsNow = campaignStore.getCampaigns();
    assert.ok(campaignsNow.length >= 1, 'Campaign store retains created campaigns');
    assert.equal(campaignsNow.some(c => c.name === 'La Ciudad Sumergida'), true);
  });

  await t.test('4. DM in active campaign has no character and cannot toggle to player mode', () => {
    const activeCampId = campaignStore.getActiveCampaignId();
    const myCharInCamp = campaignStore.getMyCharacterForCampaign(activeCampId, 'user-me');
    assert.equal(myCharInCamp, undefined, 'DM has no character in this campaign');

    const isDm = campaignStore.isCurrentUserDm(activeCampId);
    const urlMode = 'player'; // Attempt to set player mode
    const shouldShowDm = isDm && (!myCharInCamp || urlMode !== 'player');

    assert.equal(shouldShowDm, true, 'DM mode is forced because DM has no character in this campaign');
  });
});
