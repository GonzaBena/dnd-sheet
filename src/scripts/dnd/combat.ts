// src/scripts/dnd/combat.ts
// Lógica pura de combate en la hoja (Spec 11, H4):
// Modificadores opcionales al impacto y al daño, consumo condicional "1 vez por turno",
// y reglas oficiales SRD 5.1 para Ataque Furtivo, Castigo Divino, Inspiración y Maniobras.

import type { AttackAction, CharacterData, InventoryItem } from '../models/character.ts';
import type { CombatModifierOption } from '../models/combat.ts';

/** Comprueba si el arma es apta para Ataque Furtivo (SRD: sutil o a distancia). */
export function isWeaponEligibleForSneakAttack(action: AttackAction, item?: InventoryItem): boolean {
  const isRanged = action.type === 'A distancia' ||
    (action.tags || []).some((t) => /distancia|arrojadiza|thrown|ranged/i.test(t)) ||
    (item?.weapon?.range != null && !item?.weapon?.properties.includes('thrown'));

  const isFinesse = (action.tags || []).some((t) => /sutil|finesse/i.test(t)) ||
    (item?.weapon?.properties || []).includes('finesse');

  return isRanged || isFinesse;
}

/** Comprueba si el arma es apta para Castigo Divino (SRD: arma cuerpo a cuerpo). */
export function isWeaponEligibleForDivineSmite(action: AttackAction): boolean {
  return action.type === 'Cuerpo a cuerpo';
}

/** Calcula los dados de Ataque Furtivo según el nivel de Pícaro (o nivel general). */
export function calculateSneakAttackDice(char: CharacterData): string {
  // Pícaro: 1d6 a nivel 1-2, 2d6 a 3-4, 3d6 a 5-6, etc. Formula: ceil(level / 2)
  const lvl = Math.max(1, char.level || 1);
  const diceCount = Math.ceil(lvl / 2);
  return `${diceCount}d6`;
}

/** Obtiene el tipo de dado de Inspiración Bárdica según el nivel (d6, d8, d10, d12). */
export function getBardicDieType(char: CharacterData): string {
  const lvl = Math.max(1, char.level || 1);
  if (lvl >= 15) return 'd12';
  if (lvl >= 10) return 'd10';
  if (lvl >= 5) return 'd8';
  return 'd6';
}

/**
 * Obtiene todos los modificadores de combate aplicables a una acción de ataque
 * según los rasgos, recursos, espacios de conjuro y efectos activos del personaje.
 */
export function getAvailableCombatModifiers(
  char: CharacterData,
  action: AttackAction
): CombatModifierOption[] {
  const options: CombatModifierOption[] = [];
  const usedMods = new Set(char.turnState?.usedModifiers || []);
  const classNameNorm = (char.className || '').toLowerCase();
  const isRogue = /p[ií]caro|rogue/i.test(classNameNorm);
  const isPaladin = /palad[ií]n|paladin/i.test(classNameNorm);
  const isBard = /bardo|bard/i.test(classNameNorm);

  // 1. Ataque Furtivo (Pícaro)
  const hasSneakFeat = (char.features || []).some((f) =>
    /ataque\s+furtivo|sneak\s+attack/i.test(f.title || '')
  );
  if ((isRogue || hasSneakFeat) && isWeaponEligibleForSneakAttack(action)) {
    const dice = calculateSneakAttackDice(char);
    const used = usedMods.has('sneak-attack');
    options.push({
      id: 'sneak-attack',
      name: 'Ataque Furtivo',
      description: `Añade ${dice} de daño adicional si tienes ventaja o un aliado a 5 pies (1 vez por turno).`,
      type: 'damage',
      formula: `+${dice}`,
      damageType: action.damageType || 'Físico',
      oncePerTurn: true,
      usedThisTurn: used,
      resourceCost: {
        amount: 1,
        consumeTiming: 'onHit',
      },
    });
  }

  // 2. Castigo Divino (Paladín)
  const hasSmiteFeat = (char.features || []).some((f) =>
    /castigo\s+divino|divine\s+smite/i.test(f.title || '')
  );
  if ((isPaladin || hasSmiteFeat) && isWeaponEligibleForDivineSmite(action)) {
    const slots = char.spellcasting?.slots || {};
    // Añade opción para cada nivel de espacio disponible (niveles 1–5 según SRD)
    for (let lvl = 1; lvl <= 5; lvl++) {
      const slot = slots[lvl];
      if (slot && slot.total > 0) {
        const remaining = Math.max(0, slot.total - slot.used);
        const diceCount = Math.min(5, 1 + lvl); // 1º=2d8, 2º=3d8, 3º=4d8, 4º=5d8, 5º=5d8
        options.push({
          id: `divine-smite-lvl-${lvl}`,
          name: `Castigo Divino (Nivel ${lvl})`,
          description: `Gasta un espacio de nivel ${lvl} para infligir +${diceCount}d8 de daño radiante (+1d8 adicional vs no-muertos/infernales). (${remaining} disponibles)`,
          type: 'damage',
          formula: `+${diceCount}d8`,
          damageType: 'Radiante',
          resourceCost: {
            spellSlotLevel: lvl,
            amount: 1,
            consumeTiming: 'onHit',
          },
          usedThisTurn: remaining <= 0,
        });
      }
    }
  }

  // 3. Inspiración Bárdica
  const bardicRes = (char.resources || []).find((r) =>
    /inspiraci[oó]n\s+b[aá]rdica|bardic\s+inspiration/i.test(r.name)
  );
  if (bardicRes || isBard) {
    const rem = bardicRes ? Math.max(0, bardicRes.max - bardicRes.used) : 0;
    const die = bardicRes?.dieType || getBardicDieType(char);
    if (rem > 0 || !bardicRes) {
      options.push({
        id: 'bardic-inspiration-attack',
        name: `Inspiración Bárdica (Al Impacto)`,
        description: `Suma 1${die} a tu tirada de ataque con el arma.`,
        type: 'attack',
        formula: `+1${die}`,
        resourceCost: bardicRes ? {
          resourceId: bardicRes.id,
          amount: 1,
          consumeTiming: 'onAttack',
        } : undefined,
      });
      options.push({
        id: 'bardic-inspiration-damage',
        name: `Inspiración Bárdica (Al Daño)`,
        description: `Suma 1${die} a tu tirada de daño al impactar.`,
        type: 'damage',
        formula: `+1${die}`,
        damageType: action.damageType || 'Físico',
        resourceCost: bardicRes ? {
          resourceId: bardicRes.id,
          amount: 1,
          consumeTiming: 'onHit',
        } : undefined,
      });
    }
  }

  // 4. Maniobras del Maestro de la Batalla (Dados de Superioridad)
  const supRes = (char.resources || []).find((r) =>
    /superioridad|superiority/i.test(r.name)
  );
  if (supRes) {
    const rem = Math.max(0, supRes.max - supRes.used);
    const die = supRes.dieType || 'd8';
    if (rem > 0) {
      options.push({
        id: 'superiority-attack-precision',
        name: `Ataque Preciso (Maniobra)`,
        description: `Gasta 1 dado de superioridad para sumar 1${die} a la tirada de ataque. (${rem} disponibles)`,
        type: 'attack',
        formula: `+1${die}`,
        resourceCost: {
          resourceId: supRes.id,
          amount: 1,
          consumeTiming: 'onAttack',
        },
      });
      options.push({
        id: 'superiority-damage-maneuver',
        name: `Golpe con Maniobra (Daño)`,
        description: `Gasta 1 dado de superioridad para sumar 1${die} al daño al impactar. (${rem} disponibles)`,
        type: 'damage',
        formula: `+1${die}`,
        damageType: action.damageType || 'Físico',
        resourceCost: {
          resourceId: supRes.id,
          amount: 1,
          consumeTiming: 'onHit',
        },
      });
    }
  }

  // 5. Efectos activos de daño extra (Marca del Cazador, Maleficio, etc.)
  for (const fx of char.activeEffects || []) {
    const isHunter = /marca\s+del\s+cazador|hunter's\s+mark/i.test(fx.name);
    const isHex = /maleficio|hex/i.test(fx.name);
    if (isHunter || isHex) {
      options.push({
        id: `active-effect-${fx.id}`,
        name: `${fx.name} (Efecto Activo)`,
        description: `Añade 1d6 de daño adicional cada vez que impactes al objetivo.`,
        type: 'damage',
        formula: '+1d6',
        damageType: isHunter ? (action.damageType || 'Físico') : 'Necrótico',
      });
    }
  }

  return options;
}

/** Desglosa una fórmula de dados sencilla tipo "+2d8" o "+1d6+2". */
export function parseFormulaDice(formula: string): { count: number; die: number; mod: number } | null {
  if (!formula) return null;
  const match = formula.match(/([+-]?\s*\d+)d(\d+)(?:\s*([+-])\s*(\d+))?/i);
  if (match) {
    const count = parseInt(match[1].replace(/\s+/g, ''), 10) || 1;
    const die = parseInt(match[2], 10) || 6;
    const sign = match[3] === '-' ? -1 : 1;
    const mod = match[4] ? sign * parseInt(match[4], 10) : 0;
    return { count: Math.abs(count), die, mod };
  }
  // Si es solo un modificador estático, ej. "+2" o "-1"
  const staticMatch = formula.match(/^[+-]?\s*\d+$/);
  if (staticMatch) {
    const mod = parseInt(formula.replace(/\s+/g, ''), 10) || 0;
    return { count: 0, die: 0, mod };
  }
  return null;
}

/** Combina el daño base del arma con los modificadores seleccionados para daño. */
export function combineDamageModifiers(
  baseDamage: string,
  baseDamageType: string,
  modifiers: CombatModifierOption[]
): {
  combinedFormula: string;
  extraDiceList: { count: number; die: number; mod: number; type: string; name: string }[];
} {
  const extraDiceList: { count: number; die: number; mod: number; type: string; name: string }[] = [];
  let combinedFormula = baseDamage || '1d8';

  for (const mod of modifiers) {
    if (mod.type === 'damage' || mod.type === 'both') {
      const parsed = parseFormulaDice(mod.formula);
      if (parsed) {
        if (parsed.die > 0) {
          extraDiceList.push({
            count: parsed.count,
            die: parsed.die,
            mod: parsed.mod,
            type: mod.damageType || baseDamageType || 'Físico',
            name: mod.name,
          });
          combinedFormula += ` + ${mod.formula.replace(/^\+/, '').trim()}`;
        } else if (parsed.mod !== 0) {
          combinedFormula += ` ${parsed.mod >= 0 ? '+' : '-'} ${Math.abs(parsed.mod)}`;
        }
      }
    }
  }

  return { combinedFormula, extraDiceList };
}
