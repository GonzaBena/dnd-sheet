// src/scripts/data/premadeCharacters.ts
// Los datos de cada personaje prehecho viven en src/data/premades/*.toml; este módulo los combina con los
// íconos de clase y arma la ficha completa. Para cambiarlos: editá el TOML y corré `pnpm premades`.
import type { CharacterData, InventoryItem, SpellItem } from '../models/character.ts';
import { CHARACTER_CLASSES, CLASS_DEFINITIONS } from '../dnd/classes.ts';
import { CHARACTER_PRESET_IMAGES } from './characterAvatars.ts';
import { defaultCharacter } from './defaultCharacter.ts';
import { buildAttackFromWeapon } from '../dnd/weaponAttack.ts';
import { recalculateCharacter } from '../dnd/calculations.ts';
import { getSpellSlotsForClass, getSpellcastingAbilityForClass } from '../dnd/spellSlots.ts';
import { PREMADE_DATA } from './premades.generated.ts';

type ClassName = (typeof CHARACTER_CLASSES)[number];
type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

/** Forma de cada personaje tal como sale del TOML (ya validado y con los `ref` resueltos). */
export interface PremadeCharacterData {
  id: string;
  className: ClassName;
  name: string;
  title: string;
  race: string;
  subclass: string;
  alignment: string;
  description: string;
  /** Índice 1-based de CHARACTER_PRESET_IMAGES. */
  avatar: number;
  stats: Record<AbilityKey, number>;
  /** PG a nivel 1. */
  hpMax: number;
  speedFt: number;
  gold: number;
  /** Puede salir sorteado como personaje del modo demo. */
  demo: boolean;
  /** Ids de STANDARD_5E_SKILLS con competencia / con pericia. */
  skills: string[];
  expertise: string[];
  items: InventoryItem[];
  spells: SpellItem[];
}

export interface PremadeCharacterTemplate extends PremadeCharacterData {
  avatarUrl: string;
  /** SVG del emblema de clase que se muestra entre la foto y el título centrado. */
  classIconSvg: string;
}

export const CLASS_ICON_SVGS: Record<ClassName, string> = {
  // Hacha de batalla
  Guerrero:
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="M12 3v18"/><path d="M12 5c3.5-2 7-1 8 2.5-1 3.5-4.5 4.5-8 2.5"/><path d="M12 5C8.5 3 5 4 4 7.5c1 3.5 4.5 4.5 8 2.5"/><path d="M10 19h4"/></svg>`,
  // Brújula
  Explorador:
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polygon points="15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5 15.5 8.5" fill="currentColor" fill-opacity="0.25"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/></svg>`,
  // Yelmo vikingo / Furia
  Bárbaro:
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="M7 11a5 5 0 0 1 10 0v5H7v-5Z"/><path d="M7 9C4 8 2 5 3 3c1.5 1 3.5 2.5 4.5 4.5"/><path d="M17 9c3-1 5-4 4-6-1.5 1-3.5 2.5-4.5 4.5"/><path d="M12 11v6"/><path d="M5 16h14v2a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-2Z"/></svg>`,
  // Lira
  Bardo:
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="M7 4c-2 3-2 8 1 12h8c3-4 3-9 1-12"/><path d="M6 16h12"/><path d="M8 20h8"/><path d="M10 6v10M14 6v10"/><path d="M9 16v4M15 16v4"/></svg>`,
  // Ojo místico / Pacto
  Brujo:
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/></svg>`,
  // Sol radiante
  Clérigo:
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5M4.9 4.9l3.5 3.5M15.6 15.6l3.5 3.5M19.1 4.9l-3.5 3.5M8.4 15.6l-3.5 3.5"/></svg>`,
  // Hoja ancestral
  Druida:
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.4 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z"/><path d="M2 21c0-3 1.8-5.4 5.1-6C9.5 14.5 12 13 13 12"/></svg>`,
  // Llama arcana
  Hechicero:
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5Z"/></svg>`,
  // Grimorio con estrella
  Mago:
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="m12 6 1.2 2.6L16 9l-2 2 .5 2.8-2.5-1.3-2.5 1.3L10 11 8 9l2.8-.4L12 6Z"/></svg>`,
  // Sol y Luna / Ki
  Monje:
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3a4.5 4.5 0 0 0 0 9 4.5 4.5 0 0 1 0 9"/><circle cx="12" cy="7.5" r="1" fill="currentColor"/><circle cx="12" cy="16.5" r="1" fill="currentColor"/></svg>`,
  // Escudo con cruz
  Paladín:
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="M12 7v10M8.5 11h7"/></svg>`,
  // Dagas cruzadas
  Pícaro:
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="w-6 h-6" aria-hidden="true"><path d="m14.5 17.5-11-11V3h3.5l11 11"/><path d="m13 19 6-6"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/><path d="m9.5 17.5 11-11V3H17L6 14"/><path d="m11 19-6-6"/><path d="m8 16-4 4"/><path d="m5 21-2-2"/></svg>`,
};

export const PREMADE_CHARACTERS: readonly PremadeCharacterTemplate[] = PREMADE_DATA.map((data) => ({
  ...data,
  avatarUrl: CHARACTER_PRESET_IMAGES[data.avatar - 1] ?? CHARACTER_PRESET_IMAGES[0],
  classIconSvg: CLASS_ICON_SVGS[data.className],
}));

const SPELLCASTING_CLASSES: readonly string[] = ['Bardo', 'Brujo', 'Clérigo', 'Druida', 'Explorador', 'Hechicero', 'Mago', 'Paladín'];

function mod(score: number): number {
  return Math.floor((score - 10) / 2);
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/**
 * Construye un personaje completo listo para jugar del nivel indicado (3 por defecto, el del modo demo),
 * con el equipo, conjuros y sintonizaciones definidos en su TOML.
 *
 * DECISION: todo lo que trae `defaultCharacter` y es propio de Atlas (habilidades, rasgos, sintonizaciones,
 * acceso rápido, alineamiento, inspiración) se reemplaza explícitamente; antes se colaba en los prehechos.
 * DECISION: los PG por encima de nivel 1 suman el promedio del dado de golpe + CON (mínimo 1) por nivel,
 * más 1 por nivel si es enano (el `hp_max` del TOML ya incluye el de nivel 1).
 */
export function buildFullPremadeCharacter(
  template: PremadeCharacterTemplate,
  level: number = 3,
  userId: string = 'user-me'
): CharacterData {
  const classDef = CLASS_DEFINITIONS[template.className];
  const saves = new Set(classDef.savingThrows);
  const base = clone(defaultCharacter);

  const profBonus = Math.ceil(level / 4) + 1;
  const hitDieMax = Number(classDef.hitDie.replace('d', '')) || 8;
  const hitDieAvg = Math.floor(hitDieMax / 2) + 1;
  const conMod = mod(template.stats.con);
  const raceHpPerLevel = template.race.includes('Enano') ? 1 : 0;
  const hpMax = template.hpMax + (level - 1) * (Math.max(1, hitDieAvg + conMod) + raceHpPerLevel);

  const inventory: InventoryItem[] = clone(template.items);

  const rawSlots = getSpellSlotsForClass(template.className, level, '2024', template.subclass) || {};
  const slots: Record<number, { total: number; used: number }> = {};
  for (let lvl = 1; lvl <= 9; lvl++) slots[lvl] = { total: rawSlots[lvl] || 0, used: 0 };

  const spellAbility = getSpellcastingAbilityForClass(template.className) || 'int';

  let classPreset: 'wizard' | 'druid' | 'fighter' | 'rogue' | 'cleric' = 'fighter';
  if (['Mago', 'Hechicero', 'Brujo'].includes(template.className)) classPreset = 'wizard';
  else if (template.className === 'Druida') classPreset = 'druid';
  else if (['Clérigo', 'Paladín'].includes(template.className)) classPreset = 'cleric';
  else if (['Pícaro', 'Bardo'].includes(template.className)) classPreset = 'rogue';

  const skillSet = new Set(template.skills);
  const expertiseSet = new Set(template.expertise);
  const stat = (key: AbilityKey) => ({
    score: template.stats[key],
    baseScore: template.stats[key],
    modifier: mod(template.stats[key]),
    savingProficient: saves.has(key),
  });

  const draftChar: CharacterData = {
    ...base,
    id: `demo-${template.id.replace('premade-', '')}`,
    name: template.name,
    title: template.title,
    race: template.race,
    alignment: template.alignment,
    className: template.className,
    subclass: level >= 3 ? template.subclass : '',
    level,
    proficiencyBonus: profBonus,
    inspiration: false,
    avatarUrl: template.avatarUrl,
    quote: `"${template.description}"`,
    userId,
    playerName: 'Aventurero (Demo)',
    campaignId: null,
    hp: { current: hpMax, max: hpMax, temp: 0 },
    armorNote: '',
    initiativeBonus: mod(template.stats.dex),
    baseSpeedFt: template.speedFt,
    speedFt: template.speedFt,
    speedNote: `${Math.floor(template.speedFt / 5)} casillas`,
    hitDice: { total: level, remaining: level, die: classDef.hitDie },
    stats: { str: stat('str'), dex: stat('dex'), con: stat('con'), int: stat('int'), wis: stat('wis'), cha: stat('cha') },
    // recalculateCharacter completa las 18 habilidades y sus valores a partir de estas marcas.
    skills: [...skillSet].map((id) => ({
      id,
      name: id,
      stat: 'str',
      proficient: true,
      expertise: expertiseSet.has(id),
      value: 0,
    })),
    proficiencies: {
      armor: [...classDef.armorProficiencies],
      weapons: [...classDef.weaponProficiencies],
    },
    inventory,
    quickSlotItemId: inventory.find((i) => i.category === 'potion')?.id ?? null,
    actions: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: template.gold, pp: 0 },
    // La sintonización vive en el inventario (`attuned`); la lista vieja queda vacía.
    attunedItems: [],
    spellcasting: {
      ability: spellAbility,
      saveDc: 8 + profBonus + mod(template.stats[spellAbility]),
      attackBonus: profBonus + mod(template.stats[spellAbility]),
      slots,
      spells: clone(template.spells),
    },
    resources: [],
    activeEffects: [],
    features: [
      {
        id: `feat-${template.id}`,
        title: `${template.className} • ${template.subclass || 'Iniciado'}`,
        description: template.description,
        uses: 'Pasivo',
        enabled: true,
      },
    ],
    layoutConfig: {
      ...base.layoutConfig!,
      classPreset,
      showWildShape: template.className === 'Druida',
      showSpells: SPELLCASTING_CLASSES.includes(template.className),
    },
  };

  draftChar.actions = inventory
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

  return recalculateCharacter(draftChar);
}

/**
 * Datos de un personaje prehecho de nivel 1 listos para `campaignStore.createCharacter(...)`.
 * DECISION: conserva la subclase del TOML aunque sea nivel 1 (es la identidad que muestra la tarjeta).
 * Se quitan id/usuario/campaña para que los asigne `createCharacter`.
 */
export function buildCharacterFromPremade(template: PremadeCharacterTemplate): Partial<CharacterData> {
  const { id, userId, playerName, campaignId, sessionContext, ...data } = buildFullPremadeCharacter(template, 1);
  return { ...data, subclass: template.subclass };
}
