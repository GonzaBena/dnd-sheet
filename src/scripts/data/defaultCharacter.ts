import type { CharacterData } from '../models/character';

export const defaultCharacter: CharacterData = {
  id: 'atlas',
  name: 'Atlas',
  title: 'Guardián del Cónclave Umbrío',
  race: 'Semielfo',
  alignment: 'Caótico Bueno',
  className: 'Explorador',
  subclass: 'Cónclave Umbrío',
  level: 5,
  proficiencyBonus: 3,
  rulesEdition: '2024',
  inspiration: true,
  avatarUrl: 'https://lh3.googleusercontent.com/aida/ALJJyrBB58Th1LIT7lpeirKCc7greaknxjOFNsUVNXZz77F5UWABzUCxDIFrQsVH-v4M8A0YgzwBmDWfYKMutfm3_bdT3-V88pDbTqbx_y9NSuqyMrjiqmBJFvMng6gAO_JzyQ-W01nJjgrp1Vet0W6NkBOEMRrfEvwxOJ23tXexyZedPfyPSJf0S-NEBKVoih8xE_7kPjBiWbV5F_mIeuzrCDq9-2Qj9c1VoQCcRXRuCkddZQ',
  quote: '"Superviviente de los Bosques Olvidados. Juramentado a cazar los terrores que se ocultan en la niebla perpetua."',
  
  hp: {
    current: 42,
    max: 48,
    temp: 5,
  },
  
  armorClass: 16,
  armorNote: 'Cuero tach. + Escudo',
  initiativeBonus: 3,
  speedFt: 30,
  speedNote: '6 casillas',
  
  hitDice: {
    total: 5,
    remaining: 5,
    die: 'd10',
  },
  
  stats: {
    str: { score: 14, modifier: 2, savingProficient: true },
    dex: { score: 16, modifier: 3, savingProficient: true },
    con: { score: 14, modifier: 2, savingProficient: false },
    int: { score: 10, modifier: 0, savingProficient: false },
    wis: { score: 15, modifier: 2, savingProficient: false },
    cha: { score: 8, modifier: -1, savingProficient: false },
  },
  
  skills: [
    { id: 'stealth', name: 'Sigilo', stat: 'dex', proficient: true, expertise: true, value: 9 },
    { id: 'perception', name: 'Percepción', stat: 'wis', proficient: true, expertise: false, value: 5 },
    { id: 'survival', name: 'Supervivencia', stat: 'wis', proficient: true, expertise: false, value: 5 },
    { id: 'athletics', name: 'Atletismo', stat: 'str', proficient: true, expertise: false, value: 5 },
    { id: 'insight', name: 'Perspicacia', stat: 'wis', proficient: true, expertise: false, value: 5 },
    { id: 'nature', name: 'Naturaleza', stat: 'int', proficient: true, expertise: false, value: 3 },
    { id: 'acrobatics', name: 'Acrobacias', stat: 'dex', proficient: false, expertise: false, value: 3 },
    { id: 'animal-handling', name: 'Trato con Animales', stat: 'wis', proficient: false, expertise: false, value: 2 },
  ],
  
  actions: [
    {
      id: 'longbow',
      name: 'Arco Largo Élfico',
      type: 'A distancia',
      bonus: '+7 al Impacto',
      damage: '1d8 + 3',
      damageType: 'Perforante',
      tags: ['Rango 150/600', 'Pesada', 'Dos manos'],
      isAuto: true,
      ability: 'dex',
      proficient: true,
      attackBonusMod: 1,
      damageDice: '1d8',
      damageBonusMod: 0,
      addAbilityToDamage: true,
      notes: 'Rango 150/600. Bono artesanal élfico de +1 al impacto. Disparo certero en la niebla.'
    },
    {
      id: 'shortsword',
      name: 'Espada Corta de Plata',
      type: 'Cuerpo a cuerpo',
      bonus: '+6 al Impacto',
      damage: '1d6 + 3',
      damageType: 'Cortante',
      tags: ['Sutil', 'Ligera', 'Plata anti-licántropos'],
      isAuto: true,
      ability: 'dex',
      proficient: true,
      attackBonusMod: 0,
      damageDice: '1d6',
      damageBonusMod: 0,
      addAbilityToDamage: true,
      notes: 'Hoja bañada en plata pura. Anula la resistencia al daño de licántropos y espectros.'
    }
  ],
  
  currency: {
    cp: 42,
    sp: 18,
    ep: 5,
    gp: 135,
    pp: 2,
  },
  
  attunedItems: [
    { name: 'Capa del Murciélago', description: 'Otorga ventaja en Sigilo dentro de sombras', icon: 'stars' },
    { name: 'Amuleto de Ravenloft', description: 'Resistencia a miedo sobrenatural', icon: 'stars' },
    { name: 'Ranura Libre', description: 'Disponible para nuevo objeto mágico', icon: 'lock_open' }
  ],
  
  quickSlotItemId: 'pot-healing-1',

  inventory: [
    { id: 'pot-healing-1', name: 'Poción de Curación Mayor', quantity: 2, category: 'potion', description: 'Recupera 10 PG al instante', icon: 'medication', usableType: 'drinkable', healAmount: 10, activationCondition: '1 acción (Combate o Reposo)', notes: 'Elixir escarlata sellado con cera del Cónclave. Cierra heridas abiertas casi al instante.' },
    { id: 'pot-healing-reg', name: 'Poción de Curación', quantity: 1, category: 'potion', description: 'Recupera 5 PG', icon: 'vital_signs', usableType: 'drinkable', healAmount: 5, activationCondition: '1 acción', notes: 'Frasco común de vidrio verdoso con hierbas curativas.' },
    { id: 'antidote', name: 'Antídoto Menor', quantity: 1, category: 'potion', description: 'Cura venenos comunes', icon: 'science', usableType: 'drinkable', activationCondition: '1 acción al sufrir veneno', notes: 'Neutraliza toxinas de arañas y dardos envenenados durante 1 hora.' },
    { id: 'arrows', name: 'Flechas de punta plateada', quantity: 38, category: 'gear', description: 'Efectivas contra no-muertos', icon: 'straighten', usableType: 'none', notes: 'Forjadas por los armeros de Kresk con aleación de plata.' },
    { id: 'rope', name: 'Cuerda de seda élfica (50ft)', quantity: 1, category: 'gear', description: 'Resistente y ligera', icon: 'cable', usableType: 'usable', activationCondition: 'Uso manual', notes: 'Soporta hasta 3,000 lb. Otorga ventaja en tiradas de destreza para asegurar nudos.' },
    { id: 'rations', name: 'Raciones de viaje de Barovia', quantity: 5, category: 'gear', description: 'Para 5 días', icon: 'lunch_dining', usableType: 'edible', healAmount: 2, activationCondition: 'Durante descanso corto', notes: 'Carne seca salada y pan élfico concentrado.' }
  ],
  
  spellcasting: {
    ability: 'wis',
    saveDc: 13,
    attackBonus: 5,
    slots: {
      level1: { total: 4, used: 2 },
      level2: { total: 2, used: 1 },
    },
    spells: [
      {
        id: 'spell-cantrip-guia',
        name: 'Guía',
        level: 0,
        school: 'Adivinación',
        castingTime: '1 acción',
        range: 'Toque',
        duration: 'Concentración, hasta 1 min',
        components: 'V, S',
        damageDice: '1d4',
        damageType: 'Bono',
        activationCondition: '1 acción antes de una prueba',
        notes: 'Tocas a una criatura dispuesta. Añade 1d4 a una prueba de característica a su elección una vez antes de que termine el conjuro.'
      },
      {
        id: 'spell-marca-cazador',
        name: 'Marca del Cazador',
        level: 1,
        school: 'Adivinación',
        castingTime: 'Acción adicional',
        range: '90 ft',
        duration: 'Concentración, hasta 1 hora',
        components: 'V',
        damageDice: '1d6',
        damageType: 'Fuerza',
        activationCondition: 'Acción adicional al designar objetivo',
        notes: 'Causas 1d6 de daño adicional cada vez que impactes al objetivo con un ataque de arma. Ventaja en tiradas de Percepción y Supervivencia para encontrarlo.'
      },
      {
        id: 'spell-curar-heridas',
        name: 'Curar Heridas',
        level: 1,
        school: 'Evocación',
        castingTime: '1 acción',
        range: 'Toque',
        duration: 'Instantáneo',
        components: 'V, S',
        damageDice: '1d8',
        damageType: 'Curación',
        addAbilityToDamage: true,
        damageBonusMod: 0,
        activationCondition: '1 acción al tocar a un aliado herido',
        notes: 'Una criatura que tocas recupera 1d8 + tu modificador de Sabiduría en puntos de golpe. Al usar un espacio superior suma +1d8 por nivel.'
      },
      {
        id: 'spell-zancada-prodigiosa',
        name: 'Zancada Prodigiosa',
        level: 1,
        school: 'Transmutación',
        castingTime: '1 acción',
        range: 'Personal',
        duration: '1 hora',
        components: 'V, S, M',
        activationCondition: '1 acción',
        notes: 'Tu velocidad de movimiento por tierra aumenta en 10 pies hasta que el conjuro termine.'
      },
      {
        id: 'spell-pasar-sin-rastro',
        name: 'Pasar sin Rastro',
        level: 2,
        school: 'Ilusión',
        castingTime: '1 acción',
        range: 'Personal (30ft)',
        duration: 'Concentración, hasta 1 hora',
        components: 'V, S, M',
        activationCondition: '1 acción al acechar o viajar',
        notes: 'Un velo de sombras te cubre a ti y a tus aliados a 30 pies. Otorga +10 a las pruebas de Sigilo y no pueden ser rastreados salvo por medios mágicos.'
      }
    ]
  },
  
  wildShape: {
    usesTotal: 2,
    usesRemaining: 2,
    activeForm: null
  },
  
  layoutConfig: {
    activeTab: 'all',
    showSpells: true,
    showWildShape: false,
    showWeapons: true,
    showInventory: true,
    showJournal: true,
    showSkills: true,
    classPreset: 'custom',
    sectionOrder: {
      col1: ['abilities', 'saves', 'skills', 'features'],
      col2: ['weapons', 'wildshape', 'currency', 'backpack', 'spells'],
      unifiedOrder: ['abilities', 'saves', 'skills', 'features', 'weapons', 'wildshape', 'currency', 'backpack', 'spells']
    },
    collapsedSections: []
  },
  
  features: [
    {
      id: 'feat-1',
      title: 'Emboscador Umbrío (Dread Ambusher)',
      description: 'En tu primer turno de combate, ganas +10 ft de velocidad y un ataque adicional con 1d8 de daño de fuerza.',
      uses: 'Pasivo / 1er turno',
      enabled: true
    },
    {
      id: 'feat-2',
      title: 'Visión en la Oscuridad Superior',
      description: 'Alcance de 90 pies. Eres invisible para cualquier criatura que confíe en la visión en la oscuridad en penumbra o tinieblas.',
      uses: 'Continuo',
      enabled: true
    },
    {
      id: 'feat-3',
      title: 'Sentido Primitivo',
      description: 'Detecta la presencia de aberraciones, celestiales, dragones, elementales, feéricos, infernales y no-muertos en 1 milla.',
      uses: '2 / descanso largo',
      enabled: true
    }
  ],
  
  sessionContext: {
    campaignName: 'Aventura Independiente',
    sessionNumber: 1,
    weather: 'Niebla Espesa / Anochecer',
    location: 'Tierras Salvajes'
  }
};
