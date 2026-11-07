import assert from 'node:assert';
import { characterStore } from '../src/scripts/state/characterStore.ts';
import { journalStore } from '../src/scripts/state/journalStore.ts';

console.log('Running Inventory Removal & Multi-unit Tests...');

// Setup test state
characterStore.resetToDefault();
journalStore.resetToDefault();

const charInitial = characterStore.get();
assert.ok(charInitial.inventory.length > 0, 'Character should start with inventory items');

// 1. Test Partial Stack Removal (amount < total)
const multiItem = charInitial.inventory.find(i => i.quantity > 1);
assert.ok(multiItem, 'Character should have an item with quantity > 1 (e.g. Raciones)');
const initialQty = multiItem.quantity;
const removeCount = 1;

characterStore.removeInventoryItem(multiItem.id, removeCount);

const charAfterPartial = characterStore.get();
const updatedItem = charAfterPartial.inventory.find(i => i.id === multiItem.id);
assert.ok(updatedItem, 'Item should still exist in inventory after partial removal');
assert.strictEqual(updatedItem.quantity, initialQty - removeCount, `Quantity should decrease from ${initialQty} to ${initialQty - removeCount}`);
console.log(`✓ Partial quantity removal test passed (${initialQty} -> ${updatedItem.quantity}).`);

// 2. Test Full Stack Removal (amount >= total)
const itemToRemoveAll = charAfterPartial.inventory.find(i => i.id === multiItem.id);
const currentQty = itemToRemoveAll.quantity;

characterStore.removeInventoryItem(multiItem.id, currentQty);

const charAfterAll = characterStore.get();
const itemGone = charAfterAll.inventory.find(i => i.id === multiItem.id);
assert.strictEqual(itemGone, undefined, 'Item should be completely removed from inventory when total quantity is removed');
console.log('✓ Full stack removal test passed.');

// 3. Test Single Item Removal (quantity = 1, default behavior without param)
const newItemId = characterStore.addInventoryItem({
  name: 'Reliquia Antigua',
  category: 'treasure',
  quantity: 1,
  weightLb: 2,
  usableType: 'none',
  description: 'Un artefacto misterioso'
});

assert.ok(characterStore.get().inventory.some(i => i.id === newItemId));
characterStore.removeInventoryItem(newItemId);
assert.ok(!characterStore.get().inventory.some(i => i.id === newItemId), 'Single item should be removed cleanly');
console.log('✓ Single item removal test passed.');

// 4. Test Quick Slot Item cleanup when removed
const quickItemId = characterStore.addInventoryItem({
  name: 'Poción de Fuerza',
  category: 'potion',
  quantity: 1,
  weightLb: 0.5,
  usableType: 'drinkable',
  description: 'Aumenta la fuerza por 1 hora'
});

characterStore.setQuickSlotItem(quickItemId);
assert.strictEqual(characterStore.get().quickSlotItemId, quickItemId, 'Quick slot should be set to item id');

// Remove item completely
characterStore.removeInventoryItem(quickItemId);
assert.strictEqual(characterStore.get().quickSlotItemId, null, 'Quick slot must be reset to null when item is removed');
console.log('✓ Quick slot cleanup upon item removal test passed.');

// 5. Test Journal Logging for removal
const journalEntries = journalStore.getEntries();
const removalLog = journalEntries.find(e => e.title.includes('retirado') || e.title.includes('descartados'));
assert.ok(removalLog, 'Journal should contain an entry logging the item removal');
console.log('✓ Journal audit logging test passed.');

console.log('All inventory tests passed successfully!');
