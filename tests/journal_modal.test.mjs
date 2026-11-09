import test from 'node:test';
import assert from 'node:assert';
import { journalStore } from '../src/scripts/state/journalStore.ts';

test('Journal Modal - Store & Filtering Suite', async (t) => {
  journalStore.resetToDefault();

  await t.test('1. Adding and retrieving full entries from Journal Modal', () => {
    const entry = journalStore.addEntry({
      sessionNumber: 15,
      title: 'Descubrimiento en la cripta',
      content: '#Botín Encontramos un amuleto antiguo de plata.',
      tags: ['#Botín', '#Pista'],
      isPrivate: false,
      isSecret: false,
      characterId: 'elysian-1',
      authorName: 'Elysian'
    });

    assert.ok(entry.id);
    assert.strictEqual(entry.title, 'Descubrimiento en la cripta');
    assert.strictEqual(entry.isPrivate, false);

    const allEntries = journalStore.getEntries('elysian-1');
    const found = allEntries.find(e => e.id === entry.id);
    assert.ok(found, 'Entry should be present in character view');
  });

  await t.test('2. Private entries isolation for active character', () => {
    const privateEntry = journalStore.addEntry({
      sessionNumber: 15,
      title: 'Nota Secreta Personal',
      content: 'No confío en el clérigo.',
      tags: ['#Privado'],
      isPrivate: true,
      characterId: 'elysian-1',
      authorName: 'Elysian'
    });

    const elysianEntries = journalStore.getEntries('elysian-1');
    assert.ok(elysianEntries.some(e => e.id === privateEntry.id), 'Owner must see their private note');

    const otherEntries = journalStore.getEntries('other-char-2');
    assert.ok(!otherEntries.some(e => e.id === privateEntry.id), 'Other characters must not see private notes');
  });

  await t.test('3. Tag filtering resolution', () => {
    const entries = journalStore.getEntries('elysian-1');
    const combatEntries = entries.filter(e => e.tags.some(t => t.toLowerCase() === '#combate'));
    const lootEntries = entries.filter(e => e.tags.some(t => t.toLowerCase() === '#botín'));

    assert.ok(lootEntries.length >= 1, 'Loot filter should find at least one entry');
    lootEntries.forEach(e => {
      assert.ok(e.tags.includes('#Botín'), 'Filtered entries must include #Botín');
    });
  });

  await t.test('4. Entry deletion in Journal Modal', () => {
    const entry = journalStore.addEntry({
      sessionNumber: 15,
      title: 'Nota temporal a borrar',
      content: 'Esta nota será eliminada.',
      tags: ['#Pista'],
      characterId: 'elysian-1'
    });

    const countBefore = journalStore.getEntries('elysian-1').length;
    journalStore.deleteEntry(entry.id);
    const countAfter = journalStore.getEntries('elysian-1').length;

    assert.strictEqual(countAfter, countBefore - 1, 'Deleting entry should decrease count by 1');
    const found = journalStore.getEntries('elysian-1').find(e => e.id === entry.id);
    assert.strictEqual(found, undefined, 'Deleted entry should no longer exist');
  });
});
