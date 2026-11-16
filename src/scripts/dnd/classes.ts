// Clases del SRD para el selector de la ficha. Lógica pura.
export const CHARACTER_CLASSES = [
  'Bárbaro', 'Bardo', 'Brujo', 'Clérigo', 'Druida', 'Explorador',
  'Guerrero', 'Hechicero', 'Mago', 'Monje', 'Paladín', 'Pícaro',
] as const;

const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();

// DECISION: `className` era texto libre; los valores antiguos ("Maga", "Wizard", "guerrera") se reconocen
// por prefijo (es/en, sin tildes ni género) para preseleccionar la clase canónica. Lo que no coincide
// se conserva tal cual como opción extra en el selector, sin perder datos.
const MATCHERS: [RegExp, (typeof CHARACTER_CLASSES)[number]][] = [
  [/^(barbar[oa]|barbarian)/, 'Bárbaro'],
  [/^(bardo|bard)/, 'Bardo'],
  [/^(bruj[oa]|warlock)/, 'Brujo'],
  [/^(clerig[oa]|cleric)/, 'Clérigo'],
  [/^(druida|druid)/, 'Druida'],
  [/^(explorador|exploradora|ranger|montaraz)/, 'Explorador'],
  [/^(guerrer[oa]|fighter)/, 'Guerrero'],
  [/^(hechicer[oa]|sorcerer)/, 'Hechicero'],
  [/^(mago|maga|wizard)/, 'Mago'],
  [/^(monje|monk)/, 'Monje'],
  [/^(paladin|paladina)/, 'Paladín'],
  [/^(picar[oa]|rogue|ladron)/, 'Pícaro'],
];

/** Clase canónica de un texto libre, o undefined si no coincide con ninguna. */
export function matchClass(text: string | undefined): (typeof CHARACTER_CLASSES)[number] | undefined {
  const name = plain(text ?? '');
  return MATCHERS.find(([re]) => re.test(name))?.[1];
}

export type HitDieType = 'd6' | 'd8' | 'd10' | 'd12';
export type AbilityKeyType = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export interface ClassDefinition {
  name: (typeof CHARACTER_CLASSES)[number];
  hitDie: HitDieType;
  savingThrows: AbilityKeyType[];
  armorProficiencies: string[];
  weaponProficiencies: string[];
}

export const CLASS_DEFINITIONS: Record<(typeof CHARACTER_CLASSES)[number], ClassDefinition> = {
  Bárbaro: {
    name: 'Bárbaro',
    hitDie: 'd12',
    savingThrows: ['str', 'con'],
    armorProficiencies: ['light', 'medium', 'shield'],
    weaponProficiencies: ['simple', 'martial'],
  },
  Bardo: {
    name: 'Bardo',
    hitDie: 'd8',
    savingThrows: ['dex', 'cha'],
    armorProficiencies: ['light'],
    weaponProficiencies: ['simple', 'hand-crossbow', 'longsword', 'rapier', 'shortsword'],
  },
  Brujo: {
    name: 'Brujo',
    hitDie: 'd8',
    savingThrows: ['wis', 'cha'],
    armorProficiencies: ['light'],
    weaponProficiencies: ['simple'],
  },
  Clérigo: {
    name: 'Clérigo',
    hitDie: 'd8',
    savingThrows: ['wis', 'cha'],
    armorProficiencies: ['light', 'medium', 'shield'],
    weaponProficiencies: ['simple'],
  },
  Druida: {
    name: 'Druida',
    hitDie: 'd8',
    savingThrows: ['int', 'wis'],
    armorProficiencies: ['light', 'medium', 'shield'],
    weaponProficiencies: ['simple', 'scimitar', 'club', 'dagger', 'dart', 'javelin', 'mace', 'quarterstaff', 'sickle', 'sling', 'spear'],
  },
  Explorador: {
    name: 'Explorador',
    hitDie: 'd10',
    savingThrows: ['str', 'dex'],
    armorProficiencies: ['light', 'medium', 'shield'],
    weaponProficiencies: ['simple', 'martial'],
  },
  Guerrero: {
    name: 'Guerrero',
    hitDie: 'd10',
    savingThrows: ['str', 'con'],
    armorProficiencies: ['light', 'medium', 'heavy', 'shield'],
    weaponProficiencies: ['simple', 'martial'],
  },
  Hechicero: {
    name: 'Hechicero',
    hitDie: 'd6',
    savingThrows: ['con', 'cha'],
    armorProficiencies: [],
    weaponProficiencies: ['simple', 'dagger', 'dart', 'sling', 'quarterstaff', 'light-crossbow'],
  },
  Mago: {
    name: 'Mago',
    hitDie: 'd6',
    savingThrows: ['int', 'wis'],
    armorProficiencies: [],
    weaponProficiencies: ['dagger', 'dart', 'sling', 'quarterstaff', 'light-crossbow', 'simple'],
  },
  Monje: {
    name: 'Monje',
    hitDie: 'd8',
    savingThrows: ['str', 'dex'],
    armorProficiencies: [],
    weaponProficiencies: ['simple', 'shortsword'],
  },
  Paladín: {
    name: 'Paladín',
    hitDie: 'd10',
    savingThrows: ['wis', 'cha'],
    armorProficiencies: ['light', 'medium', 'heavy', 'shield'],
    weaponProficiencies: ['simple', 'martial'],
  },
  Pícaro: {
    name: 'Pícaro',
    hitDie: 'd8',
    savingThrows: ['dex', 'int'],
    armorProficiencies: ['light'],
    weaponProficiencies: ['simple', 'hand-crossbow', 'longsword', 'rapier', 'shortsword'],
  },
};

/** Devuelve la información canónica de la clase, o undefined si no coincide con ninguna. */
export function getClassDefinition(className: string | undefined): ClassDefinition | undefined {
  const canon = matchClass(className);
  return canon ? CLASS_DEFINITIONS[canon] : undefined;
}

/** Sugerencia de dado de golpe para una clase. */
export function hitDieForClass(className: string | undefined): HitDieType | undefined {
  return getClassDefinition(className)?.hitDie;
}
