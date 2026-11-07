import assert from 'node:assert';
import { characterStore } from '../src/scripts/state/characterStore.ts';
import { journalStore } from '../src/scripts/state/journalStore.ts';

console.log('Running Spells & Cantrips Dynamic Modifiers & Notes Tests...');

// 1. Reset state
characterStore.resetToDefault();
journalStore.resetToDefault();

const char = characterStore.get();
assert.ok(char.spellcasting, 'Character should have spellcasting configuration');
assert.ok(char.spellcasting.spells.length >= 4, 'Character should have prepared spells');

// Check initial DC, Attack and Curar Heridas formula
// WIS = 15 (mod +2), Prof = 3 -> DC = 13, Atk = +5
assert.strictEqual(char.spellcasting.saveDc, 13);
assert.strictEqual(char.spellcasting.attackBonus, 5);

const curar = char.spellcasting.spells.find(s => s.name === 'Curar Heridas');
assert.ok(curar, 'Curar Heridas should exist');
assert.strictEqual(curar.damageFormula, '1d8 + 2', 'Curar Heridas should start with 1d8 + 2 (+2 WIS mod)');
console.log('✓ Initial spellcasting calculations verified (DC 13, Atk +5, Curar Heridas: 1d8 + 2).');

// 2. User request test: modify spellcasting stat (WIS 15 -> 16, mod +2 -> +3)
// Validate that damage formula, DC and attack bonus update automatically!
characterStore.updateStat('wis', 16);
const charAfterWis = characterStore.get();

assert.strictEqual(charAfterWis.spellcasting.saveDc, 14, 'Save DC should automatically update to 14 (8 + 3 + 3)');
assert.strictEqual(charAfterWis.spellcasting.attackBonus, 6, 'Attack bonus should automatically update to +6 (3 + 3)');

const updatedCurar = charAfterWis.spellcasting.spells.find(s => s.name === 'Curar Heridas');
assert.strictEqual(updatedCurar.damageFormula, '1d8 + 3', 'Curar Heridas damage formula must automatically update to 1d8 + 3 without manual editing!');
console.log('✓ Changing WIS from 15 to 16 automatically updated Curar Heridas formula from 1d8 + 2 to 1d8 + 3, DC to 14, and Attack to +6!');

// 3. Level up test: Level 5 -> Level 9 (Proficiency bonus +3 -> +4)
characterStore.updateLevel(9);
const charAfterLevel = characterStore.get();
assert.strictEqual(charAfterLevel.spellcasting.saveDc, 15, 'Save DC should scale to 15 (8 + 4 + 3)');
assert.strictEqual(charAfterLevel.spellcasting.attackBonus, 7, 'Attack bonus should scale to +7 (4 + 3)');
console.log('✓ Leveling up to Level 9 automatically scaled Spell Save DC to 15 and Attack Bonus to +7!');

// 4. Test adding a Cantrip (Truco Nivel 0) with damage and notes
characterStore.addSpell({
  name: 'Rayo de Fuego',
  level: 0,
  school: 'Evocación',
  castingTime: '1 acción',
  range: '120 ft',
  duration: 'Instantáneo',
  isAttack: true,
  damageDice: '1d10',
  damageType: 'Fuego',
  activationCondition: '1 acción en combate',
  notes: 'Lanza un rayo de fuego ardiente. Enciende objetos inflamables que no se estén portando.'
});

const charWithCantrip = characterStore.get();
const firebolt = charWithCantrip.spellcasting.spells.find(s => s.name === 'Rayo de Fuego');
assert.ok(firebolt, 'Cantrip should be added to spellcasting');
assert.strictEqual(firebolt.level, 0, 'Should be level 0 (Cantrip)');
assert.strictEqual(firebolt.damageDice, '1d10');
assert.strictEqual(firebolt.activationCondition, '1 acción en combate');
assert.ok(firebolt.notes.includes('fuego ardiente'));
console.log('✓ Cantrip (Truco Nivel 0) added with attack, damage dice, activation condition and notes.');

// 5. Test characterStore.updateSpell
characterStore.updateSpell(curar.id || curar.name, {
  damageBonusMod: 2,
  activationCondition: '1 acción al tocar objetivo',
  notes: 'Bendecido por la luz de Selûne. Añade +2 curación extra a aliados.'
});

const charAfterEdit = characterStore.get();
const editedCurar = charAfterEdit.spellcasting.spells.find(s => s.name === 'Curar Heridas');
assert.strictEqual(editedCurar.damageBonusMod, 2);
assert.strictEqual(editedCurar.damageFormula, '1d8 + 5', 'Formula should now be 1d8 + 5 (3 stat + 2 bonus)');
assert.strictEqual(editedCurar.activationCondition, '1 acción al tocar objetivo');
assert.ok(editedCurar.notes.includes('Selûne'));
console.log('✓ characterStore.updateSpell updated spell properties, damage bonus mod and notes successfully.');

// 6. Test characterStore.removeSpell
characterStore.removeSpell('Zancada Prodigiosa');
const charAfterRemove = characterStore.get();
assert.ok(!charAfterRemove.spellcasting.spells.some(s => s.name === 'Zancada Prodigiosa'), 'Spell should be cleanly removed');
console.log('✓ characterStore.removeSpell removed spell successfully.');

console.log('All spells and cantrips tests passed successfully!');
