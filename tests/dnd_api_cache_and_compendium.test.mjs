import test from 'node:test';
import assert from 'node:assert';
import { defaultCharacter } from '../src/scripts/data/defaultCharacter.ts';
import { recalculateCharacter } from '../src/scripts/dnd/calculations.ts';
import {
  translateSchool,
  translateDamageType,
  translateProperty,
  WEAPON_MASTERIES_ES,
  matchesQuery,
  getSpellSpanishName,
  getEquipmentSpanishName
} from '../src/scripts/dnd/dndTranslations.ts';
import { srdCacheManager } from '../src/scripts/api/srdCacheManager.ts';
import { dndApiService } from '../src/scripts/api/dndApiService.ts';
import { characterStore } from '../src/scripts/state/characterStore.ts';

test('D&D 5e API, SRD Cache, 2024 vs 2014 and Compendium Integration Tests', async (t) => {

  await t.test('1. Character rulesEdition default and persistence', () => {
    assert.strictEqual(defaultCharacter.rulesEdition, '2024');

    const charCopy = JSON.parse(JSON.stringify(defaultCharacter));
    delete charCopy.rulesEdition;

    const recalculated = recalculateCharacter(charCopy);
    assert.strictEqual(recalculated.rulesEdition, '2024', 'recalculateCharacter should default rulesEdition to 2024');

    recalculated.rulesEdition = '2014';
    const recalc2014 = recalculateCharacter(recalculated);
    assert.strictEqual(recalc2014.rulesEdition, '2014', 'Custom edition 2014 should be preserved');
  });

  await t.test('2. Spanish translations and bilingual search matcher', () => {
    assert.strictEqual(translateSchool('evocation'), 'Evocación');
    assert.strictEqual(translateSchool('Abjuracion'), 'Abjuración');
    assert.strictEqual(translateDamageType('piercing'), 'Perforante');
    assert.strictEqual(translateDamageType('fire'), 'Fuego');
    assert.strictEqual(translateDamageType('slashing'), 'Cortante');
    assert.strictEqual(translateProperty('finesse'), 'Sutil');
    assert.strictEqual(translateProperty('two-handed'), 'A dos manos');

    // 2024 Weapon Masteries
    assert.ok(WEAPON_MASTERIES_ES.nick);
    assert.strictEqual(WEAPON_MASTERIES_ES.nick.name, 'Nick');
    assert.ok(WEAPON_MASTERIES_ES.cleave);
    assert.ok(WEAPON_MASTERIES_ES.topple);

    // Common names
    assert.strictEqual(getSpellSpanishName('fireball', 'Fireball'), 'Bola de Fuego');
    assert.strictEqual(getEquipmentSpanishName('dagger', 'Dagger'), 'Daga');

    // Bilingual matching
    assert.strictEqual(matchesQuery(['Fireball', 'Bola de Fuego', 'Evocation', 'A bright streak flashes'], 'fuego'), true);
    assert.strictEqual(matchesQuery(['Fireball', 'Bola de Fuego', 'Evocation', 'A bright streak flashes'], 'fireball'), true);
    assert.strictEqual(matchesQuery(['Dagger', 'Daga', 'Simple Weapons'], 'daga'), true);
    assert.strictEqual(matchesQuery(['Dagger', 'Daga', 'Simple Weapons'], 'dagger'), true);
    assert.strictEqual(matchesQuery(['Dagger', 'Daga', 'Simple Weapons'], 'espada'), false);
  });

  await t.test('3. SRD Cache Manager loads both 2024 and 2014 JSON datasets', async () => {
    // 2024 Spells
    const spells2024 = await srdCacheManager.getCategory('2024', 'spells');
    assert.ok(Array.isArray(spells2024) && spells2024.length > 300, '2024 should have over 300 spells');
    assert.strictEqual(spells2024.length, 339, '2024 official SRD has 339 spells');

    // 2014 Spells
    const spells2014 = await srdCacheManager.getCategory('2014', 'spells');
    assert.ok(Array.isArray(spells2014) && spells2014.length > 300, '2014 should have over 300 spells');
    assert.strictEqual(spells2014.length, 319, '2014 official SRD has 319 spells');

    // 2024 Feats (17 in 2024 revision vs 1 in 2014)
    const feats2024 = await srdCacheManager.getCategory('2024', 'feats');
    assert.strictEqual(feats2024.length, 17, '2024 SRD includes 17 feats');

    const feats2014 = await srdCacheManager.getCategory('2014', 'feats');
    assert.strictEqual(feats2014.length, 1, '2014 SRD includes 1 feat (Grappler)');

    // Species (2024) vs Races (2014)
    const species2024 = await srdCacheManager.getCategory('2024', 'species');
    assert.strictEqual(species2024.length, 9, '2024 has 9 species');

    const races2014 = await srdCacheManager.getCategory('2014', 'races');
    assert.strictEqual(races2014.length, 9, '2014 has 9 races');

    // Equipment & Magic Items
    const eq2024 = await srdCacheManager.getCategory('2024', 'equipment');
    assert.ok(eq2024.length > 150, '2024 equipment loaded');

    const mi2024 = await srdCacheManager.getCategory('2024', 'magic-items');
    assert.ok(mi2024.length > 200, '2024 magic items loaded');
  });

  await t.test('4. DndApiService normalizes schema differences between 2024 and 2014', async () => {
    // Spell normalization
    const acidArrow2024List = await dndApiService.searchSpells('2024', { query: 'Acid Arrow' });
    assert.ok(acidArrow2024List.length > 0);
    const acidArrow2024 = acidArrow2024List[0];

    assert.strictEqual(acidArrow2024.name, 'Acid Arrow');
    assert.strictEqual(acidArrow2024.nameEs, 'Flecha Ácida');
    assert.strictEqual(acidArrow2024.level, 2);
    assert.strictEqual(acidArrow2024.schoolEs, 'Evocación');
    assert.strictEqual(acidArrow2024.damageDice, '4d4');
    assert.strictEqual(acidArrow2024.damageTypeEs, 'Ácido');
    assert.strictEqual(typeof acidArrow2024.description, 'string');
    assert.ok(acidArrow2024.description.length > 20);

    // Spell normalization for 2014 (desc array of strings in raw data)
    const acidArrow2014List = await dndApiService.searchSpells('2014', { query: 'Acid Arrow' });
    assert.ok(acidArrow2014List.length > 0);
    const acidArrow2014 = acidArrow2014List[0];
    assert.strictEqual(acidArrow2014.edition, '2014');
    assert.strictEqual(typeof acidArrow2014.description, 'string', '2014 desc array must be normalized to string');
    assert.strictEqual(acidArrow2014.damageDice, '4d4');

    // Weapon normalization with 2024 Weapon Mastery
    const daggers2024 = await dndApiService.searchEquipment('2024', { query: 'Dagger' });
    assert.ok(daggers2024.length > 0);
    const dagger2024 = daggers2024[0];
    assert.strictEqual(dagger2024.category, 'weapon');
    assert.strictEqual(dagger2024.damageDice, '1d4');
    assert.strictEqual(dagger2024.damageTypeEs, 'Perforante');
    assert.strictEqual(dagger2024.mastery, 'Nick', '2024 Dagger has Nick weapon mastery');
    assert.ok(dagger2024.masteryDesc, '2024 Dagger has mastery description');

    // 2014 Dagger has no mastery
    const daggers2014 = await dndApiService.searchEquipment('2014', { query: 'Dagger' });
    assert.ok(daggers2014.length > 0);
    const dagger2014 = daggers2014[0];
    assert.strictEqual(dagger2014.mastery, undefined, '2014 Dagger has no mastery');
  });

  await t.test('5. Filtering and Compendium search', async () => {
    // Filter spells by level
    const cantrips = await dndApiService.searchSpells('2024', { level: 0 });
    assert.ok(cantrips.length > 0);
    assert.ok(cantrips.every(sp => sp.level === 0), 'All results must be cantrips (level 0)');

    const level3Spells = await dndApiService.searchSpells('2024', { level: 3 });
    assert.ok(level3Spells.every(sp => sp.level === 3), 'All results must be level 3');

    // Filter spells by school
    const evocationSpells = await dndApiService.searchSpells('2024', { school: 'Evocación' });
    assert.ok(evocationSpells.length > 0);
    assert.ok(evocationSpells.every(sp => sp.schoolEs === 'Evocación'));

    // Filter equipment by category
    const weapons = await dndApiService.searchEquipment('2024', { category: 'weapon' });
    assert.ok(weapons.length > 20);
    assert.ok(weapons.every(w => w.category === 'weapon'));
  });

  await t.test('6. Payload generation and Character Store integration', () => {
    const rawSpell = {
      index: 'fireball',
      name: 'Fireball',
      nameEs: 'Bola de Fuego',
      level: 3,
      school: 'Evocation',
      schoolEs: 'Evocación',
      castingTime: '1 action',
      castingTimeEs: '1 acción',
      range: '150 feet',
      duration: 'Instantaneous',
      concentration: false,
      ritual: false,
      components: 'V, S, M',
      description: 'A bright streak flashes from your pointing finger...',
      damageDice: '8d6',
      damageType: 'fire',
      damageTypeEs: 'Fuego',
      isAttack: false,
      isSave: true,
      saveAbility: 'dex',
      classes: ['wizard', 'sorcerer'],
      edition: '2024'
    };

    const spellPayload = dndApiService.toSpellPayload(rawSpell);
    assert.strictEqual(spellPayload.name, 'Bola de Fuego (Fireball)');
    assert.strictEqual(spellPayload.level, 3);
    assert.strictEqual(spellPayload.school, 'Evocación');
    assert.strictEqual(spellPayload.damageDice, '8d6');
    assert.strictEqual(spellPayload.damageType, 'Fuego');
    assert.strictEqual(spellPayload.isSave, true);
    assert.strictEqual(spellPayload.saveAbility, 'dex');

    // Add to characterStore
    const initialSpellCount = characterStore.get().spellcasting.spells.length;
    characterStore.addSpell(spellPayload);
    const updatedSpells = characterStore.get().spellcasting.spells;
    assert.strictEqual(updatedSpells.length, initialSpellCount + 1);
    const addedSpell = updatedSpells[updatedSpells.length - 1];
    assert.strictEqual(addedSpell.name, 'Bola de Fuego (Fireball)');
    assert.strictEqual(addedSpell.level, 3);

    // Clean up
    if (addedSpell.id) {
      characterStore.removeSpell(addedSpell.id);
    }

    // Weapon Action payload
    const rawWeapon = {
      index: 'scimitar',
      name: 'Scimitar',
      nameEs: 'Cimitarra',
      category: 'weapon',
      attackType: 'Cuerpo a cuerpo',
      damageDice: '1d6',
      damageType: 'slashing',
      damageTypeEs: 'Cortante',
      properties: ['Sutil', 'Ligera'],
      mastery: 'Nick',
      masteryDesc: 'Ataque extra en la acción de ataque.',
      description: 'A curved sword.',
      usableType: 'none',
      edition: '2024'
    };

    const attackPayload = dndApiService.toAttackPayload(rawWeapon);
    assert.strictEqual(attackPayload.name, 'Cimitarra (Scimitar)');
    assert.strictEqual(attackPayload.type, 'Cuerpo a cuerpo');
    assert.strictEqual(attackPayload.damageDice, '1d6');
    assert.strictEqual(attackPayload.damageType, 'Cortante');
    assert.strictEqual(attackPayload.mastery, 'Nick');
    assert.ok(attackPayload.tags?.includes('Maestría: Nick'));

    const initialActionCount = characterStore.get().actions.length;
    characterStore.addAction(attackPayload);
    const updatedActions = characterStore.get().actions;
    assert.strictEqual(updatedActions.length, initialActionCount + 1);
    const addedAction = updatedActions[updatedActions.length - 1];
    assert.strictEqual(addedAction.name, 'Cimitarra (Scimitar)');
    assert.strictEqual(addedAction.mastery, 'Nick');

    // Clean up
    characterStore.removeAction(addedAction.id);
  });

  await t.test('7. Contextual category scoping: Spells scope never includes potions or equipment', async () => {
    // 1. Spells dataset should only contain spells, never equipment or potions
    const spells = await dndApiService.searchSpells('2024');
    const hasPotionInSpells = spells.some(s => s.name.toLowerCase().includes('potion') || s.name.toLowerCase().includes('pocion'));
    assert.strictEqual(hasPotionInSpells, false, 'Spells category must not contain potions');

    // 2. Equipment dataset has potions and gear, but no spells
    const equipment = await dndApiService.searchEquipment('2024');
    const hasSpellsInEquipment = equipment.some(e => e.name.toLowerCase() === 'fireball' || e.name.toLowerCase() === 'acid arrow');
    assert.strictEqual(hasSpellsInEquipment, false, 'Equipment category must not contain spells');

    // 3. Searching for "potion" in spells returns zero results
    const potionInSpellsSearch = await dndApiService.searchSpells('2024', { query: 'potion of healing' });
    assert.strictEqual(potionInSpellsSearch.length, 0, 'Searching for potions in spells compendium must return 0 items');

    // 4. Searching for "potion" in equipment returns potions
    const potionInEquipmentSearch = await dndApiService.searchEquipment('2024', { query: 'potion of healing' });
    assert.ok(potionInEquipmentSearch.length > 0, 'Searching for potions in equipment returns matching potion');
  });

  await t.test('8. Full Spanish equipment & magic item translations, subtype filters, and consumable rules', async () => {
    // 1. All SRD 2024 equipment items have a Spanish translation (nameEs)
    const allEq2024 = await dndApiService.searchEquipment('2024');
    const untranslatedEq = allEq2024.filter(e => e.nameEs === e.name);
    assert.strictEqual(untranslatedEq.length, 0, `Todos los objetos de equipo 2024 deben estar traducidos, faltan: ${untranslatedEq.map(u => u.index).join(', ')}`);

    // 2. Search for "Botiquín de curandero" (healers-kit) in Spanish
    const healersSearch = await dndApiService.searchEquipment('2024', { query: 'Botiquín de curandero' });
    assert.ok(healersSearch.length > 0, 'Debe encontrar el Botiquín de curandero buscando en español');
    const hk = healersSearch.find(i => i.index === 'healers-kit');
    assert.ok(hk, 'healers-kit presente');
    assert.strictEqual(hk.usableType, 'usable');
    assert.strictEqual(hk.subCategory, 'consumable');
    assert.ok(hk.activationCondition && hk.activationCondition.includes('10 usos'));

    // 3. gear-and-potion category includes both gear and potions
    const gearAndPotions = await dndApiService.searchEquipment('2024', { category: 'gear-and-potion' });
    assert.ok(gearAndPotions.some(i => i.category === 'potion'), 'gear-and-potion incluye pociones');
    assert.ok(gearAndPotions.some(i => i.category === 'gear'), 'gear-and-potion incluye equipo general');
    assert.strictEqual(gearAndPotions.some(i => i.category === 'weapon' || i.category === 'armor'), false);

    // 4. Subcategory filtering works (consumable, tools, packs)
    const consumables = await dndApiService.searchEquipment('2024', { category: 'gear-and-potion', subCategory: 'consumable' });
    assert.ok(consumables.some(i => i.index === 'potion-of-healing'));
    assert.ok(consumables.some(i => i.index === 'healers-kit'));

    // 5. Magic items are translated to Spanish and distinguish consumables from passive wearables
    const bagSearch = await dndApiService.searchMagicItems('2024', 'Bolsa de contención');
    assert.ok(bagSearch.length > 0, 'Encuentra Bolsa de contención (Bag of Holding) en español');

    const ringList = await dndApiService.searchMagicItems('2024', 'Anillo de protección');
    assert.ok(ringList.length > 0, 'Encuentra Anillo de protección en español');
    const ringPayload = dndApiService.toInventoryPayload(ringList[0]);
    assert.strictEqual(ringPayload.usableType, 'none', 'Anillo de protección no es consumible de un uso');
    assert.strictEqual(ringPayload.requiresAttunement, true);

    const healPotionList = await dndApiService.searchMagicItems('2024', 'Poción de curación');
    const healPotion = healPotionList.find(i => i.index === 'potions-of-healing');
    assert.ok(healPotion);
    const healPotionPayload = dndApiService.toInventoryPayload(healPotion);
    assert.strictEqual(healPotionPayload.category, 'potion');
    assert.strictEqual(healPotionPayload.usableType, 'drinkable');
    assert.strictEqual(healPotionPayload.healAmount, 7);
  });
});
