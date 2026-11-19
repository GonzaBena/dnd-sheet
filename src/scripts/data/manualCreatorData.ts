// src/scripts/data/manualCreatorData.ts
import type {
  CharacterData,
  CharacterFeature,
  InventoryItem,
  SpellItem,
} from '../models/character.ts';
import { CHARACTER_CLASSES, CLASS_DEFINITIONS, type AbilityKeyType } from '../dnd/classes.ts';
import {
  STANDARD_5E_SKILLS,
  calculateModifier,
  calculateProficiencyBonus,
  recalculateCharacter,
} from '../dnd/calculations.ts';
import { getSpellcastingAbilityForClass } from '../dnd/spellSlots.ts';
import { buildAttackFromWeapon } from '../dnd/weaponAttack.ts';
import { defaultCharacter, CHARACTER_PRESET_IMAGES } from './defaultCharacter.ts';
import {
  QUICK_RACES,
  QUICK_CLASSES,
  QUICK_BACKGROUNDS,
  QUICK_NAME_SUGGESTIONS,
  type QuickRaceOption,
  type QuickClassOption,
  type QuickBackgroundOption,
} from './quickCreatorData.ts';

export {
  CHARACTER_PRESET_IMAGES,
  QUICK_RACES,
  QUICK_CLASSES,
  QUICK_BACKGROUNDS,
  QUICK_NAME_SUGGESTIONS,
  STANDARD_5E_SKILLS,
  type QuickRaceOption,
  type QuickClassOption,
  type QuickBackgroundOption,
  type AbilityKeyType,
};

export type ManualStatMethod = 'free' | 'pointbuy' | 'standard' | 'dice';
export type OriginBonusMode = 'none' | '2-1' | '1-1-1';
export type SkillProfState = 'none' | 'proficient' | 'expertise';
export type EquipmentStartMode = 'class-kit' | 'blank';

export const POINT_BUY_TOTAL = 27;
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;

export const POINT_BUY_COSTS: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

export const STANDARD_ARRAY: readonly number[] = [15, 14, 13, 12, 10, 8];

export interface DiceStatRoll {
  rolls: [number, number, number, number];
  droppedIndex: number;
  total: number;
}

export interface BackpackSupplyOption {
  id: string;
  name: string;
  tagline: string;
  quantity: number;
  category: 'potion' | 'gear' | 'treasure';
  icon: string;
  description: string;
  usableType: 'none' | 'potion' | 'drinkable' | 'edible' | 'usable';
  healAmount?: number;
  activationCondition?: string;
  defaultSelected: boolean;
}

import { CLASS_STARTER_KITS, type ClassStarterKit } from './classStarterKits.ts';
export { CLASS_STARTER_KITS, type ClassStarterKit };

export function clampScore(score: number, min = 1, max = 20): number {
  const n = Math.round(Number(score) || 10);
  return Math.max(min, Math.min(max, n));
}

/**
 * Calcula los puntos gastados en Point Buy (27 puntos máx, rango 8–15).
 */
export function calculatePointBuySpent(scores: Record<AbilityKeyType, number>): number {
  const keys: AbilityKeyType[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  return keys.reduce((acc, k) => {
    const val = clampScore(scores[k], POINT_BUY_MIN, POINT_BUY_MAX);
    return acc + (POINT_BUY_COSTS[val] ?? 0);
  }, 0);
}

/**
 * Reparte el Standard Array (15, 14, 13, 12, 10, 8) según la prioridad de la clase elegida.
 */
export function assignStandardArrayForClass(classOption: QuickClassOption): Record<AbilityKeyType, number> {
  const result = {} as Record<AbilityKeyType, number>;
  classOption.abilityPriority.forEach((key, idx) => {
    result[key] = STANDARD_ARRAY[idx] ?? 10;
  });
  return result;
}

/**
 * Tira 4d6 y descarta el dado más bajo. Permite inyectar un generador aleatorio para pruebas deterministas.
 */
export function roll4d6DropLowest(rng: () => number = Math.random): DiceStatRoll {
  const rolls: [number, number, number, number] = [
    Math.floor(rng() * 6) + 1,
    Math.floor(rng() * 6) + 1,
    Math.floor(rng() * 6) + 1,
    Math.floor(rng() * 6) + 1,
  ];
  let minVal = rolls[0];
  let droppedIndex = 0;
  for (let i = 1; i < 4; i++) {
    if (rolls[i] < minVal) {
      minVal = rolls[i];
      droppedIndex = i;
    }
  }
  const total = rolls.reduce((sum, val, idx) => (idx === droppedIndex ? sum : sum + val), 0);
  return { rolls, droppedIndex, total };
}

/**
 * Genera 6 tiradas de 4d6 descartando el menor.
 */
export function rollFullStatSet(rng: () => number = Math.random): DiceStatRoll[] {
  return Array.from({ length: 6 }, () => roll4d6DropLowest(rng));
}

/**
 * Aplica los bonificadores de origen (+2/+1 o +1/+1/+1) sobre las puntuaciones base respetando el tope de 20.
 */
export function applyOriginBonuses(
  baseScores: Record<AbilityKeyType, number>,
  mode: OriginBonusMode,
  plus2Stat?: AbilityKeyType | null,
  plus1Stats: AbilityKeyType[] = []
): Record<AbilityKeyType, number> {
  const out: Record<AbilityKeyType, number> = {
    str: clampScore(baseScores.str),
    dex: clampScore(baseScores.dex),
    con: clampScore(baseScores.con),
    int: clampScore(baseScores.int),
    wis: clampScore(baseScores.wis),
    cha: clampScore(baseScores.cha),
  };

  if (mode === '2-1') {
    if (plus2Stat) {
      out[plus2Stat] = clampScore(out[plus2Stat] + 2);
    }
    const p1 = plus1Stats.find((s) => s !== plus2Stat);
    if (p1) {
      out[p1] = clampScore(out[p1] + 1);
    }
  } else if (mode === '1-1-1') {
    const unique = Array.from(new Set(plus1Stats)).slice(0, 3);
    for (const st of unique) {
      out[st] = clampScore(out[st] + 1);
    }
  }

  return out;
}

/**
 * Calcula los Puntos de Golpe máximos sugeridos según clase/dado de golpe, nivel, CON y raza.
 */
export function computeSuggestedMaxHp(params: {
  level: number;
  hitDie: string;
  conScore: number;
  raceHpBonusPerLevel?: number;
}): number {
  const level = Math.max(1, Math.min(20, Number(params.level) || 1));
  const hitDieMax = Number(String(params.hitDie).replace(/\D/g, '')) || 8;
  const hitDieAvg = Math.floor(hitDieMax / 2) + 1;
  const conMod = calculateModifier(params.conScore);
  const raceBonus = (params.raceHpBonusPerLevel || 0) * level;
  return Math.max(
    level,
    hitDieMax + conMod + (level - 1) * Math.max(1, hitDieAvg + conMod) + raceBonus
  );
}

/**
 * Mapea los nombres en español de habilidades de trasfondo a los IDs de STANDARD_5E_SKILLS.
 */
const SKILL_NAME_TO_ID: Record<string, string> = {
  acrobacias: 'acrobatics',
  'trato con animales': 'animal-handling',
  'conocimiento arcano': 'arcana',
  arcanos: 'arcana',
  atletismo: 'athletics',
  engano: 'deception',
  historia: 'history',
  perspicacia: 'insight',
  intimidacion: 'intimidation',
  investigacion: 'investigation',
  medicina: 'medicine',
  naturaleza: 'nature',
  percepcion: 'perception',
  interpretacion: 'performance',
  persuasion: 'persuasion',
  religion: 'religion',
  'juego de manos': 'sleight-of-hand',
  sigilo: 'stealth',
  supervivencia: 'survival',
};

export function resolveBackgroundSkillIds(bg: QuickBackgroundOption): string[] {
  return bg.skillsEs
    .map((label) => {
      const clean = label
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
      return SKILL_NAME_TO_ID[clean];
    })
    .filter((id): id is string => Boolean(id));
}

/**
 * Catálogo de objetos opcionales de mochila para elegir en el último paso del Creador Manual.
 */
export const BACKPACK_STARTER_OPTIONS: readonly BackpackSupplyOption[] = [
  {
    id: 'pack-potion-heal',
    name: 'Poción de Curación',
    tagline: '2 frascos • +7 PG',
    quantity: 2,
    category: 'potion',
    icon: 'vital_signs',
    description: 'Recupera 7 PG al instante al beberla.',
    usableType: 'drinkable',
    healAmount: 7,
    activationCondition: '1 acción / Acción adicional (2024)',
    defaultSelected: true,
  },
  {
    id: 'pack-rations',
    name: 'Raciones de Viaje',
    tagline: '5 días • Comida seca',
    quantity: 5,
    category: 'gear',
    icon: 'lunch_dining',
    description: 'Alimento concentrado de viaje para acampar en tierras salvajes.',
    usableType: 'edible',
    healAmount: 2,
    activationCondition: 'Durante descanso corto',
    defaultSelected: true,
  },
  {
    id: 'pack-rope',
    name: 'Cuerda de Seda (50 ft)',
    tagline: '15 m • Escalada y nudos',
    quantity: 1,
    category: 'gear',
    icon: 'cable',
    description: 'Cuerda resistente de 50 pies indispensable para explorar mazmorras.',
    usableType: 'usable',
    activationCondition: 'Uso manual',
    defaultSelected: true,
  },
  {
    id: 'pack-torches',
    name: 'Antorchas de Resina',
    tagline: '5 uds • Luz 20/40 ft',
    quantity: 5,
    category: 'gear',
    icon: 'local_fire_department',
    description: 'Ilumina 20 pies con luz brillante y 20 pies adicionales de luz tenue durante 1 hora.',
    usableType: 'usable',
    activationCondition: '1 acción para encender',
    defaultSelected: true,
  },
  {
    id: 'pack-bedroll',
    name: 'Saco de Dormir y Manta',
    tagline: 'Equipo de acampada',
    quantity: 1,
    category: 'gear',
    icon: 'hotel',
    description: 'Petate enrollable impermeable para descansar a la intemperie.',
    usableType: 'none',
    defaultSelected: false,
  },
  {
    id: 'pack-healer-kit',
    name: 'Botiquín de Curandero',
    tagline: '10 usos • Estabilizar',
    quantity: 1,
    category: 'gear',
    icon: 'medical_services',
    description: 'Vendas, ungüentos y tablillas para estabilizar aliados a 0 PG sin tirada de Medicina.',
    usableType: 'usable',
    activationCondition: '1 acción al tocar aliado caído',
    defaultSelected: false,
  },
  {
    id: 'pack-thieves-tools',
    name: 'Herramientas de Ladrón',
    tagline: 'Ganzúas y lima',
    quantity: 1,
    category: 'gear',
    icon: 'key',
    description: 'Estuche con ganzúas de precisión, espejo pequeño y alicates para abrir cerraduras y desarmar trampas.',
    usableType: 'usable',
    activationCondition: 'Prueba de Destreza',
    defaultSelected: false,
  },
  {
    id: 'pack-waterskin',
    name: 'Odre de Agua Pura',
    tagline: 'Capacidad 4 pintas',
    quantity: 1,
    category: 'gear',
    icon: 'water_drop',
    description: 'Odre de cuero curtido lleno de agua fresca para largas marchas.',
    usableType: 'drinkable',
    defaultSelected: false,
  },
  {
    id: 'pack-crowbar',
    name: 'Palanqueta de Hierro',
    tagline: 'Ventaja en Fuerza',
    quantity: 1,
    category: 'gear',
    icon: 'handyman',
    description: 'Otorga ventaja en pruebas de Fuerza donde se pueda hacer palanca en puertas o cofres.',
    usableType: 'usable',
    defaultSelected: false,
  },
  {
    id: 'pack-antidote',
    name: 'Antídoto Alquímico',
    tagline: '1 vial • Contra veneno',
    quantity: 1,
    category: 'potion',
    icon: 'science',
    description: 'Neutraliza un efecto de veneno activo en quien lo bebe.',
    usableType: 'drinkable',
    activationCondition: '1 acción',
    defaultSelected: false,
  },
  {
    id: 'pack-arcane-focus',
    name: 'Foco Arcano / Símbolo Sagrado',
    tagline: 'Canalizador mágico',
    quantity: 1,
    category: 'gear',
    icon: 'auto_fix_high',
    description: 'Orbe, vara o relicario engarzado para canalizar conjuros sin componentes materiales comunes.',
    usableType: 'none',
    defaultSelected: false,
  },
  {
    id: 'pack-tinderbox',
    name: 'Yesquero y Pedernal',
    tagline: 'Fuego rápido',
    quantity: 1,
    category: 'gear',
    icon: 'flare',
    description: 'Caja metálica con pedernal, eslabón y mecha seca para encender hogueras y antorchas.',
    usableType: 'usable',
    defaultSelected: false,
  },
];

export interface ManualCreatorInput {
  name: string;
  title?: string;
  quote?: string;
  level: number;
  alignment: string;
  rulesEdition: '2024' | '2014';
  avatarUrl: string;
  raceOption: QuickRaceOption;
  customRaceName?: string;
  classOption: QuickClassOption;
  subclass?: string;
  hitDie?: 'd6' | 'd8' | 'd10' | 'd12';
  baseSpeedFt?: number;
  backgroundOption: QuickBackgroundOption;
  customOriginFeatTitle?: string;
  customOriginFeatDesc?: string;
  /** Puntuaciones base (antes de bonos de origen) */
  baseScores: Record<AbilityKeyType, number>;
  originBonusMode?: OriginBonusMode;
  originPlus2?: AbilityKeyType | null;
  originPlus1?: AbilityKeyType[];
  /** PG máximos (si el usuario lo sobreescribe o el calculado) */
  maxHp?: number;
  /** CA manual opcional (undefined o null = CA calculada automática) */
  manualAc?: number | null;
  /** Salvaciones con competencia */
  savingThrows?: AbilityKeyType[];
  /** Estado de las 18 habilidades ('none' | 'proficient' | 'expertise') */
  skillStates?: Record<string, SkillProfState>;
  /** Competencias de armadura y arma */
  armorProficiencies?: string[];
  weaponProficiencies?: string[];
  /** Equipamiento inicial: kit de clase o en blanco */
  equipmentMode?: EquipmentStartMode;
  /** IDs de suministros de mochila seleccionados de BACKPACK_STARTER_OPTIONS */
  selectedBackpackIds?: string[];
  /** Monedas iniciales */
  currency?: {
    gp: number;
    sp: number;
    cp: number;
  };
}

/**
 * Construye el personaje completo a partir de los 5 pasos del Creador Manual.
 */
export function buildCharacterFromManualCreator(input: ManualCreatorInput): Partial<CharacterData> {
  const base = JSON.parse(JSON.stringify(defaultCharacter)) as CharacterData;
  const classDef = CLASS_DEFINITIONS[input.classOption.name];
  const level = Math.max(1, Math.min(20, Number(input.level) || 1));
  const profBonus = calculateProficiencyBonus(level);
  const hitDie = input.hitDie || classDef.hitDie;
  const speedFt = Math.max(5, Number(input.baseSpeedFt) || input.raceOption.speedFt || 30);

  const finalScores = applyOriginBonuses(
    input.baseScores,
    input.originBonusMode || 'none',
    input.originPlus2,
    input.originPlus1 || []
  );

  const hpMax =
    typeof input.maxHp === 'number' && Number.isFinite(input.maxHp) && input.maxHp >= 1
      ? Math.round(input.maxHp)
      : computeSuggestedMaxHp({
          level,
          hitDie,
          conScore: finalScores.con,
          raceHpBonusPerLevel: input.raceOption.hpBonusPerLevel,
        });

  const savesSet = new Set<AbilityKeyType>(
    input.savingThrows ?? classDef.savingThrows
  );

  const skillStates = input.skillStates || {};
  const skills = STANDARD_5E_SKILLS.map((std) => {
    const state = skillStates[std.id] || 'none';
    const proficient = state === 'proficient' || state === 'expertise';
    const expertise = state === 'expertise';
    const modVal = calculateModifier(finalScores[std.stat]);
    const val = modVal + (proficient ? profBonus : 0) + (expertise ? profBonus : 0);
    return {
      id: std.id,
      name: std.name,
      stat: std.stat,
      proficient,
      expertise,
      customBonus: 0,
      value: val,
    };
  });

  const raceName = input.customRaceName?.trim() || input.raceOption.name;
  const subclassName =
    input.subclass !== undefined
      ? input.subclass.trim()
      : level >= 3
      ? input.classOption.defaultSubclass
      : '';

  const featTitle = input.customOriginFeatTitle?.trim() || input.backgroundOption.originFeatTitle;
  const featDesc = input.customOriginFeatDesc?.trim() || input.backgroundOption.originFeatDesc;

  const originFeature: CharacterFeature = {
    id: `feat-${input.backgroundOption.id}`,
    title: featTitle,
    description: featDesc,
    uses: 'Pasivo / Origen',
    enabled: true,
  };

  const kit = CLASS_STARTER_KITS[input.classOption.name];
  const equipMode: EquipmentStartMode = input.equipmentMode || 'class-kit';

  const kitItems: InventoryItem[] =
    equipMode === 'class-kit' ? JSON.parse(JSON.stringify(kit.equipment)) : [];

  const chosenSupplyIds =
    input.selectedBackpackIds ??
    BACKPACK_STARTER_OPTIONS.filter((o) => o.defaultSelected).map((o) => o.id);

  const supplyItems: InventoryItem[] = BACKPACK_STARTER_OPTIONS.filter((o) =>
    chosenSupplyIds.includes(o.id)
  ).map((o) => ({
    id: o.id,
    name: o.name,
    quantity: o.quantity,
    category: o.category,
    icon: o.icon,
    description: o.description,
    usableType: o.usableType,
    ...(o.healAmount ? { healAmount: o.healAmount } : {}),
    ...(o.activationCondition ? { activationCondition: o.activationCondition } : {}),
  }));

  const fullInventory: InventoryItem[] = [...kitItems, ...supplyItems];

  const proficiencies = {
    armor: input.armorProficiencies ? [...input.armorProficiencies] : [...classDef.armorProficiencies],
    weapons: input.weaponProficiencies ? [...input.weaponProficiencies] : [...classDef.weaponProficiencies],
  };

  const spellAbility = getSpellcastingAbilityForClass(input.classOption.name) || 'wis';
  const starterSpells: SpellItem[] =
    equipMode === 'class-kit' ? JSON.parse(JSON.stringify(kit.spells)) : [];

  const draftChar: CharacterData = {
    ...base,
    name: input.name.trim() || 'Nuevo Aventurero',
    title:
      input.title?.trim() ||
      `${input.backgroundOption.name} • ${input.classOption.name} ${raceName}`,
    race: raceName,
    alignment: input.alignment || 'Neutral Bueno',
    className: input.classOption.name,
    subclass: subclassName,
    level,
    proficiencyBonus: profBonus,
    rulesEdition: input.rulesEdition || '2024',
    avatarUrl: input.avatarUrl || input.classOption.avatarUrl,
    quote:
      input.quote?.trim() ||
      `"${input.backgroundOption.name}: ${input.backgroundOption.description}"`,
    hp: {
      current: hpMax,
      max: hpMax,
      temp: 0,
    },
    armorNote: '',
    initiativeBonus: calculateModifier(finalScores.dex),
    baseSpeedFt: speedFt,
    speedFt,
    speedNote: `${Math.floor(speedFt / 5)} casillas`,
    hitDice: {
      total: level,
      remaining: level,
      die: hitDie,
    },
    stats: {
      str: { score: finalScores.str, baseScore: finalScores.str, modifier: calculateModifier(finalScores.str), savingProficient: savesSet.has('str') },
      dex: { score: finalScores.dex, baseScore: finalScores.dex, modifier: calculateModifier(finalScores.dex), savingProficient: savesSet.has('dex') },
      con: { score: finalScores.con, baseScore: finalScores.con, modifier: calculateModifier(finalScores.con), savingProficient: savesSet.has('con') },
      int: { score: finalScores.int, baseScore: finalScores.int, modifier: calculateModifier(finalScores.int), savingProficient: savesSet.has('int') },
      wis: { score: finalScores.wis, baseScore: finalScores.wis, modifier: calculateModifier(finalScores.wis), savingProficient: savesSet.has('wis') },
      cha: { score: finalScores.cha, baseScore: finalScores.cha, modifier: calculateModifier(finalScores.cha), savingProficient: savesSet.has('cha') },
    },
    skills,
    actions: [],
    currency: {
      cp: Math.max(0, Number(input.currency?.cp ?? 0)),
      sp: Math.max(0, Number(input.currency?.sp ?? 0)),
      ep: 0,
      gp: Math.max(0, Number(input.currency?.gp ?? kit.defaultGold)),
      pp: 0,
    },
    attunedItems: [],
    inventory: fullInventory,
    quickSlotItemId: supplyItems.find((i) => i.category === 'potion')?.id,
    spellcasting: {
      ability: spellAbility,
      saveDc: 8 + profBonus + calculateModifier(finalScores[spellAbility]),
      attackBonus: profBonus + calculateModifier(finalScores[spellAbility]),
      slots: {
        1: { total: 0, used: 0 },
        2: { total: 0, used: 0 },
        3: { total: 0, used: 0 },
        4: { total: 0, used: 0 },
        5: { total: 0, used: 0 },
        6: { total: 0, used: 0 },
        7: { total: 0, used: 0 },
        8: { total: 0, used: 0 },
        9: { total: 0, used: 0 },
      },
      spells: starterSpells,
    },
    resources: [],
    activeEffects: [],
    proficiencies,
    features: [originFeature],
    layoutConfig: {
      ...base.layoutConfig!,
      showWildShape: input.classOption.name === 'Druida',
      showSpells: ['Bardo', 'Brujo', 'Clérigo', 'Druida', 'Explorador', 'Hechicero', 'Mago', 'Paladín'].includes(input.classOption.name),
    },
  };

  if (typeof input.manualAc === 'number' && Number.isFinite(input.manualAc) && input.manualAc > 0) {
    draftChar.armorClass = Math.round(input.manualAc);
  } else {
    delete draftChar.armorClass;
  }

  // Build weapon attack actions from starter kit weapons
  draftChar.actions = fullInventory
    .filter((item) => item.weapon)
    .map((item) => {
      const act = buildAttackFromWeapon(draftChar, item);
      if (item.equipped) {
        act.equipped = true;
        act.slot = item.slot;
        act.hands = item.hands;
      }
      return act;
    });

  const recalculated = recalculateCharacter(draftChar);
  return recalculated;
}
