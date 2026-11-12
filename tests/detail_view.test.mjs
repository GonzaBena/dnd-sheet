import { test } from 'node:test';
import assert from 'node:assert';
import {
  headerFields, detailSections, availableActions, castableLevels,
} from '../src/scripts/dnd/detailView.ts';

const item = (meta = {}, extra = {}) => ({
  id: 'i1', kind: 'item', source: 'custom', name: 'Espada', description: 'Filosa', meta, ...extra,
});
const spell = (meta = {}, extra = {}) => ({
  id: 's1', kind: 'spell', source: 'srd', name: 'Bola de fuego', description: 'Boom', meta, ...extra,
});
const feat = () => ({ id: 'f1', kind: 'feat', source: 'srd', name: 'Alerta', description: '', meta: {} });

test('availableActions: objeto en inventory (sin equip/give hasta que existan, H2/H6)', () => {
  assert.deepStrictEqual(availableActions(item(), 'inventory'), ['drop']);
  assert.deepStrictEqual(availableActions(item({ usableType: 'consumable' }), 'inventory'), ['use', 'drop']);
  // armaduras, armas y equipo traen usableType 'none': no se consumen
  assert.deepStrictEqual(availableActions(item({ usableType: 'none' }), 'inventory'), ['drop']);
});

test('availableActions: loot y compendio solo ofrecen add', () => {
  assert.deepStrictEqual(availableActions(item(), 'loot'), ['add']);
  assert.deepStrictEqual(availableActions(item(), 'compendium'), ['add']);
  assert.deepStrictEqual(availableActions(feat(), 'compendium'), ['add']);
  assert.deepStrictEqual(availableActions(spell(), 'loot'), []);
  assert.deepStrictEqual(availableActions(feat(), 'inventory'), []);
});

test('availableActions: hechizo en spellbook; apply-effect solo con effects', () => {
  assert.deepStrictEqual(availableActions(spell(), 'spellbook'), ['cast', 'remove']);
  const withFx = spell({}, { effects: [{ target: 'ac', op: 'add', value: 2 }] });
  assert.deepStrictEqual(availableActions(withFx, 'spellbook'), ['cast', 'apply-effect', 'remove']);
  assert.deepStrictEqual(availableActions(spell(), 'compendium'), ['add']);
});

test('castableLevels', () => {
  const slots = {
    1: { total: 4, used: 1 }, 2: { total: 3, used: 0 }, 3: { total: 3, used: 1 },
    4: { total: 3, used: 3 }, 5: { total: 1, used: 0 },
  };
  assert.deepStrictEqual(castableLevels(3, slots), [
    { level: 3, remaining: 2 }, { level: 4, remaining: 0 }, { level: 5, remaining: 1 },
  ]);
  assert.deepStrictEqual(castableLevels(0, slots), []);
  // niveles sin espacios definidos no aparecen
  assert.deepStrictEqual(castableLevels(6, slots), []);
});

test('headerFields', () => {
  const f = headerFields(item({ rarity: 'Raro', weightLb: 3 }));
  assert.ok(f.some((x) => x.value.includes('Raro')));
  assert.ok(f.some((x) => x.value.includes('3')));
  assert.deepStrictEqual(headerFields(item()), []);
  const s = headerFields(spell({ level: 3, school: 'Evocación' }));
  assert.ok(s.some((x) => x.value.includes('3')));
  assert.ok(s.some((x) => x.value.includes('Evocación')));
});

test('detailSections omite las vacías y describe los efectos', () => {
  assert.deepStrictEqual(detailSections(item()), []);
  const secs = detailSections(item({}, { effects: [{ target: 'ac', op: 'add', value: 2 }] }));
  assert.strictEqual(secs.length, 1);
  assert.ok(secs[0].rows.some((r) => r.value.includes('2')));
  const sp = detailSections(spell({ castingTime: '1 acción', range: '150 pies', components: 'V, S, M', material: 'azufre' }));
  assert.ok(sp.length >= 1);
  assert.ok(sp.flatMap((s) => s.rows).some((r) => r.value.includes('azufre')));
});

test('no escapa HTML (el render usa textContent, FD-7)', () => {
  const e = item({ rarity: '<script>x</script>' }, { name: '<script>', description: '<img onerror=1>' });
  assert.strictEqual(e.name, '<script>');
  assert.ok(headerFields(e).some((f) => f.value === '<script>x</script>'));
});
