import assert from 'node:assert';
import { characterStore } from '../src/scripts/state/characterStore.ts';
import { journalStore } from '../src/scripts/state/journalStore.ts';

console.log('Running Feats / Traits Top-Ordering Tests...');

// 1. Reset state
characterStore.resetToDefault();
journalStore.resetToDefault();

const charBefore = characterStore.get();
const initialCount = charBefore.features.length;
assert.ok(initialCount > 0, 'Character should start with default features');
const oldFirstFeatId = charBefore.features[0].id;

// 2. Add a new feature using addFeature (programmatic store)
const newId = characterStore.addFeature({
  title: 'Iniciativa de Alerta',
  description: 'Ganas un bonificador de +5 a las tiradas de iniciativa.',
  uses: 'Pasivo',
  enabled: true
});

const charAfter = characterStore.get();
assert.strictEqual(charAfter.features.length, initialCount + 1, 'Feature count should increase by 1');
assert.strictEqual(charAfter.features[0].id, newId, 'Newly added feature must be the FIRST element (at the top)');
assert.strictEqual(charAfter.features[0].title, 'Iniciativa de Alerta', 'Top feature title matches');
assert.strictEqual(charAfter.features[1].id, oldFirstFeatId, 'Previous first feature is now at index 1');
console.log('✓ Store addFeature prepends new feat to the top of the list.');

// 3. Test modal array unshift behavior
// Simulate user opening modal, clicking "Añadir Nuevo Rasgo" (which does unshift), and saving
const tempFeatures = (charAfter.features || []).map(f => ({ ...f }));
const modalNewFeat = {
  id: `feat-test-top`,
  title: 'Dote Reciente Superior',
  description: 'Debe aparecer inmediatamente arriba de toda la lista sin hacer scroll.',
  uses: '1 / descanso corto',
  enabled: true
};
tempFeatures.unshift(modalNewFeat);

characterStore.updateFeatures(tempFeatures);
const charAfterModal = characterStore.get();
assert.strictEqual(charAfterModal.features[0].title, 'Dote Reciente Superior', 'Saved feature from modal appears at index 0 (top)');
console.log('✓ Modal unshift behavior correctly places new feat at the top of features.');

console.log('All feats / traits ordering tests passed successfully! 🎉');
