import assert from 'node:assert';
import { getAverageHitDieHp, calculateLevelUpHpGain, recalculateCharacter } from '../src/scripts/dnd/calculations.ts';
import { characterStore } from '../src/scripts/state/characterStore.ts';
import { defaultCharacter } from '../src/scripts/data/defaultCharacter.ts';

console.log('Running Level Up & Hit Points (HP) Consistency Tests...');

// 1. D&D 5e rule calculation tests for Hit Die and Level Up HP Gain
assert.strictEqual(getAverageHitDieHp('d6'), 4, 'd6 average HP should be 4 (Wizard, Sorcerer)');
assert.strictEqual(getAverageHitDieHp('d8'), 5, 'd8 average HP should be 5 (Rogue, Cleric, Druid, Monk, Bard, Warlock)');
assert.strictEqual(getAverageHitDieHp('d10'), 6, 'd10 average HP should be 6 (Fighter, Paladin, Ranger)');
assert.strictEqual(getAverageHitDieHp('d12'), 7, 'd12 average HP should be 7 (Barbarian)');

// CON modifier +2 with d10 (Ranger): 6 + 2 = 8 HP per level
assert.strictEqual(calculateLevelUpHpGain('d10', 2, 1), 8, 'd10 with +2 CON should give +8 HP for 1 level');
assert.strictEqual(calculateLevelUpHpGain('d10', 2, 2), 16, 'd10 with +2 CON should give +16 HP for 2 levels');

// Low CON modifier safeguard (minimum 1 HP per level even with negative CON)
assert.strictEqual(calculateLevelUpHpGain('d6', -4, 1), 1, 'Negative CON mod should never reduce HP gain below 1');
console.log('✓ D&D 5e average Hit Die & HP gain calculations verified.');

// 2. Character at FULL HEALTH leveling up via characterStore.updateLevel
// Initialize store with fresh default character
characterStore.updateFullCharacter(JSON.parse(JSON.stringify(defaultCharacter)));
const charInitial = characterStore.get();

// Heal to full health: 48 / 48 PG
characterStore.setHp(48, 48, 0);
assert.strictEqual(characterStore.get().hp.current, 48);
assert.strictEqual(characterStore.get().hp.max, 48);

// Level up from 5 to 6 (d10 + CON 14 (+2) => +8 max HP)
characterStore.updateLevel(6);
const charLvl6 = characterStore.get();

assert.strictEqual(charLvl6.level, 6, 'Level should be 6');
assert.strictEqual(charLvl6.hp.max, 56, 'Max HP should increase from 48 to 56 (+8)');
assert.strictEqual(charLvl6.hp.current, 56, 'Current HP MUST remain full at 56/56, not stay at 48!');
assert.strictEqual(charLvl6.hitDice.total, 6, 'Hit dice total should scale to level 6');
assert.strictEqual(charLvl6.hitDice.remaining, 6, 'Full hit dice remaining should scale to 6');
console.log('✓ Character at full health stayed at full health (56/56) after leveling up!');

// 3. Character at PARTIAL HEALTH (wounded) leveling up
// Take 10 damage: 46 / 56 PG (damage taken = 10)
characterStore.modifyHp(-10);
assert.strictEqual(characterStore.get().hp.current, 46);
assert.strictEqual(characterStore.get().hp.max, 56);

// Level up from 6 to 7 (+8 max HP)
characterStore.updateLevel(7);
const charLvl7 = characterStore.get();

assert.strictEqual(charLvl7.level, 7);
assert.strictEqual(charLvl7.hp.max, 64, 'Max HP should increase to 64');
assert.strictEqual(charLvl7.hp.current, 54, 'Current HP should increase by +8 (from 46 to 54), maintaining 10 damage taken');
console.log('✓ Wounded character gained the same HP as max HP delta (46/56 -> 54/64), preserving damage taken.');

// 4. EditCharacterModal saving simulation (wasFullHp check)
// Simulate character with full HP (64 / 64)
characterStore.setHp(64, 64, 0);

// Simulate user editing character sheet directly: increasing max HP from 64 to 72
const charToEdit = JSON.parse(JSON.stringify(characterStore.get()));
const oldMaxHp = charToEdit.hp.max;
const wasFullHp = charToEdit.hp.current >= oldMaxHp;
const oldCurrent = charToEdit.hp.current;
const newMaxHp = 72;

charToEdit.hp.max = newMaxHp;
if (wasFullHp) {
  charToEdit.hp.current = newMaxHp;
} else if (newMaxHp > oldMaxHp) {
  charToEdit.hp.current = Math.min(newMaxHp, oldCurrent + (newMaxHp - oldMaxHp));
}

characterStore.updateFullCharacter(charToEdit);
const editedChar = characterStore.get();

assert.strictEqual(editedChar.hp.max, 72);
assert.strictEqual(editedChar.hp.current, 72, 'Full health must be preserved when manually editing max HP in character modal');
console.log('✓ Character modal edit simulation properly preserved full HP (72/72).');

console.log('All Level Up & HP Consistency Tests passed successfully! ✨');
