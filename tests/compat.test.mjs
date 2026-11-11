import { test } from 'node:test';
import assert from 'node:assert';
import { checkCompatibility, hasArmorProficiency, hasWeaponProficiency, slugify } from '../src/scripts/dnd/compat.ts';

const armor = (id, category, extra = {}, item = {}) => ({
  id, name: id, quantity: 1, category: 'armor', equipped: true, slot: category === 'shield' ? 'shield' : 'body',
  armor: { category, baseAc: 14, ...extra }, ...item,
});
const weapon = (id, category, name = id, item = {}) => ({
  id, name, quantity: 1, category: 'weapon', equipped: true, slot: 'mainHand',
  weapon: { category, damageDice: '1d8', damageType: 'slashing', properties: [] }, ...item,
});
const char = (inventory, prof, str = 15) => ({
  stats: { str: { score: str } },
  inventory,
  proficiencies: prof,
});
const has = (r, target, op, value) =>
  r.modifiers.some((m) => m.target === target && m.op === op && (value === undefined || m.value === value));

test('mago con armadura pesada y solo light: aviso, desventajas y conjuros bloqueados', () => {
  const r = checkCompatibility(char([armor('cota', 'heavy')], { armor: ['light'], weapons: [] }));
  assert.strictEqual(r.proficiencyMissing, false);
  assert.strictEqual(r.warnings.length, 1);
  assert.strictEqual(r.warnings[0].itemId, 'cota');
  assert.strictEqual(r.warnings[0].ignorable, true);
  for (const t of ['attack', 'save.str', 'save.dex', 'check.str', 'check.dex']) {
    assert.ok(has(r, t, 'disadvantage'), `falta desventaja en ${t}`);
  }
  assert.ok(has(r, 'spellcasting', 'set', 'blocked'));
});

test('con heavy en la lista: sin aviso ni penalizaciones', () => {
  const r = checkCompatibility(char([armor('cota', 'heavy')], { armor: ['heavy'], weapons: [] }));
  assert.deepStrictEqual(r.warnings, []);
  assert.deepStrictEqual(r.modifiers, []);
});

test('escudo sin shield: misma penalización', () => {
  const r = checkCompatibility(char([armor('esc', 'shield')], { armor: ['light'], weapons: [] }));
  assert.strictEqual(r.warnings.length, 1);
  assert.ok(has(r, 'attack', 'disadvantage'));
  assert.ok(has(r, 'spellcasting', 'set', 'blocked'));
});

test('escudo manual sin datos de armadura se reconoce por nombre', () => {
  const esc = { id: 'e', name: 'Escudo de roble', quantity: 1, category: 'armor', equipped: true, slot: 'shield' };
  const r = checkCompatibility(char([esc], { armor: ['light'], weapons: [] }));
  assert.strictEqual(r.warnings.length, 1);
});

test('FUE 10 con strMin 13: speed -10, con y sin competencia', () => {
  for (const armorProf of [['heavy'], ['light']]) {
    const r = checkCompatibility(char([armor('cota', 'heavy', { strMin: 13 })], { armor: armorProf, weapons: [] }, 10));
    const speed = r.modifiers.filter((m) => m.target === 'speed');
    assert.strictEqual(speed.length, 1);
    assert.strictEqual(speed[0].op, 'add');
    assert.strictEqual(speed[0].value, -10);
    assert.ok(r.warnings.some((w) => w.itemId === 'cota' && /FUE/.test(w.text)));
  }
});

test('FUE suficiente: sin penalización de velocidad', () => {
  const r = checkCompatibility(char([armor('cota', 'heavy', { strMin: 13 })], { armor: ['heavy'], weapons: [] }, 13));
  assert.strictEqual(r.modifiers.filter((m) => m.target === 'speed').length, 0);
});

test('desventaja en Sigilo solo con la armadura equipada, sin generar aviso', () => {
  const eq = checkCompatibility(char([armor('cota', 'heavy', { stealthDisadv: true })], { armor: ['heavy'], weapons: [] }));
  assert.ok(has(eq, 'skill.stealth', 'disadvantage'));
  assert.deepStrictEqual(eq.warnings, []);
  const off = checkCompatibility(char([armor('cota', 'heavy', { stealthDisadv: true }, { equipped: false })], { armor: ['heavy'], weapons: [] }));
  assert.deepStrictEqual(off.modifiers, []);
});

test('arma marcial sin martial: aviso y marcada sin bono; con arma concreta, sin aviso', () => {
  const w = weapon('espada', 'martial', 'Espada larga');
  const sin = checkCompatibility(char([w], { armor: [], weapons: ['simple'] }));
  assert.strictEqual(sin.warnings.length, 1);
  assert.deepStrictEqual(sin.weaponsWithoutProficiency, ['espada']);
  const con = checkCompatibility(char([w], { armor: [], weapons: ['espada-larga'] }));
  assert.deepStrictEqual(con.warnings, []);
  assert.deepStrictEqual(con.weaponsWithoutProficiency, []);
  const cat = checkCompatibility(char([w], { armor: [], weapons: ['martial'] }));
  assert.deepStrictEqual(cat.warnings, []);
});

test('listas vacías: proficiencyMissing y sin avisos por objeto', () => {
  const inv = [armor('cota', 'heavy'), weapon('espada', 'martial')];
  for (const prof of [{ armor: [], weapons: [] }, undefined]) {
    const r = checkCompatibility(char(inv, prof));
    assert.strictEqual(r.proficiencyMissing, true);
    assert.deepStrictEqual(r.warnings, []);
    assert.ok(!has(r, 'attack', 'disadvantage'));
  }
});

test('ignoreWarnings quita aviso y penalizaciones de competencia, pero conserva la FUE mínima', () => {
  const cota = armor('cota', 'heavy', { strMin: 15 }, { ignoreWarnings: true });
  const r = checkCompatibility(char([cota], { armor: ['light'], weapons: [] }, 10));
  assert.ok(!has(r, 'attack', 'disadvantage'));
  assert.ok(!has(r, 'spellcasting', 'set'));
  assert.ok(has(r, 'speed', 'add', -10));
  assert.deepStrictEqual(r.warnings.map((w) => w.text.includes('FUE')), [true]);
});

test('objeto no equipado: sin avisos ni modificadores', () => {
  const r = checkCompatibility(char([armor('cota', 'heavy', { strMin: 15 }, { equipped: false })], { armor: ['light'], weapons: [] }, 8));
  assert.deepStrictEqual(r.warnings, []);
  assert.deepStrictEqual(r.modifiers, []);
});

test('helpers de competencia y slugify', () => {
  assert.strictEqual(hasArmorProficiency({ armor: ['medium'], weapons: [] }, { category: 'medium', baseAc: 14 }), true);
  assert.strictEqual(hasArmorProficiency(undefined, { category: 'medium', baseAc: 14 }), false);
  assert.strictEqual(hasWeaponProficiency({ armor: [], weapons: ['hand-crossbow'] }, weapon('b', 'martial', 'Hand Crossbow')), true);
  assert.strictEqual(slugify('Espada Larga +1'), 'espada-larga-1');
  assert.strictEqual(slugify('Ballesta de mano'), 'ballesta-de-mano');
});
