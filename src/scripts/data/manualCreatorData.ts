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

export interface ClassStarterKit {
  className: (typeof CHARACTER_CLASSES)[number];
  summary: string;
  weaponsSummary: string;
  armorSummary: string;
  spellsSummary: string;
  defaultGold: number;
  equipment: InventoryItem[];
  spells: SpellItem[];
}

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

/**
 * Kits de equipamiento y conjuros iniciales sugeridos para las 12 clases del SRD.
 */
export const CLASS_STARTER_KITS: Record<(typeof CHARACTER_CLASSES)[number], ClassStarterKit> = {
  Guerrero: {
    className: 'Guerrero',
    summary: 'Cota de malla, Espada larga y Escudo de acero',
    weaponsSummary: 'Espada Larga (1d8 cortante)',
    armorSummary: 'Cota de Malla (CA 16) + Escudo (+2 CA)',
    spellsSummary: 'Sin conjuros iniciales',
    defaultGold: 25,
    equipment: [
      {
        id: 'kit-fighter-longsword',
        name: 'Espada Larga',
        quantity: 1,
        category: 'weapon',
        equipped: true,
        slot: 'mainHand',
        hands: 1,
        weapon: {
          category: 'martial',
          damageDice: '1d8',
          damageType: 'slashing',
          properties: ['versatile'],
          versatileDice: '1d10',
        },
      },
      {
        id: 'kit-fighter-chainmail',
        name: 'Cota de Malla',
        quantity: 1,
        category: 'armor',
        equipped: true,
        slot: 'body',
        armor: { category: 'heavy', baseAc: 16, dexCap: 0, strMin: 13, stealthDisadv: true },
      },
      {
        id: 'kit-fighter-shield',
        name: 'Escudo de Acero',
        quantity: 1,
        category: 'armor',
        equipped: true,
        slot: 'shield',
        armor: { category: 'shield', baseAc: 2 },
      },
    ],
    spells: [],
  },
  Explorador: {
    className: 'Explorador',
    summary: 'Armadura de cuero tachonado, Arco largo y Espada corta',
    weaponsSummary: 'Arco Largo (1d8 perforante) y Espada Corta (1d6)',
    armorSummary: 'Cuero Tachonado (CA 12 + DES)',
    spellsSummary: 'Marca del Cazador y Curar Heridas',
    defaultGold: 20,
    equipment: [
      {
        id: 'kit-ranger-longbow',
        name: 'Arco Largo',
        quantity: 1,
        category: 'weapon',
        equipped: true,
        slot: 'mainHand',
        hands: 2,
        weapon: {
          category: 'martial',
          damageDice: '1d8',
          damageType: 'piercing',
          properties: ['ammunition', 'heavy', 'two-handed'],
          range: { normal: 150, long: 600 },
        },
      },
      {
        id: 'kit-ranger-shortsword',
        name: 'Espada Corta',
        quantity: 1,
        category: 'weapon',
        equipped: false,
        hands: 1,
        weapon: {
          category: 'martial',
          damageDice: '1d6',
          damageType: 'piercing',
          properties: ['finesse', 'light'],
        },
      },
      {
        id: 'kit-ranger-armor',
        name: 'Armadura de Cuero Tachonado',
        quantity: 1,
        category: 'armor',
        equipped: true,
        slot: 'body',
        armor: { category: 'light', baseAc: 12, dexCap: null },
      },
    ],
    spells: [
      {
        id: 'kit-spell-hunters-mark',
        name: 'Marca del Cazador',
        level: 1,
        school: 'Adivinación',
        castingTime: 'Acción adicional',
        range: '90 ft',
        duration: 'Concentración, hasta 1 hora',
        components: 'V',
        damageDice: '1d6',
        damageType: 'Fuerza',
        notes: 'Infliges +1d6 de daño adicional al objetivo marcado cuando lo impactas con un ataque.',
      },
      {
        id: 'kit-spell-cure-wounds-rgr',
        name: 'Curar Heridas',
        level: 1,
        school: 'Abjuración',
        castingTime: '1 acción',
        range: 'Toque',
        duration: 'Instantáneo',
        components: 'V, S',
        damageDice: '2d8',
        damageType: 'Curación',
        addAbilityToDamage: true,
        notes: 'Una criatura que tocas recupera puntos de golpe.',
      },
    ],
  },
  Bárbaro: {
    className: 'Bárbaro',
    summary: 'Gran Hacha a dos manos y Jabalinas de caza',
    weaponsSummary: 'Gran Hacha (1d12 cortante) y 2 Jabalinas (1d6)',
    armorSummary: 'Defensa sin Armadura (10 + DES + CON)',
    spellsSummary: 'Sin conjuros iniciales',
    defaultGold: 15,
    equipment: [
      {
        id: 'kit-barb-greataxe',
        name: 'Gran Hacha',
        quantity: 1,
        category: 'weapon',
        equipped: true,
        slot: 'mainHand',
        hands: 2,
        weapon: {
          category: 'martial',
          damageDice: '1d12',
          damageType: 'slashing',
          properties: ['heavy', 'two-handed'],
        },
      },
      {
        id: 'kit-barb-javelin',
        name: 'Jabalina',
        quantity: 2,
        category: 'weapon',
        equipped: false,
        hands: 1,
        weapon: {
          category: 'simple',
          damageDice: '1d6',
          damageType: 'piercing',
          properties: ['thrown'],
          range: { normal: 30, long: 120 },
        },
      },
    ],
    spells: [],
  },
  Bardo: {
    className: 'Bardo',
    summary: 'Armadura de cuero, Estoque elegante y grimorio musical',
    weaponsSummary: 'Estoque (1d8 perforante, sutil)',
    armorSummary: 'Armadura de Cuero (CA 11 + DES)',
    spellsSummary: 'Burla Dañina, Palabra de Curación y Onda Trueno',
    defaultGold: 25,
    equipment: [
      {
        id: 'kit-bard-rapier',
        name: 'Estoque',
        quantity: 1,
        category: 'weapon',
        equipped: true,
        slot: 'mainHand',
        hands: 1,
        weapon: {
          category: 'martial',
          damageDice: '1d8',
          damageType: 'piercing',
          properties: ['finesse'],
        },
      },
      {
        id: 'kit-bard-leather',
        name: 'Armadura de Cuero',
        quantity: 1,
        category: 'armor',
        equipped: true,
        slot: 'body',
        armor: { category: 'light', baseAc: 11, dexCap: null },
      },
    ],
    spells: [
      {
        id: 'kit-spell-vicious-mockery',
        name: 'Burla Dañina',
        level: 0,
        school: 'Encantamiento',
        castingTime: '1 acción',
        range: '60 ft',
        duration: 'Instantáneo',
        components: 'V',
        isSave: true,
        saveAbility: 'wis',
        damageDice: '1d6',
        damageType: 'Psíquico',
        notes: 'El objetivo sufre daño psíquico y tiene desventaja en su siguiente tirada de ataque.',
      },
      {
        id: 'kit-spell-healing-word',
        name: 'Palabra de Curación',
        level: 1,
        school: 'Abjuración',
        castingTime: 'Acción adicional',
        range: '60 ft',
        duration: 'Instantáneo',
        components: 'V',
        damageDice: '2d4',
        damageType: 'Curación',
        addAbilityToDamage: true,
        notes: 'Una criatura visible a alcance recupera PG al instante.',
      },
      {
        id: 'kit-spell-thunderwave',
        name: 'Onda Trueno',
        level: 1,
        school: 'Evocación',
        castingTime: '1 acción',
        range: 'Personal (cubo 15 ft)',
        duration: 'Instantáneo',
        components: 'V, S',
        isSave: true,
        saveAbility: 'con',
        damageDice: '2d8',
        damageType: 'Trueno',
        notes: 'Onda de fuerza atronadora que daña y empuja 10 pies.',
      },
    ],
  },
  Brujo: {
    className: 'Brujo',
    summary: 'Armadura de cuero, Daga ritual y conjuros del Pacto',
    weaponsSummary: 'Daga Ritual (1d4 perforante, sutil)',
    armorSummary: 'Armadura de Cuero (CA 11 + DES)',
    spellsSummary: 'Descarga Sobrenatural, Maleficio (Hex) y Reprensión Infernal',
    defaultGold: 20,
    equipment: [
      {
        id: 'kit-warlock-dagger',
        name: 'Daga Ritual',
        quantity: 1,
        category: 'weapon',
        equipped: true,
        slot: 'mainHand',
        hands: 1,
        weapon: {
          category: 'simple',
          damageDice: '1d4',
          damageType: 'piercing',
          properties: ['finesse', 'light', 'thrown'],
          range: { normal: 20, long: 60 },
        },
      },
      {
        id: 'kit-warlock-leather',
        name: 'Armadura de Cuero',
        quantity: 1,
        category: 'armor',
        equipped: true,
        slot: 'body',
        armor: { category: 'light', baseAc: 11, dexCap: null },
      },
    ],
    spells: [
      {
        id: 'kit-spell-eldritch-blast',
        name: 'Descarga Sobrenatural',
        level: 0,
        school: 'Evocación',
        castingTime: '1 acción',
        range: '120 ft',
        duration: 'Instantáneo',
        components: 'V, S',
        isAttack: true,
        damageDice: '1d10',
        damageType: 'Fuerza',
        notes: 'Un haz de energía crepitante impacta a una criatura dentro del alcance.',
      },
      {
        id: 'kit-spell-hex',
        name: 'Maleficio (Hex)',
        level: 1,
        school: 'Encantamiento',
        castingTime: 'Acción adicional',
        range: '90 ft',
        duration: 'Concentración, hasta 1 hora',
        components: 'V, S, M',
        damageDice: '1d6',
        damageType: 'Necrótico',
        notes: 'Infliges 1d6 de daño necrótico extra cuando impactas al objetivo maldito.',
      },
    ],
  },
  Clérigo: {
    className: 'Clérigo',
    summary: 'Cota de escamas, Maza consagrada, Escudo y plegarias divinas',
    weaponsSummary: 'Maza Consagrada (1d6 contundente)',
    armorSummary: 'Cota de Escamas (CA 14 + DES máx 2) + Escudo (+2 CA)',
    spellsSummary: 'Llama Sagrada, Guía, Curar Heridas y Rayo Guía',
    defaultGold: 25,
    equipment: [
      {
        id: 'kit-cleric-mace',
        name: 'Maza Consagrada',
        quantity: 1,
        category: 'weapon',
        equipped: true,
        slot: 'mainHand',
        hands: 1,
        weapon: {
          category: 'simple',
          damageDice: '1d6',
          damageType: 'bludgeoning',
          properties: [],
        },
      },
      {
        id: 'kit-cleric-scalemail',
        name: 'Cota de Escamas',
        quantity: 1,
        category: 'armor',
        equipped: true,
        slot: 'body',
        armor: { category: 'medium', baseAc: 14, dexCap: 2, stealthDisadv: true },
      },
      {
        id: 'kit-cleric-shield',
        name: 'Escudo con Emblema Sagrado',
        quantity: 1,
        category: 'armor',
        equipped: true,
        slot: 'shield',
        armor: { category: 'shield', baseAc: 2 },
      },
    ],
    spells: [
      {
        id: 'kit-spell-sacred-flame',
        name: 'Llama Sagrada',
        level: 0,
        school: 'Evocación',
        castingTime: '1 acción',
        range: '60 ft',
        duration: 'Instantáneo',
        components: 'V, S',
        isSave: true,
        saveAbility: 'dex',
        damageDice: '1d8',
        damageType: 'Radiante',
        notes: 'Resplandor semejante a una llama desciende sobre una criatura.',
      },
      {
        id: 'kit-spell-guiding-bolt',
        name: 'Rayo Guía',
        level: 1,
        school: 'Evocación',
        castingTime: '1 acción',
        range: '120 ft',
        duration: '1 asalto',
        components: 'V, S',
        isAttack: true,
        damageDice: '4d6',
        damageType: 'Radiante',
        notes: 'Destello de luz contra una criatura; el siguiente ataque contra ella tiene ventaja.',
      },
      {
        id: 'kit-spell-cure-wounds-clr',
        name: 'Curar Heridas',
        level: 1,
        school: 'Abjuración',
        castingTime: '1 acción',
        range: 'Toque',
        duration: 'Instantáneo',
        components: 'V, S',
        damageDice: '2d8',
        damageType: 'Curación',
        addAbilityToDamage: true,
        notes: 'Restaura puntos de golpe al aliado que tocas.',
      },
    ],
  },
  Druida: {
    className: 'Druida',
    summary: 'Armadura de cuero, Escudo de madera, Bastón druídico y magia natural',
    weaponsSummary: 'Bastón Druídico (1d6 contundente, versátil 1d8)',
    armorSummary: 'Armadura de Cuero (CA 11 + DES) + Escudo de Madera (+2 CA)',
    spellsSummary: 'Garrote Mágico (Shillelagh), Fuego Feérico y Onda Trueno',
    defaultGold: 20,
    equipment: [
      {
        id: 'kit-druid-quarterstaff',
        name: 'Bastón Druídico',
        quantity: 1,
        category: 'weapon',
        equipped: true,
        slot: 'mainHand',
        hands: 1,
        weapon: {
          category: 'simple',
          damageDice: '1d6',
          damageType: 'bludgeoning',
          properties: ['versatile'],
          versatileDice: '1d8',
        },
      },
      {
        id: 'kit-druid-leather',
        name: 'Armadura de Cuero',
        quantity: 1,
        category: 'armor',
        equipped: true,
        slot: 'body',
        armor: { category: 'light', baseAc: 11, dexCap: null },
      },
      {
        id: 'kit-druid-shield',
        name: 'Escudo de Roble',
        quantity: 1,
        category: 'armor',
        equipped: true,
        slot: 'shield',
        armor: { category: 'shield', baseAc: 2 },
      },
    ],
    spells: [
      {
        id: 'kit-spell-shillelagh',
        name: 'Garrote Mágico (Shillelagh)',
        level: 0,
        school: 'Transmutación',
        castingTime: 'Acción adicional',
        range: 'Personal',
        duration: '1 minuto',
        components: 'V, S, M',
        damageDice: '1d8',
        damageType: 'Contundente',
        addAbilityToDamage: true,
        notes: 'Imbuye tu bastón con poder natural para atacar usando Sabiduría.',
      },
      {
        id: 'kit-spell-entangle',
        name: 'Enmarañar',
        level: 1,
        school: 'Conjuración',
        castingTime: '1 acción',
        range: '90 ft',
        duration: 'Concentración, hasta 1 min',
        components: 'V, S',
        isSave: true,
        saveAbility: 'str',
        notes: 'Raíces y enredaderas brotan del suelo en un cuadrado de 20 pies apresando enemigos.',
      },
    ],
  },
  Hechicero: {
    className: 'Hechicero',
    summary: 'Bastón arcano, Daga y conjuros de linaje innato',
    weaponsSummary: 'Daga (1d4 perforante)',
    armorSummary: 'Túnica Arcana (CA 10 + DES)',
    spellsSummary: 'Saeta de Fuego, Orbe Cromático y Escudo Arcano',
    defaultGold: 25,
    equipment: [
      {
        id: 'kit-sorc-dagger',
        name: 'Daga Arcana',
        quantity: 1,
        category: 'weapon',
        equipped: true,
        slot: 'mainHand',
        hands: 1,
        weapon: {
          category: 'simple',
          damageDice: '1d4',
          damageType: 'piercing',
          properties: ['finesse', 'light', 'thrown'],
          range: { normal: 20, long: 60 },
        },
      },
    ],
    spells: [
      {
        id: 'kit-spell-firebolt-sorc',
        name: 'Saeta de Fuego',
        level: 0,
        school: 'Evocación',
        castingTime: '1 acción',
        range: '120 ft',
        duration: 'Instantáneo',
        components: 'V, S',
        isAttack: true,
        damageDice: '1d10',
        damageType: 'Fuego',
        notes: 'Lanzas una mota de fuego contra una criatura u objeto dentro del alcance.',
      },
      {
        id: 'kit-spell-chromatic-orb',
        name: 'Orbe Cromático',
        level: 1,
        school: 'Evocación',
        castingTime: '1 acción',
        range: '90 ft',
        duration: 'Instantáneo',
        components: 'V, S, M',
        isAttack: true,
        damageDice: '3d8',
        damageType: 'Elemental',
        notes: 'Esfera de energía elemental (ácido, frío, fuego, relámpago, veneno o trueno).',
      },
    ],
  },
  Mago: {
    className: 'Mago',
    summary: 'Bastón de erudito, Libro de conjuros y magia arcana',
    weaponsSummary: 'Bastón Arcano (1d6 contundente, versátil 1d8)',
    armorSummary: 'Armadura de Mago / Túnica (CA 10 + DES)',
    spellsSummary: 'Saeta de Fuego, Proyectil Mágico y Armadura de Mago',
    defaultGold: 25,
    equipment: [
      {
        id: 'kit-wiz-quarterstaff',
        name: 'Bastón Arcano',
        quantity: 1,
        category: 'weapon',
        equipped: true,
        slot: 'mainHand',
        hands: 1,
        weapon: {
          category: 'simple',
          damageDice: '1d6',
          damageType: 'bludgeoning',
          properties: ['versatile'],
          versatileDice: '1d8',
        },
      },
    ],
    spells: [
      {
        id: 'kit-spell-firebolt-wiz',
        name: 'Saeta de Fuego',
        level: 0,
        school: 'Evocación',
        castingTime: '1 acción',
        range: '120 ft',
        duration: 'Instantáneo',
        components: 'V, S',
        isAttack: true,
        damageDice: '1d10',
        damageType: 'Fuego',
        notes: 'Ataque de conjuro a distancia con fuego arcano.',
      },
      {
        id: 'kit-spell-magic-missile',
        name: 'Proyectil Mágico',
        level: 1,
        school: 'Evocación',
        castingTime: '1 acción',
        range: '120 ft',
        duration: 'Instantáneo',
        components: 'V, S',
        damageDice: '3d4',
        damageBonusMod: 3,
        damageType: 'Fuerza',
        notes: 'Tres dardos brillantes de fuerza mágica que impactan automáticamente.',
      },
      {
        id: 'kit-spell-mage-armor',
        name: 'Armadura de Mago',
        level: 1,
        school: 'Abjuración',
        castingTime: '1 acción',
        range: 'Toque',
        duration: '8 horas',
        components: 'V, S, M',
        notes: 'La CA base del objetivo pasa a ser 13 + su modificador de Destreza.',
      },
    ],
  },
  Monje: {
    className: 'Monje',
    summary: 'Bastón de combate, Dardos y Defensa sin Armadura',
    weaponsSummary: 'Bastón Marcial (1d6/1d8) y 5 Dardos (1d4)',
    armorSummary: 'Defensa sin Armadura (10 + DES + SAB)',
    spellsSummary: 'Sin conjuros iniciales (Artes Marciales y Ki)',
    defaultGold: 15,
    equipment: [
      {
        id: 'kit-monk-quarterstaff',
        name: 'Bastón Marcial',
        quantity: 1,
        category: 'weapon',
        equipped: true,
        slot: 'mainHand',
        hands: 1,
        weapon: {
          category: 'simple',
          damageDice: '1d6',
          damageType: 'bludgeoning',
          properties: ['versatile'],
          versatileDice: '1d8',
        },
      },
      {
        id: 'kit-monk-darts',
        name: 'Dardos de Acero',
        quantity: 5,
        category: 'weapon',
        equipped: false,
        hands: 1,
        weapon: {
          category: 'simple',
          damageDice: '1d4',
          damageType: 'piercing',
          properties: ['finesse', 'thrown'],
          range: { normal: 20, long: 60 },
        },
      },
    ],
    spells: [],
  },
  Paladín: {
    className: 'Paladín',
    summary: 'Cota de malla, Espada larga, Escudo sagrado y conjuros de juramento',
    weaponsSummary: 'Espada Larga (1d8 cortante)',
    armorSummary: 'Cota de Malla (CA 16) + Escudo Sagrado (+2 CA)',
    spellsSummary: 'Castigo Divino (Divine Smite) y Escudo de Fe',
    defaultGold: 25,
    equipment: [
      {
        id: 'kit-paladin-longsword',
        name: 'Espada Larga Consagrada',
        quantity: 1,
        category: 'weapon',
        equipped: true,
        slot: 'mainHand',
        hands: 1,
        weapon: {
          category: 'martial',
          damageDice: '1d8',
          damageType: 'slashing',
          properties: ['versatile'],
          versatileDice: '1d10',
        },
      },
      {
        id: 'kit-paladin-chainmail',
        name: 'Cota de Malla',
        quantity: 1,
        category: 'armor',
        equipped: true,
        slot: 'body',
        armor: { category: 'heavy', baseAc: 16, dexCap: 0, strMin: 13, stealthDisadv: true },
      },
      {
        id: 'kit-paladin-shield',
        name: 'Escudo Sagrado',
        quantity: 1,
        category: 'armor',
        equipped: true,
        slot: 'shield',
        armor: { category: 'shield', baseAc: 2 },
      },
    ],
    spells: [
      {
        id: 'kit-spell-divine-smite',
        name: 'Castigo Divino (Divine Smite)',
        level: 1,
        school: 'Evocación',
        castingTime: 'Acción adicional al impactar',
        range: 'Personal',
        duration: 'Instantáneo',
        components: 'V',
        damageDice: '2d8',
        damageType: 'Radiante',
        notes: 'Descargas energía radiante adicional sobre el objetivo impactado (+1d8 contra no-muertos o infernales).',
      },
      {
        id: 'kit-spell-shield-of-faith',
        name: 'Escudo de Fe',
        level: 1,
        school: 'Abjuración',
        castingTime: 'Acción adicional',
        range: '60 ft',
        duration: 'Concentración, hasta 10 min',
        components: 'V, S, M',
        notes: 'Un campo resplandeciente rodea a una criatura otorgándole +2 a la CA.',
      },
    ],
  },
  Pícaro: {
    className: 'Pícaro',
    summary: 'Armadura de cuero, Estoque, Arco corto y Dagas ocultas',
    weaponsSummary: 'Estoque (1d8 sutil), Arco Corto (1d6) y Daga (1d4)',
    armorSummary: 'Armadura de Cuero (CA 11 + DES)',
    spellsSummary: 'Sin conjuros iniciales (Ataque Furtivo)',
    defaultGold: 25,
    equipment: [
      {
        id: 'kit-rogue-rapier',
        name: 'Estoque Fino',
        quantity: 1,
        category: 'weapon',
        equipped: true,
        slot: 'mainHand',
        hands: 1,
        weapon: {
          category: 'martial',
          damageDice: '1d8',
          damageType: 'piercing',
          properties: ['finesse'],
        },
      },
      {
        id: 'kit-rogue-dagger',
        name: 'Daga Equilibrada',
        quantity: 1,
        category: 'weapon',
        equipped: true,
        slot: 'offHand',
        hands: 1,
        weapon: {
          category: 'simple',
          damageDice: '1d4',
          damageType: 'piercing',
          properties: ['finesse', 'light', 'thrown'],
          range: { normal: 20, long: 60 },
        },
      },
      {
        id: 'kit-rogue-leather',
        name: 'Armadura de Cuero Oscuro',
        quantity: 1,
        category: 'armor',
        equipped: true,
        slot: 'body',
        armor: { category: 'light', baseAc: 11, dexCap: null },
      },
    ],
    spells: [],
  },
};

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
    QuickSlot: undefined as any,
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
      ...base.layoutConfig,
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
