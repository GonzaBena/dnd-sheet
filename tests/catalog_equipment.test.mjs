import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { armorFromSrd, weaponFromSrd, srdToEntry, toCatalogEntry, parseArmorInput, parseWeaponInput } from '../src/scripts/dnd/catalog.ts';
import { detailSections, headerFields } from '../src/scripts/dnd/detailView.ts';

const load = (p) => JSON.parse(readFileSync(new URL(`../public/data/srd/${p}`, import.meta.url), 'utf8'));
const EDITIONS = ['2014', '2024'];
const find = (ed, index) => load(`${ed}/equipment.json`).find((i) => i.index === index);

for (const ed of EDITIONS) {
  test(`armaduras SRD ${ed}`, () => {
    const leather = armorFromSrd(find(ed, 'leather-armor'));
    assert.strictEqual(leather.category, 'light');
    assert.strictEqual(leather.baseAc, 11);
    assert.strictEqual(leather.dexCap, null);
    assert.strictEqual(leather.strMin, undefined);

    assert.strictEqual(armorFromSrd(find(ed, 'chain-shirt')).dexCap, 2);

    const mail = armorFromSrd(find(ed, 'chain-mail'));
    assert.strictEqual(mail.category, 'heavy');
    assert.strictEqual(mail.baseAc, 16);
    assert.strictEqual(mail.dexCap, 0);
    assert.strictEqual(mail.strMin, 13);
    assert.strictEqual(mail.stealthDisadv, true);

    const shield = armorFromSrd(find(ed, 'shield'));
    assert.strictEqual(shield.category, 'shield');
    assert.strictEqual(shield.baseAc, 2);
  });

  test(`armas SRD ${ed}`, () => {
    const sword = weaponFromSrd(find(ed, 'longsword'));
    assert.strictEqual(sword.weapon.category, 'martial');
    assert.strictEqual(sword.weapon.damageDice, '1d8');
    assert.match(sword.weapon.damageType, /slashing/i);
    assert.strictEqual(sword.weapon.versatileDice, '1d10');
    assert.strictEqual(sword.hands, 1);

    const axe = weaponFromSrd(find(ed, 'greataxe'));
    assert.ok(axe.weapon.properties.includes('two-handed'));
    assert.strictEqual(axe.hands, 2);

    const bow = weaponFromSrd(find(ed, 'shortbow'));
    assert.strictEqual(bow.weapon.category, 'simple');
    assert.deepStrictEqual(bow.weapon.range, { normal: 80, long: 320 });
  });

  test(`una armadura no es arma y viceversa (${ed})`, () => {
    assert.strictEqual(weaponFromSrd(find(ed, 'chain-mail')), undefined);
    assert.strictEqual(armorFromSrd(find(ed, 'longsword')), undefined);
  });
}

test('armadura sin armor_class devuelve undefined', () => {
  const raw = {
    index: 'x', name: 'X',
    equipment_categories: [{ index: 'heavy-armor' }],
  };
  assert.strictEqual(armorFromSrd(raw), undefined);
  assert.strictEqual(armorFromSrd(undefined), undefined);
  assert.strictEqual(armorFromSrd({ equipment_categories: [{ index: 'heavy-armor' }], armor_class: {} }), undefined);
});

test('srdToEntry deja armor/weapon en meta y no comparte referencias', () => {
  const raw = find('2014', 'chain-mail');
  const entry = srdToEntry('item', raw);
  assert.strictEqual(entry.meta.armor.baseAc, 16);
  assert.strictEqual(entry.meta.weapon, undefined);
  const w = srdToEntry('item', find('2024', 'greataxe'));
  assert.strictEqual(w.meta.hands, 2);
  assert.ok(w.meta.weapon.properties.includes('two-handed'));
  // Un objeto común no trae datos de equipo
  const rope = srdToEntry('item', { index: 'rope', name: 'Rope', equipment_categories: [{ index: 'adventuring-gear' }] });
  assert.strictEqual(rope.meta.armor, undefined);
  assert.strictEqual(rope.meta.weapon, undefined);
});

test('detailSections muestra armadura y arma y omite secciones vacías', () => {
  const armorEntry = toCatalogEntry('item', {
    name: 'Placas +1', category: 'armor',
    armor: { category: 'heavy', baseAc: 18, dexCap: 0, strMin: 15, stealthDisadv: true, bonus: 1 },
  });
  const titles = detailSections(armorEntry).map((s) => s.title);
  assert.ok(titles.includes('Armadura'));
  assert.ok(!titles.includes('Arma'));
  const rows = detailSections(armorEntry).find((s) => s.title === 'Armadura').rows;
  assert.ok(rows.some((r) => r.value.includes('19')), 'CA base incluye el bono (18+1)');
  assert.ok(rows.some((r) => r.label === 'FUE mínima' && r.value === '15'));

  const weaponEntry = toCatalogEntry('item', {
    name: 'Espada larga', category: 'weapon',
    weapon: { category: 'martial', damageDice: '1d8', damageType: 'slashing', properties: ['versatile'], versatileDice: '1d10' },
  });
  assert.ok(detailSections(weaponEntry).some((s) => s.title === 'Arma'));

  const plain = toCatalogEntry('item', { name: 'Cuerda', category: 'gear' });
  const plainTitles = detailSections(plain).map((s) => s.title);
  assert.ok(!plainTitles.includes('Armadura') && !plainTitles.includes('Arma') && !plainTitles.includes('Equipo'));
  assert.ok(headerFields(armorEntry).length > 0);
});

test('entradas propias: validación de armadura y arma (FB-5)', () => {
  const ok = parseArmorInput({ category: 'heavy', baseAc: '18', dexCap: '0', strMin: '15', stealthDisadv: true, bonus: '1' });
  assert.deepStrictEqual(ok.value, { category: 'heavy', baseAc: 18, dexCap: 0, strMin: 15, stealthDisadv: true, bonus: 1 });
  const light = { category: 'light', baseAc: '11', dexCap: '', strMin: '', stealthDisadv: false, bonus: '' };
  assert.strictEqual(parseArmorInput(light).value.dexCap, null);
  assert.strictEqual('dexCap' in parseArmorInput({ ...light, category: 'shield', baseAc: '2' }).value, false);
  for (const bad of [{ baseAc: '' }, { baseAc: '1.5' }, { baseAc: '99' }, { baseAc: 'abc' }, { strMin: '-1' }]) {
    assert.strictEqual(parseArmorInput({ ...light, ...bad }).ok, false, JSON.stringify(bad));
  }
  const w = parseWeaponInput({ category: 'martial', damageDice: '1D12', damageType: 'slashing', properties: 'Heavy, two-handed', rangeNormal: '5', rangeLong: '', versatileDice: '', magicBonus: '2' });
  assert.strictEqual(w.value.hands, 2);
  assert.strictEqual(w.value.weapon.damageDice, '1d12');
  assert.strictEqual(w.value.weapon.magicBonus, 2);
  assert.deepStrictEqual(w.value.weapon.properties, ['heavy', 'two-handed']);
  const base = { category: 'simple', damageDice: '1d6', damageType: '', properties: '', rangeNormal: '', rangeLong: '', versatileDice: '', magicBonus: '' };
  assert.strictEqual(parseWeaponInput({ ...base, damageDice: 'mucho' }).ok, false);
  assert.strictEqual(parseWeaponInput({ ...base, rangeNormal: '80', rangeLong: '20' }).ok, false);
  assert.strictEqual(parseWeaponInput({ ...base, rangeLong: '20' }).ok, false);
});
