// src/scripts/dnd/advantage.ts
// Lógica pura de evaluación y explicación de Ventajas y Desventajas en tiradas (Spec 11, H4).

import type { AttackAction, CharacterData } from '../models/character.ts';
import type { AdvantageEvaluation, RollAdvantageState } from '../models/combat.ts';
import { hasArmorProficiency } from './compat.ts';

export interface AdvantageContext {
  action?: AttackAction;
  checkType?: 'attack' | 'check' | 'save' | string;
  ability?: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  targetDistanceFt?: number;
}

/**
 * Evalúa todas las fuentes activas de ventaja y desventaja aplicables a una tirada.
 * Aplica la regla oficial de D&D 5e: si concurren ventajas y desventajas a la vez,
 * se cancelan mutuamente produciendo una tirada normal.
 */
export function evaluateAdvantage(
  char: CharacterData,
  context: AdvantageContext = {}
): AdvantageEvaluation {
  const advantages: string[] = [];
  const disadvantages: string[] = [];

  const isAttack = !context.checkType || context.checkType === 'attack';
  const isStrOrDex = context.ability === 'str' || context.ability === 'dex';

  // 1. Penalizaciones de armadura por falta de competencia (SRD 5.1 / Spec 08)
  for (const item of char.inventory || []) {
    if (item.equipped && item.armor) {
      const isProf = hasArmorProficiency(char.proficiencies, item.armor);
      if (!isProf) {
        // En 5e, armadura sin competencia impone desventaja en tiradas de ataque y salvaciones/pruebas de FUE y DES
        if (isAttack) {
          disadvantages.push(`Armadura sin competencia (${item.name})`);
        } else if (isStrOrDex) {
          disadvantages.push(`Armadura sin competencia (${item.name}) en ${context.ability?.toUpperCase()}`);
        }
      }
      // Desventaja en sigilo
      if (item.armor.stealthDisadv && context.checkType === 'skill.stealth') {
        disadvantages.push(`Armadura ruidosa (${item.name})`);
      }
    }
  }

  // 2. Condiciones y Efectos Activos (Spec 07)
  for (const fx of char.activeEffects || []) {
    const nameLower = (fx.name || '').toLowerCase();
    
    // Condiciones 5e estándar
    if (/cegado|blinded/i.test(nameLower) && isAttack) {
      disadvantages.push('Condición: Cegado');
    }
    if (/derribado|prone/i.test(nameLower) && isAttack) {
      disadvantages.push('Condición: Derribado');
    }
    if (/envenenado|poisoned/i.test(nameLower)) {
      if (isAttack || context.checkType === 'check') {
        disadvantages.push('Condición: Envenenado');
      }
    }
    if (/asustado|frightened/i.test(nameLower)) {
      if (isAttack || context.checkType === 'check') {
        disadvantages.push('Condición: Asustado');
      }
    }

    // Modificadores declarados en el efecto
    for (const m of fx.modifiers || []) {
      if (m.op === 'advantage') {
        if (!m.target || m.target === 'attack' || m.target === context.checkType) {
          advantages.push(fx.name);
        }
      } else if (m.op === 'disadvantage') {
        if (!m.target || m.target === 'attack' || m.target === context.checkType) {
          disadvantages.push(fx.name);
        }
      }
    }
  }

  // 3. Alcance de armas (a quemarropa o largo alcance)
  if (context.action && typeof context.targetDistanceFt === 'number') {
    const isRanged = context.action.type === 'A distancia' ||
      (context.action.tags || []).some((t) => /distancia|munición|arrojadiza/i.test(t));

    if (isRanged) {
      if (context.targetDistanceFt <= 5) {
        disadvantages.push('Ataque a distancia a corta distancia (≤ 5 pies)');
      }
      // Parsear rango si existe ej. "80/320" o "(20/60)"
      const rangeTag = (context.action.tags || []).find((t) => /\d+\s*\/\s*\d+/.test(t));
      if (rangeTag) {
        const match = rangeTag.match(/(\d+)\s*\/\s*(\d+)/);
        if (match) {
          const normalRange = parseInt(match[1], 10);
          const maxRange = parseInt(match[2], 10);
          if (context.targetDistanceFt > normalRange && context.targetDistanceFt <= maxRange) {
            disadvantages.push(`Largo alcance (${context.targetDistanceFt} pies > normal ${normalRange} pies)`);
          }
        }
      }
    }
  }

  // 4. Regla oficial 5e de anulación mutua
  let state: RollAdvantageState = 'normal';
  let isCanceled = false;

  if (advantages.length > 0 && disadvantages.length > 0) {
    state = 'normal';
    isCanceled = true;
  } else if (advantages.length > 0) {
    state = 'advantage';
  } else if (disadvantages.length > 0) {
    state = 'disadvantage';
  }

  // 5. Construir explicación textual
  let summaryText = 'Tirada normal';
  if (isCanceled) {
    summaryText = `Tirada normal: Ventaja y Desventaja se anulan mutuamente (${advantages.join(', ')} vs ${disadvantages.join(', ')})`;
  } else if (state === 'advantage') {
    summaryText = `Ventaja por: ${advantages.join(', ')}`;
  } else if (state === 'disadvantage') {
    summaryText = `Desventaja por: ${disadvantages.join(', ')}`;
  }

  return {
    state,
    advantages,
    disadvantages,
    isCanceled,
    summaryText,
  };
}
