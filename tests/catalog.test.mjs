import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  srdToEntry, toCatalogEntry, sanitizeImageUrl, parseEffectsText, effectsToText, escapeHtml,
} from '../src/scripts/dnd/catalog.ts';

const load = (p) => JSON.parse(readFileSync(new URL(`../public/data/srd/${p}`, import.meta.url), 'utf8'));

test('srdToEntry con datos reales de ambas ediciones', () => {
  const spell14 = srdToEntry('spell', load('2014/spells.json')[0]);
  assert.ok(spell14.name && spell14.description);
  assert.strictEqual(spell14.source, 'srd');
  assert.strictEqual(typeof spell14.meta.level, 'number');

  const spell24 = srdToEntry('spell', load('2024/spells.json')[0]);
  assert.ok(spell24.name && spell24.description);

  const item = srdToEntry('item', load('2014/magic-items.json')[0]);
  assert.ok(item.name && item.description);
  assert.ok(item.meta.rarity);

  const gear24 = srdToEntry('item', load('2024/equipment.json')[0]);
  assert.ok(gear24.name && gear24.description);

  const feat14 = srdToEntry('feat', load('2014/feats.json')[0]);
  assert.ok(feat14.name && feat14.description);
  const feat24 = srdToEntry('feat', load('2024/feats.json')[0]);
  assert.strictEqual(feat24.meta.type, 'origin');
});

test('srdToEntry no lanza con JSON incompleto', () => {
  assert.doesNotThrow(() => srdToEntry('spell', {}));
  assert.doesNotThrow(() => srdToEntry('item', { name: 'X' }));
  assert.doesNotThrow(() => srdToEntry('feat', undefined));
  assert.strictEqual(srdToEntry('item', { name: 'X' }).description, '');
});

test('toCatalogEntry', () => {
  const custom = toCatalogEntry('item', { id: 'i1', name: 'Anillo', custom: true, effects: [{ target: 'ac', op: 'add', value: 1 }] });
  assert.strictEqual(custom.source, 'custom');
  assert.strictEqual(custom.effects.length, 1);
  assert.strictEqual(toCatalogEntry('item', { name: 'A', source: 'srd' }).source, 'srd');
  // FC-2: sin source → 'custom'; con srdIndex → 'srd'
  assert.strictEqual(toCatalogEntry('item', { name: 'A' }).source, 'custom');
  assert.strictEqual(toCatalogEntry('spell', { name: 'A', srdIndex: 'x' }).source, 'srd');
  const feat = toCatalogEntry('feat', { title: 'Alerta', description: 'd', featType: 'reaction' });
  assert.strictEqual(feat.name, 'Alerta');
  assert.strictEqual(feat.meta.featType, 'reaction');
});

test('sanitizeImageUrl', () => {
  assert.strictEqual(sanitizeImageUrl('https://example.com/a.png'), 'https://example.com/a.png');
  assert.strictEqual(sanitizeImageUrl('  https://example.com/a.png '), 'https://example.com/a.png');
  assert.ok(sanitizeImageUrl('data:image/png;base64,iVBORw0KGgo='));
  assert.strictEqual(sanitizeImageUrl('javascript:alert(1)'), undefined);
  assert.strictEqual(sanitizeImageUrl('http://example.com/a.png'), undefined);
  assert.strictEqual(sanitizeImageUrl('data:image/svg+xml;base64,PHN2Zz4='), undefined);
  assert.strictEqual(sanitizeImageUrl('data:text/html;base64,PGI+'), undefined);
  assert.strictEqual(sanitizeImageUrl(''), undefined);
  assert.strictEqual(sanitizeImageUrl(42), undefined);
  assert.strictEqual(sanitizeImageUrl(null), undefined);
  assert.strictEqual(sanitizeImageUrl('https://' + 'a'.repeat(3000) + '.com'), undefined);
});

test('parseEffectsText', () => {
  assert.deepStrictEqual(parseEffectsText('ac add 2'), [{ target: 'ac', op: 'add', value: 2 }]);
  assert.deepStrictEqual(parseEffectsText('save.dex advantage'), [{ target: 'save.dex', op: 'advantage' }]);
  assert.deepStrictEqual(parseEffectsText('damage resistance fuego'), [{ target: 'damage', op: 'resistance', value: 'fuego' }]);
  assert.deepStrictEqual(parseEffectsText(''), []);
  assert.deepStrictEqual(parseEffectsText('\n  \n'), []);
  assert.strictEqual(parseEffectsText('ac add 2\n\nspeed boost 5').error.startsWith('Línea 3'), true);
  assert.ok(parseEffectsText('ac add').error.includes('Línea 1'));
  assert.ok(parseEffectsText('ac add mucho').error.includes('numérico'));
  assert.ok(parseEffectsText('solo').error.includes('Línea 1'));
  assert.ok(parseEffectsText('<b> add 1').error);
});

test('effectsToText es el inverso de parseEffectsText', () => {
  const text = 'ac add 2\nsave.dex advantage';
  assert.strictEqual(effectsToText(parseEffectsText(text)), text);
  assert.strictEqual(effectsToText(undefined), '');
});

test('escapeHtml', () => {
  assert.strictEqual(escapeHtml('<img src=x onerror="a">&\''), '&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;');
  assert.strictEqual(escapeHtml(undefined), '');
});
