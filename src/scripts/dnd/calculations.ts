import type { CharacterData, StatBlock, SkillItem } from '../models/character';
import { migrateSlots, migrateResources } from './resources.ts';
import { migrateAttuned } from './equipment.ts';
import { migrateArmorClass } from './ac.ts';
import { syncHitDicePools } from './rests.ts';
import { computeStat, ABILITY_KEYS, resolveModifierValue, STAT_MAX_LIMIT, STAT_MIN_LIMIT } from './stats.ts';
import { collectModifiers } from './effects.ts';
import { getSpellSlotsForClass, getSpellcastingAbilityForClass } from './spellSlots.ts';

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

export function calculatePassivePerception(char: CharacterData): number {
  const perception = char.skills?.find((s) => s.id === 'perception');
  const bonus = perception ? (perception.value ?? 0) : (char.stats?.wis?.modifier ?? 0);
  let passive = 10 + bonus;
  const mods = [
    ...collectModifiers(char, 'skill.perception'),
    ...collectModifiers(char, 'check.wis'),
  ];
  const hasAdv = mods.some((m) => m.op === 'advantage');
  const hasDisadv = mods.some((m) => m.op === 'disadvantage');
  if (hasAdv && !hasDisadv) passive += 5;
  if (hasDisadv && !hasAdv) passive -= 5;
  return passive;
}

export function calculatePassiveInsight(char: CharacterData): number {
  const insight = char.skills?.find((s) => s.id === 'insight');
  const bonus = insight ? (insight.value ?? 0) : (char.stats?.wis?.modifier ?? 0);
  let passive = 10 + bonus;
  const mods = [
    ...collectModifiers(char, 'skill.insight'),
    ...collectModifiers(char, 'check.wis'),
  ];
  const hasAdv = mods.some((m) => m.op === 'advantage');
  const hasDisadv = mods.some((m) => m.op === 'disadvantage');
  if (hasAdv && !hasDisadv) passive += 5;
  if (hasDisadv && !hasAdv) passive -= 5;
  return passive;
}

export function calculatePassiveInvestigation(char: CharacterData): number {
  const inv = char.skills?.find((s) => s.id === 'investigation');
  const bonus = inv ? (inv.value ?? 0) : (char.stats?.int?.modifier ?? 0);
  let passive = 10 + bonus;
  const mods = [
    ...collectModifiers(char, 'skill.investigation'),
    ...collectModifiers(char, 'check.int'),
  ];
  const hasAdv = mods.some((m) => m.op === 'advantage');
  const hasDisadv = mods.some((m) => m.op === 'disadvantage');
  if (hasAdv && !hasDisadv) passive += 5;
  if (hasDisadv && !hasAdv) passive -= 5;
  return passive;
}

export function computeSpeed(char: CharacterData): { speedFt: number; speedNote: string; penalty: number } {
  const base = typeof char.baseSpeedFt === 'number' && Number.isFinite(char.baseSpeedFt)
    ? char.baseSpeedFt
    : (typeof char.speedFt === 'number' && Number.isFinite(char.speedFt) ? char.speedFt : 30);

  let effective = base;
  let penalty = 0;

  // Regla 5e: armadura pesada requiere Fuerza mínima (strMin). Si no la cumple, reduce velocidad en 10 pies.
  // Los enanos ignoran esta penalización por rasgo racial.
  const isDwarf = /enano|dwarf/i.test(char.race ?? '');
  if (!isDwarf) {
    const charStr = char.stats?.str?.score ?? 10;
    const heavyArmor = (char.inventory ?? []).find(
      (i) => i.equipped && i.armor && i.armor.category === 'heavy' && typeof i.armor.strMin === 'number' && charStr < i.armor.strMin
    );
    if (heavyArmor) {
      penalty += 10;
      effective = Math.max(5, effective - 10);
    }
  }

  // Modificadores de efectos activos a 'speed'
  for (const m of collectModifiers(char, 'speed')) {
    if (m.op === 'add') {
      effective += resolveModifierValue(char, m);
    }
  }

  effective = Math.max(0, effective);
  const squares = Math.floor(effective / 5);
  const speedNote = penalty > 0
    ? `${squares} casillas (-10 ft por armadura)`
    : `${squares} casillas`;

  return { speedFt: effective, speedNote, penalty };
}

export function recalculateCharacter(char: CharacterData): CharacterData {
  // Migraciones idempotentes (Spec 07, Fase A): slots 1–9 y registro de recursos.
  // wildShape se crea más abajo si falta, por eso migrateResources se repite al final.
  migrateSlots(char);
  migrateResources(char);
  // Spec 08, Fase A: attunedItems pasa a ser `attuned` en el inventario.
  migrateAttuned(char);
  if (!Array.isArray(char.activeEffects)) char.activeEffects = [];
  // Spec 08, Fase C: competencias cargadas a mano; ausente = vacío.
  if (!char.proficiencies) char.proficiencies = { armor: [], weapons: [] };
  if (!Array.isArray(char.proficiencies.armor)) char.proficiencies.armor = [];
  if (!Array.isArray(char.proficiencies.weapons)) char.proficiencies.weapons = [];
  // Spec 08, Fase D (FD-6): `armorClass` pasa a ser un override; si coincide con el cálculo se limpia.
  migrateArmorClass(char);
  // Spec 10, Fase A: Sincronización de dados de golpe (monoclass y multiclass) alineada al nivel.
  syncHitDicePools(char);
  // Spec 11, Fase A: Estado volátil de turno para combate.
  if (!char.turnState) char.turnState = { usedModifiers: [] };
  if (!Array.isArray(char.turnState.usedModifiers)) char.turnState.usedModifiers = [];
  // DECISION (FD-9): `armorNote` ya no es la descripción automática. La nota que traía el personaje de
  // ejemplo se limpia (exacta, para no tocar notas escritas por el usuario).
  if (char.armorNote === 'Cuero tach. + Escudo') char.armorNote = '';

  if (!char.rulesEdition) {
    char.rulesEdition = '2024';
  }
  const prof = calculateProficiencyBonus(char.level);
  char.proficiencyBonus = prof;

  // 1. Recalculate dynamic stats and modifiers (Spec: Stats from Items & Effects, max cap 20)
  ABILITY_KEYS.forEach((key) => {
    if (typeof char.stats[key].baseScore !== 'number') {
      char.stats[key].baseScore = char.stats[key].score;
    }
    char.stats[key].baseScore = Math.min(STAT_MAX_LIMIT, Math.max(STAT_MIN_LIMIT, char.stats[key].baseScore));
    const computed = computeStat(char, key);
    char.stats[key].score = computed.total;
    char.stats[key].modifier = computed.modifier;
  });

  // 2. Initiative defaults to DEX modifier + dynamic modifiers (e.g. initiative add wis/cha)
  char.initiativeBonus = char.stats.dex.modifier;
  for (const m of collectModifiers(char, 'initiative')) {
    if (m.op === 'add') char.initiativeBonus += resolveModifierValue(char, m);
  }

  // Speed calculation
  if (typeof char.baseSpeedFt !== 'number') {
    char.baseSpeedFt = typeof char.speedFt === 'number' && Number.isFinite(char.speedFt) ? char.speedFt : 30;
  }
  const speedRes = computeSpeed(char);
  char.speedFt = speedRes.speedFt;
  char.speedNote = speedRes.speedNote;

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

    // Modificadores dinámicos para esta habilidad o para pruebas de esta característica
    // (Ej: check.cha add wis para Glamour Sobrenatural)
    const skillMods = [
      ...collectModifiers(char, `skill.${std.id}`),
      ...collectModifiers(char, `check.${std.stat}`),
    ];
    for (const m of skillMods) {
      if (m.op === 'add') {
        skillBonus += resolveModifierValue(char, m);
      }
    }

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

  // Passive senses
  char.passivePerception = calculatePassivePerception(char);
  char.passiveInsight = calculatePassiveInsight(char);
  char.passiveInvestigation = calculatePassiveInvestigation(char);

  // 4. Recalculate Spellcasting if present
  if (char.spellcasting) {
    if (!char.spellcasting.ability) {
      char.spellcasting.ability = getSpellcastingAbilityForClass(char.className) || 'wis';
    }

    const expectedSlots = getSpellSlotsForClass(char.className, char.level, char.rulesEdition, char.subclass);
    if (expectedSlots) {
      if (!char.spellcasting.slots) char.spellcasting.slots = {} as any;
      for (let lvl = 1; lvl <= 9; lvl++) {
        const total = expectedSlots[lvl] ?? 0;
        const current = char.spellcasting.slots[lvl] ?? { total: 0, used: 0 };
        char.spellcasting.slots[lvl] = {
          total,
          used: Math.min(current.used, total),
        };
      }
    }

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
        col2: ['weapons', 'wildshape', 'companions', 'currency', 'backpack', 'spells'],
        unifiedOrder: ['abilities', 'saves', 'skills', 'features', 'weapons', 'wildshape', 'companions', 'currency', 'backpack', 'spells']
      },
      collapsedSections: []
    };
  }

  // Ensure sectionOrder and collapsedSections are defined
  const knownSections = ['abilities', 'saves', 'skills', 'features', 'weapons', 'wildshape', 'companions', 'currency', 'backpack', 'spells'];

  if (!char.layoutConfig.sectionOrder || !Array.isArray(char.layoutConfig.sectionOrder.col1) || !Array.isArray(char.layoutConfig.sectionOrder.col2)) {
    char.layoutConfig.sectionOrder = {
      col1: ['abilities', 'saves', 'skills', 'features'],
      col2: ['weapons', 'wildshape', 'companions', 'currency', 'backpack', 'spells'],
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
