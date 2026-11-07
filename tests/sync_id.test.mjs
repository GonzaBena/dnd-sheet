import assert from 'node:assert';

function generateCharacterSyncId(name) {
  const base = (name || 'personaje')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'personaje';

  const rand = Math.random().toString(36).substring(2, 6);
  return `${base}-${rand}`;
}

console.log('Running Sync ID generation tests...');

const id1 = generateCharacterSyncId('Elysian Ventosombra');
console.log('Generated ID 1:', id1);
assert(id1.startsWith('elysian-ventosombra-'));
assert.strictEqual(id1.split('-').length, 3);

const id2 = generateCharacterSyncId('Elysian Ventosombra');
console.log('Generated ID 2:', id2);
// Two consecutive generations must be unique
assert.notStrictEqual(id1, id2, 'Two IDs for same name must have distinct random suffixes');

const idWithAccents = generateCharacterSyncId('Áragon el Montaráz!');
console.log('Generated ID with accents:', idWithAccents);
assert(idWithAccents.startsWith('aragon-el-montaraz-'));

const emptyId = generateCharacterSyncId('');
console.log('Generated empty fallback ID:', emptyId);
assert(emptyId.startsWith('personaje-'));

console.log('✓ All Sync ID generation tests passed successfully!');
