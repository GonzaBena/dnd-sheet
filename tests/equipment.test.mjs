import { test } from 'node:test';
import assert from 'node:assert';
import {
  MAX_ATTUNED, validSlotsFor, equipAcross, unequipAction, setActionHands, validSlotsForAction, equipItem, unequipItem, attuneItem, unattuneItem, equippedItems, migrateAttuned, wornSlotsFor, belongsToDefense,
} from '../src/scripts/dnd/equipment.ts';

const gear = (id, extra = {}) => ({ id, name: id, quantity: 1, category: 'gear', ...extra });
const sword2h = (id) => gear(id, { category: 'weapon', hands: 2 });
const sword1h = (id) => gear(id, { category: 'weapon', hands: 1 });
const shield = (id) => gear(id, { category: 'armor', armor: { category: 'shield', baseAc: 2 } });
const byId = (inv, id) => inv.find((i) => i.id === id);

test('equipItem en slot libre equipa y no desequipa nada', () => {
  const inv = [gear('casco'), gear('botas')];
  const r = equipItem(inv, 'casco', 'head');
  assert.strictEqual(r.error, undefined);
  assert.deepStrictEqual(r.unequipped, []);
  assert.strictEqual(byId(r.inventory, 'casco').equipped, true);
  assert.strictEqual(byId(r.inventory, 'casco').slot, 'head');
  assert.strictEqual(byId(inv, 'casco').equipped, undefined, 'no muta el input');
});

test('equipItem en slot ocupado desequipa el anterior y lo devuelve', () => {
  let r = equipItem([gear('a'), gear('b')], 'a', 'head');
  r = equipItem(r.inventory, 'b', 'head');
  assert.deepStrictEqual(r.unequipped.map((i) => i.id), ['a']);
  assert.strictEqual(byId(r.inventory, 'a').equipped, false);
  assert.strictEqual(byId(r.inventory, 'b').equipped, true);
});

test('arma a dos manos con escudo puesto: queda sin escudo', () => {
  let r = equipItem([shield('esc'), sword2h('mandoble')], 'esc', 'shield');
  r = equipItem(r.inventory, 'mandoble', 'mainHand');
  assert.deepStrictEqual(r.unequipped.map((i) => i.id), ['esc']);
  assert.strictEqual(byId(r.inventory, 'esc').equipped, false);
  assert.strictEqual(byId(r.inventory, 'mandoble').slot, 'mainHand');
});

test('escudo con arma en offHand: se desequipa el arma', () => {
  let r = equipItem([sword1h('daga'), shield('esc')], 'daga', 'offHand');
  r = equipItem(r.inventory, 'esc', 'shield');
  assert.deepStrictEqual(r.unequipped.map((i) => i.id), ['daga']);
});

test('escudo con arma a dos manos en mainHand: se desequipa el arma', () => {
  let r = equipItem([sword2h('mandoble'), shield('esc')], 'mandoble', 'mainHand');
  r = equipItem(r.inventory, 'esc', 'shield');
  assert.deepStrictEqual(r.unequipped.map((i) => i.id), ['mandoble']);
});

test('arma de una mano en offHand con escudo puesto: se desequipa el escudo', () => {
  let r = equipItem([shield('esc'), sword1h('daga')], 'esc', 'shield');
  r = equipItem(r.inventory, 'daga', 'offHand');
  assert.deepStrictEqual(r.unequipped.map((i) => i.id), ['esc']);
});

test('slots inválidos devuelven error y no cambian nada', () => {
  const inv = [shield('esc'), sword2h('mandoble'), gear('casco')];
  assert.ok(equipItem(inv, 'esc', 'mainHand').error);
  assert.ok(equipItem(inv, 'mandoble', 'offHand').error);
  assert.ok(equipItem(inv, 'nope', 'head').error);
  assert.deepStrictEqual(equipItem(inv, 'esc', 'mainHand').inventory, inv);
});

test('escudo creado a mano (sin datos de armadura) solo va al slot shield', () => {
  const inv = [gear('Escudo de roble', { name: 'Escudo de roble', category: 'armor' }), gear('Escudo', { category: 'gear' })];
  for (const id of ['Escudo de roble', 'Escudo']) {
    assert.deepStrictEqual(validSlotsFor(byId(inv, id)), ['shield']);
    assert.ok(equipItem(inv, id, 'head').error);
    assert.ok(equipItem(inv, id, 'ring1').error);
    assert.strictEqual(equipItem(inv, id, 'shield').error, undefined);
  }
});

test('armadura sin datos va al cuerpo; un objeto común no puede ir al slot shield', () => {
  const inv = [gear('cota', { category: 'armor' }), gear('casco')];
  assert.deepStrictEqual(validSlotsFor(byId(inv, 'cota')), ['body']);
  assert.ok(equipItem(inv, 'casco', 'shield').error);
  assert.ok(equipItem(inv, 'casco', 'body').error);
});

test('dos anillos conviven; un tercero en ring1 reemplaza al primero', () => {
  let r = equipItem([gear('r1'), gear('r2'), gear('r3')], 'r1', 'ring1');
  r = equipItem(r.inventory, 'r2', 'ring2');
  assert.deepStrictEqual(r.unequipped, []);
  r = equipItem(r.inventory, 'r3', 'ring1');
  assert.deepStrictEqual(r.unequipped.map((i) => i.id), ['r1']);
  assert.strictEqual(byId(r.inventory, 'r2').equipped, true);
  assert.strictEqual(equippedItems(r.inventory).length, 2);
});

test('mover un objeto equipado a otro slot libera el anterior', () => {
  let r = equipItem([gear('r1')], 'r1', 'ring1');
  r = equipItem(r.inventory, 'r1', 'ring2');
  assert.deepStrictEqual(r.unequipped, []);
  assert.strictEqual(byId(r.inventory, 'r1').slot, 'ring2');
});

test('attuneItem: tres pasan; el cuarto da error y deja el inventario igual', () => {
  let inv = [gear('a'), gear('b'), gear('c'), gear('d')];
  for (const id of ['a', 'b', 'c']) {
    const r = attuneItem(inv, id);
    assert.strictEqual(r.error, undefined);
    inv = r.inventory;
  }
  assert.strictEqual(MAX_ATTUNED, 3);
  const r = attuneItem(inv, 'd');
  assert.ok(r.error && r.error.includes('3'));
  assert.deepStrictEqual(r.inventory, inv);
  assert.strictEqual(byId(r.inventory, 'd').attuned, undefined);
});

test('unattuneItem libera un cupo', () => {
  let inv = [gear('a', { attuned: true }), gear('b', { attuned: true }), gear('c', { attuned: true }), gear('d')];
  inv = unattuneItem(inv, 'a');
  assert.strictEqual(byId(inv, 'a').attuned, false);
  assert.strictEqual(attuneItem(inv, 'd').error, undefined);
});

test('unequipItem conserva attuned', () => {
  let r = equipItem([gear('capa', { attuned: true })], 'capa', 'cloak');
  const inv = unequipItem(r.inventory, 'capa');
  assert.strictEqual(byId(inv, 'capa').equipped, false);
  assert.strictEqual(byId(inv, 'capa').slot, undefined);
  assert.strictEqual(byId(inv, 'capa').attuned, true);
});

test('migrateAttuned: con y sin objeto equivalente', () => {
  const char = {
    inventory: [gear('x', { name: 'Capa del Murciélago' })],
    attunedItems: [
      { name: 'capa del murciélago', description: 'd1', icon: 'i1' },
      { name: 'Amuleto', description: 'Brilla', icon: 'star' },
      { name: 'Ranura Libre', description: '', icon: '' },
    ],
  };
  assert.strictEqual(migrateAttuned(char), true);
  assert.strictEqual(char.inventory.length, 2);
  assert.strictEqual(byId(char.inventory, 'x').attuned, true);
  const amuleto = char.inventory.find((i) => i.name === 'Amuleto');
  assert.strictEqual(amuleto.category, 'gear');
  assert.strictEqual(amuleto.description, 'Brilla');
  assert.strictEqual(amuleto.icon, 'star');
  assert.strictEqual(amuleto.attuned, true);
  assert.deepStrictEqual(char.attunedItems, []);
});

test('migrateAttuned: más de 3 entradas, el resto queda sin sintonizar', () => {
  const char = {
    inventory: [],
    attunedItems: ['a', 'b', 'c', 'd', 'e'].map((n) => ({ name: n, description: '', icon: '' })),
  };
  migrateAttuned(char);
  assert.strictEqual(char.inventory.length, 5);
  assert.strictEqual(char.inventory.filter((i) => i.attuned).length, 3);
  assert.deepStrictEqual(char.attunedItems, []);
});

test('migrateAttuned: idempotente y tolera personaje sin attunedItems', () => {
  const char = { inventory: [], attunedItems: [{ name: 'a', description: '', icon: '' }] };
  migrateAttuned(char);
  const snapshot = JSON.stringify(char);
  assert.strictEqual(migrateAttuned(char), false);
  assert.strictEqual(JSON.stringify(char), snapshot);
  assert.strictEqual(migrateAttuned({ inventory: [] }), false);
  assert.strictEqual(migrateAttuned({ inventory: [], attunedItems: [] }), false);
});

const atk = (id, extra = {}) => ({ id, name: id, type: 'Cuerpo a cuerpo', bonus: '+5', damage: '1d8', damageType: 'cortante', tags: [], ...extra });

test('arma de la sección a dos manos con escudo del inventario: lo quita', () => {
  const inv = [shield('esc')];
  let r = equipAcross(inv, [atk('mandoble', { hands: 2 })], 'esc', 'shield');
  r = equipAcross(r.inventory, r.actions, 'action:mandoble', 'mainHand');
  assert.deepStrictEqual(r.unequipped.map((i) => i.name), ['esc']);
  assert.strictEqual(byId(r.inventory, 'esc').equipped, false);
  assert.strictEqual(r.actions[0].equipped, true);
  assert.strictEqual(r.actions[0].slot, 'mainHand');
});

test('escudo del inventario con arma de la sección en offHand: quita el arma', () => {
  let r = equipAcross([shield('esc')], [atk('daga')], 'action:daga', 'offHand');
  r = equipAcross(r.inventory, r.actions, 'esc', 'shield');
  assert.deepStrictEqual(r.unequipped.map((i) => i.name), ['daga']);
  assert.strictEqual(r.actions[0].equipped, false);
  assert.strictEqual('slot' in r.actions[0], false, 'no deja slot: undefined (Firestore)');
});

test('armas: slots según manos; dos manos no admiten offHand', () => {
  assert.deepStrictEqual(validSlotsForAction(atk('a', { hands: 2 })), ['mainHand']);
  assert.deepStrictEqual(validSlotsForAction(atk('a')), ['mainHand', 'offHand']);
  const r = equipAcross([], [atk('mandoble', { hands: 2 })], 'action:mandoble', 'offHand');
  assert.ok(r.error);
});

test('dos armas de una mano conviven; una tercera en mainHand reemplaza la primera', () => {
  let r = equipAcross([], [atk('a'), atk('b'), atk('c')], 'action:a', 'mainHand');
  r = equipAcross(r.inventory, r.actions, 'action:b', 'offHand');
  assert.deepStrictEqual(r.unequipped, []);
  r = equipAcross(r.inventory, r.actions, 'action:c', 'mainHand');
  assert.deepStrictEqual(r.unequipped.map((i) => i.name), ['a']);
});

test('cambiar manos desequipa el arma; unequipAction limpia el slot', () => {
  let r = equipAcross([], [atk('a')], 'action:a', 'offHand');
  const changed = setActionHands(r.actions, 'a', 2);
  assert.strictEqual(changed[0].equipped, false);
  assert.strictEqual(changed[0].hands, 2);
  assert.strictEqual('slot' in changed[0], false);
  const un = unequipAction(r.actions, 'a');
  assert.strictEqual(un[0].equipped, false);
  assert.strictEqual('slot' in un[0], false);
});

test('wornSlotsFor: un objeto genérico no se ofrece en ningún slot de prenda', () => {
  assert.deepStrictEqual(wornSlotsFor(gear('flecha', { name: 'Flecha' })), []);
  assert.deepStrictEqual(wornSlotsFor(gear('cuerda', { name: 'Cuerda de seda' })), []);
  assert.deepStrictEqual(wornSlotsFor(gear('poc', { category: 'potion', name: 'Poción de anillo' })), []);
  assert.deepStrictEqual(wornSlotsFor(sword1h('espada')), []);
});

test('wornSlotsFor: se infiere el slot por el nombre', () => {
  const w = (name) => wornSlotsFor(gear('x', { name }));
  assert.deepStrictEqual(w('Casco de hierro'), ['head']);
  assert.deepStrictEqual(w('Amuleto de salud'), ['neck']);
  assert.deepStrictEqual(w('Anillo de protección'), ['ring1', 'ring2']);
  assert.deepStrictEqual(w('Capa del Murciélago'), ['cloak']);
  assert.deepStrictEqual(w('Guantes de ogro'), ['gloves']);
  assert.deepStrictEqual(w('Botas élficas'), ['boots']);
  assert.deepStrictEqual(w('Medallón de Pensamientos'), ['neck']);
  assert.deepStrictEqual(w('Capacete'), []);
});

test('belongsToDefense: defensa fuera de la mochila, anillos y amuletos dentro', () => {
  const d = (name, extra = {}) => belongsToDefense(gear('x', { name, ...extra }));
  assert.strictEqual(d('Armadura de cuero'), true);
  assert.strictEqual(d('Casco de hierro'), true);
  assert.strictEqual(d('Botas élficas'), true);
  assert.strictEqual(belongsToDefense(shield('esc')), true);
  assert.strictEqual(d('Anillo de protección'), false);
  assert.strictEqual(d('Amuleto de salud'), false);
  assert.strictEqual(d('Cuerda de seda'), false);
  assert.strictEqual(d('Anillo de protección', { equipped: true, slot: 'ring1' }), true);
});

test('wornSlotsFor: armadura y escudo van a cuerpo y escudo', () => {
  assert.deepStrictEqual(wornSlotsFor(gear('cota', { category: 'armor', armor: { category: 'heavy', baseAc: 16 } })), ['body']);
  assert.deepStrictEqual(wornSlotsFor(shield('esc')), ['shield']);
  assert.deepStrictEqual(wornSlotsFor(gear('v', { category: 'armor', name: 'Armadura de cuero con capucha', armor: { category: 'light', baseAc: 11 } })), ['body']);
});
