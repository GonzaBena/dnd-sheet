// src/scripts/data/quickCreatorData.ts
import type { CharacterData, CharacterFeature } from '../models/character.ts';
import { CHARACTER_CLASSES, CLASS_DEFINITIONS, type AbilityKeyType } from '../dnd/classes.ts';
import { CHARACTER_PRESET_IMAGES } from './characterAvatars.ts';
import { PREMADE_CHARACTERS } from './premadeCharacters.ts';
import { defaultCharacter } from './defaultCharacter.ts';

export interface QuickRaceOption {
  id: string;
  name: string;
  tagline: string;
  description: string;
  speedFt: number;
  hpBonusPerLevel?: number;
  avatarUrl: string;
  raceIconSvg: string;
}

export interface QuickClassOption {
  id: string;
  name: (typeof CHARACTER_CLASSES)[number];
  tagline: string;
  description: string;
  defaultSubclass: string;
  hitDie: 'd6' | 'd8' | 'd10' | 'd12';
  primaryAbility: AbilityKeyType;
  avatarUrl: string;
  classIconSvg: string;
  /** Priority order of abilities for automatic array assignment (highest to lowest) */
  abilityPriority: [AbilityKeyType, AbilityKeyType, AbilityKeyType, AbilityKeyType, AbilityKeyType, AbilityKeyType];
}

export interface QuickBackgroundOption {
  id: string;
  name: string;
  tagline: string;
  description: string;
  originFeatTitle: string;
  originFeatDesc: string;
  skillsEs: [string, string];
  avatarUrl: string;
  backgroundIconSvg: string;
}

export type QuickStatPreset = 'balanced' | 'offensive' | 'resilient';

export const QUICK_RACES: readonly QuickRaceOption[] = [
  {
    id: 'race-humano',
    name: 'Humano',
    tagline: 'Versátil • 30 ft',
    description: 'Adaptables y ambiciosos, destacan en cualquier vocación y tierra.',
    speedFt: 30,
    avatarUrl: CHARACTER_PRESET_IMAGES[0],
    raceIconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="m12 2 2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6L12 2Z"/></svg>`,
  },
  {
    id: 'race-elfo',
    name: 'Elfo',
    tagline: 'Visión Oscura • 30 ft',
    description: 'Pueblo feérico de sentidos agudos, gracia innata y afinidad arcana.',
    speedFt: 30,
    avatarUrl: CHARACTER_PRESET_IMAGES[1],
    raceIconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.4 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z"/><path d="M2 21c0-3 1.8-5.4 5.1-6C9.5 14.5 12 13 13 12"/></svg>`,
  },
  {
    id: 'race-enano',
    name: 'Enano',
    tagline: 'Resistencia Enana • 25 ft',
    description: 'Forjadores robustos de las montañas, resistentes al veneno y la fatiga.',
    speedFt: 25,
    hpBonusPerLevel: 1,
    avatarUrl: CHARACTER_PRESET_IMAGES[2],
    raceIconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="M6 4h12l2 4H4l2-4Z"/><path d="M10 8v12h4V8"/><path d="M8 20h8"/></svg>`,
  },
  {
    id: 'race-semielfo',
    name: 'Semielfo',
    tagline: 'Dos Mundos • 30 ft',
    description: 'Combinan la chispa humana con la elegancia y visión feérica de los elfos.',
    speedFt: 30,
    avatarUrl: CHARACTER_PRESET_IMAGES[3],
    raceIconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/><path d="M19 3v4M21 5h-4"/></svg>`,
  },
  {
    id: 'race-mediano',
    name: 'Mediano',
    tagline: 'Afortunado • 25 ft',
    description: 'Ágiles, escurridizos y bendecidos con una suerte extraordinaria ante el peligro.',
    speedFt: 25,
    avatarUrl: CHARACTER_PRESET_IMAGES[4],
    raceIconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="M12 12c-3-4.5-7-3-7 1s4 5 7 1c3 4 7 3 7-1s-4-5.5-7-1Z"/><path d="M12 12c-4.5-3-3-7 1-7s5 4 1 7"/><path d="M12 13v8"/></svg>`,
  },
  {
    id: 'race-draconido',
    name: 'Dracónido',
    tagline: 'Aliento Dracónico • 30 ft',
    description: 'Orgullosos guerreros con escamas elementales y el aliento de los dragones.',
    speedFt: 30,
    avatarUrl: CHARACTER_PRESET_IMAGES[0],
    raceIconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5Z"/></svg>`,
  },
  {
    id: 'race-gnomo',
    name: 'Gnomo',
    tagline: 'Astucia Gnómica • 25 ft',
    description: 'Inventores curiosos con mentes protegidas contra encantamientos mágicos.',
    speedFt: 25,
    avatarUrl: CHARACTER_PRESET_IMAGES[1],
    raceIconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><polygon points="12 2 19 8 16 21 8 21 5 8 12 2"/><path d="M5 8h14M12 2v19"/></svg>`,
  },
  {
    id: 'race-semiorco',
    name: 'Semiorco',
    tagline: 'Aguante Implacable • 30 ft',
    description: 'Fuerza bruta y determinación feroz para seguir en pie cuando otros caen.',
    speedFt: 30,
    avatarUrl: CHARACTER_PRESET_IMAGES[2],
    raceIconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="M7 18c-3-3-4-8-1-13 2 3 3 6 3 9"/><path d="M17 18c3-3 4-8 1-13-2 3-3 6-3 9"/><path d="M5 18h14"/></svg>`,
  },
  {
    id: 'race-tiefling',
    name: 'Tiefling',
    tagline: 'Legado Infernal • 30 ft',
    description: 'Marcados por los planos inferiores, dominan taumaturgia y resisten el fuego.',
    speedFt: 30,
    avatarUrl: CHARACTER_PRESET_IMAGES[3],
    raceIconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="M7 13c-3-2-5-6-3-10 1 3 3 5 5 6"/><path d="M17 13c3-2 5-6 3-10-1 3-3 5-5 6"/><circle cx="12" cy="14" r="5"/></svg>`,
  },
];

/**
 * Trasfondos del SRD 2024 (Acólito, Criminal, Sabio, Soldado + Explorador de Fronteras y Artesano)
 * con sus Dotes de Origen de 2024 (Alert, Magic Initiate, Savage Attacker, Skilled).
 */
export const QUICK_BACKGROUNDS: readonly QuickBackgroundOption[] = [
  {
    id: 'bg-soldado',
    name: 'Soldado',
    tagline: 'Dote: Atacante Salvaje',
    description: 'Entrenado en el arte de la guerra. Competente en Atletismo e Intimidación.',
    originFeatTitle: 'Dote de Origen: Atacante Salvaje (Savage Attacker)',
    originFeatDesc: 'Una vez por turno al impactar con un arma, puedes tirar dos veces los dados de daño del arma y elegir cualquiera de los dos resultados.',
    skillsEs: ['Atletismo', 'Intimidación'],
    avatarUrl: CHARACTER_PRESET_IMAGES[2],
    // Insignia militar / Espadas cruzadas
    backgroundIconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="M12 2 4 5v6c0 5.5 3.8 10.7 8 12 4.2-1.3 8-6.5 8-12V5l-8-3Z"/><path d="m9 12 2 2 4-4"/></svg>`,
  },
  {
    id: 'bg-criminal',
    name: 'Criminal',
    tagline: 'Dote: Alerta',
    description: 'Veterano de los callejones y el sigilo. Competente en Sigilo y Juego de Manos.',
    originFeatTitle: 'Dote de Origen: Alerta (Alert)',
    originFeatDesc: 'Sumas tu Bono de Competencia a las tiradas de Iniciativa y puedes intercambiar tu Iniciativa con la de un aliado dispuesto al inicio del combate.',
    skillsEs: ['Sigilo', 'Acrobacias'],
    avatarUrl: CHARACTER_PRESET_IMAGES[4],
    // Antifaz / Llave maestra
    backgroundIconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>`,
  },
  {
    id: 'bg-acolito',
    name: 'Acólito',
    tagline: 'Dote: Iniciado en la Magia (Clérigo)',
    description: 'Devoto servidor de un templo sagrado. Competente en Perspicacia y Religión.',
    originFeatTitle: 'Dote de Origen: Iniciado en la Magia — Clérigo (Magic Initiate)',
    originFeatDesc: 'Aprendes dos trucos y un conjuro de nivel 1 de la lista de Clérigo. Puedes lanzar el conjuro de nivel 1 una vez sin gastar espacio por Descanso Largo.',
    skillsEs: ['Perspicacia', 'Naturaleza'],
    avatarUrl: CHARACTER_PRESET_IMAGES[0],
    // Cáliz / Símbolo del templo
    backgroundIconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="M12 2v20M7 7h10"/><circle cx="12" cy="7" r="3"/></svg>`,
  },
  {
    id: 'bg-sabio',
    name: 'Sabio',
    tagline: 'Dote: Iniciado en la Magia (Mago)',
    description: 'Estudioso de pergaminos y misterios antiguos. Competente en Historia y Arcanos.',
    originFeatTitle: 'Dote de Origen: Iniciado en la Magia — Mago (Magic Initiate)',
    originFeatDesc: 'Aprendes dos trucos y un conjuro de nivel 1 de la lista de Mago. Puedes lanzar el conjuro de nivel 1 una vez sin gastar espacio por Descanso Largo.',
    skillsEs: ['Perspicacia', 'Naturaleza'],
    avatarUrl: CHARACTER_PRESET_IMAGES[3],
    // Pluma y pergamino
    backgroundIconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.5 7.5"/></svg>`,
  },
  {
    id: 'bg-guia',
    name: 'Guía / Explorador',
    tagline: 'Dote: Habilidoso (Skilled)',
    description: 'Criado en tierras indómitas lejos de las ciudades. Competente en Supervivencia y Percepción.',
    originFeatTitle: 'Dote de Origen: Habilidoso (Skilled)',
    originFeatDesc: 'Obtienes competencia en cualquier combinación de tres habilidades o herramientas de tu elección.',
    skillsEs: ['Supervivencia', 'Percepción'],
    avatarUrl: CHARACTER_PRESET_IMAGES[1],
    // Montañas / Sendero
    backgroundIconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="m8 3 4 8 5-5 5 15H2L8 3z"/></svg>`,
  },
  {
    id: 'bg-artesano',
    name: 'Artesano / Mercader',
    tagline: 'Dote: Habilidoso (Skilled)',
    description: 'Maestro de un oficio gremial y del trato con viajeros. Competente en Perspicacia y Percepción.',
    originFeatTitle: 'Dote de Origen: Habilidoso (Skilled)',
    originFeatDesc: 'Obtienes competencia en cualquier combinación de tres habilidades o herramientas de artesano de tu elección.',
    skillsEs: ['Perspicacia', 'Percepción'],
    avatarUrl: CHARACTER_PRESET_IMAGES[0],
    // Balanza / Gremio
    backgroundIconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="M12 3v18M5 7h14M5 7l-3 6h6l-3-6ZM19 7l-3 6h6l-3-6ZM8 21h8"/></svg>`,
  },
];

const PRIORITY_BY_CLASS: Record<
  (typeof CHARACTER_CLASSES)[number],
  [AbilityKeyType, AbilityKeyType, AbilityKeyType, AbilityKeyType, AbilityKeyType, AbilityKeyType]
> = {
  Guerrero: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
  Explorador: ['dex', 'wis', 'con', 'str', 'int', 'cha'],
  Bárbaro: ['str', 'con', 'dex', 'wis', 'cha', 'int'],
  Bardo: ['cha', 'dex', 'con', 'wis', 'int', 'str'],
  Brujo: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
  Clérigo: ['wis', 'con', 'str', 'cha', 'dex', 'int'],
  Druida: ['wis', 'con', 'dex', 'int', 'cha', 'str'],
  Hechicero: ['cha', 'con', 'dex', 'wis', 'int', 'str'],
  Mago: ['int', 'con', 'dex', 'wis', 'cha', 'str'],
  Monje: ['dex', 'wis', 'con', 'str', 'int', 'cha'],
  Paladín: ['str', 'cha', 'con', 'wis', 'dex', 'int'],
  Pícaro: ['dex', 'int', 'con', 'cha', 'wis', 'str'],
};

const abilityLabelsEs: Record<AbilityKeyType, string> = {
  str: 'FUE',
  dex: 'DES',
  con: 'CON',
  int: 'INT',
  wis: 'SAB',
  cha: 'CAR',
};

export const QUICK_CLASSES: readonly QuickClassOption[] = PREMADE_CHARACTERS.map((p) => {
  const def = CLASS_DEFINITIONS[p.className];
  const priority = PRIORITY_BY_CLASS[p.className];
  return {
    id: `class-${p.className.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}`,
    name: p.className,
    tagline: `Dado ${def.hitDie} • ${abilityLabelsEs[priority[0]]}/${abilityLabelsEs[priority[1]]}`,
    description: p.description,
    defaultSubclass: p.subclass,
    hitDie: def.hitDie,
    primaryAbility: priority[0],
    avatarUrl: p.avatarUrl,
    classIconSvg: p.classIconSvg,
    abilityPriority: priority,
  };
});

export const QUICK_NAME_SUGGESTIONS: readonly string[] = [
  'Kaelen Sombraviento',
  'Lyra Hojaplata',
  'Thorin Barbaférrea',
  'Sylvara Lunaverde',
  'Valerius Alba',
  'Vex Ocaso',
  'Alden Rocafirme',
  'Kaeroc Ceniza',
  'Aelindor Astral',
  'Nyx Susurro',
];

function mod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Calcula los 6 atributos según la clase elegida y el estilo rápido ('balanced', 'offensive', 'resilient').
 */
export function computeQuickStats(
  classOption: QuickClassOption,
  preset: QuickStatPreset = 'balanced'
): Record<AbilityKeyType, number> {
  const p = [...classOption.abilityPriority];
  let scores = [16, 14, 14, 12, 10, 8];

  if (preset === 'offensive') {
    scores = [17, 15, 13, 12, 10, 8];
  } else if (preset === 'resilient') {
    const conIdx = p.indexOf('con');
    if (conIdx > 1) {
      p.splice(conIdx, 1);
      p.splice(1, 0, 'con');
    }
    scores = [15, 16, 14, 12, 10, 8];
  }

  const result = {} as Record<AbilityKeyType, number>;
  p.forEach((key, idx) => {
    result[key] = scores[idx];
  });
  return result;
}

export interface QuickCreatorInput {
  name: string;
  level: number;
  alignment: string;
  rulesEdition: '2024' | '2014';
  avatarUrl: string;
  raceOption: QuickRaceOption;
  classOption: QuickClassOption;
  backgroundOption?: QuickBackgroundOption;
  statPreset: QuickStatPreset;
}

/**
 * Genera el objeto `Partial<CharacterData>` listo para `campaignStore.createCharacter(...)`.
 */
export function buildCharacterFromQuickCreator(input: QuickCreatorInput): Partial<CharacterData> {
  const classDef = CLASS_DEFINITIONS[input.classOption.name];
  const saves = new Set(classDef.savingThrows);
  const rawStats = computeQuickStats(input.classOption, input.statPreset);
  const base = JSON.parse(JSON.stringify(defaultCharacter)) as CharacterData;
  const bg = input.backgroundOption || QUICK_BACKGROUNDS[0];

  const level = Math.max(1, Math.min(20, Number(input.level) || 1));
  const profBonus = Math.ceil(level / 4) + 1;
  const hitDieMax = Number(classDef.hitDie.replace('d', '')) || 8;
  const hitDieAvg = Math.floor(hitDieMax / 2) + 1;
  const conMod = mod(rawStats.con);
  const raceHpBonus = (input.raceOption.hpBonusPerLevel || 0) * level;
  const hpMax = Math.max(
    level,
    hitDieMax + conMod + (level - 1) * Math.max(1, hitDieAvg + conMod) + raceHpBonus
  );

  const originFeature: CharacterFeature = {
    id: `feat-${bg.id}`,
    title: bg.originFeatTitle,
    description: bg.originFeatDesc,
    uses: 'Pasivo / Origen',
    enabled: true,
  };

  return {
    name: input.name.trim() || 'Nuevo Aventurero',
    title: `${bg.name} • ${input.classOption.name} ${input.raceOption.name}`,
    race: input.raceOption.name,
    alignment: input.alignment || 'Neutral Bueno',
    className: input.classOption.name,
    subclass: level >= 3 ? input.classOption.defaultSubclass : '',
    level,
    proficiencyBonus: profBonus,
    rulesEdition: input.rulesEdition,
    avatarUrl: input.avatarUrl || input.classOption.avatarUrl,
    quote: `"${bg.name}: ${bg.description}"`,
    hp: {
      current: hpMax,
      max: hpMax,
      temp: 0,
    },
    initiativeBonus: mod(rawStats.dex),
    speedFt: input.raceOption.speedFt,
    speedNote: `${Math.floor(input.raceOption.speedFt / 5)} casillas`,
    hitDice: {
      total: level,
      remaining: level,
      die: classDef.hitDie,
    },
    stats: {
      str: { score: rawStats.str, modifier: mod(rawStats.str), savingProficient: saves.has('str') },
      dex: { score: rawStats.dex, modifier: mod(rawStats.dex), savingProficient: saves.has('dex') },
      con: { score: rawStats.con, modifier: mod(rawStats.con), savingProficient: saves.has('con') },
      int: { score: rawStats.int, modifier: mod(rawStats.int), savingProficient: saves.has('int') },
      wis: { score: rawStats.wis, modifier: mod(rawStats.wis), savingProficient: saves.has('wis') },
      cha: { score: rawStats.cha, modifier: mod(rawStats.cha), savingProficient: saves.has('cha') },
    },
    features: [originFeature, ...base.features],
    proficiencies: {
      armor: [...classDef.armorProficiencies],
      weapons: [...classDef.weaponProficiencies],
    },
    layoutConfig: {
      ...base.layoutConfig,
      showWildShape: input.classOption.name === 'Druida',
      showSpells: ['Bardo', 'Brujo', 'Clérigo', 'Druida', 'Explorador', 'Hechicero', 'Mago', 'Paladín'].includes(input.classOption.name),
    },
  };
}
