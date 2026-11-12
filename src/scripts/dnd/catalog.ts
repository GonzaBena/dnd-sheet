// src/scripts/dnd/catalog.ts
// Adaptadores y validaciones puras del catálogo (Spec 07, Fase C).
import type { CatalogEntry, CatalogKind } from '../models/catalog.ts';
import type { Modifier } from '../models/effect.ts';
import type { ArmorData, WeaponData } from '../models/character.ts';
import { normalizeStatName } from './stats.ts';

type Raw = Record<string, unknown>;

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);
const nameOf = (v: unknown): string | undefined =>
  v && typeof v === 'object' ? str((v as Raw).name) : undefined;

/** Escapa texto de usuario antes de insertarlo en un template HTML. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const catIndexes = (r: Raw): string[] => {
  const out: string[] = [];
  const one = (c: unknown) => {
    const i = c && typeof c === 'object' ? str((c as Raw).index) : undefined;
    if (i) out.push(i.toLowerCase());
  };
  one(r.equipment_category);
  if (Array.isArray(r.equipment_categories)) r.equipment_categories.forEach(one);
  return out;
};

const ARMOR_CATEGORY_BY_INDEX: Record<string, ArmorData['category']> = {
  'light-armor': 'light', 'medium-armor': 'medium', 'heavy-armor': 'heavy', shield: 'shield', shields: 'shield',
};

/**
 * Armadura/escudo del SRD → `ArmorData` (FB-2). Devuelve `undefined` si no es una armadura o no trae una CA base válida.
 * DECISION (FB-2): la categoría sale de los `index` de `equipment_categories` (no de los nombres, que se traducen).
 *  - El escudo se llama `shields` en ambas ediciones del SRD (el plan hablaba de `shield`): se aceptan los dos.
 *  - `dex_bonus` falso → `dexCap: 0` (sin DES); `max_bonus` manda sobre lo anterior (2024 trae `max_bonus: 0` en la pesada);
 *    `dex_bonus` verdadero sin `max_bonus` → `dexCap: null` (sin tope). El escudo no lleva `dexCap`: su `baseAc` es un bono.
 * DECISION (FB-4): si el SRD no trae un dato se omite el campo; sin `base` numérico no hay `ArmorData` (objeto común).
 */
export function armorFromSrd(raw: unknown): ArmorData | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Raw;
  const category = catIndexes(r).map((i) => ARMOR_CATEGORY_BY_INDEX[i]).find(Boolean);
  const ac = r.armor_class && typeof r.armor_class === 'object' ? (r.armor_class as Raw) : undefined;
  if (!category || !ac || typeof ac.base !== 'number' || !Number.isFinite(ac.base) || ac.base <= 0) return undefined;

  const armor: ArmorData = { category, baseAc: ac.base };
  if (category !== 'shield') {
    if (typeof ac.max_bonus === 'number') armor.dexCap = ac.max_bonus;
    else if (ac.dex_bonus === false) armor.dexCap = 0;
    else if (ac.dex_bonus === true) armor.dexCap = null;
  }
  if (typeof r.str_minimum === 'number' && r.str_minimum > 0) armor.strMin = r.str_minimum;
  if (r.stealth_disadvantage === true) armor.stealthDisadv = true;
  return armor;
}

/**
 * Arma del SRD → `WeaponData` + manos (FB-3). Devuelve `undefined` si no es un arma con dado de daño.
 * DECISION (FB-3): `weapon_category` solo existe en 2014; en 2024 la categoría se deduce de `simple-weapons`/`martial-weapons`.
 * `two_handed_damage` cuelga de la raíz del arma (no de la propiedad `versatile`). Las armas con `two-handed` usan 2 manos.
 * DECISION (FB-4): alcance, versátil y demás se omiten si el SRD no los trae.
 */
export function weaponFromSrd(raw: unknown): { weapon: WeaponData; hands: 1 | 2 } | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Raw;
  const cats = catIndexes(r);
  const wc = (str(r.weapon_category) ?? '').toLowerCase();
  const category: WeaponData['category'] | undefined =
    wc === 'simple' || cats.includes('simple-weapons') ? 'simple'
      : wc === 'martial' || cats.includes('martial-weapons') ? 'martial' : undefined;
  const dmg = r.damage && typeof r.damage === 'object' ? (r.damage as Raw) : undefined;
  const damageDice = str(dmg?.damage_dice);
  if (!category || !dmg || !damageDice) return undefined;

  const typeObj = dmg.damage_type && typeof dmg.damage_type === 'object' ? (dmg.damage_type as Raw) : undefined;
  const damageType = str(typeObj?.index) ?? str(typeObj?.name) ?? '';
  const properties = Array.isArray(r.properties)
    ? (r.properties as unknown[]).map((p) => (p && typeof p === 'object' ? str((p as Raw).index) : undefined)).filter((x): x is string => !!x)
    : [];

  const weapon: WeaponData = { category, damageDice, damageType, properties };
  const range = r.range && typeof r.range === 'object' ? (r.range as Raw) : undefined;
  if (range && typeof range.normal === 'number') {
    weapon.range = { normal: range.normal, long: typeof range.long === 'number' ? range.long : range.normal };
  }
  const two = r.two_handed_damage && typeof r.two_handed_damage === 'object' ? (r.two_handed_damage as Raw) : undefined;
  const versatileDice = str(two?.damage_dice);
  if (versatileDice) weapon.versatileDice = versatileDice;
  return { weapon, hands: properties.includes('two-handed') ? 2 : 1 };
}

export type EquipInputResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Entero opcional dentro de [min, max]. Vacío → `undefined`; cualquier otra cosa fuera de rango → error. */
function intInRange(label: string, raw: unknown, min: number, max: number): EquipInputResult<number | undefined> {
  const t = String(raw ?? '').trim();
  if (!t) return { ok: true, value: undefined };
  const n = Number(t);
  if (!Number.isInteger(n) || n < min || n > max) {
    return { ok: false, error: `${label}: debe ser un entero entre ${min} y ${max}.` };
  }
  return { ok: true, value: n };
}

/**
 * FB-5: valida los campos de una armadura propia (todo llega como texto del formulario).
 * `dexCap` vacío = sin tope (`null`); `0` = sin DES.
 */
export function parseArmorInput(input: {
  category: string; baseAc: string; dexCap: string; strMin: string; stealthDisadv: boolean; bonus: string;
}): EquipInputResult<ArmorData> {
  const category = input.category as ArmorData['category'];
  if (!['light', 'medium', 'heavy', 'shield'].includes(category)) return { ok: false, error: 'Armadura: elige una categoría.' };
  const base = intInRange('CA base', input.baseAc, 1, 30);
  if (!base.ok) return base;
  if (base.value === undefined) return { ok: false, error: 'CA base: es obligatoria.' };
  const dex = intInRange('Tope de DES', input.dexCap, 0, 10);
  if (!dex.ok) return dex;
  const str = intInRange('FUE mínima', input.strMin, 0, 30);
  if (!str.ok) return str;
  const bonus = intInRange('Bono', input.bonus, -5, 10);
  if (!bonus.ok) return bonus;

  const armor: ArmorData = { category, baseAc: base.value };
  if (category !== 'shield') armor.dexCap = dex.value === undefined ? null : dex.value;
  if (str.value) armor.strMin = str.value;
  if (input.stealthDisadv) armor.stealthDisadv = true;
  if (bonus.value) armor.bonus = bonus.value;
  return { ok: true, value: armor };
}

const DICE_RE = /^\d{1,2}d\d{1,3}$/i;

/** FB-5: valida los campos de un arma propia. Las propiedades se separan por comas; `two-handed` implica 2 manos. */
export function parseWeaponInput(input: {
  category: string; damageDice: string; damageType: string; properties: string;
  rangeNormal: string; rangeLong: string; versatileDice: string; magicBonus: string;
}): EquipInputResult<{ weapon: WeaponData; hands: 1 | 2 }> {
  const category = input.category as WeaponData['category'];
  if (!['simple', 'martial'].includes(category)) return { ok: false, error: 'Arma: elige una categoría.' };
  const dice = input.damageDice.trim();
  if (!DICE_RE.test(dice)) return { ok: false, error: 'Dado de daño: usa el formato NdM (por ejemplo 1d8).' };
  const versatile = input.versatileDice.trim();
  if (versatile && !DICE_RE.test(versatile)) return { ok: false, error: 'Dado versátil: usa el formato NdM (por ejemplo 1d10).' };
  const damageType = input.damageType.trim();
  if (damageType.length > 30) return { ok: false, error: 'Tipo de daño: máximo 30 caracteres.' };
  const properties = input.properties.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (properties.length > 12 || properties.some((p) => p.length > 30)) {
    return { ok: false, error: 'Propiedades: hasta 12, de máximo 30 caracteres cada una.' };
  }
  const normal = intInRange('Alcance normal', input.rangeNormal, 1, 1000);
  if (!normal.ok) return normal;
  const long = intInRange('Alcance largo', input.rangeLong, 1, 2000);
  if (!long.ok) return long;
  if (long.value !== undefined && normal.value === undefined) return { ok: false, error: 'Alcance largo: indica también el alcance normal.' };
  if (normal.value !== undefined && long.value !== undefined && long.value < normal.value) {
    return { ok: false, error: 'Alcance largo: no puede ser menor que el normal.' };
  }
  const bonus = intInRange('Bono mágico', input.magicBonus, -5, 10);
  if (!bonus.ok) return bonus;

  const weapon: WeaponData = { category, damageDice: dice.toLowerCase(), damageType, properties };
  if (normal.value !== undefined) weapon.range = { normal: normal.value, long: long.value ?? normal.value };
  if (versatile) weapon.versatileDice = versatile.toLowerCase();
  if (bonus.value) weapon.magicBonus = bonus.value;
  return { ok: true, value: { weapon, hands: properties.includes('two-handed') ? 2 : 1 } };
}

/**
 * Adaptador SRD → CatalogEntry.
 * DECISION: las dos ediciones del SRD difieren y se cubren ambas sin ramificar por edición:
 *  - Descripción: 2014 usa `desc: string[]` (+ `higher_level: string[]` en conjuros); 2024 usa `description: string`.
 *  - Conjuros: 2024 trae `level`/`school` igual que 2014, pero `damage` es objeto (2024) o arreglo (2014); no se mapea el daño.
 *  - Equipo 2014 trae `equipment_category`; 2024 solo `equipment_categories[]`. Se toma la primera disponible.
 *  - Dotes: 2024 trae `type` ('origin', …); 2014 no (solo `prerequisites`).
 *  - `image` de los objetos mágicos es una ruta relativa de la API, no una URL https: no se usa como `imageUrl`.
 * Los campos ausentes quedan `undefined` en `meta` y no rompen.
 */
export function srdToEntry(kind: CatalogKind, raw: Raw): CatalogEntry {
  const r = raw ?? {};
  let description = '';
  if (Array.isArray(r.desc)) description = r.desc.filter((x) => typeof x === 'string').join('\n');
  else if (typeof r.description === 'string') description = r.description;
  if (Array.isArray(r.higher_level) && r.higher_level.length) {
    description += `${description ? '\n' : ''}A niveles superiores: ${r.higher_level.join(' ')}`;
  }

  let meta: Record<string, unknown> = {};
  if (kind === 'spell') {
    meta = {
      level: typeof r.level === 'number' ? r.level : undefined,
      school: nameOf(r.school),
      castingTime: str(r.casting_time),
      range: str(r.range),
      components: Array.isArray(r.components) ? r.components.join(', ') : undefined,
      material: str(r.material),
      duration: str(r.duration),
      concentration: typeof r.concentration === 'boolean' ? r.concentration : undefined,
      ritual: typeof r.ritual === 'boolean' ? r.ritual : undefined,
    };
  } else if (kind === 'item') {
    const cats = Array.isArray(r.equipment_categories) ? (r.equipment_categories as unknown[]) : [];
    const cost = r.cost && typeof r.cost === 'object' ? (r.cost as Raw) : undefined;
    meta = {
      category: nameOf(r.equipment_category) ?? nameOf(cats[0]),
      rarity: nameOf(r.rarity),
      weight: typeof r.weight === 'number' ? r.weight : undefined,
      cost: cost ? `${cost.quantity} ${cost.unit}` : undefined,
      attunement: typeof r.attunement === 'boolean' ? r.attunement : undefined,
    };
    // FB-1: los datos estructurados tienen la misma forma que ArmorData/WeaponData y se copian al inventario.
    const armor = armorFromSrd(r);
    const w = armor ? undefined : weaponFromSrd(r);
    if (armor) meta.armor = armor;
    if (w) { meta.weapon = w.weapon; meta.hands = w.hands; }
    if (r.requires_attunement === true) meta.requiresAttunement = true;
  } else {
    meta = {
      type: str(r.type),
      prerequisites: Array.isArray(r.prerequisites) ? r.prerequisites : undefined,
    };
  }

  return {
    id: `srd:${kind}:${str(r.index) ?? str(r.name) ?? 'sin-id'}`,
    kind,
    source: 'srd',
    name: str(r.name) ?? '',
    description,
    meta,
  };
}

interface ThingLike {
  id?: string;
  name?: string;
  title?: string;
  description?: string;
  notes?: string;
  source?: 'srd' | 'custom';
  custom?: boolean;
  imageUrl?: string;
  effects?: Modifier[];
  [key: string]: unknown;
}

/**
 * Convierte un objeto, hechizo o rasgo existente al esquema común.
 * DECISION (FC-2): `source` ausente se interpreta como 'custom' (lo cargado a mano), salvo que el elemento
 * tenga `srdIndex`, que se toma como 'srd'. Los modales actuales no guardan `srdIndex`; el origen SRD se
 * marca explícitamente con `source: 'srd'` al agregar desde el compendio.
 */
export function toCatalogEntry(kind: CatalogKind, thing: ThingLike): CatalogEntry {
  const source: 'srd' | 'custom' =
    thing.source ?? (thing.custom ? 'custom' : thing.srdIndex ? 'srd' : 'custom');
  const name = thing.name ?? thing.title ?? '';
  let description = '';
  let meta: Record<string, unknown> = {};
  if (kind === 'item') {
    description = thing.description ?? thing.notes ?? '';
    meta = {
      category: thing.category,
      quantity: thing.quantity,
      weightLb: thing.weightLb,
      usableType: thing.usableType,
      healAmount: thing.healAmount,
      activationCondition: thing.activationCondition,
      notes: thing.notes,
      armor: thing.armor,
      weapon: thing.weapon,
      hands: thing.hands,
      requiresAttunement: thing.requiresAttunement,
      attuned: thing.attuned,
    };
  } else if (kind === 'spell') {
    description = thing.notes ?? '';
    meta = {
      level: thing.level,
      school: thing.school,
      castingTime: thing.castingTime,
      range: thing.range,
      duration: thing.duration,
      components: thing.components,
      damageDice: thing.damageDice,
      damageType: thing.damageType,
    };
  } else {
    description = thing.description ?? '';
    meta = { featType: thing.featType, resourceId: thing.resourceId, uses: thing.uses };
  }
  const entry: CatalogEntry = {
    id: thing.id ?? `${source}:${kind}:${name}`,
    kind,
    source,
    name,
    description,
    meta,
  };
  if (thing.imageUrl) entry.imageUrl = thing.imageUrl;
  if (thing.effects?.length) entry.effects = thing.effects;
  return entry;
}

const MAX_URL_LENGTH = 2048;
const MAX_DATA_LENGTH = 50_000;

/**
 * FC-4: acepta `https://…` o `data:image/(png|jpeg|gif|webp);base64,…` cortas. Todo lo demás se descarta.
 * Se muestra solo en un `<img>` (nunca como HTML).
 */
export function sanitizeImageUrl(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  const value = url.trim();
  if (!value) return undefined;
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(value)) {
    return value.length <= MAX_DATA_LENGTH ? value : undefined;
  }
  if (value.length > MAX_URL_LENGTH) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname ? value : undefined;
  } catch {
    return undefined;
  }
}

const OPS: Modifier['op'][] = ['add', 'set', 'advantage', 'disadvantage', 'resistance'];

const OP_ALIASES: Record<string, Modifier['op']> = {
  add: 'add',
  '+': 'add',
  sumar: 'add',
  suma: 'add',
  set: 'set',
  '=': 'set',
  fijar: 'set',
  advantage: 'advantage',
  ventaja: 'advantage',
  disadvantage: 'disadvantage',
  desventaja: 'disadvantage',
  resistance: 'resistance',
  resistencia: 'resistance',
};

/**
 * Editor simple de efectos: una línea por modificador, `objetivo operación [valor]`
 * (por ejemplo `ac add 2`, `save.dex advantage`). Texto vacío → [].
 */
export function parseEffectsText(text: string): Modifier[] | { error: string } {
  const out: Modifier[] = [];
  const lines = String(text ?? '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) continue;
    // Limpiar comillas iniciales y finales si el usuario copió o pegó con comillas
    line = line.replace(/^["'`]/, '').replace(/["'`]$/, '').trim();
    if (!line) continue;
    const n = i + 1;
    const [target, rawOp, ...rest] = line.split(/\s+/);
    if (!target || !rawOp) return { error: `Línea ${n}: usa "objetivo operación valor" (ej: ac add 2).` };
    if (!/^[a-z][a-z0-9_-]*(\.[a-z0-9_-]+)*$/i.test(target)) {
      return { error: `Línea ${n}: el objetivo "${target}" no es válido.` };
    }
    const op = OP_ALIASES[rawOp.toLowerCase()];
    if (!op) {
      return { error: `Línea ${n}: operación "${rawOp}" desconocida (${OPS.join(', ')}).` };
    }
    const rawValue = rest.join(' ').trim();
    if (!rawValue && (op === 'add' || op === 'set')) {
      return { error: `Línea ${n}: "${op}" necesita un valor numérico o una característica (ej: 2, wis, sab).` };
    }
    const mod: Modifier = { target, op };
    if (op === 'add' || op === 'set') {
      const cleanVal = rawValue.replace(/^\+\s*/, '').trim();
      const num = Number(cleanVal);
      if (Number.isFinite(num)) {
        mod.value = num;
      } else {
        const statRef = normalizeStatName(rawValue);
        if (statRef) {
          mod.value = statRef;
        } else {
          return { error: `Línea ${n}: "${op}" necesita un valor numérico o una característica válida (ej: 2, wis, sab).` };
        }
      }
    } else if (rawValue) {
      mod.value = rawValue;
    }
    out.push(mod);
  }
  return out;
}

/** Inverso de `parseEffectsText`, para mostrar los efectos guardados en el cuadro de texto. */
export function effectsToText(effects: Modifier[] | undefined): string {
  return (effects ?? [])
    .map((m) => [m.target, m.op, m.value ?? ''].filter((x) => x !== '').join(' '))
    .join('\n');
}
