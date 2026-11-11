// Equipo y sintonización (Spec 08, Fase A). Lógica pura: no toca el store ni el DOM.
import type { AttackAction, CharacterData, EquipSlot, InventoryItem } from '../models/character.ts';

export const MAX_ATTUNED = 3;

export const EQUIP_SLOTS: EquipSlot[] = [
  'head', 'body', 'gloves', 'neck', 'ring1', 'ring2',
  'boots', 'cloak', 'mainHand', 'offHand', 'shield',
];

export const SLOT_LABELS: Record<EquipSlot, string> = {
  head: 'Cabeza', body: 'Cuerpo', gloves: 'Guantes', neck: 'Cuello', ring1: 'Anillo 1', ring2: 'Anillo 2',
  boots: 'Botas', cloak: 'Capa', mainHand: 'Mano principal', offHand: 'Mano secundaria', shield: 'Escudo',
};

export interface EquipResult {
  inventory: InventoryItem[];
  unequipped: InventoryItem[];
  error?: string;
}

// DECISION: los objetos creados a mano no traen `armor`, así que el escudo también se reconoce por
// nombre (escudo/rodela/broquel/shield) y una armadura sin datos va al cuerpo. Si no, un escudo
// manual se ofrecería para cabeza o anillos.
const SHIELD_NAME = /\b(escudo|rodela|broquel|adarga|pavés|shield)\b/i;
const isShield = (i: InventoryItem) =>
  i.armor?.category === 'shield' || (i.category === 'armor' && !i.armor && SHIELD_NAME.test(i.name)) ||
  (!i.armor && i.category !== 'weapon' && SHIELD_NAME.test(i.name));
const isWeapon = (i: InventoryItem) => i.category === 'weapon' || !!i.weapon;
const isBodyArmor = (i: InventoryItem) => !isShield(i) && (!!i.armor || i.category === 'armor');

/** Slots válidos según el tipo de objeto. El resto de objetos va al slot que elija el jugador. */
export function validSlotsFor(item: InventoryItem): EquipSlot[] {
  if (isShield(item)) return ['shield'];
  if (isBodyArmor(item)) return ['body'];
  if (isWeapon(item)) return item.hands === 2 ? ['mainHand'] : ['mainHand', 'offHand'];
  return EQUIP_SLOTS.filter((s) => s !== 'mainHand' && s !== 'offHand' && s !== 'shield' && s !== 'body');
}

const stripEquip = (i: InventoryItem): InventoryItem => {
  const { slot: _slot, ...rest } = i;
  return { ...rest, equipped: false };
};

export function equippedItems(inv: InventoryItem[]): InventoryItem[] {
  return inv.filter((i) => i.equipped);
}

export function equipItem(inv: InventoryItem[], itemId: string, slot: EquipSlot): EquipResult {
  const item = inv.find((i) => i.id === itemId);
  if (!item) return { inventory: inv, unequipped: [], error: 'Objeto no encontrado' };
  if (!validSlotsFor(item).includes(slot)) {
    return { inventory: inv, unequipped: [], error: `${item.name} no se puede equipar en ese slot` };
  }

  // DECISION: cuando algo no cabe (slot ocupado, dos manos, escudo + arma en offHand) se desequipa
  // lo anterior y se devuelve la lista para avisar al jugador; equipar nunca se bloquea (FA-2).
  const conflicts = new Set<EquipSlot>([slot]);
  const twoHanded = slot === 'mainHand' && item.hands === 2;
  if (twoHanded) { conflicts.add('offHand'); conflicts.add('shield'); }
  if (slot === 'shield') conflicts.add('offHand');
  if (slot === 'offHand') conflicts.add('shield');

  const unequipped: InventoryItem[] = [];
  const next = inv.map((i) => {
    if (i.id === itemId) return { ...i, equipped: true, slot };
    if (!i.equipped || !i.slot) return i;
    const clash =
      conflicts.has(i.slot) ||
      // un arma a dos manos ocupa también offHand/shield
      ((slot === 'shield' || slot === 'offHand') && i.slot === 'mainHand' && i.hands === 2);
    if (!clash) return i;
    const out = stripEquip(i);
    unequipped.push(out);
    return out;
  });
  return { inventory: next, unequipped };
}

export function unequipItem(inv: InventoryItem[], itemId: string): InventoryItem[] {
  // La sintonización se conserva: se puede estar sintonizado sin llevarlo puesto.
  return inv.map((i) => (i.id === itemId ? stripEquip(i) : i));
}

export function attuneItem(inv: InventoryItem[], itemId: string): EquipResult {
  const item = inv.find((i) => i.id === itemId);
  if (!item) return { inventory: inv, unequipped: [], error: 'Objeto no encontrado' };
  if (item.attuned) return { inventory: inv, unequipped: [] };
  if (inv.filter((i) => i.attuned).length >= MAX_ATTUNED) {
    return { inventory: inv, unequipped: [], error: `Solo puedes estar sintonizado con ${MAX_ATTUNED} objetos` };
  }
  return { inventory: inv.map((i) => (i.id === itemId ? { ...i, attuned: true } : i)), unequipped: [] };
}

export function unattuneItem(inv: InventoryItem[], itemId: string): InventoryItem[] {
  return inv.map((i) => (i.id === itemId ? { ...i, attuned: false } : i));
}

// --- Armas de la sección "Armas y Acciones de Ataque" (AttackAction) ---------------------------
// Comparten slots con el inventario: para resolver conflictos se tratan como objetos de categoría
// 'weapon' con id `action:<id>` y el resultado se reparte de vuelta a cada lista.
export const ACTION_PREFIX = 'action:';

const actionAsItem = (a: AttackAction): InventoryItem => ({
  id: ACTION_PREFIX + a.id, name: a.name, quantity: 1, category: 'weapon',
  hands: a.hands, equipped: a.equipped, slot: a.slot,
});

export interface AcrossResult {
  inventory: InventoryItem[];
  actions: AttackAction[];
  unequipped: { id: string; name: string }[];
  error?: string;
}

const applyToActions = (actions: AttackAction[], pseudo: InventoryItem[]): AttackAction[] =>
  actions.map((a, idx) => {
    const p = pseudo[idx];
    const { slot: _slot, ...rest } = a;
    return p.equipped && p.slot ? { ...rest, equipped: true, slot: p.slot } : { ...rest, equipped: false };
  });

/** Equipa un objeto del inventario (`key` = id) o un arma de la sección (`key` = `action:<id>`). */
export function equipAcross(
  inv: InventoryItem[], actions: AttackAction[], key: string, slot: EquipSlot,
): AcrossResult {
  const r = equipItem([...inv, ...actions.map(actionAsItem)], key, slot);
  if (r.error) return { inventory: inv, actions, unequipped: [], error: r.error };
  return {
    inventory: r.inventory.slice(0, inv.length),
    actions: applyToActions(actions, r.inventory.slice(inv.length)),
    unequipped: r.unequipped.map((i) => ({ id: i.id, name: i.name })),
  };
}

export function unequipAction(actions: AttackAction[], actionId: string): AttackAction[] {
  return actions.map((a) => {
    if (a.id !== actionId) return a;
    const { slot: _slot, ...rest } = a;
    return { ...rest, equipped: false };
  });
}

/** Cambia las manos de un arma; si estaba equipada se quita (el slot elegido puede dejar de valer). */
export function setActionHands(actions: AttackAction[], actionId: string, hands: 1 | 2): AttackAction[] {
  return actions.map((a) => {
    if (a.id !== actionId || a.hands === hands) return a;
    const { slot: _slot, ...rest } = a;
    return { ...rest, hands, equipped: false };
  });
}

export function validSlotsForAction(a: AttackAction): EquipSlot[] {
  return validSlotsFor(actionAsItem(a));
}

let idCounter = 0;

/**
 * Migra `attunedItems` (lista libre) al inventario. Idempotente: al terminar queda vacía.
 * Devuelve true si cambió algo.
 */
export function migrateAttuned(char: CharacterData): boolean {
  const entries = (char as any).attunedItems;
  if (!Array.isArray(entries) || entries.length === 0) return false;
  if (!Array.isArray(char.inventory)) char.inventory = [];

  // DECISION: cada entrada se busca en el inventario por nombre (sin mayúsculas); si no existe se crea
  // como 'gear'. Se respeta el tope de 3 contando lo ya sintonizado; el resto queda sin sintonizar.
  // Las ranuras vacías antiguas ("Ranura Libre") no son objetos y se descartan (FA-6).
  let attunedCount = char.inventory.filter((i) => i.attuned).length;
  for (const entry of entries) {
    const name = String(entry?.name ?? '').trim();
    if (!name || name.toLowerCase().includes('libre')) continue;
    let item = char.inventory.find((i) => i.name.trim().toLowerCase() === name.toLowerCase());
    if (!item) {
      item = {
        id: `item-${Date.now()}-${idCounter++}`,
        name,
        quantity: 1,
        category: 'gear',
        description: entry.description ?? '',
        icon: entry.icon ?? '',
        requiresAttunement: true,
      };
      char.inventory.push(item);
    }
    if (!item.attuned && attunedCount < MAX_ATTUNED) {
      item.attuned = true;
      attunedCount++;
    }
  }
  (char as any).attunedItems = [];
  return true;
}
