// src/scripts/dnd/detailView.ts
// Lógica pura de presentación de las fichas de objeto y hechizo (Spec 07, Fase D).
// Los textos se devuelven tal cual: el escape es responsabilidad del render (textContent, FD-7).
import type { CatalogEntry } from '../models/catalog.ts';
import { FEAT_TYPE_LABELS } from '../models/catalog.ts';
import type { Modifier } from '../models/effect.ts';
import type { ArmorData, InventoryItem, WeaponData } from '../models/character.ts';
import { SLOT_LABELS, validSlotsFor } from './equipment.ts';

export type DetailContext = 'inventory' | 'spellbook' | 'compendium' | 'loot';
export type DetailAction =
  | 'equip' | 'use' | 'give' | 'drop' | 'add' | 'cast' | 'apply-effect' | 'remove';

export interface DetailField { label: string; value: string }
export interface DetailSection { title: string; rows: DetailField[] }

const has = (v: unknown): boolean => v !== undefined && v !== null && String(v).trim() !== '';
const text = (v: unknown): string => String(v).trim();

function pushIf(out: DetailField[], label: string, v: unknown, fmt: (s: string) => string = (s) => s) {
  if (has(v)) out.push({ label, value: fmt(text(v)) });
}

/** Campos de una línea que se muestran bajo el título, según el tipo. */
export function headerFields(entry: CatalogEntry): DetailField[] {
  const m = entry.meta ?? {};
  const out: DetailField[] = [];
  if (entry.kind === 'item') {
    pushIf(out, 'Categoría', m.category);
    pushIf(out, 'Rareza', m.rarity);
    pushIf(out, 'Peso', m.weightLb ?? m.weight, (s) => `${s} lb`);
    if (typeof m.quantity === 'number' && m.quantity > 1) out.push({ label: 'Cantidad', value: `×${m.quantity}` });
  } else if (entry.kind === 'spell') {
    const lvl = m.level;
    if (typeof lvl === 'number') out.push({ label: 'Nivel', value: lvl === 0 ? 'Truco' : `Nivel ${lvl}` });
    pushIf(out, 'Escuela', m.school);
    if (m.concentration === true) out.push({ label: 'Concentración', value: 'Concentración' });
    if (m.ritual === true) out.push({ label: 'Ritual', value: 'Ritual' });
  } else {
    const ft = m.featType as keyof typeof FEAT_TYPE_LABELS | undefined;
    if (ft && FEAT_TYPE_LABELS[ft]) out.push({ label: 'Tipo', value: FEAT_TYPE_LABELS[ft] });
    pushIf(out, 'Tipo', m.type);
  }
  return out;
}

const OP_LABEL: Record<Modifier['op'], string> = {
  add: 'suma', set: 'fija en', advantage: 'ventaja', disadvantage: 'desventaja', resistance: 'resistencia',
};

function describeModifier(mod: Modifier): DetailField {
  const value = [OP_LABEL[mod.op] ?? mod.op, mod.value !== undefined ? String(mod.value) : '']
    .filter(Boolean).join(' ');
  return { label: mod.target, value: mod.when ? `${value} (${mod.when})` : value };
}

const ARMOR_CATEGORY_LABEL: Record<ArmorData['category'], string> = {
  light: 'Ligera', medium: 'Media', heavy: 'Pesada', shield: 'Escudo',
};
const WEAPON_CATEGORY_LABEL: Record<WeaponData['category'], string> = { simple: 'Simple', martial: 'Marcial' };
const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function armorRows(a: ArmorData | undefined): DetailField[] {
  const rows: DetailField[] = [];
  if (!a || typeof a !== 'object') return rows;
  pushIf(rows, 'Categoría', ARMOR_CATEGORY_LABEL[a.category]);
  if (isNum(a.baseAc)) {
    const bonus = isNum(a.bonus) ? a.bonus : 0;
    // El escudo suma su valor a la CA; el resto de armaduras fija la CA base.
    rows.push({
      label: a.category === 'shield' ? 'Bono de CA' : 'CA base',
      value: a.category === 'shield' ? signed(a.baseAc + bonus) : String(a.baseAc + bonus),
    });
  }
  if (a.category !== 'shield') {
    if (a.dexCap === 0) rows.push({ label: 'Tope de DES', value: 'Sin DES' });
    else if (a.dexCap === null) rows.push({ label: 'Tope de DES', value: 'Sin tope' });
    else if (isNum(a.dexCap)) rows.push({ label: 'Tope de DES', value: `+${a.dexCap}` });
  }
  if (isNum(a.strMin) && a.strMin > 0) rows.push({ label: 'FUE mínima', value: String(a.strMin) });
  if (a.stealthDisadv) rows.push({ label: 'Sigilo', value: 'Desventaja' });
  return rows;
}

function weaponRows(w: WeaponData | undefined): DetailField[] {
  const rows: DetailField[] = [];
  if (!w || typeof w !== 'object') return rows;
  pushIf(rows, 'Categoría', WEAPON_CATEGORY_LABEL[w.category]);
  const bonus = isNum(w.magicBonus) && w.magicBonus !== 0 ? ` ${signed(w.magicBonus)}` : '';
  if (has(w.damageDice)) {
    rows.push({ label: 'Daño', value: [`${text(w.damageDice)}${bonus}`, has(w.damageType) ? text(w.damageType) : ''].filter(Boolean).join(' ') });
  }
  if (Array.isArray(w.properties) && w.properties.length) rows.push({ label: 'Propiedades', value: w.properties.join(', ') });
  if (w.range && isNum(w.range.normal)) {
    rows.push({ label: 'Alcance', value: w.range.long > w.range.normal ? `${w.range.normal}/${w.range.long} pies` : `${w.range.normal} pies` });
  }
  pushIf(rows, 'Versátil', w.versatileDice);
  if (bonus) rows.push({ label: 'Bono mágico', value: signed(w.magicBonus as number) });
  return rows;
}

function equipRows(entry: CatalogEntry): DetailField[] {
  const m = entry.meta ?? {};
  const rows: DetailField[] = [];
  if (m.armor || m.weapon) {
    const slots = validSlotsFor({
      name: entry.name, category: m.armor ? 'armor' : 'weapon', armor: m.armor, weapon: m.weapon, hands: m.hands,
    } as InventoryItem);
    if (slots.length) rows.push({ label: 'Slot sugerido', value: slots.map((s) => SLOT_LABELS[s]).join(' / ') });
  }
  const attune = m.requiresAttunement === true || m.attunement === true;
  if (attune) rows.push({ label: 'Sintonización', value: m.attuned === true ? 'Sintonizado' : 'Requiere sintonización' });
  return rows;
}

/** Secciones de detalle (propiedades, efectos, requisitos…); omite las vacías. */
export function detailSections(entry: CatalogEntry): DetailSection[] {
  const m = entry.meta ?? {};
  const sections: DetailSection[] = [];
  const add = (title: string, rows: DetailField[]) => { if (rows.length) sections.push({ title, rows }); };

  if (entry.kind === 'spell') {
    const rows: DetailField[] = [];
    pushIf(rows, 'Tiempo de lanzamiento', m.castingTime);
    pushIf(rows, 'Alcance', m.range);
    pushIf(rows, 'Componentes', m.components);
    pushIf(rows, 'Material', m.material);
    pushIf(rows, 'Duración', m.duration);
    add('Lanzamiento', rows);
    const dmg: DetailField[] = [];
    pushIf(dmg, 'Daño', m.damageDice);
    pushIf(dmg, 'Tipo de daño', m.damageType);
    add('Daño', dmg);
  } else if (entry.kind === 'item') {
    const rows: DetailField[] = [];
    pushIf(rows, 'Activación', m.activationCondition);
    pushIf(rows, 'Curación', m.healAmount);
    pushIf(rows, 'Uso', m.usableType);
    add('Propiedades', rows);
    add('Armadura', armorRows(m.armor as ArmorData | undefined));
    add('Arma', weaponRows(m.weapon as WeaponData | undefined));
    add('Equipo', equipRows(entry));
  } else {
    const rows: DetailField[] = [];
    pushIf(rows, 'Usos', m.uses);
    add('Recurso', rows);
  }
  if (entry.effects?.length) add('Efectos', entry.effects.map(describeModifier));
  return sections;
}

/** Botones visibles según tipo y contexto. */
export function availableActions(entry: CatalogEntry, ctx: DetailContext): DetailAction[] {
  const out: DetailAction[] = [];
  if (ctx === 'compendium') return ['add'];
  if (entry.kind === 'item') {
    if (ctx === 'loot') return ['add'];
    if (ctx === 'inventory') {
      // DECISION: 'equip' y 'give' siguen en el tipo, pero no se ofrecen hasta que el store tenga esas
      // acciones (H2/H6). Hoy el inventario solo sabe consumir y quitar.
      if (has(entry.meta?.usableType)) out.push('use');
      out.push('drop');
    }
  } else if (entry.kind === 'spell' && ctx === 'spellbook') {
    out.push('cast');
    if (entry.effects?.length) out.push('apply-effect');
    out.push('remove');
  }
  return out;
}

/** Niveles de espacio elegibles para lanzar un hechizo (trucos: ninguno). */
export function castableLevels(
  spellLevel: number,
  slots: Record<number, { total: number; used: number }>,
): { level: number; remaining: number }[] {
  if (!(spellLevel >= 1)) return [];
  const out: { level: number; remaining: number }[] = [];
  for (let level = spellLevel; level <= 9; level++) {
    const s = slots?.[level];
    if (!s || !(s.total > 0)) continue;
    out.push({ level, remaining: Math.max(0, s.total - s.used) });
  }
  return out;
}
