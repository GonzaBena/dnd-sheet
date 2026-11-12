import { test } from 'node:test';
import assert from 'node:assert';
import { buildAttackFromWeapon, upsertAttack } from '../src/scripts/dnd/weaponAttack.ts';

const weapon = (id, name, w = {}, item = {}) => ({
  id, name, quantity: 1, category: 'weapon',
  weapon: { category: 'martial', damageDice: '1d8', damageType: 'slashing', properties: [], ...w }, ...item,
});
const char = (str, dex, prof = { armor: [], weapons: ['martial'] }) => ({
  proficiencyBonus: 2,
  stats: { str: { score: str, modifier: Math.floor((str - 10) / 2) }, dex: { score: dex, modifier: Math.floor((dex - 10) / 2) } },
  proficiencies: prof,
});

test('espada larga con FUE +3 y competencia marcial', () => {
  const a = buildAttackFromWeapon(char(16, 10), weapon('esp', 'Espada larga'));
  assert.strictEqual(a.ability, 'str');
  assert.strictEqual(a.proficient, true);
  assert.strictEqual(a.damageDice, '1d8');
  assert.strictEqual(a.itemId, 'esp');
  assert.strictEqual(a.bonus, '+5 al Impacto');
  assert.strictEqual(a.damage, '1d8 + 3');
  assert.strictEqual(a.damageType, 'Cortante');
});

test('estoque (sutil) con DES mayor que FUE usa DES', () => {
  const a = buildAttackFromWeapon(char(10, 16), weapon('est', 'Estoque', { properties: ['finesse'] }));
  assert.strictEqual(a.ability, 'dex');
  assert.deepStrictEqual(a.tags, ['Sutil']);
});

test('sutil con FUE mayor o igual conserva FUE', () => {
  const a = buildAttackFromWeapon(char(16, 14), weapon('est', 'Estoque', { properties: ['finesse'] }));
  assert.strictEqual(a.ability, 'str');
});

test('arco largo (a distancia) usa DES aunque FUE sea mayor', () => {
  const a = buildAttackFromWeapon(char(16, 12), weapon('arco', 'Arco largo', { range: { normal: 150, long: 600 }, properties: ['ammunition'] }));
  assert.strictEqual(a.ability, 'dex');
  assert.strictEqual(a.type, 'A distancia');
});

test('arma +1: attackBonusMod 1 y el daño suma 1', () => {
  const a = buildAttackFromWeapon(char(16, 10), weapon('esp', 'Espada larga', { magicBonus: 1 }));
  assert.strictEqual(a.attackBonusMod, 1);
  assert.strictEqual(a.bonus, '+6 al Impacto');
  assert.strictEqual(a.damage, '1d8 + 4');
});

test('sin competencia: proficient false y no suma el bono', () => {
  const a = buildAttackFromWeapon(char(16, 10, { armor: [], weapons: [] }), weapon('esp', 'Espada larga'));
  assert.strictEqual(a.proficient, false);
  assert.strictEqual(a.bonus, '+3 al Impacto');
});

test('arma versátil: dado alternativo en notes', () => {
  const a = buildAttackFromWeapon(char(16, 10), weapon('esp', 'Espada larga', { properties: ['versatile'], versatileDice: '1d10' }));
  assert.ok(a.notes.includes('1d10'));
});

test('upsertAttack: agrega, reemplaza por itemId sin duplicar y no toca acciones sin itemId', () => {
  const manual = { id: 'm1', name: 'Garras', type: 'Cuerpo a cuerpo', bonus: '+4', damage: '1d6', damageType: 'Cortante', tags: [] };
  const a1 = buildAttackFromWeapon(char(16, 10), weapon('esp', 'Espada larga'));
  const list1 = upsertAttack([manual], a1);
  assert.strictEqual(list1.length, 2);
  assert.strictEqual(list1[0], manual);

  const a2 = buildAttackFromWeapon(char(16, 10), weapon('esp', 'Espada larga', { magicBonus: 2 }));
  const list2 = upsertAttack(list1.map((x) => (x.itemId ? { ...x, equipped: true, slot: 'mainHand', mastery: 'Hendedura' } : x)), a2);
  assert.strictEqual(list2.length, 2);
  assert.strictEqual(list2[0], manual);
  assert.strictEqual(list2[1].attackBonusMod, 2);
  assert.strictEqual(list2[1].id, a1.id);
  assert.strictEqual(list2[1].equipped, true);
  assert.strictEqual(list2[1].mastery, 'Hendedura');
});
