// src/scripts/data/premadeCharacters.ts
import type { CharacterData } from '../models/character.ts';
import { CHARACTER_CLASSES, CLASS_DEFINITIONS } from '../dnd/classes.ts';
import { CHARACTER_PRESET_IMAGES } from './characterAvatars.ts';
import { defaultCharacter } from './defaultCharacter.ts';

export interface PremadeCharacterTemplate {
  id: string;
  className: (typeof CHARACTER_CLASSES)[number];
  name: string;
  title: string;
  race: string;
  subclass: string;
  description: string;
  avatarUrl: string;
  /** SVG path/markup for the class emblem shown between the photo and the centered title */
  classIconSvg: string;
  stats: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  hpMax: number;
  speedFt: number;
}

export const PREMADE_CHARACTERS: readonly PremadeCharacterTemplate[] = [
  {
    id: 'premade-guerrero',
    className: 'Guerrero',
    name: 'Thorin Rompehierro',
    title: 'Veterano de la Guardia Férrea',
    race: 'Enano de las Montañas',
    subclass: 'Campeón',
    description: 'Maestro de las armas marciales y armaduras pesadas, implacable en primera línea.',
    avatarUrl: CHARACTER_PRESET_IMAGES[0],
    // Hacha de batalla (Battle Axe)
    classIconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="M12 3v18"/><path d="M12 5c3.5-2 7-1 8 2.5-1 3.5-4.5 4.5-8 2.5"/><path d="M12 5C8.5 3 5 4 4 7.5c1 3.5 4.5 4.5 8 2.5"/><path d="M10 19h4"/></svg>`,
    stats: { str: 16, dex: 12, con: 15, int: 10, wis: 13, cha: 8 },
    hpMax: 13,
    speedFt: 25,
  },
  {
    id: 'premade-explorador',
    className: 'Explorador',
    name: 'Atlas Ventosombra',
    title: 'Rastreador de las Tierras Salvajes',
    race: 'Semielfo',
    subclass: 'Cazador',
    description: 'Arquero letal y guía experto capaz de acechar a cualquier presa en la espesura.',
    avatarUrl: CHARACTER_PRESET_IMAGES[1],
    // Brújula (Compass)
    classIconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polygon points="15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5 15.5 8.5" fill="currentColor" fill-opacity="0.25"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/></svg>`,
    stats: { str: 12, dex: 16, con: 14, int: 10, wis: 15, cha: 8 },
    hpMax: 12,
    speedFt: 30,
  },
  {
    id: 'premade-barbaro',
    className: 'Bárbaro',
    name: 'Grommash el Feroz',
    title: 'Furia de las Cumbres Heladas',
    race: 'Semiorco',
    subclass: 'Camino del Berserker',
    description: 'Canaliza una furia primigenia devastadora para resistir golpes mortales y arrasar.',
    avatarUrl: CHARACTER_PRESET_IMAGES[2],
    // Yelmo vikingo / Furia
    classIconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="M7 11a5 5 0 0 1 10 0v5H7v-5Z"/><path d="M7 9C4 8 2 5 3 3c1.5 1 3.5 2.5 4.5 4.5"/><path d="M17 9c3-1 5-4 4-6-1.5 1-3.5 2.5-4.5 4.5"/><path d="M12 11v6"/><path d="M5 16h14v2a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-2Z"/></svg>`,
    stats: { str: 16, dex: 14, con: 16, int: 8, wis: 12, cha: 8 },
    hpMax: 15,
    speedFt: 30,
  },
  {
    id: 'premade-bardo',
    className: 'Bardo',
    name: 'Lyra Cuerdaplata',
    title: 'Trovadora del Colegio del Saber',
    race: 'Semielfa',
    subclass: 'Colegio del Saber',
    description: 'Teje magia a través de la música y la palabra, inspirando aliados y confundiendo enemigos.',
    avatarUrl: CHARACTER_PRESET_IMAGES[3],
    // Lira / Arpa
    classIconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="M7 4c-2 3-2 8 1 12h8c3-4 3-9 1-12"/><path d="M6 16h12"/><path d="M8 20h8"/><path d="M10 6v10M14 6v10"/><path d="M9 16v4M15 16v4"/></svg>`,
    stats: { str: 8, dex: 14, con: 13, int: 12, wis: 10, cha: 16 },
    hpMax: 9,
    speedFt: 30,
  },
  {
    id: 'premade-brujo',
    className: 'Brujo',
    name: 'Kaeroc Cuernonegro',
    title: 'Portador del Pacto Umbrío',
    race: 'Tiefling',
    subclass: 'Patrón Infernal',
    description: 'Empuña secretos prohibidos y descargas sobrenaturales otorgadas por un pacto arcano.',
    avatarUrl: CHARACTER_PRESET_IMAGES[4],
    // Ojo místico / Pacto
    classIconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></svg>`,
    stats: { str: 8, dex: 14, con: 14, int: 12, wis: 10, cha: 16 },
    hpMax: 10,
    speedFt: 30,
  },
  {
    id: 'premade-clerigo',
    className: 'Clérigo',
    name: 'Liara Hojaargenta',
    title: 'Sacerdotisa de la Llama Sagrada',
    race: 'Alta Elfa',
    subclass: 'Dominio de la Vida',
    description: 'Canaliza el poder divino para sanar a los caídos y castigar a las fuerzas de la oscuridad.',
    avatarUrl: CHARACTER_PRESET_IMAGES[0],
    // Símbolo sagrado / Sol radiante
    classIconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5M4.9 4.9l3.5 3.5M15.6 15.6l3.5 3.5M19.1 4.9l-3.5 3.5M8.4 15.6l-3.5 3.5"/></svg>`,
    stats: { str: 14, dex: 10, con: 14, int: 10, wis: 16, cha: 12 },
    hpMax: 10,
    speedFt: 30,
  },
  {
    id: 'premade-druida',
    className: 'Druida',
    name: 'Sylvara Raízantigua',
    title: 'Guardiana del Círculo Esmeralda',
    race: 'Elfa de los Bosques',
    subclass: 'Círculo de la Luna',
    description: 'Protectora del equilibrio natural capaz de invocar tormentas y adoptar formas salvajes.',
    avatarUrl: CHARACTER_PRESET_IMAGES[1],
    // Hoja ancestral
    classIconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.4 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z"/><path d="M2 21c0-3 1.8-5.4 5.1-6C9.5 14.5 12 13 13 12"/></svg>`,
    stats: { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 8 },
    hpMax: 10,
    speedFt: 35,
  },
  {
    id: 'premade-hechicero',
    className: 'Hechicero',
    name: 'Ignis Sangredragón',
    title: 'Heredero del Fuego Primordial',
    race: 'Dracónido',
    subclass: 'Linaje Dracónico',
    description: 'La magia corre por sus venas de forma innata, moldeando conjuros con pura voluntad.',
    avatarUrl: CHARACTER_PRESET_IMAGES[2],
    // Llama arcana
    classIconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5Z"/></svg>`,
    stats: { str: 10, dex: 13, con: 14, int: 10, wis: 12, cha: 16 },
    hpMax: 9,
    speedFt: 30,
  },
  {
    id: 'premade-mago',
    className: 'Mago',
    name: 'Aelindor Estrellagris',
    title: 'Erudito de la Torre Arcana',
    race: 'Alto Elfo',
    subclass: 'Escuela de Evocación',
    description: 'Estudioso de los grimorios antiguos que domina las fuerzas elementales y el cosmos.',
    avatarUrl: CHARACTER_PRESET_IMAGES[3],
    // Sombrero / Estrella arcana y grimorio
    classIconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="m12 6 1.2 2.6L16 9l-2 2 .5 2.8-2.5-1.3-2.5 1.3L10 11 8 9l2.8-.4L12 6Z"/></svg>`,
    stats: { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 },
    hpMax: 8,
    speedFt: 30,
  },
  {
    id: 'premade-monje',
    className: 'Monje',
    name: 'Kaelen Vientoapacible',
    title: 'Discípulo del Templo Celeste',
    race: 'Humano',
    subclass: 'Camino de la Mano Abierta',
    description: 'Domina la energía del Ki con velocidad sobrehumana y artes marciales precisas.',
    avatarUrl: CHARACTER_PRESET_IMAGES[4],
    // Sol y Luna / Ki equilibrio
    classIconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3a4.5 4.5 0 0 0 0 9 4.5 4.5 0 0 1 0 9"/><circle cx="12" cy="7.5" r="1" fill="currentColor"/><circle cx="12" cy="16.5" r="1" fill="currentColor"/></svg>`,
    stats: { str: 10, dex: 16, con: 14, int: 10, wis: 15, cha: 8 },
    hpMax: 10,
    speedFt: 30,
  },
  {
    id: 'premade-paladin',
    className: 'Paladín',
    name: 'Valerius Escudosol',
    title: 'Caballero del Juramento Sagrado',
    race: 'Humano',
    subclass: 'Juramento de Devoción',
    description: 'Baluarte de justicia que combina acero pesado con castigos divinos e imposición de manos.',
    avatarUrl: CHARACTER_PRESET_IMAGES[0],
    // Escudo con cruz radiante
    classIconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="M12 7v10M8.5 11h7"/></svg>`,
    stats: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 15 },
    hpMax: 12,
    speedFt: 30,
  },
  {
    id: 'premade-picaro',
    className: 'Pícaro',
    name: 'Vex Sombraveloz',
    title: 'Espía del Gremio del Ocaso',
    race: 'Mediano Piesligeros',
    subclass: 'Asesino',
    description: 'Especialista en sigilo, cerraduras y ataques furtivos letales desde las sombras.',
    avatarUrl: CHARACTER_PRESET_IMAGES[1],
    // Dagas cruzadas
    classIconSvg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="m14.5 17.5-11-11V3h3.5l11 11"/><path d="m13 19 6-6"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/><path d="m9.5 17.5 11-11V3H17L6 14"/><path d="m11 19-6-6"/><path d="m8 16-4 4"/><path d="m5 21-2-2"/></svg>`,
    stats: { str: 8, dex: 16, con: 14, int: 13, wis: 12, cha: 12 },
    hpMax: 10,
    speedFt: 25,
  },
];

function mod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Construye los datos de un personaje listo para `campaignStore.createCharacter(...)`
 * a partir de una plantilla de personaje prehecho.
 */
export function buildCharacterFromPremade(template: PremadeCharacterTemplate): Partial<CharacterData> {
  const classDef = CLASS_DEFINITIONS[template.className];
  const saves = new Set(classDef.savingThrows);
  const base = JSON.parse(JSON.stringify(defaultCharacter)) as CharacterData;

  return {
    name: template.name,
    title: template.title,
    race: template.race,
    className: template.className,
    subclass: template.subclass,
    level: 1,
    proficiencyBonus: 2,
    avatarUrl: template.avatarUrl,
    quote: `"${template.description}"`,
    hp: {
      current: template.hpMax,
      max: template.hpMax,
      temp: 0,
    },
    initiativeBonus: mod(template.stats.dex),
    speedFt: template.speedFt,
    speedNote: `${Math.floor(template.speedFt / 5)} casillas`,
    hitDice: {
      total: 1,
      remaining: 1,
      die: classDef.hitDie,
    },
    stats: {
      str: { score: template.stats.str, modifier: mod(template.stats.str), savingProficient: saves.has('str') },
      dex: { score: template.stats.dex, modifier: mod(template.stats.dex), savingProficient: saves.has('dex') },
      con: { score: template.stats.con, modifier: mod(template.stats.con), savingProficient: saves.has('con') },
      int: { score: template.stats.int, modifier: mod(template.stats.int), savingProficient: saves.has('int') },
      wis: { score: template.stats.wis, modifier: mod(template.stats.wis), savingProficient: saves.has('wis') },
      cha: { score: template.stats.cha, modifier: mod(template.stats.cha), savingProficient: saves.has('cha') },
    },
    proficiencies: {
      armor: [...classDef.armorProficiencies],
      weapons: [...classDef.weaponProficiencies],
    },
    layoutConfig: {
      ...base.layoutConfig,
      showWildShape: template.className === 'Druida',
      showSpells: ['Bardo', 'Brujo', 'Clérigo', 'Druida', 'Explorador', 'Hechicero', 'Mago', 'Paladín'].includes(template.className),
    },
  };
}
