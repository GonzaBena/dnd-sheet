import assert from 'node:assert';
import { characterStore } from '../src/scripts/state/characterStore.ts';
import { journalStore } from '../src/scripts/state/journalStore.ts';

console.log('Running Weapons Dynamic Modifiers & Item Notes Tests...');

// 1. Reset state
characterStore.resetToDefault();
journalStore.resetToDefault();

const char = characterStore.get();
assert.ok(char.actions.length >= 2, 'Default character should have at least 2 weapons/actions');

// 2. Validate initial dynamic calculation
// Elysian has DEX 16 (mod +3) and Level 5 (prof +3)
const longbow = char.actions.find(a => a.id === 'longbow');
assert.ok(longbow, 'Longbow should exist');
assert.strictEqual(longbow.bonus, '+7 al Impacto', 'Longbow bonus should be +7 (+3 prof + 3 dex + 1 magic)');
assert.strictEqual(longbow.damage, '1d8 + 3', 'Longbow damage should be 1d8 + 3 (3 dex mod)');
assert.ok(longbow.notes, 'Longbow should have special effect notes');
console.log('✓ Initial weapon dynamic formula calculation verified (+7 / 1d8 + 3).');

// 3. User request test: modify stat (DEX 16 -> 18) and confirm damage and attack update automatically
// No manual string changing required!
characterStore.updateStat('dex', 18);
const charAfterDex = characterStore.get();
const updatedLongbow = charAfterDex.actions.find(a => a.id === 'longbow');

assert.strictEqual(updatedLongbow.bonus, '+8 al Impacto', 'Longbow bonus should automatically update to +8 (+3 prof + 4 dex + 1 magic)');
assert.strictEqual(updatedLongbow.damage, '1d8 + 4', 'Longbow damage should automatically update to 1d8 + 4 (+4 dex mod)');
console.log('✓ Changing DEX from 16 to 18 automatically updated weapon damage from 1d8 + 3 to 1d8 + 4!');

// 4. Level up test: Level 5 -> Level 9 (Proficiency bonus +3 -> +4)
characterStore.updateLevel(9);
const charAfterLevel = characterStore.get();
const levelUpLongbow = charAfterLevel.actions.find(a => a.id === 'longbow');
assert.strictEqual(levelUpLongbow.bonus, '+9 al Impacto', 'Attack bonus should automatically scale to +9 (+4 prof + 4 dex + 1 magic)');
console.log('✓ Leveling up to Level 9 (Prof +4) automatically scaled attack bonus to +9!');

// 5. Test characterStore.updateAction
characterStore.updateAction('longbow', {
  name: 'Arco Largo del Fénix',
  damageBonusMod: 2,
  attackBonusMod: 2,
  notes: 'Dispara flechas envueltas en llamas sagradas. Daño crítico con 19-20.'
});

const charAfterEdit = characterStore.get();
const editedBow = charAfterEdit.actions.find(a => a.id === 'longbow');
assert.strictEqual(editedBow.name, 'Arco Largo del Fénix');
assert.strictEqual(editedBow.damageBonusMod, 2);
assert.strictEqual(editedBow.damage, '1d8 + 6', 'Damage should now be 1d8 + 6 (4 dex mod + 2 magic mod)');
assert.strictEqual(editedBow.notes, 'Dispara flechas envueltas en llamas sagradas. Daño crítico con 19-20.');
console.log('✓ characterStore.updateAction edited weapon properties, modifiers and notes.');

// 6. Test Manual Weapon preservation (isAuto = false)
characterStore.addAction({
  name: 'Artefacto Caótico',
  type: 'Mágico',
  bonus: '+11 Arcano',
  damage: '4d10 + 7 Caos',
  damageType: 'Fuerza',
  tags: ['Único'],
  isAuto: false
});

characterStore.updateStat('str', 16);
const charAfterManual = characterStore.get();
const manualAction = charAfterManual.actions.find(a => a.name === 'Artefacto Caótico');
assert.strictEqual(manualAction.bonus, '+11 Arcano', 'Manual weapon bonus must not be overwritten');
assert.strictEqual(manualAction.damage, '4d10 + 7 Caos', 'Manual weapon damage formula must not be overwritten');
console.log('✓ Manual action custom formula preserved intact.');

// 7. Test Inventory Items with Activation Conditions and Notes
const testItemId = characterStore.addInventoryItem({
  name: 'Anillo del Viento Veloz',
  category: 'treasure',
  quantity: 1,
  activationCondition: '1 vez por descanso largo (Acción adicional)',
  notes: 'Otorga el conjuro Zancada Prodigiosa sin gastar espacios de conjuro por 10 minutos.',
  description: 'Un aro de plata con grabados de plumas en relieve.'
});

const charWithItem = characterStore.get();
const savedItem = charWithItem.inventory.find(i => i.id === testItemId);
assert.ok(savedItem, 'Item should be added to inventory');
assert.strictEqual(savedItem.activationCondition, '1 vez por descanso largo (Acción adicional)');
assert.strictEqual(savedItem.notes, 'Otorga el conjuro Zancada Prodigiosa sin gastar espacios de conjuro por 10 minutos.');

// 8. Test characterStore.updateInventoryItem
characterStore.updateInventoryItem(testItemId, {
  activationCondition: '2 veces por descanso largo',
  quantity: 2
});

const charAfterItemEdit = characterStore.get();
const updatedItem = charAfterItemEdit.inventory.find(i => i.id === testItemId);
assert.strictEqual(updatedItem.quantity, 2);
assert.strictEqual(updatedItem.activationCondition, '2 veces por descanso largo');
console.log('✓ Inventory item activation conditions, notes and updates verified successfully.');

console.log('All weapons and notes tests passed successfully!');
