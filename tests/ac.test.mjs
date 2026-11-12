import { test } from 'node:test';
import assert from 'node:assert';
import { computeAc, getArmorClass, migrateArmorClass } from '../src/scripts/dnd/ac.ts';

const scoreFor = (mod) => 10 + mod * 2;
const char = ({ dex = 0, con = 0, wis = 0, className = 'Guerrero', inventory = [], activeEffects = [], ...rest } = {}) => ({
  className,
  stats: { dex: { score: scoreFor(dex) }, con: { score: scoreFor(con) }, wis: { score: scoreFor(wis) } },
  inventory,
  activeEffects,
  ...rest,
});
const armor = (name, category, baseAc, extra = {}, item = {}) => ({
  id: name, name, quantity: 1, category: 'armor', equipped: true, slot: 'body',
  armor: { category, baseAc, ...extra }, ...item,
});
const shield = (extra = {}) => ({
  id: 'shield', name: 'Escudo', quantity: 1, category: 'armor', equipped: true, slot: 'shield',
  armor: { category: 'shield', baseAc: 2, ...extra },
});
const ring = (extra = {}) => ({
  id: 'ring', name: 'Anillo de Protección', quantity: 1, category: 'gear', equipped: true, slot: 'ring1',
  requiresAttunement: true, attuned: true, effects: [{ target: 'ac', op: 'add', value: 1 }], ...extra,
});
const fx = (modifiers, extra = {}) => ({
  id: 'fx', name: 'Efecto', sourceType: 'custom', duration: { kind: 'indefinite' }, appliedAt: 0, modifiers, ...extra,
});

test('sin armadura: 10 + DES', () => {
  const r = computeAc(char({ dex: 2 }));
  assert.strictEqual(r.total, 12);
  assert.strictEqual(r.formula, 'Sin armadura');
  assert.strictEqual(r.manual, false);
});

test('armaduras con tope de DES', () => {
  assert.strictEqual(computeAc(char({ dex: 3, inventory: [armor('Cuero', 'light', 11)] })).total, 14);
  assert.strictEqual(computeAc(char({ dex: 3, inventory: [armor('Camisote', 'medium', 13, { dexCap: 2 })] })).total, 15);
  assert.strictEqual(computeAc(char({ dex: 3, inventory: [armor('Cota de malla', 'heavy', 16, { dexCap: 0 })] })).total, 16);
});

test('el escudo suma sobre cualquier fórmula', () => {
  assert.strictEqual(computeAc(char({ dex: 2, inventory: [shield()] })).total, 14);
  assert.strictEqual(computeAc(char({ dex: 3, inventory: [armor('Cuero', 'light', 11), shield()] })).total, 16);
  const r = computeAc(char({ inventory: [shield()] }));
  assert.ok(r.parts.some((p) => p.label === 'Escudo +2'));
});

test('armadura mágica suma su bono', () => {
  assert.strictEqual(computeAc(char({ dex: 3, inventory: [armor('Cuero +1', 'light', 11, { bonus: 1 })] })).total, 15);
});

test('un objeto sin equipar no aporta', () => {
  assert.strictEqual(computeAc(char({ dex: 2, inventory: [armor('Cuero', 'light', 11, {}, { equipped: false })] })).total, 12);
});

test('bárbaro: 10 + DES + CON solo sin armadura', () => {
  const sin = computeAc(char({ className: 'Bárbaro', dex: 2, con: 3 }));
  assert.strictEqual(sin.total, 15);
  assert.strictEqual(sin.formula, 'Defensa sin armadura');
  const con = computeAc(char({ className: 'Bárbaro', dex: 2, con: 3, inventory: [armor('Camisote', 'medium', 13, { dexCap: 2 })] }));
  assert.strictEqual(con.total, 15); // 13 + 2: la fórmula de bárbaro ni se considera
  assert.strictEqual(con.formula, 'Armadura');
  assert.ok(!con.alternatives.some((a) => a.formula === 'Defensa sin armadura'));
  // el bárbaro conserva la fórmula con escudo
  assert.strictEqual(computeAc(char({ className: 'Barbarian', dex: 2, con: 3, inventory: [shield()] })).total, 17);
});

test('monje: 10 + DES + SAB sin armadura ni escudo', () => {
  assert.strictEqual(computeAc(char({ className: 'Monje', dex: 3, wis: 2 })).total, 15);
  const escudo = computeAc(char({ className: 'Monje', dex: 3, wis: 2, inventory: [shield()] }));
  assert.strictEqual(escudo.total, 15); // 10 + 3 + escudo 2; sin SAB
  assert.strictEqual(escudo.formula, 'Sin armadura');
});

test('Armadura de mago: 13 + DES gana sobre 10 + DES', () => {
  const mage = fx([], { sourceType: 'spell', sourceId: 'mage-armor', name: 'Armadura de mago' });
  const r = computeAc(char({ className: 'Mago', dex: 2, activeEffects: [mage] }));
  assert.strictEqual(r.total, 15);
  assert.strictEqual(r.formula, 'Armadura de mago');
  assert.ok(r.alternatives.some((a) => a.formula === 'Sin armadura' && a.total === 12));
  // con armadura equipada no aplica
  const conArmadura = computeAc(char({ dex: 2, activeEffects: [mage], inventory: [armor('Cuero', 'light', 11)] }));
  assert.strictEqual(conArmadura.formula, 'Armadura');
});

test('Anillo de Protección: exige equipado y sintonizado', () => {
  assert.strictEqual(computeAc(char({ dex: 2, inventory: [ring()] })).total, 13);
  assert.strictEqual(computeAc(char({ dex: 2, inventory: [ring({ attuned: false })] })).total, 12);
  assert.strictEqual(computeAc(char({ dex: 2, inventory: [ring({ equipped: false })] })).total, 12);
  assert.ok(computeAc(char({ inventory: [ring()] })).parts.some((p) => p.label.includes('Anillo de Protección')));
});

test('ac set reemplaza la fórmula y los add siguen sumando', () => {
  const set = fx([{ target: 'ac', op: 'set', value: 17 }]);
  const add = fx([{ target: 'ac', op: 'add', value: 2 }], { id: 'fx2' });
  const r1 = computeAc(char({ dex: 5, activeEffects: [set] }));
  assert.strictEqual(r1.total, 17);
  assert.strictEqual(r1.formula, 'Efecto');
  assert.strictEqual(computeAc(char({ dex: 5, activeEffects: [set, add] })).total, 19);
  assert.strictEqual(computeAc(char({ dex: 5, activeEffects: [add] })).total, 17);
});

test('override manual', () => {
  const r = computeAc(char({ dex: 2, armorClass: 18 }));
  assert.strictEqual(r.manual, true);
  assert.strictEqual(r.total, 18);
  assert.strictEqual(r.formula, 'Manual');
  assert.strictEqual(computeAc(char({ dex: 2, armorClass: undefined })).manual, false);
});

test('getArmorClass: forma salvaje > manual > calculada', () => {
  const base = char({ dex: 2, armorClass: 18 });
  assert.strictEqual(getArmorClass(base), 18);
  assert.strictEqual(getArmorClass(char({ dex: 2 })), 12);
  const ws = { wildShape: { usesTotal: 2, usesRemaining: 2, activeForm: { name: 'Lobo', ac: 13 } } };
  assert.strictEqual(getArmorClass({ ...base, ...ws }), 13);
  assert.strictEqual(getArmorClass({ ...base, wildShape: { ...ws.wildShape, activeForm: null } }), 18);
});

test('migración FD-6', () => {
  const same = char({ dex: 2, armorClass: 12 });
  assert.strictEqual(migrateArmorClass(same), true);
  assert.strictEqual(same.armorClass, undefined);
  assert.strictEqual(migrateArmorClass(same), false); // idempotente

  const diff = char({ dex: 2, armorClass: 16 });
  assert.strictEqual(migrateArmorClass(diff), false);
  assert.strictEqual(diff.armorClass, 16);
  assert.strictEqual(migrateArmorClass(diff), false);
});
