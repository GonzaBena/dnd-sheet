// tests/character_ownership.test.mjs
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

test('Character Ownership & Access Protection Tests', async (t) => {
  // Reset user to default 'user-me' (Gonzo)
  userStore.setCurrentUser('user-me');
  const gonzo = userStore.getCurrentUser();
  assert.equal(gonzo.id, 'user-me', 'Initial user is Gonzo (user-me)');

  await t.test('1. Character ownership validation for active user', () => {
    const elysian = campaignStore.getCharacter('elysian-ventosombra');
    const morgana = campaignStore.getCharacter('morgana-espinaoscura');
    const thorin = campaignStore.getCharacter('thorin-rompehierro');
    const geralt = campaignStore.getCharacter('geralt-vagabundo');

    assert.ok(elysian, 'Elysian exists');
    assert.ok(morgana, 'Morgana exists');
    assert.ok(thorin, 'Thorin exists');
    assert.ok(geralt, 'Geralt exists');

    // Gonzo checks
    assert.equal(campaignStore.isCharacterOwner(elysian), true, 'Gonzo is the owner of Elysian');
    assert.equal(campaignStore.isCharacterOwner(geralt), true, 'Gonzo is the owner of standalone Geralt');
    assert.equal(campaignStore.isCharacterOwner(morgana), false, 'Gonzo is NOT the owner of Morgana (Elena)');
    assert.equal(campaignStore.isCharacterOwner(thorin), false, 'Gonzo is NOT the owner of Thorin (Marcos)');
  });

  await t.test('2. getMyCharacterForCampaign correctly resolves owner character per campaign', () => {
    // Gonzo in Barovia
    const gonzoBaroviaChar = campaignStore.getMyCharacterForCampaign('barovia-strahd', 'user-me');
    assert.ok(gonzoBaroviaChar, 'Gonzo has a character in Barovia');
    assert.equal(gonzoBaroviaChar.id, 'elysian-ventosombra');

    // Elena in Barovia
    const elenaBaroviaChar = campaignStore.getMyCharacterForCampaign('barovia-strahd', 'user-elena');
    assert.ok(elenaBaroviaChar, 'Elena has a character in Barovia');
    assert.equal(elenaBaroviaChar.id, 'morgana-espinaoscura');

    // Sofia in Barovia
    const sofiaBaroviaChar = campaignStore.getMyCharacterForCampaign('barovia-strahd', 'user-sofia');
    assert.ok(sofiaBaroviaChar, 'Sofia has a character in Barovia');
    assert.equal(sofiaBaroviaChar.id, 'liara-hojaargenta');

    // Gonzo in Avernus (Gonzo is DM in Avernus, has no player character)
    const gonzoAvernusChar = campaignStore.getMyCharacterForCampaign('avernus-descent', 'user-me');
    assert.equal(gonzoAvernusChar, undefined, 'Gonzo has no player character in Avernus');
  });

  await t.test('3. Cloning transfers ownership to the cloner user with independent ID', () => {
    // Switch to Elena
    userStore.setCurrentUser('user-elena');
    const elena = userStore.getCurrentUser();
    assert.equal(elena.id, 'user-elena');

    // Create a new campaign for Elena where she does not yet have a character
    const elenaCamp = campaignStore.createCampaign({
      name: 'Cruzada de Elena',
      memberUserIds: ['user-elena']
    });

    // Elena clones Elysian (which originally belonged to Gonzo)
    const elenaClone = campaignStore.cloneCharacter('elysian-ventosombra', elenaCamp.id, 'Elysian de Fuego');

    assert.ok(elenaClone.id !== 'elysian-ventosombra', 'Cloned character gets a new independent ID');
    assert.equal(elenaClone.userId, 'user-elena', 'Clone userId is assigned to the current active user (Elena)');
    assert.equal(elenaClone.playerName, 'Elena V.', 'Clone playerName is set to Elena');
    assert.equal(elenaClone.campaignId, elenaCamp.id);

    // Ownership of the clone
    assert.equal(campaignStore.isCharacterOwner(elenaClone, 'user-elena'), true, 'Elena owns the new clone');
    assert.equal(campaignStore.isCharacterOwner(elenaClone, 'user-me'), false, 'Gonzo does not own Elena\'s clone');

    // Original Elysian is unchanged
    const original = campaignStore.getCharacter('elysian-ventosombra');
    assert.equal(original.userId, 'user-me', 'Original Elysian still belongs to Gonzo');
    assert.equal(original.campaignId, 'barovia-strahd');

    // Clean up
    campaignStore.deleteCharacter(elenaClone.id);
    campaignStore.deleteCampaign(elenaCamp.id, 'user-elena');
  });

  await t.test('4. Dynamic ownership switching when active user changes', () => {
    // Switch to Sofia
    userStore.setCurrentUser('user-sofia');
    const liara = campaignStore.getCharacter('liara-hojaargenta');
    const elysian = campaignStore.getCharacter('elysian-ventosombra');

    assert.equal(campaignStore.isCharacterOwner(liara), true, 'Sofia owns Liara');
    assert.equal(campaignStore.isCharacterOwner(elysian), false, 'Sofia does not own Elysian');

    const sofiaBarovia = campaignStore.getMyCharacterForCampaign('barovia-strahd');
    assert.equal(sofiaBarovia?.id, 'liara-hojaargenta');

    // Switch back to Gonzo
    userStore.setCurrentUser('user-me');
    assert.equal(campaignStore.isCharacterOwner(liara), false, 'Gonzo does not own Liara');
    assert.equal(campaignStore.isCharacterOwner(elysian), true, 'Gonzo owns Elysian');

    const gonzoBarovia = campaignStore.getMyCharacterForCampaign('barovia-strahd');
    assert.equal(gonzoBarovia?.id, 'elysian-ventosombra');
  });

  await t.test('5. Standalone character ownership isolation', () => {
    userStore.setCurrentUser('user-me');
    const gonzoStandalone = campaignStore.getMyStandaloneCharacters('user-me');
    assert.ok(gonzoStandalone.some(c => c.id === 'geralt-vagabundo'), 'Gonzo has Geralt as standalone character');

    const elenaStandalone = campaignStore.getMyStandaloneCharacters('user-elena');
    assert.equal(elenaStandalone.length, 0, 'Elena initially has no standalone characters');
  });

  console.log('✓ All Character Ownership & Access Protection tests passed successfully!');
});
