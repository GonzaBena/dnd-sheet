import assert from 'node:assert';
import { calculateModifier, calculateProficiencyBonus, recalculateCharacter } from '../src/scripts/dnd/calculations.ts';
import { defaultCharacter } from '../src/scripts/data/defaultCharacter.ts';

console.log('Running D&D 5e rule calculations tests...');

// 1. Modifiers
assert.strictEqual(calculateModifier(1), -5);
assert.strictEqual(calculateModifier(8), -1);
assert.strictEqual(calculateModifier(9), -1);
assert.strictEqual(calculateModifier(10), 0);
assert.strictEqual(calculateModifier(11), 0);
assert.strictEqual(calculateModifier(14), 2);
assert.strictEqual(calculateModifier(15), 2);
assert.strictEqual(calculateModifier(16), 3);
assert.strictEqual(calculateModifier(20), 5);
console.log('✓ Modifiers test passed.');

// 2. Proficiency Bonus
assert.strictEqual(calculateProficiencyBonus(1), 2);
assert.strictEqual(calculateProficiencyBonus(4), 2);
assert.strictEqual(calculateProficiencyBonus(5), 3);
assert.strictEqual(calculateProficiencyBonus(8), 3);
assert.strictEqual(calculateProficiencyBonus(9), 4);
assert.strictEqual(calculateProficiencyBonus(17), 6);
assert.strictEqual(calculateProficiencyBonus(20), 6);
console.log('✓ Proficiency bonus test passed.');

// 3. Recalculation test
const charCopy = JSON.parse(JSON.stringify(defaultCharacter));
charCopy.level = 9; // prof bonus becomes +4
charCopy.stats.dex.score = 18; // dex mod becomes +4
const updated = recalculateCharacter(charCopy);

assert.strictEqual(updated.proficiencyBonus, 4);
assert.strictEqual(updated.stats.dex.modifier, 4);
assert.strictEqual(updated.initiativeBonus, 4);

// Stealth has expertise (DEX mod + prof * 2): 4 + (4 * 2) = 12
const stealth = updated.skills.find(s => s.id === 'stealth');
assert.strictEqual(stealth?.value, 12);
console.log('✓ Character recalculation with expertise test passed.');

console.log('All automated calculation tests passed successfully!');
