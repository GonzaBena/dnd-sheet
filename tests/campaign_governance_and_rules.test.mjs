// tests/campaign_governance_and_rules.test.mjs
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

test('Campaign Governance & Rules Tests', async (t) => {
  userStore.setCurrentUser('user-me');

  await t.test('1. A campaign cannot have 2 characters of the same user', () => {
    // Gonzo (user-me) already has 'elysian-ventosombra' in 'barovia-strahd'
    const existing = campaignStore.getMyCharacterForCampaign('barovia-strahd', 'user-me');
    assert.ok(existing, 'Gonzo already has Elysian in Barovia');

    // Attempting to clone Geralt (standalone) to Barovia while logged in as Gonzo must fail
    assert.throws(() => {
      campaignStore.cloneCharacter('geralt-vagabundo', 'barovia-strahd', 'Geralt en Barovia');
    }, /El usuario ya tiene un personaje/, 'Cloning duplicate character for same user throws error');

    // Attempting to save a new character directly into Barovia with userId='user-me' must fail
    assert.throws(() => {
      campaignStore.saveCharacter({
        id: 'clon-ilegal-123',
        name: 'Clon Ilegal',
        campaignId: 'barovia-strahd',
        userId: 'user-me',
        level: 1,
        hp: { current: 10, max: 10, temp: 0 }
      });
    }, /Una campaña no permite múltiples personajes del mismo usuario/, 'saveCharacter duplicate check throws error');

    // But cloning to a campaign where Gonzo has NO character (e.g. avernus-descent) succeeds
    assert.equal(campaignStore.getMyCharacterForCampaign('avernus-descent', 'user-me'), undefined);
    const avernusChar = campaignStore.cloneCharacter('geralt-vagabundo', 'avernus-descent', 'Geralt en Averno');
    assert.ok(avernusChar, 'Successfully cloned to Avernus');
    assert.equal(avernusChar.campaignId, 'avernus-descent');
    assert.equal(avernusChar.userId, 'user-me');

    // Clean up test character
    campaignStore.deleteCharacter(avernusChar.id);
  });

  await t.test('2. A campaign can never exist without a DM and single user is DM', () => {
    userStore.setCurrentUser('user-me');
    // Create new campaign with no members specified
    const soloCamp = campaignStore.createCampaign({
      name: 'Torre Solitaria',
      description: 'Una torre misteriosa'
    });

    assert.equal(soloCamp.creatorId, 'user-me', 'Creator is user-me');
    assert.equal(soloCamp.dmId, 'user-me', 'Single user campaign has creator as DM');
    assert.equal(soloCamp.memberUserIds.length, 1, 'Only 1 member');
    assert.equal(soloCamp.memberUserIds[0], 'user-me');

    // Clean up solo campaign
    campaignStore.deleteCampaign(soloCamp.id, 'user-me');
  });

  await t.test('3. Member management: only creator or DM can remove a user, unlinking character to standalone', () => {
    // Create a multi-user test campaign
    userStore.setCurrentUser('user-me');
    const testCamp = campaignStore.createCampaign({
      name: 'Cruzada de Prueba',
      creatorId: 'user-me',
      dmId: 'user-me',
      memberUserIds: ['user-me', 'user-elena', 'user-marcos']
    });

    // Add a character for Elena in this test campaign
    campaignStore.saveCharacter({
      id: 'char-elena-test',
      name: 'Elena Exploradora',
      campaignId: testCamp.id,
      userId: 'user-elena',
      playerName: 'Elena V.',
      level: 3,
      hp: { current: 20, max: 20, temp: 0 }
    });

    assert.ok(campaignStore.getCharactersForCampaign(testCamp.id).some(c => c.id === 'char-elena-test'));

    // Elena (non-creator, non-DM) tries to remove Marcos -> must throw error
    assert.throws(() => {
      campaignStore.removeCampaignMember(testCamp.id, 'user-marcos', 'user-elena');
    }, /Solo el creador o el DM/, 'Non-creator and non-DM cannot remove members');

    // Gonzo (creator and DM) removes Elena
    const removed = campaignStore.removeCampaignMember(testCamp.id, 'user-elena', 'user-me');
    assert.equal(removed, true, 'Removal succeeded');

    const updatedCamp = campaignStore.getCampaign(testCamp.id);
    assert.equal(updatedCamp.memberUserIds.includes('user-elena'), false, 'Elena removed from members');

    // Verify Elena's character was turned into standalone independent character
    const elenaChar = campaignStore.getCharacter('char-elena-test');
    assert.ok(elenaChar, 'Character still exists');
    assert.equal(elenaChar.campaignId, null, 'Character was unlinked to standalone');
    assert.equal(elenaChar.name, 'Elena Exploradora', 'Character data preserved');

    // Clean up
    campaignStore.deleteCharacter('char-elena-test');
    campaignStore.deleteCampaign(testCamp.id, 'user-me');
  });

  await t.test('4. Voluntary departure: user leaves campaign, DM auto-reassigns if DM leaves', () => {
    userStore.setCurrentUser('user-me');
    const testCamp = campaignStore.createCampaign({
      name: 'Campamento Abandonado',
      creatorId: 'user-me',
      dmId: 'user-marcos', // Marcos is DM
      memberUserIds: ['user-me', 'user-marcos', 'user-elena']
    });

    // Marcos (the DM) leaves voluntarily
    campaignStore.leaveCampaign(testCamp.id, 'user-marcos');

    const campAfterMarcosLeft = campaignStore.getCampaign(testCamp.id);
    assert.equal(campAfterMarcosLeft.memberUserIds.includes('user-marcos'), false, 'Marcos left');
    // Since creator (user-me) is still present, creator is assigned as DM
    assert.equal(campAfterMarcosLeft.dmId, 'user-me', 'DM auto-reassigned to creator');

    // Elena leaves voluntarily, leaving only user-me
    campaignStore.leaveCampaign(testCamp.id, 'user-elena');
    const campSoleMember = campaignStore.getCampaign(testCamp.id);
    assert.equal(campSoleMember.memberUserIds.length, 1);
    assert.equal(campSoleMember.dmId, 'user-me', 'Sole member is DM');

    // Clean up
    campaignStore.deleteCampaign(testCamp.id, 'user-me');
  });

  await t.test('5. Campaign Deletion rules: creator deletion unlinks all characters, DM inherits deletion if creator leaves', () => {
    userStore.setCurrentUser('user-me');
    const governanceCamp = campaignStore.createCampaign({
      name: 'Tierras Lejanas',
      creatorId: 'user-me',
      dmId: 'user-marcos',
      memberUserIds: ['user-me', 'user-marcos', 'user-elena']
    });

    // Add characters for Elena and Marcos
    campaignStore.saveCharacter({
      id: 'char-elena-tierras',
      name: 'Elena de las Tierras',
      campaignId: governanceCamp.id,
      userId: 'user-elena',
      playerName: 'Elena V.',
      level: 4,
      hp: { current: 30, max: 30, temp: 0 }
    });
    campaignStore.saveCharacter({
      id: 'char-marcos-tierras',
      name: 'Marcos de las Tierras',
      campaignId: governanceCamp.id,
      userId: 'user-marcos',
      playerName: 'Marcos R.',
      level: 4,
      hp: { current: 40, max: 40, temp: 0 }
    });

    // Marcos (DM, but creator is still in the campaign) tries to delete campaign -> must fail!
    assert.throws(() => {
      campaignStore.deleteCampaign(governanceCamp.id, 'user-marcos');
    }, /No tienes permisos/, 'DM cannot delete campaign while creator is still a member');

    // Case B: Creator leaves the campaign!
    campaignStore.leaveCampaign(governanceCamp.id, 'user-me');
    const campWithoutCreator = campaignStore.getCampaign(governanceCamp.id);
    assert.equal(campWithoutCreator.memberUserIds.includes('user-me'), false, 'Creator has left');

    // Now Marcos (the DM) inherits the authority to delete/close the campaign!
    assert.equal(campaignStore.canUserDeleteCampaign(governanceCamp.id, 'user-marcos'), true, 'DM can delete after creator leaves');

    // Elena (non-DM) still cannot delete
    assert.equal(campaignStore.canUserDeleteCampaign(governanceCamp.id, 'user-elena'), false, 'Non-DM player cannot delete');

    // Marcos deletes the campaign
    campaignStore.deleteCampaign(governanceCamp.id, 'user-marcos');
    assert.equal(campaignStore.getCampaign(governanceCamp.id), undefined, 'Campaign was deleted');

    // Verify all characters became standalone independent characters without losing data
    const elenaStandalone = campaignStore.getCharacter('char-elena-tierras');
    const marcosStandalone = campaignStore.getCharacter('char-marcos-tierras');
    assert.ok(elenaStandalone, 'Elena character preserved');
    assert.equal(elenaStandalone.campaignId, null, 'Elena character is now standalone');
    assert.equal(elenaStandalone.hp.current, 30, 'HP intact');

    assert.ok(marcosStandalone, 'Marcos character preserved');
    assert.equal(marcosStandalone.campaignId, null, 'Marcos character is now standalone');
    assert.equal(marcosStandalone.hp.current, 40, 'HP intact');

    // Clean up test characters
    campaignStore.deleteCharacter('char-elena-tierras');
    campaignStore.deleteCharacter('char-marcos-tierras');
  });
});
