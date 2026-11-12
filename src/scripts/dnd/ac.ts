// CA derivada (Spec 08, Fase D). Lógica pura: no toca el store ni el DOM, y el resultado no se guarda.
import type { CharacterData, InventoryItem } from '../models/character.ts';
import type { Modifier } from '../models/effect.ts';
import { collectModifiers, itemContributes } from './effects.ts';
import { equippedItems, isShield } from './equipment.ts';

export interface AcPart { label: string; value: number }
export interface AcResult {
  total: number;
  formula: string; // 'Armadura', 'Sin armadura', 'Defensa sin armadura', 'Armadura de mago', 'Efecto', 'Manual'
  parts: AcPart[];
  manual: boolean;
  alternatives: { formula: string; total: number }[]; // fórmulas descartadas, para mostrar la elección
}

type AcChar = Pick<CharacterData, 'stats' | 'className'> &
  Partial<Pick<CharacterData, 'inventory' | 'activeEffects' | 'armorClass' | 'wildShape'>>;

const mod = (score: number | undefined) => Math.floor(((score ?? 10) - 10) / 2);
const signed = (n: number) => (n >= 0 ? `+${n}` : String(n));
const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const isBarbarian = (c: AcChar) => /^(barbaro|barbarian)/.test(plain(c.className ?? ''));
const isMonk = (c: AcChar) => /^(monje|monk)/.test(plain(c.className ?? ''));

const bodyArmor = (inv: InventoryItem[]) =>
  equippedItems(inv).find((i) => i.armor && i.armor.category !== 'shield' && (!i.slot || i.slot === 'body'));
const equippedShield = (inv: InventoryItem[]) => equippedItems(inv).find((i) => isShield(i));

// DECISION: Armadura de Mago se reconoce por `sourceId` 'mage-armor' o, para efectos puestos a mano,
// por el nombre (es/en). No hay un campo "fórmula" en los efectos, así que es la única pista disponible.
const hasMageArmor = (c: AcChar) =>
  (c.activeEffects ?? []).some((e) => e.sourceId === 'mage-armor' || /armadura de mago|mage armor/i.test(e.name));

interface Candidate { formula: string; parts: AcPart[] }

const total = (parts: AcPart[]) => parts.reduce((s, p) => s + p.value, 0);

/** Fuentes de modificadores `ac` con su etiqueta; reutiliza `collectModifiers` por fuente (FD-8). */
function acSources(char: AcChar): { label: string; m: Modifier }[] {
  const out: { label: string; m: Modifier }[] = [];
  for (const e of char.activeEffects ?? []) {
    for (const m of collectModifiers({ activeEffects: [e] }, 'ac')) out.push({ label: e.name, m });
  }
  for (const item of char.inventory ?? []) {
    if (!itemContributes(item)) continue;
    for (const m of collectModifiers({ inventory: [item] }, 'ac')) out.push({ label: item.name, m });
  }
  return out;
}

export function computeAc(char: AcChar): AcResult {
  if (typeof char.armorClass === 'number' && Number.isFinite(char.armorClass)) {
    return {
      total: char.armorClass, formula: 'Manual', manual: true, alternatives: [],
      parts: [{ label: 'CA manual', value: char.armorClass }],
    };
  }

  const inv = char.inventory ?? [];
  const dex = mod(char.stats?.dex?.score);
  const armor = bodyArmor(inv);
  const shield = equippedShield(inv);

  const candidates: Candidate[] = [];
  if (armor?.armor) {
    const a = armor.armor;
    const parts: AcPart[] = [{ label: armor.name, value: a.baseAc }];
    if (a.bonus) parts.push({ label: `${armor.name} ${signed(a.bonus)}`, value: a.bonus });
    const cap = a.dexCap;
    if (cap !== 0) {
      const capped = typeof cap === 'number' && dex > cap;
      const used = capped ? cap : dex;
      parts.push({ label: capped ? `Destreza ${signed(used)} (máx. ${signed(cap)})` : `Destreza ${signed(used)}`, value: used });
    }
    candidates.push({ formula: 'Armadura', parts });
  } else {
    const base = (extra: AcPart[]): AcPart[] => [{ label: 'Base 10', value: 10 }, { label: `Destreza ${signed(dex)}`, value: dex }, ...extra];
    candidates.push({ formula: 'Sin armadura', parts: base([]) });
    // DECISION (FD-2): las fórmulas de clase solo compiten sin armadura; el monje además la pierde con escudo.
    if (isBarbarian(char)) {
      const con = mod(char.stats?.con?.score);
      candidates.push({ formula: 'Defensa sin armadura', parts: base([{ label: `Constitución ${signed(con)}`, value: con }]) });
    } else if (isMonk(char) && !shield) {
      const wis = mod(char.stats?.wis?.score);
      candidates.push({ formula: 'Defensa sin armadura', parts: base([{ label: `Sabiduría ${signed(wis)}`, value: wis }]) });
    }
    if (hasMageArmor(char)) {
      candidates.push({ formula: 'Armadura de mago', parts: [{ label: 'Base 13', value: 13 }, { label: `Destreza ${signed(dex)}`, value: dex }] });
    }
  }

  // Gana la de mayor total; en empate, la primera (la más simple).
  let best = candidates[0];
  for (const c of candidates) if (total(c.parts) > total(best.parts)) best = c;
  const alternatives = candidates.filter((c) => c !== best).map((c) => ({ formula: c.formula, total: total(c.parts) }));

  let formula = best.formula;
  let parts = best.parts.slice();

  const sources = acSources(char);
  // FD-5: un `set` reemplaza la fórmula; si hay varios gana el mayor.
  const sets = sources.filter((s) => s.m.op === 'set' && Number.isFinite(Number(s.m.value)));
  if (sets.length) {
    const top = sets.reduce((a, b) => (Number(b.m.value) > Number(a.m.value) ? b : a));
    alternatives.unshift({ formula, total: total(parts) });
    formula = 'Efecto';
    parts = [{ label: `${top.label} (CA ${Number(top.m.value)})`, value: Number(top.m.value) }];
  }

  // FD-3: escudo y luego los `add` de objetos y efectos.
  if (shield) {
    const bonus = (shield.armor?.baseAc ?? 2) + (shield.armor?.bonus ?? 0);
    parts.push({ label: `Escudo ${signed(bonus)}`, value: bonus });
  }
  for (const s of sources) {
    const v = Number(s.m.value);
    if (s.m.op === 'add' && Number.isFinite(v)) parts.push({ label: `${s.label} ${signed(v)}`, value: v });
  }

  return { total: total(parts), formula, parts, manual: false, alternatives };
}

/** Único punto de lectura de la CA: forma salvaje > override manual > calculada (FD-7). */
export function getArmorClass(char: AcChar): number {
  const form = char.wildShape?.activeForm;
  if (form && typeof form.ac === 'number') return form.ac;
  return computeAc(char).total;
}

/**
 * Migración idempotente (FD-6). Devuelve true si cambió algo.
 * DECISION: los personajes antiguos tienen `armorClass` numérico. Si coincide con el cálculo se limpia
 * (era la CA calculada a mano); si difiere se conserva como override. Como no hay marca de "ya migrado"
 * (sin campos nuevos), un override puesto a propósito que coincida con el cálculo también se limpia:
 * el resultado visible es el mismo hasta que cambie el equipo.
 */
export function migrateArmorClass(char: CharacterData | AcChar): boolean {
  const current = char.armorClass;
  if (current === undefined) return false;
  if (typeof current !== 'number' || !Number.isFinite(current)) {
    delete (char as { armorClass?: number }).armorClass;
    return true;
  }
  if (computeAc({ ...char, armorClass: undefined }).total !== current) return false;
  delete (char as { armorClass?: number }).armorClass;
  return true;
}
