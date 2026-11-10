import type { Resource, SlotState } from './resource.ts';

export interface StatBlock {
  score: number;
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
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  weight?: string;
  weightLb?: number;
  description?: string;
  category: 'potion' | 'gear' | 'treasure' | 'weapon';
  icon?: string;
  usableType?: 'none' | 'potion' | 'drinkable' | 'edible' | 'usable';
  healAmount?: number;
  activationCondition?: string;
  notes?: string;
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
  
  armorClass: number;
  armorNote: string;
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
  }[];
  
  sessionContext: {
    campaignName: string;
    sessionNumber: number;
    weather: string;
    location: string;
  };
}
