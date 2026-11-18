// src/scripts/dnd/spellcasting.ts
// Lógica pura de validación de componentes de conjuros, rituales y escalado (Spec 11, H4).

import type { CharacterData, InventoryItem } from '../models/character.ts';
import type { SpellComponentCheck } from '../models/combat.ts';

export interface SpellCheckItem {
  id?: string;
  name: string;
  level?: number;
  components?: string;
  duration?: string;
  notes?: string;
  ritual?: boolean;
}

/** Comprueba si el personaje tiene las manos ocupadas según su equipo activo. */
export function countFreeHands(char: CharacterData): { freeHands: number; hasShield: boolean; twoHandedWeapon: boolean } {
  let occupiedHands = 0;
  let hasShield = false;
  let twoHandedWeapon = false;

  // 1. Armas equipadas en actions
  for (const act of char.actions || []) {
    if (act.equipped) {
      if (act.hands === 2) {
        twoHandedWeapon = true;
        occupiedHands += 2;
      } else {
        occupiedHands += 1;
      }
    }
  }

  // 2. Escudo equipado en inventory
  for (const item of char.inventory || []) {
    if (item.equipped) {
      if (item.slot === 'shield' || item.armor?.category === 'shield') {
        hasShield = true;
        occupiedHands += 1;
      }
    }
  }

  const freeHands = Math.max(0, 2 - occupiedHands);
  return { freeHands, hasShield, twoHandedWeapon };
}

/** Comprueba si el personaje posee un foco de lanzamiento, canalizador o bolsa de componentes. */
export function hasSpellcastingFocusOrPouch(char: CharacterData): boolean {
  return (char.inventory || []).some((item) =>
    /foco|canalizador|bolsa\s+de\s+componentes|varita|b[aá]culo|s[ií]mbolo\s+sagrado|relicario|tomo/i.test(item.name || '') ||
    /foco|canalizador|componentes/i.test(item.description || '') ||
    /foco|canalizador/i.test(item.notes || '')
  );
}

/** Comprueba si el personaje tiene la dote o rasgo de Conjurador de Guerra (War Caster). */
export function hasWarCasterFeat(char: CharacterData): boolean {
  return (char.features || []).some((f) =>
    /conjurador\s+de\s+guerra|war\s*caster/i.test(f.title || '')
  );
}

/** Extrae el coste en piezas de oro (po / gp) de una descripción de componentes materiales si existe. */
export function extractMaterialCostGp(componentsStr?: string): { costGp: number; isConsumed: boolean; rawMaterial: string } | null {
  if (!componentsStr) return null;
  const mMatch = componentsStr.match(/M\s*\(([^)]+)\)/i);
  if (!mMatch) return null;

  const raw = mMatch[1];
  const isConsumed = /consume|consumible/i.test(raw);
  const costMatch = raw.match(/(\d+[\d,.]*)\s*(?:po|gp|piezas?\s*de\s*oro)/i);
  const costGp = costMatch ? parseInt(costMatch[1].replace(/[,.]/g, ''), 10) || 0 : 0;

  return { costGp, isConsumed, rawMaterial: raw.trim() };
}

/** Clases oficiales que lanzan conjuros como ritual en el SRD 5.1. */
export function canClassCastRituals(className?: string): boolean {
  const norm = (className || '').toLowerCase();
  return /mago|wizard|cl[eé]rigo|cleric|druida|druid|bardo|bard/i.test(norm);
}

/** Determina si un conjuro se puede lanzar como ritual. */
export function isRitualSpell(spell: SpellCheckItem): boolean {
  if (spell.ritual === true) return true;
  return /ritual/i.test(spell.notes || '') || /ritual/i.test(spell.duration || '');
}

/**
 * Valida los componentes V, S, M de un conjuro contra el estado actual del personaje.
 * Regla del proyecto: La hoja avisa, pero no bloquea.
 */
export function validateSpellComponents(
  char: CharacterData,
  spell: SpellCheckItem
): SpellComponentCheck {
  const comp = (spell.components || '').toUpperCase();
  const requiresV = comp.includes('V');
  const requiresS = comp.includes('S');
  const requiresM = comp.includes('M');

  const warnings: string[] = [];

  // 1. Componente Verbal (V)
  let verbalOk = true;
  const isSilenced = (char.activeEffects || []).some((e) =>
    /silencio|silenced|amordazado|inm[oó]vil/i.test(e.name)
  );
  if (requiresV && isSilenced) {
    verbalOk = false;
    warnings.push('Componente Verbal (V): Tu personaje está silenciado o no puede hablar.');
  }

  // 2. Componente Somático (S)
  const { freeHands } = countFreeHands(char);
  const warCaster = hasWarCasterFeat(char);
  const hasFocus = hasSpellcastingFocusOrPouch(char);
  let somaticOk = true;

  if (requiresS) {
    // Si no tiene manos libres y no tiene War Caster
    if (freeHands < 1 && !warCaster) {
      somaticOk = false;
      warnings.push('Componente Somático (S): Tienes ambas manos ocupadas (se requiere una mano libre o rasgo Conjurador de Guerra).');
    }
  }

  // 3. Componente Material (M)
  let materialOk = true;
  let missingMaterial: string | undefined;
  const costInfo = extractMaterialCostGp(spell.components);

  if (requiresM) {
    if (costInfo && costInfo.costGp > 0) {
      // Material con coste monetario (ej. diamante de 300 po)
      const hasItemInInventory = (char.inventory || []).some((item) =>
        item.name.toLowerCase().includes(costInfo.rawMaterial.toLowerCase()) ||
        costInfo.rawMaterial.toLowerCase().includes(item.name.toLowerCase())
      );
      const totalGp = (char.currency?.gp || 0) + (char.currency?.pp || 0) * 10;
      if (!hasItemInInventory && totalGp < costInfo.costGp) {
        materialOk = false;
        missingMaterial = costInfo.rawMaterial;
        warnings.push(`Componente Material (M): Requiere "${costInfo.rawMaterial}" (${costInfo.costGp} po) no encontrado en inventario ni fondos suficientes.`);
      }
    } else if (!hasFocus) {
      // Material común sin foco ni bolsa de componentes
      warnings.push('Componente Material (M): No tienes equipado un foco arcano, símbolo sagrado ni bolsa de componentes.');
    }
  }

  return {
    canCast: warnings.length === 0,
    warnings,
    verbalOk,
    somaticOk,
    materialOk,
    hasFreeHand: freeHands > 0,
    hasFocusOrPouch: hasFocus,
    missingMaterial,
  };
}

/** Calcula la fórmula de daño escalada si se lanza un conjuro a un nivel superior (Upcasting). */
export function calculateUpcastFormula(
  baseFormula: string,
  baseLevel: number,
  castLevel: number,
  dicePerLevel: number = 1
): string {
  if (castLevel <= baseLevel) return baseFormula;
  const diff = castLevel - baseLevel;
  const match = baseFormula.match(/(\d+)d(\d+)(?:\s*([+-]\s*\d+))?/i);
  if (!match) return baseFormula;

  const count = parseInt(match[1], 10) || 1;
  const die = match[2];
  const modStr = match[3] ? ` ${match[3]}` : '';
  const newCount = count + diff * dicePerLevel;

  return `${newCount}d${die}${modStr}`;
}
