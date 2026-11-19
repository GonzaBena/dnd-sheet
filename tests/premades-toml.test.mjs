// tests/premades-toml.test.mjs
// Personajes prehechos definidos en src/data/premades/*.toml (generados por scripts/build-premades.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadPremades, renderPremadesSource, OUTPUT_FILE } from '../scripts/build-premades.mjs';

const { PREMADE_CHARACTERS, buildCharacterFromPremade, buildFullPremadeCharacter } = await import(
  '../src/scripts/data/premadeCharacters.ts'
);
const { defaultCharacter } = await import('../src/scripts/data/defaultCharacter.ts');

/** Crea una carpeta temporal con un _objetos.toml y un personaje mínimo al que se le agrega `extra`. */
function tempPremades(extra, objetos = '') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'premades-'));
  fs.writeFileSync(path.join(dir, '_objetos.toml'), objetos);
  fs.writeFileSync(
    path.join(dir, '01-test.toml'),
    `id = "premade-test"
class = "Guerrero"
name = "Prueba"
title = "T"
race = "Humano"
subclass = "Campeón"
description = "D"
avatar = 1
hp_max = 12
speed_ft = 30

[stats]
str = 10
dex = 10
con = 10
int = 10
wis = 10
cha = 10
${extra}`
  );
  return dir;
}

const errorsOf = (dir) => {
  try {
    loadPremades(dir);
    return [];
  } catch (e) {
    return e.premadeErrors ?? [e.message];
  }
};

const RING = `
[anillo]
name = "Anillo de Protección"
category = "treasure"
requires_attunement = true

[[anillo.effects]]
target = "ac"
op = "add"
value = 1
`;

test('premades.generated.ts está al día con los TOML', () => {
  assert.equal(fs.readFileSync(OUTPUT_FILE, 'utf8'), renderPremadesSource(), 'Corré `pnpm premades`');
});

test('los TOML del repo son válidos y hay uno por clase con el modo demo sin Atlas', () => {
  const chars = loadPremades();
  assert.equal(chars.length, 12);
  assert.equal(PREMADE_CHARACTERS.find((p) => p.name.includes('Atlas'))?.demo, false);
  assert.ok(PREMADE_CHARACTERS.filter((p) => p.demo).length >= 10);
});

test('la Poción de Curación cura un número de PG (no un texto)', () => {
  for (const p of PREMADE_CHARACTERS) {
    const potion = p.items.find((i) => i.category === 'potion');
    assert.ok(potion, `${p.name} debería tener una poción`);
    assert.equal(typeof potion.healAmount, 'number');
    assert.equal(potion.healAmount, 7);
    assert.equal(potion.usableType, 'drinkable');
    assert.equal(potion.healDice, '2d4+2');
  }
});

test('un prehecho creado desde el modal no hereda objetos, sintonizaciones ni rasgos de Atlas', () => {
  const atlasItemIds = new Set(defaultCharacter.inventory.map((i) => i.id));
  const atlasSpellIds = new Set(defaultCharacter.spellcasting.spells.map((s) => s.id));
  for (const p of PREMADE_CHARACTERS) {
    const built = buildCharacterFromPremade(p);
    assert.equal(built.level, 1);
    assert.equal(built.subclass, p.subclass);
    assert.deepEqual(built.attunedItems, []);
    assert.equal(built.inventory.filter((i) => i.attuned).length, 0, `${p.name} no debería tener nada sintonizado`);
    assert.ok(built.inventory.every((i) => !atlasItemIds.has(i.id)), `${p.name} trae objetos de Atlas`);
    assert.ok(built.spellcasting.spells.every((s) => !atlasSpellIds.has(s.id)), `${p.name} trae conjuros de Atlas`);
    assert.ok(built.features.every((f) => !f.title.includes('Umbrío')), `${p.name} trae rasgos de Atlas`);
    assert.deepEqual(
      built.skills.filter((s) => s.proficient).map((s) => s.id).sort(),
      [...p.skills].sort(),
      `${p.name}: las competencias tienen que ser las del TOML`
    );
    assert.ok(p.skills.length >= 4, `${p.name} debería tener al menos 4 habilidades competentes`);
    assert.deepEqual(built.skills.filter((s) => s.expertise).map((s) => s.id).sort(), [...p.expertise].sort());
    assert.equal(built.inspiration, false);
    assert.equal(built.hp.max, p.hpMax);
    assert.equal(built.id, undefined, 'el id lo asigna createCharacter');
    const quick = built.inventory.find((i) => i.id === built.quickSlotItemId);
    assert.equal(quick?.category, 'potion', 'el acceso rápido apunta a la poción propia');
  }
});

test('objetos con sintonización: el campo se respeta y el efecto solo cuenta sintonizado', () => {
  const build = (attuned) => {
    const [data] = loadPremades(
      tempPremades(`\n[[items]]\nref = "anillo"\nequipped = true\nslot = "ring1"\nattuned = ${attuned}\n`, RING)
    );
    const template = { ...data, avatarUrl: '/characters/ch-1.avif', classIconSvg: '<svg/>' };
    return { data, char: buildFullPremadeCharacter(template, 3) };
  };
  const on = build(true);
  const off = build(false);
  const ring = on.data.items.find((i) => i.id === 'anillo');
  assert.equal(ring.requiresAttunement, true);
  assert.equal(ring.attuned, true);
  assert.equal(off.data.items.find((i) => i.id === 'anillo').attuned, false);
  assert.deepEqual(ring.effects, [{ target: 'ac', op: 'add', value: 1 }]);
  assert.ok(on.char.inventory.find((i) => i.id === 'anillo').attuned);
});

test('la validación rechaza configuraciones inválidas con mensajes claros', () => {
  const cases = [
    [`\n[[items]]\nname = "Gema"\ncategory = "treasure"\nattuned = true\n`, /requires_attunement/],
    [
      [1, 2, 3, 4].map((n) => `\n[[items]]\nref = "anillo"\nid = "a${n}"\nattuned = true\n`).join(''),
      /4 objetos sintonizados.*máximo es 3/,
    ],
    [`\n[[items]]\nref = "no-existe"\n`, /no existe el objeto "no-existe"/],
    [`\n[[items]]\nref = "kit-fighter-longsword"\nequipped = true\nslot = "manoPrincipal"\n`, /"slot" "manoPrincipal" no es válido/],
    [`\n[[items]]\nname = "Yelmo"\ncategory = "gear"\nequipped = true\n`, /necesita "slot"/],
    [`\n[[items]]\nref = "anillo"\n\n[[items]]\nref = "anillo"\n`, /está repetido/],
    [`\n[[items]]\nref = "anillo"\nequiped = true\n`, /clave desconocida "equiped"/],
    [`\n[[items]]\nname = "Elixir"\ncategory = "potion"\nheal_amount = "2d4+2"\n`, /heal_amount/],
    [
      `\n[[items]]\nref = "kit-fighter-longsword"\nequipped = true\nslot = "mainHand"\n\n[[items]]\nref = "kit-paladin-longsword"\nequipped = true\nslot = "mainHand"\n`,
      /mismo slot "mainHand"/,
    ],
  ];
  for (const [extra, pattern] of cases) {
    const errors = errorsOf(tempPremades(extra, RING));
    assert.ok(errors.some((e) => pattern.test(e)), `esperaba ${pattern} en:\n${errors.join('\n')}`);
  }
});

test('la validación rechaza claves de personaje mal escritas y habilidades inexistentes', () => {
  // Las claves sueltas tienen que ir antes de [stats]: se agregan en otro archivo para no romper el TOML.
  const dir = tempPremades('');
  const file = path.join(dir, '01-test.toml');
  fs.writeFileSync(file, `velocidad = 30\nskills = ["sigilo"]\n` + fs.readFileSync(file, 'utf8'));
  const errors = errorsOf(dir);
  assert.ok(errors.some((e) => /clave desconocida "velocidad"/.test(e)));
  assert.ok(errors.some((e) => /"sigilo" no es una habilidad/.test(e)));
});
