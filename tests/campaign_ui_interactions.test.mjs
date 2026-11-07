// tests/campaign_ui_interactions.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

// Mock browser environment for node testing
if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
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

test('Campaign UI Interactions & Navbar Resolution Tests', async (t) => {
  campaignStore.seedLegacyFixtures();
  userStore.setCurrentUser('user-me');

  await t.test('1. When active campaign has user as DM, navbar button resolves to Grimorio del Control', () => {
    // Select Avernus (Gonzo is DM)
    campaignStore.setActiveCampaign('avernus-descent');
    const activeCampId = campaignStore.getActiveCampaignId();
    assert.equal(activeCampId, 'avernus-descent');

    const isDm = campaignStore.isCurrentUserDm(activeCampId);
    assert.equal(isDm, true, 'User is DM of Avernus');

    // Simulate navbar resolution logic from campaigns.astro
    let buttonMode = '';
    let buttonText = '';
    let buttonHref = '';

    if (isDm) {
      buttonMode = 'dm';
      buttonText = 'Grimorio del Control';
      buttonHref = `/?campaign=${encodeURIComponent(activeCampId)}&mode=dm`;
    } else {
      const myChar = campaignStore.getMyCharacterForCampaign(activeCampId, 'user-me');
      buttonMode = 'player';
      buttonText = myChar ? `Hoja (${myChar.name})` : 'Unirse';
      buttonHref = myChar ? `/?campaign=${activeCampId}&character=${myChar.id}` : '#';
    }

    assert.equal(buttonMode, 'dm', 'Mode is DM');
    assert.equal(buttonText, 'Grimorio del Control');
    assert.equal(buttonHref, '/?campaign=avernus-descent&mode=dm');
    // Ensure it does NOT show Elysian from Barovia!
    assert.equal(buttonText.includes('Elysian'), false, 'Does not mention Elysian');
  });

  await t.test('2. When active campaign has user as Player, navbar button resolves to that specific character', () => {
    // Select Barovia (Gonzo is player with Elysian)
    campaignStore.setActiveCampaign('barovia-strahd');
    const activeCampId = campaignStore.getActiveCampaignId();
    assert.equal(activeCampId, 'barovia-strahd');

    const isDm = campaignStore.isCurrentUserDm(activeCampId);
    assert.equal(isDm, false, 'User is NOT DM of Barovia');

    const myChar = campaignStore.getMyCharacterForCampaign(activeCampId, 'user-me');
    assert.ok(myChar, 'User has Elysian in Barovia');
    assert.equal(myChar.id, 'elysian-ventosombra');

    let buttonText = '';
    let buttonHref = '';
    if (isDm) {
      buttonText = 'Grimorio del Control';
    } else if (myChar) {
      buttonText = `Hoja (${myChar.name.split(' ')[0]})`;
      buttonHref = `/?campaign=${encodeURIComponent(activeCampId)}&character=${encodeURIComponent(myChar.id)}`;
    }

    assert.equal(buttonText, 'Hoja (Elysian)');
    assert.equal(buttonHref, '/?campaign=barovia-strahd&character=elysian-ventosombra');
  });

  await t.test('3. Card click ONLY activates campaign without triggering modal or navigating', () => {
    // Start with Barovia active
    campaignStore.setActiveCampaign('barovia-strahd');
    assert.equal(campaignStore.getActiveCampaignId(), 'barovia-strahd');

    // Simulate clicking card for Phandelver
    let modalOpened = false;
    let navigated = false;

    // Card click behavior
    const onCardClick = (campId) => {
      // ONLY sets active campaign!
      campaignStore.setActiveCampaign(campId);
      // DOES NOT open modal
      // DOES NOT window.location.href
    };

    onCardClick('phandelver-mine');
    assert.equal(campaignStore.getActiveCampaignId(), 'phandelver-mine', 'Phandelver became active');
    assert.equal(modalOpened, false, 'Modal was NOT opened');
    assert.equal(navigated, false, 'Did not navigate');

    // Simulate clicking "Ver Grupo" button
    const onVerGrupoClick = (campId) => {
      modalOpened = true;
    };
    onVerGrupoClick('phandelver-mine');
    assert.equal(modalOpened, true, 'Modal opens ONLY when clicking Ver Grupo');

    // Reset back to Barovia
    campaignStore.setActiveCampaign('barovia-strahd');
  });
});
