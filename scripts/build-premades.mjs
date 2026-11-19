#!/usr/bin/env node
// scripts/build-premades.mjs
// Genera src/scripts/data/premades.generated.ts a partir de src/data/premades/*.toml.
//
//   node scripts/build-premades.mjs          → valida y escribe el archivo generado
//   node scripts/build-premades.mjs --check  → valida y falla si el archivo generado está desactualizado
//
// DECISION: el TOML se convierte a TS al generar (no en el navegador ni con un plugin de Vite) porque
// los tests corren con `node --test` importando .ts directamente y Node no sabe importar .toml.
// El archivo generado se versiona; un test verifica que esté al día.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';
import { CLASS_STARTER_KITS } from '../src/scripts/data/classStarterKits.ts';
import { CHARACTER_CLASSES } from '../src/scripts/dnd/classes.ts';
import { EQUIP_SLOTS, MAX_ATTUNED } from '../src/scripts/dnd/equipment.ts';
import { CHARACTER_PRESET_IMAGES } from '../src/scripts/data/characterAvatars.ts';
import { STANDARD_5E_SKILLS } from '../src/scripts/dnd/calculations.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PREMADES_DIR = path.join(ROOT, 'src/data/premades');
export const OUTPUT_FILE = path.join(ROOT, 'src/scripts/data/premades.generated.ts');

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const ITEM_CATEGORIES = ['potion', 'gear', 'treasure', 'weapon', 'armor'];
const USABLE_TYPES = ['none', 'potion', 'drinkable', 'edible', 'usable'];
const SKILL_IDS = STANDARD_5E_SKILLS.map((s) => s.id);
const DICE_RE = /^\d+d\d+([+-]\d+)?$/;

const CHARACTER_KEYS = [
  'id', 'class', 'name', 'title', 'race', 'subclass', 'alignment', 'description', 'avatar',
  'speed_ft', 'hp_max', 'gold', 'demo', 'skills', 'expertise', 'spells', 'stats', 'items',
];
const ITEM_KEYS = [
  'ref', 'id', 'name', 'quantity', 'category', 'equipped', 'slot', 'hands', 'requires_attunement',
  'attuned', 'description', 'icon', 'usable_type', 'heal_amount', 'heal_dice', 'activation_condition',
  'notes', 'weight_lb', 'weapon', 'armor', 'effects',
];
const MODIFIER_OPS = ['add', 'set', 'advantage', 'disadvantage', 'resistance'];

const snakeToCamel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
function camelize(value) {
  if (Array.isArray(value)) return value.map(camelize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [snakeToCamel(k), camelize(v)]));
  }
  return value;
}
const clone = (v) => JSON.parse(JSON.stringify(v));
const list = (arr) => arr.join(', ');

/** Objetos referenciables: los del catálogo compartido (_objetos.toml) y los de los kits de clase. */
function loadItemCatalog(dir, errors) {
  const ITEMS_FILE = path.join(dir, '_objetos.toml');
  const catalog = new Map();
  for (const kit of Object.values(CLASS_STARTER_KITS)) {
    for (const item of kit.equipment) catalog.set(item.id, { item: clone(item), source: `kit ${kit.className}` });
  }
  if (!fs.existsSync(ITEMS_FILE)) return catalog;
  let raw;
  try {
    raw = parse(fs.readFileSync(ITEMS_FILE, 'utf8'));
  } catch (err) {
    errors.push(`_objetos.toml: TOML inválido — ${err.message}`);
    return catalog;
  }
  for (const [ref, def] of Object.entries(raw)) {
    const where = `_objetos.toml [${ref}]`;
    if (catalog.has(ref)) errors.push(`${where}: el id "${ref}" ya existe en ${catalog.get(ref).source}`);
    if (!def || typeof def !== 'object' || Array.isArray(def)) {
      errors.push(`${where}: debe ser una tabla`);
      continue;
    }
    if ('ref' in def) errors.push(`${where}: un objeto del catálogo no puede usar "ref"`);
    catalog.set(ref, { item: { id: ref, ...camelize(def) }, source: '_objetos.toml' });
  }
  return catalog;
}

function loadSpellCatalog() {
  const spells = new Map();
  for (const kit of Object.values(CLASS_STARTER_KITS)) {
    for (const spell of kit.spells) if (spell.id) spells.set(spell.id, clone(spell));
  }
  return spells;
}

function checkItem(item, where, errors) {
  const req = (cond, msg) => { if (!cond) errors.push(`${where}: ${msg}`); };
  req(typeof item.name === 'string' && item.name.trim(), 'falta "name"');
  req(Number.isInteger(item.quantity) && item.quantity > 0, '"quantity" debe ser un entero mayor a 0');
  req(ITEM_CATEGORIES.includes(item.category), `"category" debe ser una de: ${list(ITEM_CATEGORIES)}`);
  if (item.slot !== undefined) req(EQUIP_SLOTS.includes(item.slot), `"slot" "${item.slot}" no es válido (usá: ${list(EQUIP_SLOTS)})`);
  if (item.hands !== undefined) req(item.hands === 1 || item.hands === 2, '"hands" debe ser 1 o 2');
  if (item.usableType !== undefined) req(USABLE_TYPES.includes(item.usableType), `"usable_type" debe ser uno de: ${list(USABLE_TYPES)}`);
  if (item.healAmount !== undefined) req(Number.isInteger(item.healAmount) && item.healAmount >= 0, '"heal_amount" debe ser un entero (PG que cura)');
  if (item.healDice !== undefined) req(typeof item.healDice === 'string' && DICE_RE.test(item.healDice), `"heal_dice" debe tener forma de dados, p. ej. "2d4+2"`);
  if (item.equipped) req(!!item.slot, 'un objeto equipado necesita "slot"');
  if (item.attuned) req(item.requiresAttunement === true, '"attuned = true" requiere "requires_attunement = true"');
  if (item.category === 'weapon') req(!!item.weapon, 'un arma necesita la tabla [items.weapon]');
  if (item.weapon) {
    req(['simple', 'martial'].includes(item.weapon.category), 'weapon.category debe ser "simple" o "martial"');
    req(typeof item.weapon.damageDice === 'string' && DICE_RE.test(item.weapon.damageDice), 'weapon.damage_dice debe tener forma de dados');
    req(typeof item.weapon.damageType === 'string', 'falta weapon.damage_type');
    if (!Array.isArray(item.weapon.properties)) item.weapon.properties = [];
  }
  if (item.effects !== undefined) {
    if (!Array.isArray(item.effects)) errors.push(`${where}: "effects" debe ser una lista de [[items.effects]]`);
    else item.effects.forEach((m, j) => {
      req(m && typeof m.target === 'string' && m.target.trim(), `effects[${j}] necesita "target" (p. ej. "ac", "save.dex", "skill.stealth")`);
      req(MODIFIER_OPS.includes(m?.op), `effects[${j}].op debe ser uno de: ${list(MODIFIER_OPS)}`);
      for (const k of Object.keys(m ?? {})) req(['target', 'op', 'value', 'when'].includes(k), `effects[${j}]: clave desconocida "${k}"`);
    });
  }
  if (item.armor) {
    req(['light', 'medium', 'heavy', 'shield'].includes(item.armor.category), 'armor.category debe ser light, medium, heavy o shield');
    req(Number.isInteger(item.armor.baseAc) && item.armor.baseAc > 0, 'falta armor.base_ac');
  }
}

function buildCharacter(file, raw, itemCatalog, spellCatalog, errors) {
  const where = path.basename(file);
  const err = (msg) => errors.push(`${where}: ${msg}`);

  for (const key of Object.keys(raw)) {
    if (!CHARACTER_KEYS.includes(key)) err(`clave desconocida "${key}" (válidas: ${list(CHARACTER_KEYS)})`);
  }
  for (const key of ['id', 'class', 'name', 'title', 'race', 'subclass', 'description']) {
    if (typeof raw[key] !== 'string' || !raw[key].trim()) err(`falta "${key}" (texto)`);
  }
  if (raw.class !== undefined && !CHARACTER_CLASSES.includes(raw.class)) err(`"class" debe ser una de: ${list(CHARACTER_CLASSES)}`);
  if (!Number.isInteger(raw.avatar) || raw.avatar < 1 || raw.avatar > CHARACTER_PRESET_IMAGES.length) {
    err(`"avatar" debe ser un número de 1 a ${CHARACTER_PRESET_IMAGES.length}`);
  }
  for (const key of ['speed_ft', 'hp_max']) {
    if (!Number.isInteger(raw[key]) || raw[key] <= 0) err(`"${key}" debe ser un entero mayor a 0`);
  }
  if (raw.gold !== undefined && (!Number.isInteger(raw.gold) || raw.gold < 0)) err('"gold" debe ser un entero ≥ 0');
  if (raw.demo !== undefined && typeof raw.demo !== 'boolean') err('"demo" debe ser true o false');

  const stats = raw.stats ?? {};
  for (const ab of ABILITIES) {
    if (!Number.isInteger(stats[ab]) || stats[ab] < 1 || stats[ab] > 30) err(`stats.${ab} debe ser un entero de 1 a 30`);
  }
  for (const key of Object.keys(stats)) if (!ABILITIES.includes(key)) err(`stats.${key} no existe (usá: ${list(ABILITIES)})`);

  const skills = raw.skills ?? [];
  const expertise = raw.expertise ?? [];
  for (const [name, arr] of [['skills', skills], ['expertise', expertise]]) {
    if (!Array.isArray(arr)) { err(`"${name}" debe ser una lista`); continue; }
    for (const s of arr) if (!SKILL_IDS.includes(s)) err(`${name}: "${s}" no es una habilidad (usá: ${list(SKILL_IDS)})`);
  }
  for (const s of Array.isArray(expertise) ? expertise : []) {
    if (Array.isArray(skills) && !skills.includes(s)) err(`expertise: "${s}" también tiene que estar en "skills"`);
  }

  const spells = [];
  for (const ref of raw.spells ?? []) {
    const spell = spellCatalog.get(ref);
    if (!spell) err(`spells: no existe el conjuro "${ref}" (los conjuros salen de classStarterKits.ts)`);
    else spells.push(clone(spell));
  }

  const items = [];
  (raw.items ?? []).forEach((entry, i) => {
    const iw = `${where} items[${i}]${entry?.ref ? ` (${entry.ref})` : entry?.name ? ` (${entry.name})` : ''}`;
    for (const key of Object.keys(entry)) {
      if (!ITEM_KEYS.includes(key)) errors.push(`${iw}: clave desconocida "${key}" (válidas: ${list(ITEM_KEYS)})`);
    }
    let base = {};
    if (entry.ref !== undefined) {
      const found = itemCatalog.get(entry.ref);
      if (!found) { errors.push(`${iw}: no existe el objeto "${entry.ref}" en _objetos.toml ni en los kits de clase`); return; }
      base = clone(found.item);
    }
    const { ref, ...overrides } = camelize(entry);
    const item = { ...base, ...overrides };
    if (base.weapon && overrides.weapon) item.weapon = { ...base.weapon, ...overrides.weapon };
    if (base.armor && overrides.armor) item.armor = { ...base.armor, ...overrides.armor };
    if (!item.id) {
      item.id = `${raw.id}-${String(item.name ?? i).toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
    }
    if (!item.quantity) item.quantity = 1;
    // Sin "equipped" explícito un objeto queda guardado en la mochila; lo mismo con la sintonización.
    item.equipped = item.equipped === true;
    item.attuned = item.attuned === true;
    if (!item.equipped) { delete item.slot; }
    checkItem(item, iw, errors);
    items.push(item);
  });

  const ids = items.map((it) => it.id);
  for (const dup of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) {
    err(`el id de objeto "${dup}" está repetido; agregá "id = ..." para distinguirlos`);
  }
  const attuned = items.filter((it) => it.attuned);
  if (attuned.length > MAX_ATTUNED) {
    err(`tiene ${attuned.length} objetos sintonizados (${attuned.map((it) => it.name).join(', ')}); el máximo es ${MAX_ATTUNED}`);
  }
  const bySlot = new Map();
  for (const it of items.filter((x) => x.equipped)) {
    if (bySlot.has(it.slot)) err(`"${it.name}" y "${bySlot.get(it.slot)}" están equipados en el mismo slot "${it.slot}"`);
    bySlot.set(it.slot, it.name);
  }

  return {
    id: raw.id,
    className: raw.class,
    name: raw.name,
    title: raw.title,
    race: raw.race,
    subclass: raw.subclass,
    alignment: raw.alignment ?? 'Neutral',
    description: raw.description,
    avatar: raw.avatar,
    stats: Object.fromEntries(ABILITIES.map((ab) => [ab, stats[ab]])),
    hpMax: raw.hp_max,
    speedFt: raw.speed_ft,
    gold: raw.gold ?? 0,
    demo: raw.demo ?? true,
    skills: Array.isArray(skills) ? skills : [],
    expertise: Array.isArray(expertise) ? expertise : [],
    items,
    spells,
  };
}

/** Lee y valida todos los TOML. Devuelve los personajes o lanza un error con todos los problemas. */
export function loadPremades(dir = PREMADES_DIR) {
  const errors = [];
  const itemCatalog = loadItemCatalog(dir, errors);
  const spellCatalog = loadSpellCatalog();
  const files = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.toml') && !f.startsWith('_'))
    .sort()
    .map((f) => path.join(dir, f));

  const characters = [];
  for (const file of files) {
    let raw;
    try {
      raw = parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      errors.push(`${path.basename(file)}: TOML inválido — ${e.message}`);
      continue;
    }
    characters.push(buildCharacter(file, raw, itemCatalog, spellCatalog, errors));
  }

  const ids = characters.map((c) => c.id);
  for (const dup of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) errors.push(`id de personaje repetido: "${dup}"`);

  if (errors.length) {
    const e = new Error(`Personajes prehechos con errores:\n  - ${errors.join('\n  - ')}`);
    e.premadeErrors = errors;
    throw e;
  }
  return characters;
}

export function renderPremadesSource(characters = loadPremades()) {
  return [
    '// ARCHIVO GENERADO por scripts/build-premades.mjs a partir de src/data/premades/*.toml.',
    '// No lo edites a mano: cambiá los TOML y corré `pnpm premades`.',
    "import type { PremadeCharacterData } from './premadeCharacters.ts';",
    '',
    `export const PREMADE_DATA: readonly PremadeCharacterData[] = ${JSON.stringify(characters, null, 2)};`,
    '',
  ].join('\n');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const source = renderPremadesSource();
    const current = fs.existsSync(OUTPUT_FILE) ? fs.readFileSync(OUTPUT_FILE, 'utf8') : '';
    if (process.argv.includes('--check')) {
      if (current !== source) {
        console.error('premades.generated.ts está desactualizado: corré `pnpm premades`.');
        process.exit(1);
      }
      console.log('Personajes prehechos: OK');
    } else if (current !== source) {
      fs.writeFileSync(OUTPUT_FILE, source);
      console.log(`Personajes prehechos: generado ${path.relative(ROOT, OUTPUT_FILE)}`);
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
