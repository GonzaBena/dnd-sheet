// src/scripts/dnd/dndTranslations.ts
// Diccionarios y funciones de traducción y normalización EN <-> ES para el SRD de D&D 5e

export const MAGIC_SCHOOLS_ES: Record<string, string> = {
  abjuration: 'Abjuración',
  abjuracion: 'Abjuración',
  conjuration: 'Conjuración',
  conjuracion: 'Conjuración',
  divination: 'Adivinación',
  adivinacion: 'Adivinación',
  enchantment: 'Encantamiento',
  encantamiento: 'Encantamiento',
  evocation: 'Evocación',
  evocacion: 'Evocación',
  illusion: 'Ilusión',
  ilusion: 'Ilusión',
  necromancy: 'Nigromancia',
  nigromancia: 'Nigromancia',
  transmutation: 'Transmutación',
  transmutacion: 'Transmutación',
};

export const DAMAGE_TYPES_ES: Record<string, string> = {
  acid: 'Ácido',
  acido: 'Ácido',
  bludgeoning: 'Contundente',
  contundente: 'Contundente',
  cold: 'Frío',
  frio: 'Frío',
  fire: 'Fuego',
  fuego: 'Fuego',
  force: 'Fuerza',
  fuerza: 'Fuerza',
  lightning: 'Relámpago',
  relampago: 'Relámpago',
  necrotic: 'Necrótico',
  necrotico: 'Necrótico',
  piercing: 'Perforante',
  perforante: 'Perforante',
  poison: 'Veneno',
  veneno: 'Veneno',
  psychic: 'Psíquico',
  psiquico: 'Psíquico',
  radiant: 'Radiante',
  radiante: 'Radiante',
  slashing: 'Cortante',
  cortante: 'Cortante',
  thunder: 'Trueno',
  trueno: 'Trueno',
};

export const WEAPON_PROPERTIES_ES: Record<string, string> = {
  ammunition: 'Munición',
  finesse: 'Sutil',
  heavy: 'Pesada',
  light: 'Ligera',
  loading: 'Recarga',
  range: 'A distancia',
  reach: 'Alcance extendido',
  special: 'Especial',
  thrown: 'Arrojadiza',
  'two-handed': 'A dos manos',
  versatile: 'Versátil',
  monk: 'Monje',
};

export const WEAPON_MASTERIES_ES: Record<string, { name: string; desc: string }> = {
  cleave: { name: 'Cleave', desc: 'Si impactas a una criatura con un ataque cuerpo a cuerpo, puedes realizar un segundo ataque contra otra criatura adyacente.' },
  graze: { name: 'Graze', desc: 'Si fallas la tirada de ataque, el objetivo recibe daño igual al modificador de tu característica de ataque.' },
  nick: { name: 'Nick', desc: 'El ataque adicional con arma ligera se realiza como parte de la acción de Ataque en lugar de una acción adicional.' },
  push: { name: 'Push', desc: 'Si impactas a una criatura de tamaño Grande o menor, puedes empujarla hasta 10 pies en línea recta.' },
  sap: { name: 'Sap', desc: 'Si impactas a una criatura, esta tiene desventaja en su siguiente tirada de ataque antes del inicio de tu próximo turno.' },
  slow: { name: 'Slow', desc: 'Si impactas a una criatura y le infliges daño, su velocidad se reduce en 10 pies hasta el inicio de tu siguiente turno.' },
  topple: { name: 'Topple', desc: 'Si impactas a una criatura, debe superar una tirada de salvación de CON o quedar derribada (Prone).' },
  vex: { name: 'Vex', desc: 'Si impactas a una criatura e infliges daño, obtienes ventaja en tu siguiente tirada de ataque contra esa criatura.' },
};

export const RARITY_ES: Record<string, string> = {
  common: 'Común',
  uncommon: 'Poco Común',
  rare: 'Rara',
  'very-rare': 'Muy Rara',
  'very rare': 'Muy Rara',
  legendary: 'Legendaria',
  artifact: 'Artefacto',
  varies: 'Variable',
};

export const CASTING_TIME_ES: Record<string, string> = {
  action: '1 acción',
  '1 action': '1 acción',
  'bonus action': '1 acción adicional',
  '1 bonus action': '1 acción adicional',
  reaction: '1 reacción',
  '1 reaction': '1 reacción',
  '1 minute': '1 minuto',
  '10 minutes': '10 minutos',
  '1 hour': '1 hora',
  '8 hours': '8 horas',
  '24 hours': '24 horas',
};

export const COMMON_SPELL_TRANSLATIONS: Record<string, string> = {
  'acid-arrow': 'Flecha Ácida',
  'acid-splash': 'Salpicadura Ácida',
  aid: 'Auxilio Divino',
  alarm: 'Alarma',
  'alter-self': 'Alterar el Propio Cuerpo',
  'animal-friendship': 'Amistad con los Animales',
  'animal-messenger': 'Mensajero Animal',
  'animate-dead': 'Animar a los Muertos',
  'animate-objects': 'Animar Objetos',
  'arcane-eye': 'Ojo Arcano',
  'arcane-lock': 'Cerradura Arcana',
  bane: 'Ruina (Bane)',
  banishment: 'Destierro',
  barkskin: 'Piel Rupestre / Corteza',
  bless: 'Bendición',
  blight: 'Marchitar',
  'blindness-deafness': 'Ceguera/Sordera',
  blink: 'Parpadeo (Blink)',
  blur: 'Desdibujar (Blur)',
  'burning-hands': 'Manos Ardientes',
  'call-lightning': 'Llamar al Relámpago',
  'calm-emotions': 'Calmar Emociones',
  'charm-person': 'Hechizar Persona',
  'chill-touch': 'Toque Helado',
  'chromatic-orb': 'Orbe Cromático',
  command: 'Orden Premisoria',
  'cure-wounds': 'Curar Heridas',
  darkness: 'Oscuridad',
  darkvision: 'Visión en la Oscuridad',
  'detect-magic': 'Detectar Magia',
  disguise: 'Disfrazarse',
  entangle: 'Entrelazar',
  fireball: 'Bola de Fuego',
  'fire-bolt': 'Descarga de Fuego',
  fly: 'Volar',
  guidance: 'Guía',
  haste: 'Celeridad / Acelerar',
  'healing-word': 'Palabra de Curación',
  identify: 'Identificar',
  invisibility: 'Invisibilidad',
  light: 'Luz',
  'mage-armor': 'Armadura de Mago',
  'mage-hand': 'Mano de Mago',
  'magic-missile': 'Proyectil Mágico',
  'pass-without-trace': 'Pasar sin Rastro',
  shield: 'Escudo Arcano',
  sleep: 'Sueño',
  thunderwave: 'Ola Atronadora',
};

export const COMMON_EQUIPMENT_TRANSLATIONS: Record<string, string> = {
  dagger: 'Daga',
  shortsword: 'Espada Corta',
  longsword: 'Espada Larga',
  greatsword: 'Mandoble',
  rapier: 'Estoques / Ropera',
  scimitar: 'Cimitarra',
  shortbow: 'Arco Corto',
  longbow: 'Arco Largo',
  crossbow: 'Ballesta',
  'light-crossbow': 'Ballesta Ligera',
  'heavy-crossbow': 'Ballesta Pesada',
  shield: 'Escudo de Combate',
  'leather-armor': 'Armadura de Cuero',
  'studded-leather-armor': 'Cuero Tachonado',
  'chain-mail': 'Cota de Malla',
  'plate-armor': 'Armadura de Placas',
  'potion-of-healing': 'Poción de Curación',
  'potion-of-greater-healing': 'Poción de Curación Mayor',
  torch: 'Antorcha',
  rope: 'Cuerda',
  rations: 'Raciones de Viaje',
  backpack: 'Mochila de Aventurero',
};

export function normalizeText(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function translateSchool(schoolKeyOrName: string): string {
  const norm = normalizeText(schoolKeyOrName);
  return MAGIC_SCHOOLS_ES[norm] || schoolKeyOrName;
}

export function translateDamageType(damageKeyOrName: string): string {
  const norm = normalizeText(damageKeyOrName);
  return DAMAGE_TYPES_ES[norm] || damageKeyOrName;
}

export function translateCastingTime(time: string): string {
  const norm = normalizeText(time);
  return CASTING_TIME_ES[norm] || time;
}

export function translateProperty(propKey: string): string {
  const norm = normalizeText(propKey);
  return WEAPON_PROPERTIES_ES[norm] || propKey;
}

export function translateRarity(rarity: string): string {
  const norm = normalizeText(rarity);
  return RARITY_ES[norm] || rarity;
}

export function getSpellSpanishName(index: string, originalName: string): string {
  return COMMON_SPELL_TRANSLATIONS[index] || originalName;
}

export function getEquipmentSpanishName(index: string, originalName: string): string {
  return COMMON_EQUIPMENT_TRANSLATIONS[index] || originalName;
}

export function matchesQuery(searchTarget: string[], query: string): boolean {
  if (!query || query.trim() === '') return true;
  const terms = normalizeText(query).split(/\s+/).filter(Boolean);
  const normalizedTargets = searchTarget.map(t => normalizeText(t)).join(' ');

  return terms.every(term => normalizedTargets.includes(term));
}
