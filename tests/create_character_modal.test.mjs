// tests/create_character_modal.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const modalPath = path.resolve(process.cwd(), 'src/components/campaigns/CreateCharacterModal.astro');
const quickModalPath = path.resolve(process.cwd(), 'src/components/campaigns/QuickCreatorModal.astro');
const manualModalPath = path.resolve(process.cwd(), 'src/components/campaigns/ManualCreatorModal.astro');
const premadeModalPath = path.resolve(process.cwd(), 'src/components/campaigns/PremadeCharactersModal.astro');
const indexPath = path.resolve(process.cwd(), 'src/pages/index.astro');

const { CHARACTER_CLASSES } = await import('../src/scripts/dnd/classes.ts');
const { PREMADE_CHARACTERS, buildCharacterFromPremade } = await import('../src/scripts/data/premadeCharacters.ts');
const {
  QUICK_RACES,
  QUICK_CLASSES,
  QUICK_BACKGROUNDS,
  computeQuickStats,
  buildCharacterFromQuickCreator,
} = await import('../src/scripts/data/quickCreatorData.ts');
const {
  POINT_BUY_TOTAL,
  BACKPACK_STARTER_OPTIONS,
  CLASS_STARTER_KITS,
  calculatePointBuySpent,
  assignStandardArrayForClass,
  roll4d6DropLowest,
  applyOriginBonuses,
  buildCharacterFromManualCreator,
} = await import('../src/scripts/data/manualCreatorData.ts');

test('CreateCharacterModal, QuickCreatorModal, ManualCreatorModal & PremadeCharactersModal Tests', async (t) => {
  await t.test('1. CreateCharacterModal.astro exists and uses native <dialog closedby="any">', () => {
    assert.ok(fs.existsSync(modalPath), 'CreateCharacterModal.astro should exist');
    const content = fs.readFileSync(modalPath, 'utf-8');

    assert.match(content, /<dialog[\s\S]*?id="create-character-modal"/, 'Should use native <dialog> element');
    assert.match(content, /closedby="any"/, 'Should use closedby="any" for light-dismiss');
    assert.match(content, /aria-labelledby="create-character-modal-title"/, 'Should have aria-labelledby');
    assert.ok(!content.includes('role="dialog"'), 'Native <dialog> must not have redundant role="dialog"');
    assert.ok(!content.includes('aria-modal='), 'Native <dialog> must not have redundant aria-modal');
    assert.match(content, /showModal\(\)/, 'Should open modal via showModal()');
    assert.match(content, /closedBy.*in HTMLDialogElement\.prototype/, 'Should include closedby fallback');
  });

  await t.test('2. Contains 3 vertical <article> cards (Creador rápido, Creación manual, Prehechos) with preset images and CTAs', () => {
    const content = fs.readFileSync(modalPath, 'utf-8');

    const articleMatches = content.match(/<article\b[\s\S]*?<\/article>/g) || [];
    assert.equal(articleMatches.length, 3, 'Should contain exactly 3 <article> cards');

    for (const article of articleMatches) {
      assert.match(article, /aspect-\[3\/4\]/, 'Each card image should have vertical 3/4 aspect ratio');
      assert.match(article, /\/characters\/(thumbs\/)?ch-[1-5]\.avif/, 'Each card should use a loaded character image');
      assert.match(article, /<h4\b/, 'Each card should have a title heading');
      assert.match(article, /<footer\b[\s\S]*?<button\b[\s\S]*?data-creation-mode=/, 'Each card should have a footer CTA button');
    }

    assert.ok(content.includes('Creador rápido'), 'Should include "Creador rápido" title');
    assert.ok(content.includes('Creación manual'), 'Should include "Creación manual" title');
    assert.ok(content.includes('Prehechos'), 'Should include "Prehechos" title');

    assert.ok(content.includes('data-creation-mode="quick"'), 'Should have quick mode CTA');
    assert.ok(content.includes('open-quick-creator-modal'), 'Clicking quick mode should open QuickCreatorModal');
    assert.ok(content.includes('data-creation-mode="manual"'), 'Should have manual mode CTA');
    assert.ok(content.includes('open-manual-creator-modal'), 'Clicking manual mode should open ManualCreatorModal');
    assert.ok(content.includes('data-creation-mode="premade"'), 'Should have premade mode CTA');
    assert.ok(content.includes('open-premade-characters-modal'), 'Clicking premade should open PremadeCharactersModal');
  });

  await t.test('3. PREMADE_CHARACTERS includes 1 character per each of the 12 D&D classes with class icon SVG', () => {
    assert.equal(PREMADE_CHARACTERS.length, CHARACTER_CLASSES.length, 'Should have 1 premade character per class');
    const coveredClasses = new Set(PREMADE_CHARACTERS.map((c) => c.className));
    for (const cls of CHARACTER_CLASSES) {
      assert.ok(coveredClasses.has(cls), `Missing premade character for class: ${cls}`);
    }

    for (const premade of PREMADE_CHARACTERS) {
      assert.match(premade.avatarUrl, /^\/characters\/ch-[1-5]\.avif$/, 'Uses loaded preset avatar');
      assert.ok(premade.classIconSvg.includes('<svg'), `Class ${premade.className} must have an SVG emblem`);
      const built = buildCharacterFromPremade(premade);
      assert.equal(built.className, premade.className);
      assert.equal(built.name, premade.name);
      assert.ok(built.hp?.max > 0);
    }
  });

  await t.test('4. PremadeCharactersModal.astro uses vertical cards with class emblem between photo and centered title', () => {
    assert.ok(fs.existsSync(premadeModalPath), 'PremadeCharactersModal.astro should exist');
    const content = fs.readFileSync(premadeModalPath, 'utf-8');

    assert.match(content, /<dialog[\s\S]*?id="premade-characters-modal"/, 'Should use native <dialog>');
    assert.match(content, /closedby="any"/, 'Should support light-dismiss');
    assert.match(
      content,
      /<img[\s\S]*?aspect-\[3\/4\][\s\S]*?\/>[\s\S]*?<header[\s\S]*?class-emblem-badge[\s\S]*?-mt-5[\s\S]*?<h4[\s\S]*?text-center/,
      'Card should render photo, then centered class emblem overlapping bottom of photo (-mt-5) right above the centered title'
    );
  });

  await t.test('5. QuickCreatorModal.astro uses phased StepRail form and 3 bookmark cards for Race, Class & Background', () => {
    assert.ok(fs.existsSync(quickModalPath), 'QuickCreatorModal.astro should exist');
    const content = fs.readFileSync(quickModalPath, 'utf-8');

    assert.match(content, /<dialog[\s\S]*?id="quick-creator-modal"/, 'Should use native <dialog>');
    assert.match(content, /<StepRail\s*\/>/, 'Should use StepRail for phased steps like weapon selector');
    assert.match(content, /data-page="datos"/, 'Should have datos basicos step');
    assert.match(content, /data-page="origen"/, 'Should have Race, Class & Background bookmark cards step');
    assert.match(content, /data-page="detalles"/, 'Should have stats & summary step');
    assert.match(content, /id="quick-race-bookmark-card"/, 'Should have Race bookmark card');
    assert.match(content, /id="quick-class-bookmark-card"/, 'Should have Class bookmark card');
    assert.match(content, /id="quick-background-bookmark-card"/, 'Should have Background bookmark card');
  });

  await t.test('6. quickCreatorData builds valid character data for any race, class, background, and stat preset', () => {
    assert.ok(QUICK_RACES.length >= 9, 'Should include the core D&D races');
    assert.equal(QUICK_CLASSES.length, CHARACTER_CLASSES.length, 'Should include all 12 classes');
    assert.ok(QUICK_BACKGROUNDS.length >= 4, 'Should include at least the 4 SRD 2024 backgrounds');

    const sampleRace = QUICK_RACES.find((r) => r.name === 'Enano') || QUICK_RACES[0];
    const sampleClass = QUICK_CLASSES.find((c) => c.name === 'Explorador') || QUICK_CLASSES[0];
    const sampleBg = QUICK_BACKGROUNDS.find((b) => b.name === 'Criminal') || QUICK_BACKGROUNDS[0];

    const stats = computeQuickStats(sampleClass, 'offensive');
    assert.equal(stats.dex, 17, 'Explorador offensive preset should prioritize DEX (17)');

    const built = buildCharacterFromQuickCreator({
      name: 'Bardo de Prueba',
      level: 3,
      alignment: 'Caótico Bueno',
      rulesEdition: '2024',
      avatarUrl: sampleRace.avatarUrl,
      raceOption: sampleRace,
      classOption: sampleClass,
      backgroundOption: sampleBg,
      statPreset: 'balanced',
    });

    assert.equal(built.name, 'Bardo de Prueba');
    assert.equal(built.race, sampleRace.name);
    assert.equal(built.className, sampleClass.name);
    assert.ok(built.title?.includes(sampleBg.name), 'Title should include selected background');
    assert.ok(built.features?.some((f) => f.title === sampleBg.originFeatTitle), 'Should include background origin feat');
  });

  await t.test('7. ManualCreatorModal.astro has 5 phased steps (identidad, origen, atributos, habilidades, equipo) and backpack options', () => {
    assert.ok(fs.existsSync(manualModalPath), 'ManualCreatorModal.astro should exist');
    const content = fs.readFileSync(manualModalPath, 'utf-8');

    assert.match(content, /<dialog[\s\S]*?id="manual-creator-modal"/, 'Should use native <dialog>');
    assert.match(content, /closedby="any"/, 'Should use closedby="any"');
    assert.match(content, /<StepRail\s*\/>/, 'Should use StepRail');
    assert.match(content, /data-page="identidad"/, 'Step 1: identidad');
    assert.match(content, /data-page="origen"/, 'Step 2: origen');
    assert.match(content, /data-page="atributos"/, 'Step 3: atributos');
    assert.match(content, /data-page="habilidades"/, 'Step 4: habilidades');
    assert.match(content, /data-page="equipo"/, 'Step 5: equipo y mochila');

    assert.match(content, /data-stat-method="free"/, 'Supports free stat edition');
    assert.match(content, /data-stat-method="pointbuy"/, 'Supports Point Buy');
    assert.match(content, /data-stat-method="standard"/, 'Supports Standard Array');
    assert.match(content, /data-stat-method="dice"/, 'Supports 4d6 dice roller');
    assert.match(content, /data-origin-bonus-mode="2-1"/, 'Supports +2/+1 origin bonus');
    assert.match(content, /data-origin-bonus-mode="1-1-1"/, 'Supports +1/+1/+1 origin bonus');
    assert.match(content, /data-backpack-item-id=/, 'Includes selectable backpack items in Step 5');

    const scriptMatch = content.match(/<script>([\s\S]*?)<\/script>/);
    assert.ok(scriptMatch, 'Should have client <script> block');
    assert.match(scriptMatch[1], /import[\s\S]*?CHARACTER_PRESET_IMAGES[\s\S]*?from/, 'Client script must import CHARACTER_PRESET_IMAGES');
  });

  await t.test('8. manualCreatorData computes Point Buy, 4d6 rolls, Origin Bonuses, Skills with Expertise, Class Kits & Backpack supplies', () => {
    // Point Buy: Standard array [15, 14, 13, 12, 10, 8] costs 9 + 7 + 5 + 4 + 2 + 0 = 27 pts
    const sampleClass = QUICK_CLASSES.find((c) => c.name === 'Mago') || QUICK_CLASSES[0];
    const stdScores = assignStandardArrayForClass(sampleClass);
    assert.equal(calculatePointBuySpent(stdScores), POINT_BUY_TOTAL, 'Standard array should cost exactly 27 points');

    // Deterministic 4d6 drop lowest test
    const seq = [0.99, 0.8, 0.5, 0.0]; // rolls: 6, 5, 4, 1 -> drop 1 -> total 15
    let i = 0;
    const roll = roll4d6DropLowest(() => seq[i++ % seq.length]);
    assert.deepEqual(roll.rolls, [6, 5, 4, 1]);
    assert.equal(roll.droppedIndex, 3);
    assert.equal(roll.total, 15);

    // Origin bonuses (+2 / +1 and +1 / +1 / +1)
    const boosted21 = applyOriginBonuses(stdScores, '2-1', 'int', ['con']);
    assert.equal(boosted21.int, stdScores.int + 2);
    assert.equal(boosted21.con, stdScores.con + 1);

    const boosted111 = applyOriginBonuses(stdScores, '1-1-1', null, ['int', 'con', 'dex']);
    assert.equal(boosted111.int, stdScores.int + 1);
    assert.equal(boosted111.con, stdScores.con + 1);
    assert.equal(boosted111.dex, stdScores.dex + 1);

    // Starter kits exist for all 12 classes
    for (const cls of CHARACTER_CLASSES) {
      assert.ok(CLASS_STARTER_KITS[cls], `Starter kit missing for ${cls}`);
    }
    assert.ok(BACKPACK_STARTER_OPTIONS.length >= 10, 'Should provide at least 10 backpack supply options');

    // Build character with Class Kit + custom backpack items + expertise
    const sampleRace = QUICK_RACES.find((r) => r.name === 'Elfo') || QUICK_RACES[0];
    const sampleBg = QUICK_BACKGROUNDS.find((b) => b.name === 'Sabio') || QUICK_BACKGROUNDS[0];

    const builtWithKit = buildCharacterFromManualCreator({
      name: 'Aelindor Manual',
      title: 'Archimago del Alba',
      level: 3,
      alignment: 'Neutral Bueno',
      rulesEdition: '2024',
      avatarUrl: sampleRace.avatarUrl,
      raceOption: sampleRace,
      customRaceName: 'Alto Elfo',
      classOption: sampleClass,
      subclass: 'Escuela de Evocación',
      backgroundOption: sampleBg,
      baseScores: stdScores,
      originBonusMode: '2-1',
      originPlus2: 'int',
      originPlus1: ['con'],
      savingThrows: ['int', 'wis'],
      skillStates: {
        arcana: 'expertise',
        history: 'proficient',
        perception: 'proficient',
      },
      equipmentMode: 'class-kit',
      selectedBackpackIds: ['pack-potion-heal', 'pack-healer-kit', 'pack-arcane-focus'],
      currency: { gp: 50, sp: 15, cp: 5 },
    });

    assert.equal(builtWithKit.name, 'Aelindor Manual');
    assert.equal(builtWithKit.race, 'Alto Elfo');
    assert.equal(builtWithKit.className, 'Mago');
    assert.equal(builtWithKit.subclass, 'Escuela de Evocación');
    assert.equal(builtWithKit.stats?.int.score, 17);
    assert.equal(builtWithKit.currency?.gp, 50);

    const arcanaSkill = builtWithKit.skills?.find((s) => s.id === 'arcana');
    assert.ok(arcanaSkill?.proficient && arcanaSkill?.expertise, 'Arcana should have expertise');
    // INT 17 (+3) + expertise at level 3 (2 * 2 = +4) = +7
    assert.equal(arcanaSkill?.value, 7);

    assert.ok(builtWithKit.spellcasting?.spells.length > 0, 'Class kit for Mago should include starter spells');
    assert.ok(
      builtWithKit.inventory?.some((i) => i.id === 'pack-healer-kit'),
      'Inventory should include chosen backpack item (Botiquín de Curandero)'
    );

    // Build character in blank mode
    const builtBlank = buildCharacterFromManualCreator({
      name: 'Guerrero En Blanco',
      level: 1,
      alignment: 'Neutral',
      rulesEdition: '2024',
      avatarUrl: sampleRace.avatarUrl,
      raceOption: sampleRace,
      classOption: QUICK_CLASSES[0],
      backgroundOption: sampleBg,
      baseScores: stdScores,
      equipmentMode: 'blank',
      selectedBackpackIds: ['pack-rope'],
    });

    assert.equal(builtBlank.actions?.length, 0, 'Blank mode should have no pre-equipped weapons');
    assert.equal(builtBlank.inventory?.length, 1, 'Blank mode should only contain selected backpack supplies');
    assert.equal(builtBlank.inventory?.[0].id, 'pack-rope');
  });

  await t.test('9. index.astro integrates CreateCharacterModal, QuickCreatorModal, ManualCreatorModal, and PremadeCharactersModal with uniform max-w-4xl width', () => {
    const indexContent = fs.readFileSync(indexPath, 'utf-8');

    assert.ok(indexContent.includes('<CreateCharacterModal />'));
    assert.ok(indexContent.includes('<QuickCreatorModal />'));
    assert.ok(indexContent.includes('<ManualCreatorModal />'));
    assert.ok(indexContent.includes('<PremadeCharactersModal />'));

    const createContent = fs.readFileSync(modalPath, 'utf-8');
    const quickContent = fs.readFileSync(quickModalPath, 'utf-8');
    const manualContent = fs.readFileSync(manualModalPath, 'utf-8');
    const premadeContent = fs.readFileSync(premadeModalPath, 'utf-8');

    assert.match(createContent, /<dialog[\s\S]*?max-w-4xl/, 'CreateCharacterModal should use max-w-4xl');
    assert.match(quickContent, /<dialog[\s\S]*?max-w-4xl/, 'QuickCreatorModal should use max-w-4xl');
    assert.match(manualContent, /<dialog[\s\S]*?max-w-4xl/, 'ManualCreatorModal should use max-w-4xl');
    assert.match(premadeContent, /<dialog[\s\S]*?max-w-4xl/, 'PremadeCharactersModal should use max-w-4xl');
  });
});
