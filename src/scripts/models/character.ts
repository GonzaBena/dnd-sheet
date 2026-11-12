import type { Resource, SlotState } from './resource.ts';
import type { ActiveEffect, Modifier } from './effect.ts';
import type { FeatType } from './catalog.ts';

export interface StatBlock {
  score: number;
  baseScore?: number;
  modifier: number;
  savingProficient: boolean;
}

export interface SkillItem {
  id: string;
  name: string;
  stat: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  proficient: boolean;
  expertise: boolean;
  customBonus?: number;
  value?: number;
}

export interface AttackAction {
  id: string;
  name: string;
  type: string;
  bonus: string;
  damage: string;
  damageType: string;
  tags: string[];
  isAuto?: boolean;
  ability?: 'none' | 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  proficient?: boolean;
  attackBonusMod?: number;
  damageDice?: string;
  damageBonusMod?: number;
  addAbilityToDamage?: boolean;
  mastery?: string;
  notes?: string;
  // Equipo (Spec 08, Fase A): las armas se equipan desde su sección
  equipped?: boolean;
  slot?: EquipSlot;
  hands?: 1 | 2;
  // Spec 08, Fase E: arma del inventario de la que salió este ataque
  itemId?: string;
}

export interface SpellItem {
  id?: string;
  name: string;
  level: number;
  school: string;
  castingTime: string;
  range: string;
  duration?: string;
  components?: string;
  isAttack?: boolean;
  isSave?: boolean;
  saveAbility?: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  saveDc?: number;
  damageDice?: string;
  damageType?: string;
  damageBonusMod?: number;
  addAbilityToDamage?: boolean;
  damageFormula?: string;
  activationCondition?: string;
  notes?: string;
  // Catálogo (Spec 07, Fase C)
  source?: 'srd' | 'custom';
  custom?: boolean;
  imageUrl?: string;
  effects?: Modifier[];
}

// Equipo (Spec 08, Fase A)
export type EquipSlot =
  | 'head' | 'body' | 'gloves' | 'neck' | 'ring1' | 'ring2'
  | 'boots' | 'cloak' | 'mainHand' | 'offHand' | 'shield';

export interface ArmorData {
  category: 'light' | 'medium' | 'heavy' | 'shield';
  baseAc: number;
  dexCap?: number | null; // null/ausente = sin tope; 0 = sin DES
  strMin?: number;
  stealthDisadv?: boolean;
  bonus?: number; // armadura mágica +1, +2…
}

export interface WeaponData {
  category: 'simple' | 'martial';
  damageDice: string;
  damageType: string;
  properties: string[];
  range?: { normal: number; long: number };
  versatileDice?: string;
  magicBonus?: number;
}

// Competencias cargadas a mano (Spec 08, Fase C). Armadura: light|medium|heavy|shield.
// Armas: simple|martial o el `index` de un arma concreta (p. ej. 'longsword').
export interface Proficiencies { armor: string[]; weapons: string[] }

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  weight?: string;
  weightLb?: number;
  description?: string;
  category: 'potion' | 'gear' | 'treasure' | 'weapon' | 'armor';
  // Equipo (Spec 08, Fase A)
  equipped?: boolean;
  slot?: EquipSlot;
  equipSlot?: EquipSlot;
  hands?: 1 | 2;
  attuned?: boolean;
  requiresAttunement?: boolean;
  armor?: ArmorData;
  weapon?: WeaponData;
  ignoreWarnings?: boolean;
  icon?: string;
  usableType?: 'none' | 'potion' | 'drinkable' | 'edible' | 'usable';
  healAmount?: number;
  healDice?: string;
  activationCondition?: string;
  notes?: string;
  // Catálogo (Spec 07, Fase C)
  source?: 'srd' | 'custom';
  custom?: boolean;
  imageUrl?: string;
  effects?: Modifier[];
}

export interface WildShapeForm {
  name: string;
  cr: string;
  hp: { current: number; max: number };
  ac: number;
  speed: string;
  attacks: { name: string; bonus: string; damage: string }[];
}

export interface SectionOrderConfig {
  col1: string[];
  col2: string[];
  unifiedOrder?: string[];
}

export interface LayoutConfig {
  activeTab: 'all' | 'combat' | 'skills' | 'spells' | 'wildshape' | 'inventory' | 'journal';
  showSpells: boolean;
  showWildShape: boolean;
  showWeapons: boolean;
  showInventory: boolean;
  showJournal: boolean;
  showSkills: boolean;
  classPreset?: 'custom' | 'wizard' | 'druid' | 'fighter' | 'rogue' | 'cleric';
  sectionOrder?: SectionOrderConfig;
  collapsedSections?: string[];
}

export interface CharacterData {
  id: string;
  campaignId?: string | null;
  userId?: string;
  playerName?: string;
  name: string;
  title: string;
  race: string;
  alignment: string;
  className: string;
  subclass: string;
  level: number;
  proficiencyBonus: number;
  rulesEdition?: '2024' | '2014';
  inspiration: boolean;
  avatarUrl: string;
  quote: string;
  
  hp: {
    current: number;
    max: number;
    temp: number;
  };
  
  armorClass?: number; // override manual (Spec 08, Fase D); ausente = CA calculada
  armorNote: string; // nota libre
  initiativeBonus: number;
  speedFt: number;
  speedNote: string;
  
  hitDice: {
    total: number;
    remaining: number;
    die: string;
  };
  
  stats: {
    str: StatBlock;
    dex: StatBlock;
    con: StatBlock;
    int: StatBlock;
    wis: StatBlock;
    cha: StatBlock;
  };
  
  skills: SkillItem[];
  
  actions: AttackAction[];
  
  currency: {
    cp: number;
    sp: number;
    ep: number;
    gp: number;
    pp: number;
  };
  
  attunedItems: {
    name: string;
    description: string;
    icon: string;
  }[];
  
  inventory: InventoryItem[];
  
  spellcasting: {
    ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
    saveDc: number;
    attackBonus: number;
    slots: Record<number, SlotState>; // claves 1–9
    spells: SpellItem[];
  };

  resources: Resource[];

  proficiencies?: Proficiencies; // ausente = vacío

  activeEffects: ActiveEffect[];
  effectsLastRound?: { campaignId: string; round: number };

  wildShape?: {
    usesTotal: number;
    usesRemaining: number;
    activeForm: WildShapeForm | null;
  };

  layoutConfig?: LayoutConfig;
  
  quickSlotItemId?: string | null;

  features: {
    id?: string;
    title: string;
    description: string;
    uses?: string;
    enabled?: boolean;
    featType?: FeatType;
    resourceId?: string;
    effects?: Modifier[];
    custom?: boolean;
  }[];
  
  sessionContext: {
    campaignName: string;
    sessionNumber: number;
    weather: string;
    location: string;
  };
}
