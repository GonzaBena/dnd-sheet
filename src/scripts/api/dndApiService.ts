// src/scripts/api/dndApiService.ts
// Servicio unificado de acceso y normalización para la API de D&D 5e (2024 y 2014)

import { srdCacheManager, type SrdEdition } from './srdCacheManager.ts';
import {
  translateSchool,
  translateDamageType,
  translateCastingTime,
  translateProperty,
  translateRarity,
  translateEquipmentCategory,
  getSpellSpanishName,
  getEquipmentSpanishName,
  getMagicItemSpanishName,
  COMMON_ITEM_EFFECT_HINTS_ES,
  WEAPON_MASTERIES_ES,
  matchesQuery,
  normalizeText,
} from '../dnd/dndTranslations.ts';
import type { SpellItem, InventoryItem, AttackAction, ArmorData, WeaponData } from '../models/character.ts';
import { armorFromSrd, weaponFromSrd } from '../dnd/catalog.ts';

export interface UnifiedSpell {
  index: string;
  name: string;
  nameEs: string;
  level: number;
  school: string;
  schoolEs: string;
  castingTime: string;
  castingTimeEs: string;
  range: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  components: string;
  material?: string;
  description: string;
  higherLevel?: string;
  damageDice?: string;
  damageType?: string;
  damageTypeEs?: string;
  isAttack: boolean;
  isSave: boolean;
  saveAbility?: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
  classes: string[];
  edition: SrdEdition;
}

export interface UnifiedEquipment {
  index: string;
  name: string;
  nameEs: string;
  category: 'weapon' | 'armor' | 'gear' | 'potion' | 'treasure';
  subCategory?: 'consumable' | 'tools' | 'packs' | 'ammunition' | 'focus' | 'mount' | 'general';
  equipmentType?: string;
  cost?: string;
  weight?: number;
  damageDice?: string;
  damageType?: string;
  damageTypeEs?: string;
  attackType?: 'Cuerpo a cuerpo' | 'A distancia' | 'Mágico';
  properties: string[];
  mastery?: string;
  masteryDesc?: string;
  armorClass?: string;
  stealthDisadvantage?: boolean;
  strPrerequisite?: number;
  /** Datos estructurados (Spec 08, Fase B). Se copian al InventoryItem al agregar. */
  armor?: ArmorData;
  weapon?: WeaponData;
  hands?: 1 | 2;
  description: string;
  usableType: 'none' | 'potion' | 'drinkable' | 'edible' | 'usable';
  healAmount?: number;
  activationCondition?: string;
  edition: SrdEdition;
}

export interface UnifiedMagicItem {
  index: string;
  name: string;
  nameEs: string;
  rarity: string;
  rarityEs: string;
  attunement: boolean;
  category: string;
  description: string;
  edition: SrdEdition;
}

export interface UnifiedClass {
  index: string;
  name: string;
  hitDie: number;
  savingThrows: string[];
  subclasses: { index: string; name: string }[];
  edition: SrdEdition;
}

export interface UnifiedSpecies {
  index: string;
  name: string;
  speed: number;
  traits: { index: string; name: string }[];
  edition: SrdEdition;
}

export interface UnifiedFeat {
  index: string;
  name: string;
  prerequisites: string;
  description: string;
  edition: SrdEdition;
}

export interface SpellFilters {
  query?: string;
  level?: number;
  school?: string;
  className?: string;
}

export interface EquipmentFilters {
  query?: string;
  category?: 'all' | 'weapon' | 'armor' | 'gear' | 'potion' | 'gear-and-potion';
  subCategory?: 'all' | 'consumable' | 'tools' | 'packs' | 'ammunition' | 'focus' | 'mount' | 'general';
}

class DndApiService {
  private liveApiBase = 'https://www.dnd5eapi.co/api';

  /**
   * Extrae la descripción tanto si viene como cadena (2024) o como array de cadenas (2014)
   */
  private extractDescription(desc: any): string {
    if (!desc) return '';
    if (Array.isArray(desc)) return desc.join('\n\n');
    return String(desc);
  }

  /**
   * Normaliza un conjuro del SRD (2024 o 2014) a UnifiedSpell
   */
  public normalizeSpell(raw: any, edition: SrdEdition): UnifiedSpell {
    const rawSchool = raw.school?.name || raw.school?.index || (typeof raw.school === 'string' ? raw.school : 'Evocation');
    const schoolEs = translateSchool(rawSchool);

    const castingTime = raw.casting_time || '1 action';
    const castingTimeEs = translateCastingTime(castingTime);

    // Extraer daño y tipo de daño
    let damageDice = '';
    let damageType = '';
    let damageTypeEs = '';

    if (raw.damage) {
      if (Array.isArray(raw.damage) && raw.damage.length > 0) {
        // Formato 2014
        const d = raw.damage[0];
        damageType = d.damage_type?.name || d.damage_type?.index || '';
        if (d.damage_at_slot_level) {
          const lvls = Object.keys(d.damage_at_slot_level);
          if (lvls.length > 0) damageDice = d.damage_at_slot_level[lvls[0]];
        } else if (d.damage_at_character_level) {
          const lvls = Object.keys(d.damage_at_character_level);
          if (lvls.length > 0) damageDice = d.damage_at_character_level[lvls[0]];
        }
      } else if (typeof raw.damage === 'object') {
        // Formato 2024
        damageType = raw.damage.damage_type?.name || raw.damage.damage_type?.index || '';
        if (raw.damage.damage_at_slot_level) {
          const lvls = Object.keys(raw.damage.damage_at_slot_level);
          if (lvls.length > 0) damageDice = raw.damage.damage_at_slot_level[lvls[0]];
        } else if (raw.damage.damage_at_character_level) {
          const lvls = Object.keys(raw.damage.damage_at_character_level);
          if (lvls.length > 0) damageDice = raw.damage.damage_at_character_level[lvls[0]];
        }
      }
    }

    if (damageType) {
      damageTypeEs = translateDamageType(damageType);
    }

    // Ataque o Salvación
    const isAttack = !!raw.attack_type;
    const isSave = !!raw.dc;
    let saveAbility: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha' | undefined;
    if (isSave && raw.dc?.dc_type?.index) {
      saveAbility = raw.dc.dc_type.index.toLowerCase() as any;
    }

    // Componentes
    const comps = Array.isArray(raw.components) ? raw.components.join(', ') : (raw.components || 'V, S');

    const desc = this.extractDescription(raw.description || raw.desc);
    const higherLevel = this.extractDescription(raw.higher_level);

    const classes = Array.isArray(raw.classes)
      ? raw.classes.map((c: any) => c.name || c.index)
      : [];

    return {
      index: raw.index || raw.name?.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      name: raw.name || '',
      nameEs: getSpellSpanishName(raw.index, raw.name),
      level: typeof raw.level === 'number' ? raw.level : 0,
      school: rawSchool,
      schoolEs,
      castingTime,
      castingTimeEs,
      range: raw.range || 'Personal',
      duration: raw.duration || 'Instantáneo',
      concentration: !!raw.concentration,
      ritual: !!raw.ritual,
      components: comps,
      material: raw.material || undefined,
      description: desc,
      higherLevel: higherLevel || undefined,
      damageDice: damageDice || undefined,
      damageType: damageType || undefined,
      damageTypeEs: damageTypeEs || undefined,
      isAttack,
      isSave,
      saveAbility,
      classes,
      edition
    };
  }

  /**
   * Normaliza equipo del SRD (2024 o 2014) a UnifiedEquipment
   */
  public normalizeEquipment(raw: any, edition: SrdEdition): UnifiedEquipment {
    let cat: 'weapon' | 'armor' | 'gear' | 'potion' | 'treasure' = 'gear';
    const rawCategories: string[] = [];

    if (raw.equipment_category?.index) rawCategories.push(raw.equipment_category.index);
    if (Array.isArray(raw.equipment_categories)) {
      raw.equipment_categories.forEach((c: any) => {
        if (c.index) rawCategories.push(c.index);
      });
    }

    const catStr = rawCategories.join(' ');
    if (catStr.includes('weapon')) cat = 'weapon';
    else if (catStr.includes('armor')) cat = 'armor';
    else if (raw.index?.includes('potion') || raw.name?.toLowerCase().includes('potion')) cat = 'potion';

    // Coste y peso
    let cost = '';
    if (raw.cost) {
      cost = `${raw.cost.quantity} ${raw.cost.unit?.toUpperCase() || 'PO'}`;
    }
    const weight = typeof raw.weight === 'number' ? raw.weight : undefined;

    // Daño de arma
    let damageDice = '';
    let damageType = '';
    let damageTypeEs = '';
    if (raw.damage) {
      damageDice = raw.damage.damage_dice || '';
      damageType = raw.damage.damage_type?.name || raw.damage.damage_type?.index || '';
      if (damageType) damageTypeEs = translateDamageType(damageType);
    }

    // Tipo de ataque
    let attackType: 'Cuerpo a cuerpo' | 'A distancia' | 'Mágico' = 'Cuerpo a cuerpo';
    if (raw.weapon_range === 'Ranged' || raw.range?.long) {
      attackType = 'A distancia';
    }

    // Propiedades
    const properties: string[] = [];
    if (Array.isArray(raw.properties)) {
      raw.properties.forEach((p: any) => {
        const pName = p.name || p.index;
        if (pName) properties.push(translateProperty(pName));
      });
    }

    // Maestría (2024)
    let mastery = '';
    let masteryDesc = '';
    if (raw.mastery?.index) {
      mastery = raw.mastery.name || raw.mastery.index;
      const mInfo = WEAPON_MASTERIES_ES[raw.mastery.index.toLowerCase()];
      if (mInfo) masteryDesc = mInfo.desc;
    }

    // Armadura
    let armorClass = '';
    let stealthDisadvantage = false;
    let strPrerequisite = 0;
    if (raw.armor_class) {
      const baseAc = raw.armor_class.base || 10;
      const dexBonus = raw.armor_class.dex_bonus ? ' + DES' : '';
      const maxBonus = raw.armor_class.max_bonus ? ` (máx +${raw.armor_class.max_bonus})` : '';
      armorClass = `CA ${baseAc}${dexBonus}${maxBonus}`;
      stealthDisadvantage = !!raw.stealth_disadvantage;
      strPrerequisite = raw.str_minimum || 0;
    }

    // Consumible / Curación y Subcategoría
    const idx = raw.index || raw.name?.toLowerCase().replace(/[^a-z0-9]/g, '-') || '';
    let usableType: 'none' | 'potion' | 'drinkable' | 'edible' | 'usable' = 'none';
    let healAmount: number | undefined;
    let activationCondition: string | undefined;

    const hint = COMMON_ITEM_EFFECT_HINTS_ES[idx];
    if (hint) {
      usableType = hint.usableType;
      healAmount = hint.healAmount;
      activationCondition = hint.activationCondition;
    } else if (cat === 'potion') {
      usableType = 'drinkable';
      if (idx === 'potion-of-healing') healAmount = 7; // Promedio 2d4+2
      else if (idx === 'potion-of-greater-healing') healAmount = 14;
    }

    // Subcategoría para filtrado de Equipo y Consumibles
    let subCategory: string = 'general';
    const gearCatIdx = raw.gear_category?.index || '';
    if (cat === 'potion' || usableType === 'drinkable' || usableType === 'edible' || ['healers-kit', 'caltrops', 'ball-bearings-bag-of-1-000', 'torch', 'candle', 'tinderbox'].includes(idx)) {
      subCategory = 'consumable';
    } else if (catStr.includes('tools') || gearCatIdx.includes('tools') || gearCatIdx.includes('kits') || idx.endsWith('-supplies') || idx.endsWith('-tools') || idx.endsWith('-kit')) {
      subCategory = 'tools';
    } else if (gearCatIdx === 'equipment-packs' || idx.endsWith('-pack')) {
      subCategory = 'packs';
    } else if (gearCatIdx === 'ammunition' || catStr.includes('ammunition') || ['arrows', 'crossbow-bolts', 'sling-bullets', 'blowgun-needles', 'firearm-bullets'].includes(idx)) {
      subCategory = 'ammunition';
    } else if (['holy-symbols', 'arcane-foci', 'druidic-foci'].includes(gearCatIdx) || ['component-pouch', 'spellbook', 'amulet', 'emblem', 'reliquary', 'crystal', 'orb', 'rod', 'staff', 'wand', 'sprig-of-mistletoe', 'totem', 'wooden-staff', 'yew-wand'].includes(idx)) {
      subCategory = 'focus';
    } else if (catStr.includes('mounts') || catStr.includes('vehicles') || gearCatIdx.includes('mounts') || gearCatIdx.includes('tack')) {
      subCategory = 'mount';
    }

    const rawDesc = this.extractDescription(raw.description || raw.desc);
    const desc = hint?.descEs ? (rawDesc ? `${hint.descEs}\n\n${rawDesc}` : hint.descEs) : rawDesc;

    // Spec 08, Fase B: datos estructurados de armadura/arma (FB-2/FB-3).
    const armorData = armorFromSrd(raw);
    const weaponData = armorData ? undefined : weaponFromSrd(raw);

    const rawEquipType = raw.gear_category?.name || raw.equipment_category?.name || raw.weapon_category || undefined;
    const equipmentType = rawEquipType ? translateEquipmentCategory(rawEquipType) : undefined;

    return {
      index: idx,
      name: raw.name || '',
      armor: armorData,
      weapon: weaponData?.weapon,
      hands: weaponData?.hands,
      nameEs: getEquipmentSpanishName(idx, raw.name),
      category: cat,
      subCategory,
      equipmentType,
      cost: cost || undefined,
      weight,
      damageDice: damageDice || undefined,
      damageType: damageType || undefined,
      damageTypeEs: damageTypeEs || undefined,
      attackType: cat === 'weapon' ? attackType : undefined,
      properties,
      mastery: mastery || undefined,
      masteryDesc: masteryDesc || undefined,
      armorClass: armorClass || undefined,
      stealthDisadvantage,
      strPrerequisite: strPrerequisite || undefined,
      description: desc,
      usableType,
      healAmount,
      activationCondition,
      edition
    };
  }

  /**
   * Normaliza objetos mágicos
   */
  public normalizeMagicItem(raw: any, edition: SrdEdition): UnifiedMagicItem {
    const idx = raw.index || raw.name?.toLowerCase().replace(/[^a-z0-9]/g, '-') || '';
    const rarity = raw.rarity?.name || 'Varies';
    const rarityEs = translateRarity(rarity);
    const desc = this.extractDescription(raw.description || raw.desc);
    const rawCat = raw.equipment_category?.name || raw.equipment_category?.index || 'Objeto Mágico';

    return {
      index: idx,
      name: raw.name || '',
      nameEs: getMagicItemSpanishName(idx, raw.name || ''),
      rarity,
      rarityEs,
      attunement: !!(raw.attunement || raw.requires_attunement || /requires attunement/i.test(desc)),
      category: translateEquipmentCategory(rawCat),
      description: desc,
      edition
    };
  }

  /**
   * Busca conjuros filtrados
   */
  public async searchSpells(edition: SrdEdition, filters: SpellFilters = {}): Promise<UnifiedSpell[]> {
    const rawList = await srdCacheManager.getCategory(edition, 'spells');
    const normalized = rawList.map(r => this.normalizeSpell(r, edition));

    return normalized.filter(sp => {
      if (filters.level !== undefined && filters.level !== null && sp.level !== filters.level) {
        return false;
      }
      if (filters.school && normalizeText(sp.school) !== normalizeText(filters.school) && normalizeText(sp.schoolEs) !== normalizeText(filters.school)) {
        return false;
      }
      if (filters.query && filters.query.trim() !== '') {
        const matches = matchesQuery([sp.name, sp.nameEs, sp.school, sp.schoolEs, sp.description], filters.query);
        if (!matches) return false;
      }
      return true;
    }).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  }

  /**
   * Busca equipo / armas / armaduras
   */
  public async searchEquipment(edition: SrdEdition, filters: EquipmentFilters = {}): Promise<UnifiedEquipment[]> {
    const rawList = await srdCacheManager.getCategory(edition, 'equipment');
    const normalized = rawList.map(r => this.normalizeEquipment(r, edition));

    return normalized.filter(item => {
      if (filters.category && filters.category !== 'all') {
        if (filters.category === 'weapon' && item.category !== 'weapon') return false;
        if (filters.category === 'armor' && item.category !== 'armor') return false;
        if (filters.category === 'potion' && item.category !== 'potion') return false;
        if (filters.category === 'gear' && item.category !== 'gear') return false;
        if (filters.category === 'gear-and-potion' && item.category !== 'gear' && item.category !== 'potion') return false;
      }
      if (filters.subCategory && filters.subCategory !== 'all') {
        if (item.subCategory !== filters.subCategory) return false;
      }
      if (filters.query && filters.query.trim() !== '') {
        const matches = matchesQuery(
          [item.name, item.nameEs, item.category, item.equipmentType || '', item.activationCondition || '', item.description, ...(item.properties || [])],
          filters.query
        );
        if (!matches) return false;
      }
      return true;
    }).sort((a, b) => (a.nameEs || a.name).localeCompare(b.nameEs || b.name, 'es'));
  }

  /**
   * Busca objetos mágicos
   */
  public async searchMagicItems(edition: SrdEdition, query?: string): Promise<UnifiedMagicItem[]> {
    const rawList = await srdCacheManager.getCategory(edition, 'magic-items');
    const normalized = rawList.map(r => this.normalizeMagicItem(r, edition));

    const filtered = (!query || query.trim() === '')
      ? normalized
      : normalized.filter(item => matchesQuery([item.name, item.nameEs, item.rarity, item.rarityEs, item.category, item.description], query));

    return filtered.sort((a, b) => (a.nameEs || a.name).localeCompare(b.nameEs || b.name, 'es'));
  }

  /**
   * Obtiene clases del SRD
   */
  public async getClasses(edition: SrdEdition): Promise<UnifiedClass[]> {
    const rawList = await srdCacheManager.getCategory(edition, 'classes');
    return rawList.map((c: any) => ({
      index: c.index,
      name: c.name,
      hitDie: c.hit_die || 8,
      savingThrows: Array.isArray(c.saving_throws) ? c.saving_throws.map((st: any) => st.name || st.index) : [],
      subclasses: Array.isArray(c.subclasses) ? c.subclasses.map((sub: any) => ({ index: sub.index, name: sub.name })) : [],
      edition
    }));
  }

  /**
   * Obtiene especies (2024) o razas (2014)
   */
  public async getSpeciesOrRaces(edition: SrdEdition): Promise<UnifiedSpecies[]> {
    const cat = edition === '2024' ? 'species' : 'races';
    const rawList = await srdCacheManager.getCategory(edition, cat);
    return rawList.map((r: any) => ({
      index: r.index,
      name: r.name,
      speed: r.speed || 30,
      traits: Array.isArray(r.traits) ? r.traits.map((t: any) => ({ index: t.index, name: t.name })) : [],
      edition
    }));
  }

  /**
   * Obtiene dotes del SRD
   */
  public async getFeats(edition: SrdEdition, query?: string): Promise<UnifiedFeat[]> {
    const rawList = await srdCacheManager.getCategory(edition, 'feats');
    const list: UnifiedFeat[] = rawList.map((f: any) => {
      let prereq = '';
      if (Array.isArray(f.prerequisites)) {
        prereq = f.prerequisites.map((p: any) => p.description || p.name || '').filter(Boolean).join('; ');
      }
      return {
        index: f.index,
        name: f.name,
        prerequisites: prereq,
        description: this.extractDescription(f.description || f.desc),
        edition
      };
    });

    if (!query || query.trim() === '') return list;
    return list.filter(f => matchesQuery([f.name, f.prerequisites, f.description], query));
  }

  /**
   * Fallback dinámico a la API en vivo
   */
  public async fetchLive(edition: SrdEdition, endpoint: string): Promise<any> {
    const url = `${this.liveApiBase}/${edition}/${endpoint.replace(/^\//, '')}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Live API error: HTTP ${res.status}`);
    return await res.json();
  }

  // --- Mapeadores hacia los modelos internos de la Ficha ---

  public toSpellPayload(unified: UnifiedSpell): Partial<SpellItem> {
    return {
      source: 'srd',
      custom: false,
      name: unified.nameEs !== unified.name ? `${unified.nameEs} (${unified.name})` : unified.name,
      level: unified.level,
      school: unified.schoolEs,
      castingTime: unified.castingTimeEs,
      range: unified.range,
      duration: unified.duration,
      components: unified.components,
      isAttack: unified.isAttack,
      isSave: unified.isSave,
      saveAbility: unified.saveAbility,
      damageDice: unified.damageDice,
      damageType: unified.damageTypeEs || 'Fuerza',
      notes: unified.description.slice(0, 500)
    };
  }

  public toInventoryPayload(unified: UnifiedEquipment | UnifiedMagicItem): Partial<InventoryItem> {
    if ('rarity' in unified) {
      const lowerIdx = unified.index.toLowerCase();
      const lowerCat = unified.category.toLowerCase();
      const isPotion = lowerIdx.includes('potion') || lowerIdx.includes('philter') || lowerIdx.includes('elixir') || lowerCat.includes('poción') || lowerCat.includes('potion');
      const isScrollOrWand = lowerIdx.includes('scroll') || lowerIdx.includes('wand-') || lowerIdx.includes('bead-') || lowerIdx.includes('feather-token') || lowerIdx.includes('necklace-of-fireballs') || lowerIdx.includes('chime-of-opening') || lowerIdx.includes('candle-of-invocation') || lowerIdx.includes('dust-of-') || lowerIdx.includes('oil-of-') || lowerCat.includes('pergamino') || lowerCat.includes('varita');

      let healAmount: number | undefined;
      if (lowerIdx === 'potion-of-healing' || lowerIdx === 'potions-of-healing' || lowerIdx === 'potion-of-healing-common') healAmount = 7;
      else if (lowerIdx === 'potion-of-greater-healing' || lowerIdx === 'potion-of-healing-greater') healAmount = 14;
      else if (lowerIdx === 'potion-of-superior-healing' || lowerIdx === 'potion-of-healing-superior') healAmount = 28;
      else if (lowerIdx === 'potion-of-supreme-healing' || lowerIdx === 'potion-of-healing-supreme') healAmount = 45;

      return {
        source: 'srd',
        custom: false,
        name: unified.nameEs && unified.nameEs !== unified.name ? `${unified.nameEs} (${unified.name})` : unified.name,
        quantity: 1,
        category: isPotion ? 'potion' : 'gear',
        ...(unified.attunement ? { requiresAttunement: true } : {}),
        usableType: isPotion ? 'drinkable' : (isScrollOrWand ? 'usable' : 'none'),
        ...(healAmount ? { healAmount } : {}),
        notes: `[${unified.rarityEs} • ${unified.category}] ${unified.description.slice(0, 300)}`
      };
    }

    // FB-1/FB-4: se copia (sin compartir referencias). Una armadura sin `armor` válido queda como objeto común.
    const armor = unified.armor ? { ...unified.armor } : undefined;
    const weapon = unified.weapon
      ? { ...unified.weapon, properties: [...unified.weapon.properties], range: unified.weapon.range ? { ...unified.weapon.range } : undefined }
      : undefined;
    if (weapon && !weapon.range) delete weapon.range;
    return {
      source: 'srd',
      custom: false,
      name: unified.nameEs !== unified.name ? `${unified.nameEs} (${unified.name})` : unified.name,
      quantity: 1,
      category: unified.category,
      ...(armor ? { armor } : {}),
      ...(weapon ? { weapon, hands: unified.hands ?? 1 } : {}),
      weight: unified.weight ? `${unified.weight} lb` : undefined,
      weightLb: unified.weight,
      usableType: unified.usableType,
      healAmount: unified.healAmount,
      activationCondition: unified.activationCondition,
      notes: [
        unified.cost ? `Coste: ${unified.cost}` : '',
        unified.mastery ? `Maestría: ${unified.mastery} - ${unified.masteryDesc}` : '',
        unified.armorClass ? `Protección: ${unified.armorClass}` : '',
        unified.description ? unified.description.slice(0, 250) : ''
      ].filter(Boolean).join(' • ')
    };
  }

  public toAttackPayload(unified: UnifiedEquipment): Partial<AttackAction> {
    const tags: string[] = [...(unified.properties || [])];
    if (unified.mastery) tags.push(`Maestría: ${unified.mastery}`);

    return {
      name: unified.nameEs !== unified.name ? `${unified.nameEs} (${unified.name})` : unified.name,
      type: unified.attackType || 'Cuerpo a cuerpo',
      damageDice: unified.damageDice || '1d6',
      damageType: unified.damageTypeEs || 'Perforante',
      mastery: unified.mastery || undefined,
      tags,
      notes: unified.masteryDesc ? `Maestría (${unified.mastery}): ${unified.masteryDesc}` : unified.description.slice(0, 200)
    };
  }
}

export const dndApiService = new DndApiService();
