import type { AttackAction, CharacterData, InventoryItem } from '../models/character.ts';
import { hasWeaponProficiency } from './compat.ts';
import { translateDamageType, translateProperty } from './dndTranslations.ts';
import { calculateModifier } from './calculations.ts';

const modOf = (char: CharacterData, ability: 'str' | 'dex'): number => {
  const s = char.stats?.[ability];
  if (!s) return 0;
  return typeof s.modifier === 'number' ? s.modifier : calculateModifier(s.score ?? 10);
};

/** Arma a distancia: tiene alcance y no es arrojadiza (las arrojadizas cuerpo a cuerpo, como la daga, también traen alcance). */
const isRanged = (item: InventoryItem): boolean =>
  !!item.weapon?.range && !item.weapon.properties.includes('thrown');

/** FE-3: FUE por defecto; DES si el arma es a distancia o sutil y DES es mayor (a distancia usa DES siempre). */
function pickAbility(char: CharacterData, item: InventoryItem): 'str' | 'dex' {
  if (isRanged(item)) return 'dex';
  if (item.weapon?.properties.includes('finesse') && modOf(char, 'dex') > modOf(char, 'str')) return 'dex';
  return 'str';
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** Construye la acción de ataque de un arma del inventario (Spec 08, FE-3…FE-6). No guarda nada. */
export function buildAttackFromWeapon(char: CharacterData, item: InventoryItem): AttackAction {
  const w = item.weapon;
  if (!w) throw new Error(`"${item.name}" no tiene datos de arma`);

  const ability = pickAbility(char, item);
  const proficient = hasWeaponProficiency(char.proficiencies, item);
  const magic = w.magicBonus ?? 0;
  const abilityMod = modOf(char, ability);
  const total = (proficient ? char.proficiencyBonus || 0 : 0) + abilityMod + magic;
  const dmgMod = abilityMod + magic;

  let damage = w.damageDice;
  if (dmgMod > 0) damage += ` + ${dmgMod}`;
  else if (dmgMod < 0) damage += ` - ${Math.abs(dmgMod)}`;

  const action: AttackAction = {
    id: `act-${item.id}`,
    itemId: item.id,
    name: item.name,
    type: isRanged(item) ? 'A distancia' : 'Cuerpo a cuerpo',
    bonus: `${signed(total)} al Impacto`,
    damage,
    damageType: translateDamageType(w.damageType),
    tags: w.properties.map(translateProperty),
    isAuto: true,
    ability,
    proficient,
    attackBonusMod: magic,
    damageDice: w.damageDice,
    damageBonusMod: magic,
    addAbilityToDamage: true,
  };
  if (w.versatileDice) action.notes = `Versátil: ${w.versatileDice} a dos manos`;
  return action;
}

/** Reemplaza la acción con el mismo `itemId` o agrega la nueva. Las acciones sin `itemId` no se tocan. */
export function upsertAttack(attacks: AttackAction[], action: AttackAction): AttackAction[] {
  if (!action.itemId) return [...attacks, action];
  const idx = attacks.findIndex((a) => a.itemId === action.itemId);
  if (idx === -1) return [...attacks, action];
  // Se conservan el id, el estado de equipado y la maestría de la acción existente (FE-8).
  const prev = attacks[idx];
  const merged: AttackAction = { ...action, id: prev.id };
  if (prev.equipped !== undefined) merged.equipped = prev.equipped;
  if (prev.slot) merged.slot = prev.slot;
  if (prev.hands) merged.hands = prev.hands;
  if (prev.mastery) merged.mastery = prev.mastery;
  return attacks.map((a, i) => (i === idx ? merged : a));
}
