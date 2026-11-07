import assert from 'node:assert';

console.log('Running Campaigns & Character Cloning Tests...');

// Mock data structures mirroring campaignStore logic
const campaigns = [
  {
    id: 'barovia-strahd',
    name: 'Maldición de Strahd',
    dmName: 'Lord Raven',
    isCurrentUserDm: false,
    characterIds: ['char-1', 'char-2']
  },
  {
    id: 'avernus-descent',
    name: 'Descenso al Averno',
    dmName: 'Tú (DM)',
    isCurrentUserDm: true,
    characterIds: ['char-3']
  }
];

const characters = [
  {
    id: 'char-1',
    campaignId: 'barovia-strahd',
    name: 'Elysian Ventosombra',
    level: 5,
    hp: { current: 42, max: 48, temp: 5 },
    inventory: [{ id: 'item-1', name: 'Poción de Curación', quantity: 2 }]
  },
  {
    id: 'char-2',
    campaignId: 'barovia-strahd',
    name: 'Morgana Espinaoscura',
    level: 5,
    hp: { current: 32, max: 32, temp: 0 },
    inventory: []
  },
  {
    id: 'char-3',
    campaignId: 'avernus-descent',
    name: 'Kaeroc Cuernonegro',
    level: 7,
    hp: { current: 45, max: 58, temp: 8 },
    inventory: []
  },
  {
    id: 'char-standalone',
    campaignId: null,
    name: 'Geralt el Errante',
    level: 6,
    hp: { current: 54, max: 54, temp: 0 },
    inventory: []
  }
];

function cloneCharacter(originalChar, targetCampaignId, newName) {
  const cloned = JSON.parse(JSON.stringify(originalChar));
  const baseSlug = (newName || originalChar.name || 'personaje')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const rand = Math.random().toString(36).substring(2, 8);
  
  cloned.id = `${baseSlug}-${rand}`;
  cloned.campaignId = targetCampaignId;
  if (newName) cloned.name = newName;
  cloned.playerName = 'Tú (Copia)';
  return cloned;
}

// TEST 1: Retrieve characters by campaign
const baroviaChars = characters.filter(c => c.campaignId === 'barovia-strahd');
assert.strictEqual(baroviaChars.length, 2, 'Barovia should have 2 characters initially');
assert.strictEqual(baroviaChars[0].name, 'Elysian Ventosombra');

// TEST 2: Retrieve standalone characters
const standalone = characters.filter(c => !c.campaignId);
assert.strictEqual(standalone.length, 1, 'Should have 1 standalone character');
assert.strictEqual(standalone[0].id, 'char-standalone');

// TEST 3: Clone character to another campaign
const original = characters[0];
const cloneToAvernus = cloneCharacter(original, 'avernus-descent', 'Elysian en el Infierno');

assert.notStrictEqual(cloneToAvernus.id, original.id, 'Cloned character MUST have a new independent ID');
assert.strictEqual(cloneToAvernus.campaignId, 'avernus-descent', 'Target campaign must be avernus-descent');
assert.strictEqual(cloneToAvernus.name, 'Elysian en el Infierno');
assert.strictEqual(cloneToAvernus.level, 5);

// TEST 4: Independence verification (modifying clone must NOT alter original)
cloneToAvernus.hp.current = 10;
cloneToAvernus.level = 6;
cloneToAvernus.inventory.push({ id: 'item-new', name: 'Espada Llameante', quantity: 1 });

assert.strictEqual(original.hp.current, 42, 'Original HP must remain 42');
assert.strictEqual(original.level, 5, 'Original Level must remain 5');
assert.strictEqual(original.inventory.length, 1, 'Original Inventory must not receive cloned items');

// TEST 5: Clone to standalone (null campaign)
const cloneToStandalone = cloneCharacter(original, null, 'Elysian Vagabundo');
assert.strictEqual(cloneToStandalone.campaignId, null, 'Must be standalone with null campaignId');
assert.notStrictEqual(cloneToStandalone.id, original.id);

// TEST 6: DM Verification
const isUserDmInBarovia = !!campaigns.find(c => c.id === 'barovia-strahd')?.isCurrentUserDm;
const isUserDmInAvernus = !!campaigns.find(c => c.id === 'avernus-descent')?.isCurrentUserDm;

assert.strictEqual(isUserDmInBarovia, false, 'User is player in Barovia');
assert.strictEqual(isUserDmInAvernus, true, 'User is DM in Avernus');

console.log('✓ All Campaigns & Cloning tests passed successfully!');
