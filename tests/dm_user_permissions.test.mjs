import assert from 'node:assert';

console.log('Running DM User Assignment & Access Control Tests...');

// Mock User Store
const users = [
  { id: 'user-me', name: 'Gonzo (Tú)', email: 'gonzo@dnd.local' },
  { id: 'user-raven', name: 'Lord Raven', email: 'raven@barovia.local' },
  { id: 'user-elena', name: 'Elena V.', email: 'elena@dnd.local' },
  { id: 'user-marcos', name: 'Marcos R.', email: 'marcos@dnd.local' }
];

let currentUserId = 'user-me';

function getCurrentUser() {
  return users.find(u => u.id === currentUserId) || users[0];
}

function setCurrentUser(id) {
  if (users.some(u => u.id === id)) {
    currentUserId = id;
  }
}

// Mock Campaigns Store
const campaigns = [
  {
    id: 'barovia-strahd',
    name: 'Maldición de Strahd',
    dmId: 'user-raven',
    dmName: 'Lord Raven',
    memberUserIds: ['user-me', 'user-raven', 'user-elena']
  },
  {
    id: 'avernus-descent',
    name: 'Descenso al Averno',
    dmId: 'user-me',
    dmName: 'Gonzo (Tú)',
    memberUserIds: ['user-me', 'user-elena', 'user-marcos']
  }
];

function isCurrentUserDm(campaignId) {
  const camp = campaigns.find(c => c.id === campaignId);
  if (!camp) return false;
  return camp.dmId === getCurrentUser().id;
}

function setCampaignDm(campaignId, newDmUserId) {
  const camp = campaigns.find(c => c.id === campaignId);
  const user = users.find(u => u.id === newDmUserId);
  if (!camp || !user) return false;
  camp.dmId = newDmUserId;
  camp.dmName = user.name;
  if (!camp.memberUserIds.includes(newDmUserId)) {
    camp.memberUserIds.push(newDmUserId);
  }
  return true;
}

// TEST 1: Initial user is Gonzo (user-me)
assert.strictEqual(getCurrentUser().id, 'user-me');
assert.strictEqual(isCurrentUserDm('avernus-descent'), true, 'Gonzo must be DM of Avernus');
assert.strictEqual(isCurrentUserDm('barovia-strahd'), false, 'Gonzo must NOT be DM of Strahd');

// TEST 2: Switch to Lord Raven (user-raven)
setCurrentUser('user-raven');
assert.strictEqual(getCurrentUser().id, 'user-raven');
assert.strictEqual(isCurrentUserDm('barovia-strahd'), true, 'Lord Raven must be DM of Strahd');
assert.strictEqual(isCurrentUserDm('avernus-descent'), false, 'Lord Raven must NOT be DM of Avernus');

// TEST 3: Switch to Elena V. (player in both)
setCurrentUser('user-elena');
assert.strictEqual(getCurrentUser().id, 'user-elena');
assert.strictEqual(isCurrentUserDm('barovia-strahd'), false, 'Elena is player in Strahd, not DM');
assert.strictEqual(isCurrentUserDm('avernus-descent'), false, 'Elena is player in Avernus, not DM');

// TEST 4: Reassign Strahd DM to Elena V.
const reassignSuccess = setCampaignDm('barovia-strahd', 'user-elena');
assert.strictEqual(reassignSuccess, true);
assert.strictEqual(isCurrentUserDm('barovia-strahd'), true, 'Elena is now DM of Strahd');

// Verify former DM (Lord Raven) lost access
setCurrentUser('user-raven');
assert.strictEqual(isCurrentUserDm('barovia-strahd'), false, 'Lord Raven lost DM access after reassignment');

// TEST 5: Create a new user and assign as DM
const newUserId = 'user-camila';
users.push({ id: newUserId, name: 'Camila S.', email: 'camila@dnd.local' });
setCampaignDm('avernus-descent', newUserId);

setCurrentUser(newUserId);
assert.strictEqual(isCurrentUserDm('avernus-descent'), true, 'New user Camila is now DM of Avernus');

setCurrentUser('user-me');
assert.strictEqual(isCurrentUserDm('avernus-descent'), false, 'Gonzo lost DM access after Camila was assigned DM');

// TEST 6: Legacy campaign fallback & dmCount calculation
setCurrentUser('user-me');
const legacyCampaign = {
  id: 'legacy-camp',
  name: 'Campaña Antigua',
  dmName: 'Gonzo (Tú)',
  // dmId is intentionally missing to simulate old localStorage
};
campaigns.push(legacyCampaign);

function isDmWithFallback(c) {
  if (c.dmId) return c.dmId === getCurrentUser().id;
  if (c.dmName && c.dmName.includes('Tú') && getCurrentUser().id === 'user-me') return true;
  return false;
}

assert.strictEqual(isDmWithFallback(legacyCampaign), true, 'Fallback identifies Gonzo as DM of legacy campaign');

// Re-assign Avernus back to Gonzo to verify total dmCount
setCampaignDm('avernus-descent', 'user-me');
const gonzoDmCount = campaigns.filter(c => isDmWithFallback(c)).length;
assert.strictEqual(gonzoDmCount >= 1, true, `Gonzo must have at least 1 DM campaign, got ${gonzoDmCount}`);

console.log('✓ All DM User Assignment & Access Control tests passed successfully!');
