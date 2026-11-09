// tests/section_reorder_and_collapse.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

// Mock browser environment for node testing
if (typeof globalThis.window === 'undefined') {
  const listeners = new Map();
  globalThis.window = {
    addEventListener: (type, cb) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(cb);
    },
    removeEventListener: (type, cb) => {
      if (listeners.has(type)) {
        listeners.set(type, listeners.get(type).filter(fn => fn !== cb));
      }
    },
    dispatchEvent: (event) => {
      const cbs = listeners.get(event.type) || [];
      cbs.forEach(cb => cb(event));
      return true;
    },
    CustomEvent: class CustomEvent {
      constructor(type, eventInitDict) {
        this.type = type;
        this.detail = eventInitDict?.detail;
      }
    }
  };
}

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear()
  };
}

const { characterStore } = await import('../src/scripts/state/characterStore.ts');
const { recalculateCharacter } = await import('../src/scripts/dnd/calculations.ts');
const { SECTIONS_META, ALL_SECTION_IDS } = await import('../src/scripts/ui/sectionOrganizer.ts');

test('Section Reordering, Collapsing & Layout Tests', async (t) => {
  await t.test('1. Default character layout has valid sectionOrder with col1 and col2', () => {
    const char = characterStore.get();
    assert.ok(char.layoutConfig);
    assert.ok(char.layoutConfig.sectionOrder);
    assert.deepEqual(char.layoutConfig.sectionOrder.col1, ['abilities', 'saves', 'skills', 'features']);
    assert.deepEqual(char.layoutConfig.sectionOrder.col2, ['weapons', 'wildshape', 'currency', 'backpack', 'spells']);
    assert.deepEqual(char.layoutConfig.collapsedSections, []);
  });

  await t.test('2. SECTIONS_META defines all 9 modular sections', () => {
    assert.equal(ALL_SECTION_IDS.length, 9);
    for (const secId of ALL_SECTION_IDS) {
      assert.ok(SECTIONS_META[secId]);
      assert.ok(SECTIONS_META[secId].name);
      assert.ok(SECTIONS_META[secId].icon);
    }
  });

  await t.test('3. characterStore.updateSectionOrder updates and persists custom column order', () => {
    characterStore.updateSectionOrder({
      col1: ['spells', 'weapons', 'abilities'],
      col2: ['saves', 'skills', 'features', 'wildshape', 'currency', 'backpack']
    });

    const updated = characterStore.get();
    assert.deepEqual(updated.layoutConfig.sectionOrder.col1, ['spells', 'weapons', 'abilities']);
    assert.deepEqual(updated.layoutConfig.sectionOrder.col2, ['saves', 'skills', 'features', 'wildshape', 'currency', 'backpack']);
  });

  await t.test('4. characterStore.resetSectionOrder reverts to default 4/5 column distribution', () => {
    characterStore.resetSectionOrder();
    const reset = characterStore.get();
    assert.deepEqual(reset.layoutConfig.sectionOrder.col1, ['abilities', 'saves', 'skills', 'features']);
    assert.deepEqual(reset.layoutConfig.sectionOrder.col2, ['weapons', 'wildshape', 'currency', 'backpack', 'spells']);
  });

  await t.test('5. characterStore.toggleSectionCollapsed toggles individual section collapse', () => {
    assert.equal(characterStore.isSectionCollapsed('spells'), false);

    const firstToggle = characterStore.toggleSectionCollapsed('spells');
    assert.equal(firstToggle, true);
    assert.equal(characterStore.isSectionCollapsed('spells'), true);
    assert.ok(characterStore.get().layoutConfig.collapsedSections.includes('spells'));

    const secondToggle = characterStore.toggleSectionCollapsed('spells');
    assert.equal(secondToggle, false);
    assert.equal(characterStore.isSectionCollapsed('spells'), false);
    assert.ok(!characterStore.get().layoutConfig.collapsedSections.includes('spells'));
  });

  await t.test('6. characterStore.setAllSectionsCollapsed collapses or expands all sections in bulk', () => {
    characterStore.setAllSectionsCollapsed(true);
    const collapsedAll = characterStore.get().layoutConfig.collapsedSections;
    assert.equal(collapsedAll.length, 9);
    assert.equal(characterStore.isSectionCollapsed('weapons'), true);
    assert.equal(characterStore.isSectionCollapsed('backpack'), true);

    characterStore.setAllSectionsCollapsed(false);
    const expandedAll = characterStore.get().layoutConfig.collapsedSections;
    assert.equal(expandedAll.length, 0);
    assert.equal(characterStore.isSectionCollapsed('weapons'), false);
    assert.equal(characterStore.isSectionCollapsed('backpack'), false);
  });

  await t.test('7. Backward compatibility: recalculateCharacter guarantees sectionOrder and collapsedSections', () => {
    const legacyChar = {
      id: 'legacy-char',
      name: 'Legacy Hero',
      level: 3,
      hp: { current: 20, max: 20, temp: 0 },
      stats: {
        str: { score: 10, modifier: 0, savingProficient: false },
        dex: { score: 14, modifier: 2, savingProficient: false },
        con: { score: 12, modifier: 1, savingProficient: false },
        int: { score: 10, modifier: 0, savingProficient: false },
        wis: { score: 12, modifier: 1, savingProficient: false },
        cha: { score: 10, modifier: 0, savingProficient: false }
      },
      skills: [],
      actions: [],
      currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      backpack: [],
      spellcasting: { spellSlots: { level1: { total: 0, used: 0 } }, spells: [] },
      // No layoutConfig at all
    };

    const recalculated = recalculateCharacter(legacyChar);
    assert.ok(recalculated.layoutConfig);
    assert.ok(recalculated.layoutConfig.sectionOrder);
    assert.equal(recalculated.layoutConfig.sectionOrder.col1.length, 4);
    assert.equal(recalculated.layoutConfig.sectionOrder.col2.length, 5);
    assert.deepEqual(recalculated.layoutConfig.collapsedSections, []);
  });

  await t.test('8. Missing sections are auto-appended to col2 during recalculation', () => {
    const partialOrderChar = {
      id: 'partial-char',
      name: 'Partial Hero',
      level: 1,
      hp: { current: 10, max: 10, temp: 0 },
      stats: {
        str: { score: 10, modifier: 0, savingProficient: false },
        dex: { score: 10, modifier: 0, savingProficient: false },
        con: { score: 10, modifier: 0, savingProficient: false },
        int: { score: 10, modifier: 0, savingProficient: false },
        wis: { score: 10, modifier: 0, savingProficient: false },
        cha: { score: 10, modifier: 0, savingProficient: false }
      },
      skills: [],
      actions: [],
      currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      backpack: [],
      spellcasting: { spellSlots: {}, spells: [] },
      layoutConfig: {
        activeTab: 'all',
        showSpells: true,
        showWildShape: false,
        showWeapons: true,
        showInventory: true,
        showJournal: true,
        showSkills: true,
        sectionOrder: {
          col1: ['abilities'],
          col2: ['weapons'] // Missing saves, skills, features, wildshape, currency, backpack, spells
        }
      }
    };

    const fixed = recalculateCharacter(partialOrderChar);
    const allAssigned = new Set([...fixed.layoutConfig.sectionOrder.col1, ...fixed.layoutConfig.sectionOrder.col2]);
    for (const sec of ALL_SECTION_IDS) {
      assert.ok(allAssigned.has(sec), `Expected section ${sec} to be assigned`);
    }
  });

  await t.test('9. unifiedOrder is initialized, synchronized and maintained on characterStore updates', () => {
    characterStore.resetSectionOrder();
    const char = characterStore.get();
    assert.ok(Array.isArray(char.layoutConfig.sectionOrder.unifiedOrder));
    assert.equal(char.layoutConfig.sectionOrder.unifiedOrder.length, 9);
    assert.equal(char.layoutConfig.sectionOrder.unifiedOrder[0], 'abilities');

    // Updating with a unifiedOrder
    const newUnified = ['spells', 'weapons', 'abilities', 'saves', 'skills', 'features', 'wildshape', 'currency', 'backpack'];
    characterStore.updateSectionOrder({
      unifiedOrder: newUnified
    });

    const updated = characterStore.get();
    assert.deepEqual(updated.layoutConfig.sectionOrder.unifiedOrder, newUnified);
    // col1 gets first 4, col2 gets remaining 5
    assert.deepEqual(updated.layoutConfig.sectionOrder.col1, ['spells', 'weapons', 'abilities', 'saves']);
    assert.deepEqual(updated.layoutConfig.sectionOrder.col2, ['skills', 'features', 'wildshape', 'currency', 'backpack']);

    // Updating with col1/col2 automatically updates unifiedOrder
    characterStore.updateSectionOrder({
      col1: ['features', 'skills'],
      col2: ['abilities', 'saves', 'weapons', 'wildshape', 'currency', 'backpack', 'spells']
    });
    const updated2 = characterStore.get();
    assert.deepEqual(updated2.layoutConfig.sectionOrder.unifiedOrder, [
      'features', 'skills', 'abilities', 'saves', 'weapons', 'wildshape', 'currency', 'backpack', 'spells'
    ]);
  });

  await t.test('10. Backward compatibility: legacy character gets valid unifiedOrder during recalculation', () => {
    const legacy = {
      id: 'legacy-2',
      name: 'Legacy 2',
      level: 1,
      hp: { current: 10, max: 10 },
      stats: { str: { score: 10, modifier: 0 }, dex: { score: 10, modifier: 0 }, con: { score: 10, modifier: 0 }, int: { score: 10, modifier: 0 }, wis: { score: 10, modifier: 0 }, cha: { score: 10, modifier: 0 } },
      layoutConfig: {
        sectionOrder: {
          col1: ['weapons', 'spells'],
          col2: ['abilities']
        }
      }
    };
    const fixed = recalculateCharacter(legacy);
    assert.ok(Array.isArray(fixed.layoutConfig.sectionOrder.unifiedOrder));
    assert.equal(fixed.layoutConfig.sectionOrder.unifiedOrder.length, 9);
    // Preserves custom col1 and col2 order at the front
    assert.equal(fixed.layoutConfig.sectionOrder.unifiedOrder[0], 'weapons');
    assert.equal(fixed.layoutConfig.sectionOrder.unifiedOrder[1], 'spells');
    assert.equal(fixed.layoutConfig.sectionOrder.unifiedOrder[2], 'abilities');
  });
});
