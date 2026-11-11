import type { CharacterData, StatBlock, SkillItem } from '../models/character';
import { migrateSlots, migrateResources } from './resources.ts';
import { migrateAttuned } from './equipment.ts';

export const STANDARD_5E_SKILLS: { id: string; name: string; stat: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' }[] = [
  { id: 'acrobatics', name: 'Acrobacias', stat: 'dex' },
  { id: 'animal-handling', name: 'Trato con Animales', stat: 'wis' },
  { id: 'arcana', name: 'Conocimiento Arcano', stat: 'int' },
  { id: 'athletics', name: 'Atletismo', stat: 'str' },
  { id: 'deception', name: 'Engaño', stat: 'cha' },
  { id: 'history', name: 'Historia', stat: 'int' },
  { id: 'insight', name: 'Perspicacia', stat: 'wis' },
  { id: 'intimidation', name: 'Intimidación', stat: 'cha' },
  { id: 'investigation', name: 'Investigación', stat: 'int' },
  { id: 'medicine', name: 'Medicina', stat: 'wis' },
  { id: 'nature', name: 'Naturaleza', stat: 'int' },
  { id: 'perception', name: 'Percepción', stat: 'wis' },
  { id: 'performance', name: 'Interpretación', stat: 'cha' },
  { id: 'persuasion', name: 'Persuasión', stat: 'cha' },
  { id: 'religion', name: 'Religión', stat: 'int' },
  { id: 'sleight-of-hand', name: 'Juego de Manos', stat: 'dex' },
  { id: 'stealth', name: 'Sigilo', stat: 'dex' },
  { id: 'survival', name: 'Supervivencia', stat: 'wis' },
];

export function calculateModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function calculateProficiencyBonus(level: number): number {
  return Math.ceil(1 + (level / 4)); // 1-4 -> 2, 5-8 -> 3, 9-12 -> 4, etc.
}

export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function getAverageHitDieHp(die: string): number {
  const size = parseInt(die.replace(/\D/g, '')) || 8;
  return Math.floor(size / 2) + 1; // d6->4, d8->5, d10->6, d12->7
}

export function calculateLevelUpHpGain(die: string, conModifier: number, levelsGained: number = 1): number {
  const avg = getAverageHitDieHp(die);
  const perLevel = Math.max(1, avg + conModifier);
  return perLevel * levelsGained;
}

export function recalculateCharacter(char: CharacterData): CharacterData {
  // Migraciones idempotentes (Spec 07, Fase A): slots 1–9 y registro de recursos.
  // wildShape se crea más abajo si falta, por eso migrateResources se repite al final.
  migrateSlots(char);
  migrateResources(char);
  // Spec 08, Fase A: attunedItems pasa a ser `attuned` en el inventario.
  migrateAttuned(char);
  if (!Array.isArray(char.activeEffects)) char.activeEffects = [];

  if (!char.rulesEdition) {
    char.rulesEdition = '2024';
  }
  const prof = calculateProficiencyBonus(char.level);
  char.proficiencyBonus = prof;

  // 1. Recalculate stat modifiers
  const statKeys: (keyof CharacterData['stats'])[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  statKeys.forEach((key) => {
    char.stats[key].modifier = calculateModifier(char.stats[key].score);
  });

  // 2. Initiative defaults to DEX modifier
  char.initiativeBonus = char.stats.dex.modifier;

  // 3. Ensure all standard skills exist
  if (!char.skills) char.skills = [];
  const existingMap = new Map(char.skills.map(s => [s.id, s]));

  char.skills = STANDARD_5E_SKILLS.map((std) => {
    const existing = existingMap.get(std.id);
    const proficient = existing ? existing.proficient : false;
    const expertise = existing ? existing.expertise : false;
    const customBonus = existing ? (existing.customBonus || 0) : 0;

    const statMod = char.stats[std.stat]?.modifier ?? 0;
    let skillBonus = statMod;
    if (proficient) skillBonus += prof;
    if (expertise) skillBonus += prof; // D&D 5e expertise adds proficiency bonus a second time
    skillBonus += customBonus; // Items, feats, or magical bonuses

    return {
      id: std.id,
      name: std.name,
      stat: std.stat,
      proficient,
      expertise,
      customBonus,
      value: skillBonus
    };
  });

  // 4. Recalculate Spellcasting if present
  if (char.spellcasting) {
    const spellStatMod = char.stats[char.spellcasting.ability]?.modifier || 0;
    char.spellcasting.saveDc = 8 + prof + spellStatMod;
    char.spellcasting.attackBonus = prof + spellStatMod;

    if (char.spellcasting.spells && Array.isArray(char.spellcasting.spells)) {
      char.spellcasting.spells.forEach((sp, idx) => {
        if (!sp.id) {
          sp.id = `spell-${idx + 1}-${sp.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
        }
        if (sp.isSave) {
          sp.saveDc = char.spellcasting.saveDc;
        }
        if (sp.damageDice) {
          const dmgStatMod = sp.addAbilityToDamage ? spellStatMod : 0;
          const totalDmgMod = dmgStatMod + (sp.damageBonusMod || 0);
          if (totalDmgMod > 0) {
            sp.damageFormula = `${sp.damageDice} + ${totalDmgMod}`;
          } else if (totalDmgMod < 0) {
            sp.damageFormula = `${sp.damageDice} - ${Math.abs(totalDmgMod)}`;
          } else {
            sp.damageFormula = sp.damageDice;
          }
        }
      });
    }
  }

  // 5. Recalculate dynamic weapon actions if configured
  if (char.actions && Array.isArray(char.actions)) {
    char.actions.forEach((act) => {
      if (act.isAuto || (act.ability && act.ability !== 'none') || act.damageDice) {
        const profBonus = act.proficient ? prof : 0;
        const statMod = (act.ability && act.ability !== 'none' && char.stats[act.ability])
          ? char.stats[act.ability].modifier
          : 0;
        const atkMod = profBonus + statMod + (act.attackBonusMod || 0);
        act.bonus = `${atkMod >= 0 ? '+' : ''}${atkMod} al Impacto`;

        const baseDice = act.damageDice || (act.damage ? act.damage.match(/^(\d+d\d+)/)?.[1] : '1d6') || '1d6';
        const dmgStatMod = (act.addAbilityToDamage !== false && act.ability && act.ability !== 'none') ? statMod : 0;
        const totalDmgMod = dmgStatMod + (act.damageBonusMod || 0);

        if (totalDmgMod > 0) {
          act.damage = `${baseDice} + ${totalDmgMod}`;
        } else if (totalDmgMod < 0) {
          act.damage = `${baseDice} - ${Math.abs(totalDmgMod)}`;
        } else {
          act.damage = baseDice;
        }
      }
    });
  }

  // 6. Ensure LayoutConfig and WildShape exist
  if (!char.layoutConfig) {
    char.layoutConfig = {
      activeTab: 'all',
      showSpells: true,
      showWildShape: false,
      showWeapons: true,
      showInventory: true,
      showJournal: true,
      showSkills: true,
      classPreset: 'custom',
      sectionOrder: {
        col1: ['abilities', 'saves', 'skills', 'features'],
        col2: ['weapons', 'wildshape', 'currency', 'backpack', 'spells'],
        unifiedOrder: ['abilities', 'saves', 'skills', 'features', 'weapons', 'wildshape', 'currency', 'backpack', 'spells']
      },
      collapsedSections: []
    };
  }

  // Ensure sectionOrder and collapsedSections are defined
  const knownSections = ['abilities', 'saves', 'skills', 'features', 'weapons', 'wildshape', 'currency', 'backpack', 'spells'];

  if (!char.layoutConfig.sectionOrder || !Array.isArray(char.layoutConfig.sectionOrder.col1) || !Array.isArray(char.layoutConfig.sectionOrder.col2)) {
    char.layoutConfig.sectionOrder = {
      col1: ['abilities', 'saves', 'skills', 'features'],
      col2: ['weapons', 'wildshape', 'currency', 'backpack', 'spells'],
      unifiedOrder: [...knownSections]
    };
  } else {
    // Ensure all 9 known sections exist in sectionOrder
    const current = new Set([...char.layoutConfig.sectionOrder.col1, ...char.layoutConfig.sectionOrder.col2]);
    for (const sec of knownSections) {
      if (!current.has(sec)) {
        char.layoutConfig.sectionOrder.col2.push(sec);
      }
    }

    if (!Array.isArray(char.layoutConfig.sectionOrder.unifiedOrder) || char.layoutConfig.sectionOrder.unifiedOrder.length === 0) {
      char.layoutConfig.sectionOrder.unifiedOrder = [...char.layoutConfig.sectionOrder.col1, ...char.layoutConfig.sectionOrder.col2];
    } else {
      const currentUnified = new Set(char.layoutConfig.sectionOrder.unifiedOrder);
      for (const sec of knownSections) {
        if (!currentUnified.has(sec)) {
          char.layoutConfig.sectionOrder.unifiedOrder.push(sec);
        }
      }
    }
  }

  if (!Array.isArray(char.layoutConfig.collapsedSections)) {
    char.layoutConfig.collapsedSections = [];
  }

  if (!char.wildShape) {
    char.wildShape = {
      usesTotal: 2,
      usesRemaining: 2,
      activeForm: null
    };
    migrateResources(char);
  }

  return char;
}
