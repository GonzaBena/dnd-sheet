// ARCHIVO GENERADO por scripts/build-premades.mjs a partir de src/data/premades/*.toml.
// No lo edites a mano: cambiá los TOML y corré `pnpm premades`.
import type { PremadeCharacterData } from './premadeCharacters.ts';

export const PREMADE_DATA: readonly PremadeCharacterData[] = [
  {
    "id": "premade-guerrero",
    "className": "Guerrero",
    "name": "Thorin Rompehierro",
    "title": "Veterano de la Guardia Férrea",
    "race": "Enano de las Montañas",
    "subclass": "Campeón",
    "alignment": "Neutral",
    "description": "Maestro de las armas marciales y armaduras pesadas, implacable en primera línea.",
    "avatar": 1,
    "stats": {
      "str": 16,
      "dex": 12,
      "con": 15,
      "int": 10,
      "wis": 13,
      "cha": 8
    },
    "hpMax": 13,
    "speedFt": 25,
    "gold": 25,
    "demo": true,
    "skills": [
      "athletics",
      "intimidation",
      "perception",
      "survival"
    ],
    "expertise": [],
    "items": [
      {
        "id": "kit-fighter-longsword",
        "name": "Espada Larga",
        "quantity": 1,
        "category": "weapon",
        "equipped": true,
        "slot": "mainHand",
        "hands": 1,
        "weapon": {
          "category": "martial",
          "damageDice": "1d8",
          "damageType": "slashing",
          "properties": [
            "versatile"
          ],
          "versatileDice": "1d10"
        },
        "attuned": false
      },
      {
        "id": "kit-fighter-chainmail",
        "name": "Cota de Malla",
        "quantity": 1,
        "category": "armor",
        "equipped": true,
        "slot": "body",
        "armor": {
          "category": "heavy",
          "baseAc": 16,
          "dexCap": 0,
          "strMin": 13,
          "stealthDisadv": true
        },
        "attuned": false
      },
      {
        "id": "kit-fighter-shield",
        "name": "Escudo de Acero",
        "quantity": 1,
        "category": "armor",
        "equipped": true,
        "slot": "shield",
        "armor": {
          "category": "shield",
          "baseAc": 2
        },
        "attuned": false
      },
      {
        "id": "pocion-curacion",
        "name": "Poción de Curación",
        "category": "potion",
        "icon": "science",
        "description": "Bebida carmesí brillante. Recupera 7 PG (2d4 + 2) al instante.",
        "usableType": "drinkable",
        "healAmount": 7,
        "healDice": "2d4+2",
        "activationCondition": "1 acción",
        "quantity": 2,
        "equipped": false,
        "attuned": false
      },
      {
        "id": "mochila-aventurero",
        "name": "Mochila de Aventurero",
        "category": "gear",
        "icon": "backpack",
        "description": "Mochila con saco de dormir, yesquero, 10 antorchas y raciones de viaje.",
        "usableType": "none",
        "quantity": 1,
        "equipped": false,
        "attuned": false
      }
    ],
    "spells": []
  },
  {
    "id": "premade-explorador",
    "className": "Explorador",
    "name": "Atlas Ventosombra",
    "title": "Rastreador de las Tierras Salvajes",
    "race": "Semielfo",
    "subclass": "Cazador",
    "alignment": "Neutral",
    "description": "Arquero letal y guía experto capaz de acechar a cualquier presa en la espesura.",
    "avatar": 2,
    "stats": {
      "str": 12,
      "dex": 16,
      "con": 14,
      "int": 10,
      "wis": 15,
      "cha": 8
    },
    "hpMax": 12,
    "speedFt": 30,
    "gold": 20,
    "demo": false,
    "skills": [
      "athletics",
      "nature",
      "perception",
      "stealth",
      "survival"
    ],
    "expertise": [],
    "items": [
      {
        "id": "kit-ranger-longbow",
        "name": "Arco Largo",
        "quantity": 1,
        "category": "weapon",
        "equipped": true,
        "slot": "mainHand",
        "hands": 2,
        "weapon": {
          "category": "martial",
          "damageDice": "1d8",
          "damageType": "piercing",
          "properties": [
            "ammunition",
            "heavy",
            "two-handed"
          ],
          "range": {
            "normal": 150,
            "long": 600
          }
        },
        "attuned": false
      },
      {
        "id": "kit-ranger-shortsword",
        "name": "Espada Corta",
        "quantity": 1,
        "category": "weapon",
        "equipped": false,
        "hands": 1,
        "weapon": {
          "category": "martial",
          "damageDice": "1d6",
          "damageType": "piercing",
          "properties": [
            "finesse",
            "light"
          ]
        },
        "attuned": false
      },
      {
        "id": "kit-ranger-armor",
        "name": "Armadura de Cuero Tachonado",
        "quantity": 1,
        "category": "armor",
        "equipped": true,
        "slot": "body",
        "armor": {
          "category": "light",
          "baseAc": 12,
          "dexCap": null
        },
        "attuned": false
      },
      {
        "id": "pocion-curacion",
        "name": "Poción de Curación",
        "category": "potion",
        "icon": "science",
        "description": "Bebida carmesí brillante. Recupera 7 PG (2d4 + 2) al instante.",
        "usableType": "drinkable",
        "healAmount": 7,
        "healDice": "2d4+2",
        "activationCondition": "1 acción",
        "quantity": 2,
        "equipped": false,
        "attuned": false
      },
      {
        "id": "mochila-aventurero",
        "name": "Mochila de Aventurero",
        "category": "gear",
        "icon": "backpack",
        "description": "Mochila con saco de dormir, yesquero, 10 antorchas y raciones de viaje.",
        "usableType": "none",
        "quantity": 1,
        "equipped": false,
        "attuned": false
      }
    ],
    "spells": [
      {
        "id": "kit-spell-hunters-mark",
        "name": "Marca del Cazador",
        "level": 1,
        "school": "Adivinación",
        "castingTime": "Acción adicional",
        "range": "90 ft",
        "duration": "Concentración, hasta 1 hora",
        "components": "V",
        "damageDice": "1d6",
        "damageType": "Fuerza",
        "notes": "Infliges +1d6 de daño adicional al objetivo marcado cuando lo impactas con un ataque."
      },
      {
        "id": "kit-spell-cure-wounds-rgr",
        "name": "Curar Heridas",
        "level": 1,
        "school": "Abjuración",
        "castingTime": "1 acción",
        "range": "Toque",
        "duration": "Instantáneo",
        "components": "V, S",
        "damageDice": "2d8",
        "damageType": "Curación",
        "addAbilityToDamage": true,
        "notes": "Una criatura que tocas recupera puntos de golpe."
      }
    ]
  },
  {
    "id": "premade-barbaro",
    "className": "Bárbaro",
    "name": "Grommash el Feroz",
    "title": "Furia de las Cumbres Heladas",
    "race": "Semiorco",
    "subclass": "Camino del Berserker",
    "alignment": "Neutral",
    "description": "Canaliza una furia primigenia devastadora para resistir golpes mortales y arrasar.",
    "avatar": 3,
    "stats": {
      "str": 16,
      "dex": 14,
      "con": 16,
      "int": 8,
      "wis": 12,
      "cha": 8
    },
    "hpMax": 15,
    "speedFt": 30,
    "gold": 15,
    "demo": true,
    "skills": [
      "animal-handling",
      "athletics",
      "intimidation",
      "survival"
    ],
    "expertise": [],
    "items": [
      {
        "id": "kit-barb-greataxe",
        "name": "Gran Hacha",
        "quantity": 1,
        "category": "weapon",
        "equipped": true,
        "slot": "mainHand",
        "hands": 2,
        "weapon": {
          "category": "martial",
          "damageDice": "1d12",
          "damageType": "slashing",
          "properties": [
            "heavy",
            "two-handed"
          ]
        },
        "attuned": false
      },
      {
        "id": "kit-barb-javelin",
        "name": "Jabalina",
        "quantity": 2,
        "category": "weapon",
        "equipped": false,
        "hands": 1,
        "weapon": {
          "category": "simple",
          "damageDice": "1d6",
          "damageType": "piercing",
          "properties": [
            "thrown"
          ],
          "range": {
            "normal": 30,
            "long": 120
          }
        },
        "attuned": false
      },
      {
        "id": "pocion-curacion",
        "name": "Poción de Curación",
        "category": "potion",
        "icon": "science",
        "description": "Bebida carmesí brillante. Recupera 7 PG (2d4 + 2) al instante.",
        "usableType": "drinkable",
        "healAmount": 7,
        "healDice": "2d4+2",
        "activationCondition": "1 acción",
        "quantity": 2,
        "equipped": false,
        "attuned": false
      },
      {
        "id": "mochila-aventurero",
        "name": "Mochila de Aventurero",
        "category": "gear",
        "icon": "backpack",
        "description": "Mochila con saco de dormir, yesquero, 10 antorchas y raciones de viaje.",
        "usableType": "none",
        "quantity": 1,
        "equipped": false,
        "attuned": false
      }
    ],
    "spells": []
  },
  {
    "id": "premade-bardo",
    "className": "Bardo",
    "name": "Lyra Cuerdaplata",
    "title": "Trovadora del Colegio del Saber",
    "race": "Semielfa",
    "subclass": "Colegio del Saber",
    "alignment": "Neutral",
    "description": "Teje magia a través de la música y la palabra, inspirando aliados y confundiendo enemigos.",
    "avatar": 4,
    "stats": {
      "str": 8,
      "dex": 14,
      "con": 13,
      "int": 12,
      "wis": 10,
      "cha": 16
    },
    "hpMax": 9,
    "speedFt": 30,
    "gold": 25,
    "demo": true,
    "skills": [
      "arcana",
      "deception",
      "history",
      "performance",
      "persuasion"
    ],
    "expertise": [],
    "items": [
      {
        "id": "kit-bard-rapier",
        "name": "Estoque",
        "quantity": 1,
        "category": "weapon",
        "equipped": true,
        "slot": "mainHand",
        "hands": 1,
        "weapon": {
          "category": "martial",
          "damageDice": "1d8",
          "damageType": "piercing",
          "properties": [
            "finesse"
          ]
        },
        "attuned": false
      },
      {
        "id": "kit-bard-leather",
        "name": "Armadura de Cuero",
        "quantity": 1,
        "category": "armor",
        "equipped": true,
        "slot": "body",
        "armor": {
          "category": "light",
          "baseAc": 11,
          "dexCap": null
        },
        "attuned": false
      },
      {
        "id": "pocion-curacion",
        "name": "Poción de Curación",
        "category": "potion",
        "icon": "science",
        "description": "Bebida carmesí brillante. Recupera 7 PG (2d4 + 2) al instante.",
        "usableType": "drinkable",
        "healAmount": 7,
        "healDice": "2d4+2",
        "activationCondition": "1 acción",
        "quantity": 2,
        "equipped": false,
        "attuned": false
      },
      {
        "id": "mochila-aventurero",
        "name": "Mochila de Aventurero",
        "category": "gear",
        "icon": "backpack",
        "description": "Mochila con saco de dormir, yesquero, 10 antorchas y raciones de viaje.",
        "usableType": "none",
        "quantity": 1,
        "equipped": false,
        "attuned": false
      }
    ],
    "spells": [
      {
        "id": "kit-spell-vicious-mockery",
        "name": "Burla Dañina",
        "level": 0,
        "school": "Encantamiento",
        "castingTime": "1 acción",
        "range": "60 ft",
        "duration": "Instantáneo",
        "components": "V",
        "isSave": true,
        "saveAbility": "wis",
        "damageDice": "1d6",
        "damageType": "Psíquico",
        "notes": "El objetivo sufre daño psíquico y tiene desventaja en su siguiente tirada de ataque."
      },
      {
        "id": "kit-spell-healing-word",
        "name": "Palabra de Curación",
        "level": 1,
        "school": "Abjuración",
        "castingTime": "Acción adicional",
        "range": "60 ft",
        "duration": "Instantáneo",
        "components": "V",
        "damageDice": "2d4",
        "damageType": "Curación",
        "addAbilityToDamage": true,
        "notes": "Una criatura visible a alcance recupera PG al instante."
      },
      {
        "id": "kit-spell-thunderwave",
        "name": "Onda Trueno",
        "level": 1,
        "school": "Evocación",
        "castingTime": "1 acción",
        "range": "Personal (cubo 15 ft)",
        "duration": "Instantáneo",
        "components": "V, S",
        "isSave": true,
        "saveAbility": "con",
        "damageDice": "2d8",
        "damageType": "Trueno",
        "notes": "Onda de fuerza atronadora que daña y empuja 10 pies."
      }
    ]
  },
  {
    "id": "premade-brujo",
    "className": "Brujo",
    "name": "Kaeroc Cuernonegro",
    "title": "Portador del Pacto Umbrío",
    "race": "Tiefling",
    "subclass": "Patrón Infernal",
    "alignment": "Neutral",
    "description": "Empuña secretos prohibidos y descargas sobrenaturales otorgadas por un pacto arcano.",
    "avatar": 5,
    "stats": {
      "str": 8,
      "dex": 14,
      "con": 14,
      "int": 12,
      "wis": 10,
      "cha": 16
    },
    "hpMax": 10,
    "speedFt": 30,
    "gold": 20,
    "demo": true,
    "skills": [
      "arcana",
      "deception",
      "insight",
      "intimidation"
    ],
    "expertise": [],
    "items": [
      {
        "id": "kit-warlock-dagger",
        "name": "Daga Ritual",
        "quantity": 1,
        "category": "weapon",
        "equipped": true,
        "slot": "mainHand",
        "hands": 1,
        "weapon": {
          "category": "simple",
          "damageDice": "1d4",
          "damageType": "piercing",
          "properties": [
            "finesse",
            "light",
            "thrown"
          ],
          "range": {
            "normal": 20,
            "long": 60
          }
        },
        "attuned": false
      },
      {
        "id": "kit-warlock-leather",
        "name": "Armadura de Cuero",
        "quantity": 1,
        "category": "armor",
        "equipped": true,
        "slot": "body",
        "armor": {
          "category": "light",
          "baseAc": 11,
          "dexCap": null
        },
        "attuned": false
      },
      {
        "id": "pocion-curacion",
        "name": "Poción de Curación",
        "category": "potion",
        "icon": "science",
        "description": "Bebida carmesí brillante. Recupera 7 PG (2d4 + 2) al instante.",
        "usableType": "drinkable",
        "healAmount": 7,
        "healDice": "2d4+2",
        "activationCondition": "1 acción",
        "quantity": 2,
        "equipped": false,
        "attuned": false
      },
      {
        "id": "mochila-aventurero",
        "name": "Mochila de Aventurero",
        "category": "gear",
        "icon": "backpack",
        "description": "Mochila con saco de dormir, yesquero, 10 antorchas y raciones de viaje.",
        "usableType": "none",
        "quantity": 1,
        "equipped": false,
        "attuned": false
      }
    ],
    "spells": [
      {
        "id": "kit-spell-eldritch-blast",
        "name": "Descarga Sobrenatural",
        "level": 0,
        "school": "Evocación",
        "castingTime": "1 acción",
        "range": "120 ft",
        "duration": "Instantáneo",
        "components": "V, S",
        "isAttack": true,
        "damageDice": "1d10",
        "damageType": "Fuerza",
        "notes": "Un haz de energía crepitante impacta a una criatura dentro del alcance."
      },
      {
        "id": "kit-spell-hex",
        "name": "Maleficio (Hex)",
        "level": 1,
        "school": "Encantamiento",
        "castingTime": "Acción adicional",
        "range": "90 ft",
        "duration": "Concentración, hasta 1 hora",
        "components": "V, S, M",
        "damageDice": "1d6",
        "damageType": "Necrótico",
        "notes": "Infliges 1d6 de daño necrótico extra cuando impactas al objetivo maldito."
      }
    ]
  },
  {
    "id": "premade-clerigo",
    "className": "Clérigo",
    "name": "Liara Hojaargenta",
    "title": "Sacerdotisa de la Llama Sagrada",
    "race": "Alta Elfa",
    "subclass": "Dominio de la Vida",
    "alignment": "Neutral",
    "description": "Canaliza el poder divino para sanar a los caídos y castigar a las fuerzas de la oscuridad.",
    "avatar": 1,
    "stats": {
      "str": 14,
      "dex": 10,
      "con": 14,
      "int": 10,
      "wis": 16,
      "cha": 12
    },
    "hpMax": 10,
    "speedFt": 30,
    "gold": 25,
    "demo": true,
    "skills": [
      "insight",
      "medicine",
      "persuasion",
      "religion"
    ],
    "expertise": [],
    "items": [
      {
        "id": "kit-cleric-mace",
        "name": "Maza Consagrada",
        "quantity": 1,
        "category": "weapon",
        "equipped": true,
        "slot": "mainHand",
        "hands": 1,
        "weapon": {
          "category": "simple",
          "damageDice": "1d6",
          "damageType": "bludgeoning",
          "properties": []
        },
        "attuned": false
      },
      {
        "id": "kit-cleric-scalemail",
        "name": "Cota de Escamas",
        "quantity": 1,
        "category": "armor",
        "equipped": true,
        "slot": "body",
        "armor": {
          "category": "medium",
          "baseAc": 14,
          "dexCap": 2,
          "stealthDisadv": true
        },
        "attuned": false
      },
      {
        "id": "kit-cleric-shield",
        "name": "Escudo con Emblema Sagrado",
        "quantity": 1,
        "category": "armor",
        "equipped": true,
        "slot": "shield",
        "armor": {
          "category": "shield",
          "baseAc": 2
        },
        "attuned": false
      },
      {
        "id": "pocion-curacion",
        "name": "Poción de Curación",
        "category": "potion",
        "icon": "science",
        "description": "Bebida carmesí brillante. Recupera 7 PG (2d4 + 2) al instante.",
        "usableType": "drinkable",
        "healAmount": 7,
        "healDice": "2d4+2",
        "activationCondition": "1 acción",
        "quantity": 2,
        "equipped": false,
        "attuned": false
      },
      {
        "id": "mochila-aventurero",
        "name": "Mochila de Aventurero",
        "category": "gear",
        "icon": "backpack",
        "description": "Mochila con saco de dormir, yesquero, 10 antorchas y raciones de viaje.",
        "usableType": "none",
        "quantity": 1,
        "equipped": false,
        "attuned": false
      }
    ],
    "spells": [
      {
        "id": "kit-spell-sacred-flame",
        "name": "Llama Sagrada",
        "level": 0,
        "school": "Evocación",
        "castingTime": "1 acción",
        "range": "60 ft",
        "duration": "Instantáneo",
        "components": "V, S",
        "isSave": true,
        "saveAbility": "dex",
        "damageDice": "1d8",
        "damageType": "Radiante",
        "notes": "Resplandor semejante a una llama desciende sobre una criatura."
      },
      {
        "id": "kit-spell-guiding-bolt",
        "name": "Rayo Guía",
        "level": 1,
        "school": "Evocación",
        "castingTime": "1 acción",
        "range": "120 ft",
        "duration": "1 asalto",
        "components": "V, S",
        "isAttack": true,
        "damageDice": "4d6",
        "damageType": "Radiante",
        "notes": "Destello de luz contra una criatura; el siguiente ataque contra ella tiene ventaja."
      },
      {
        "id": "kit-spell-cure-wounds-clr",
        "name": "Curar Heridas",
        "level": 1,
        "school": "Abjuración",
        "castingTime": "1 acción",
        "range": "Toque",
        "duration": "Instantáneo",
        "components": "V, S",
        "damageDice": "2d8",
        "damageType": "Curación",
        "addAbilityToDamage": true,
        "notes": "Restaura puntos de golpe al aliado que tocas."
      }
    ]
  },
  {
    "id": "premade-druida",
    "className": "Druida",
    "name": "Sylvara Raízantigua",
    "title": "Guardiana del Círculo Esmeralda",
    "race": "Elfa de los Bosques",
    "subclass": "Círculo de la Luna",
    "alignment": "Neutral",
    "description": "Protectora del equilibrio natural capaz de invocar tormentas y adoptar formas salvajes.",
    "avatar": 2,
    "stats": {
      "str": 10,
      "dex": 14,
      "con": 14,
      "int": 12,
      "wis": 16,
      "cha": 8
    },
    "hpMax": 10,
    "speedFt": 35,
    "gold": 20,
    "demo": true,
    "skills": [
      "animal-handling",
      "medicine",
      "nature",
      "survival"
    ],
    "expertise": [],
    "items": [
      {
        "id": "kit-druid-quarterstaff",
        "name": "Bastón Druídico",
        "quantity": 1,
        "category": "weapon",
        "equipped": true,
        "slot": "mainHand",
        "hands": 1,
        "weapon": {
          "category": "simple",
          "damageDice": "1d6",
          "damageType": "bludgeoning",
          "properties": [
            "versatile"
          ],
          "versatileDice": "1d8"
        },
        "attuned": false
      },
      {
        "id": "kit-druid-leather",
        "name": "Armadura de Cuero",
        "quantity": 1,
        "category": "armor",
        "equipped": true,
        "slot": "body",
        "armor": {
          "category": "light",
          "baseAc": 11,
          "dexCap": null
        },
        "attuned": false
      },
      {
        "id": "kit-druid-shield",
        "name": "Escudo de Roble",
        "quantity": 1,
        "category": "armor",
        "equipped": true,
        "slot": "shield",
        "armor": {
          "category": "shield",
          "baseAc": 2
        },
        "attuned": false
      },
      {
        "id": "pocion-curacion",
        "name": "Poción de Curación",
        "category": "potion",
        "icon": "science",
        "description": "Bebida carmesí brillante. Recupera 7 PG (2d4 + 2) al instante.",
        "usableType": "drinkable",
        "healAmount": 7,
        "healDice": "2d4+2",
        "activationCondition": "1 acción",
        "quantity": 2,
        "equipped": false,
        "attuned": false
      },
      {
        "id": "mochila-aventurero",
        "name": "Mochila de Aventurero",
        "category": "gear",
        "icon": "backpack",
        "description": "Mochila con saco de dormir, yesquero, 10 antorchas y raciones de viaje.",
        "usableType": "none",
        "quantity": 1,
        "equipped": false,
        "attuned": false
      }
    ],
    "spells": [
      {
        "id": "kit-spell-shillelagh",
        "name": "Garrote Mágico (Shillelagh)",
        "level": 0,
        "school": "Transmutación",
        "castingTime": "Acción adicional",
        "range": "Personal",
        "duration": "1 minuto",
        "components": "V, S, M",
        "damageDice": "1d8",
        "damageType": "Contundente",
        "addAbilityToDamage": true,
        "notes": "Imbuye tu bastón con poder natural para atacar usando Sabiduría."
      },
      {
        "id": "kit-spell-entangle",
        "name": "Enmarañar",
        "level": 1,
        "school": "Conjuración",
        "castingTime": "1 acción",
        "range": "90 ft",
        "duration": "Concentración, hasta 1 min",
        "components": "V, S",
        "isSave": true,
        "saveAbility": "str",
        "notes": "Raíces y enredaderas brotan del suelo en un cuadrado de 20 pies apresando enemigos."
      }
    ]
  },
  {
    "id": "premade-hechicero",
    "className": "Hechicero",
    "name": "Ignis Sangredragón",
    "title": "Heredero del Fuego Primordial",
    "race": "Dracónido",
    "subclass": "Linaje Dracónico",
    "alignment": "Neutral",
    "description": "La magia corre por sus venas de forma innata, moldeando conjuros con pura voluntad.",
    "avatar": 3,
    "stats": {
      "str": 10,
      "dex": 13,
      "con": 14,
      "int": 10,
      "wis": 12,
      "cha": 16
    },
    "hpMax": 9,
    "speedFt": 30,
    "gold": 25,
    "demo": true,
    "skills": [
      "arcana",
      "history",
      "intimidation",
      "persuasion"
    ],
    "expertise": [],
    "items": [
      {
        "id": "kit-sorc-dagger",
        "name": "Daga Arcana",
        "quantity": 1,
        "category": "weapon",
        "equipped": true,
        "slot": "mainHand",
        "hands": 1,
        "weapon": {
          "category": "simple",
          "damageDice": "1d4",
          "damageType": "piercing",
          "properties": [
            "finesse",
            "light",
            "thrown"
          ],
          "range": {
            "normal": 20,
            "long": 60
          }
        },
        "attuned": false
      },
      {
        "id": "pocion-curacion",
        "name": "Poción de Curación",
        "category": "potion",
        "icon": "science",
        "description": "Bebida carmesí brillante. Recupera 7 PG (2d4 + 2) al instante.",
        "usableType": "drinkable",
        "healAmount": 7,
        "healDice": "2d4+2",
        "activationCondition": "1 acción",
        "quantity": 2,
        "equipped": false,
        "attuned": false
      },
      {
        "id": "mochila-aventurero",
        "name": "Mochila de Aventurero",
        "category": "gear",
        "icon": "backpack",
        "description": "Mochila con saco de dormir, yesquero, 10 antorchas y raciones de viaje.",
        "usableType": "none",
        "quantity": 1,
        "equipped": false,
        "attuned": false
      }
    ],
    "spells": [
      {
        "id": "kit-spell-firebolt-sorc",
        "name": "Saeta de Fuego",
        "level": 0,
        "school": "Evocación",
        "castingTime": "1 acción",
        "range": "120 ft",
        "duration": "Instantáneo",
        "components": "V, S",
        "isAttack": true,
        "damageDice": "1d10",
        "damageType": "Fuego",
        "notes": "Lanzas una mota de fuego contra una criatura u objeto dentro del alcance."
      },
      {
        "id": "kit-spell-chromatic-orb",
        "name": "Orbe Cromático",
        "level": 1,
        "school": "Evocación",
        "castingTime": "1 acción",
        "range": "90 ft",
        "duration": "Instantáneo",
        "components": "V, S, M",
        "isAttack": true,
        "damageDice": "3d8",
        "damageType": "Elemental",
        "notes": "Esfera de energía elemental (ácido, frío, fuego, relámpago, veneno o trueno)."
      }
    ]
  },
  {
    "id": "premade-mago",
    "className": "Mago",
    "name": "Aelindor Estrellagris",
    "title": "Erudito de la Torre Arcana",
    "race": "Alto Elfo",
    "subclass": "Escuela de Evocación",
    "alignment": "Neutral",
    "description": "Estudioso de los grimorios antiguos que domina las fuerzas elementales y el cosmos.",
    "avatar": 4,
    "stats": {
      "str": 8,
      "dex": 14,
      "con": 14,
      "int": 16,
      "wis": 12,
      "cha": 10
    },
    "hpMax": 8,
    "speedFt": 30,
    "gold": 25,
    "demo": true,
    "skills": [
      "arcana",
      "history",
      "insight",
      "investigation"
    ],
    "expertise": [],
    "items": [
      {
        "id": "kit-wiz-quarterstaff",
        "name": "Bastón Arcano",
        "quantity": 1,
        "category": "weapon",
        "equipped": true,
        "slot": "mainHand",
        "hands": 1,
        "weapon": {
          "category": "simple",
          "damageDice": "1d6",
          "damageType": "bludgeoning",
          "properties": [
            "versatile"
          ],
          "versatileDice": "1d8"
        },
        "attuned": false
      },
      {
        "id": "pocion-curacion",
        "name": "Poción de Curación",
        "category": "potion",
        "icon": "science",
        "description": "Bebida carmesí brillante. Recupera 7 PG (2d4 + 2) al instante.",
        "usableType": "drinkable",
        "healAmount": 7,
        "healDice": "2d4+2",
        "activationCondition": "1 acción",
        "quantity": 2,
        "equipped": false,
        "attuned": false
      },
      {
        "id": "mochila-aventurero",
        "name": "Mochila de Aventurero",
        "category": "gear",
        "icon": "backpack",
        "description": "Mochila con saco de dormir, yesquero, 10 antorchas y raciones de viaje.",
        "usableType": "none",
        "quantity": 1,
        "equipped": false,
        "attuned": false
      }
    ],
    "spells": [
      {
        "id": "kit-spell-firebolt-wiz",
        "name": "Saeta de Fuego",
        "level": 0,
        "school": "Evocación",
        "castingTime": "1 acción",
        "range": "120 ft",
        "duration": "Instantáneo",
        "components": "V, S",
        "isAttack": true,
        "damageDice": "1d10",
        "damageType": "Fuego",
        "notes": "Ataque de conjuro a distancia con fuego arcano."
      },
      {
        "id": "kit-spell-magic-missile",
        "name": "Proyectil Mágico",
        "level": 1,
        "school": "Evocación",
        "castingTime": "1 acción",
        "range": "120 ft",
        "duration": "Instantáneo",
        "components": "V, S",
        "damageDice": "3d4",
        "damageBonusMod": 3,
        "damageType": "Fuerza",
        "notes": "Tres dardos brillantes de fuerza mágica que impactan automáticamente."
      },
      {
        "id": "kit-spell-mage-armor",
        "name": "Armadura de Mago",
        "level": 1,
        "school": "Abjuración",
        "castingTime": "1 acción",
        "range": "Toque",
        "duration": "8 horas",
        "components": "V, S, M",
        "notes": "La CA base del objetivo pasa a ser 13 + su modificador de Destreza."
      }
    ]
  },
  {
    "id": "premade-monje",
    "className": "Monje",
    "name": "Kaelen Vientoapacible",
    "title": "Discípulo del Templo Celeste",
    "race": "Humano",
    "subclass": "Camino de la Mano Abierta",
    "alignment": "Neutral",
    "description": "Domina la energía del Ki con velocidad sobrehumana y artes marciales precisas.",
    "avatar": 5,
    "stats": {
      "str": 10,
      "dex": 16,
      "con": 14,
      "int": 10,
      "wis": 15,
      "cha": 8
    },
    "hpMax": 10,
    "speedFt": 30,
    "gold": 15,
    "demo": true,
    "skills": [
      "acrobatics",
      "insight",
      "medicine",
      "religion"
    ],
    "expertise": [],
    "items": [
      {
        "id": "kit-monk-quarterstaff",
        "name": "Bastón Marcial",
        "quantity": 1,
        "category": "weapon",
        "equipped": true,
        "slot": "mainHand",
        "hands": 1,
        "weapon": {
          "category": "simple",
          "damageDice": "1d6",
          "damageType": "bludgeoning",
          "properties": [
            "versatile"
          ],
          "versatileDice": "1d8"
        },
        "attuned": false
      },
      {
        "id": "kit-monk-darts",
        "name": "Dardos de Acero",
        "quantity": 5,
        "category": "weapon",
        "equipped": false,
        "hands": 1,
        "weapon": {
          "category": "simple",
          "damageDice": "1d4",
          "damageType": "piercing",
          "properties": [
            "finesse",
            "thrown"
          ],
          "range": {
            "normal": 20,
            "long": 60
          }
        },
        "attuned": false
      },
      {
        "id": "pocion-curacion",
        "name": "Poción de Curación",
        "category": "potion",
        "icon": "science",
        "description": "Bebida carmesí brillante. Recupera 7 PG (2d4 + 2) al instante.",
        "usableType": "drinkable",
        "healAmount": 7,
        "healDice": "2d4+2",
        "activationCondition": "1 acción",
        "quantity": 2,
        "equipped": false,
        "attuned": false
      },
      {
        "id": "mochila-aventurero",
        "name": "Mochila de Aventurero",
        "category": "gear",
        "icon": "backpack",
        "description": "Mochila con saco de dormir, yesquero, 10 antorchas y raciones de viaje.",
        "usableType": "none",
        "quantity": 1,
        "equipped": false,
        "attuned": false
      }
    ],
    "spells": []
  },
  {
    "id": "premade-paladin",
    "className": "Paladín",
    "name": "Valerius Escudosol",
    "title": "Caballero del Juramento Sagrado",
    "race": "Humano",
    "subclass": "Juramento de Devoción",
    "alignment": "Neutral",
    "description": "Baluarte de justicia que combina acero pesado con castigos divinos e imposición de manos.",
    "avatar": 1,
    "stats": {
      "str": 16,
      "dex": 10,
      "con": 14,
      "int": 8,
      "wis": 12,
      "cha": 15
    },
    "hpMax": 12,
    "speedFt": 30,
    "gold": 25,
    "demo": true,
    "skills": [
      "athletics",
      "insight",
      "persuasion",
      "religion"
    ],
    "expertise": [],
    "items": [
      {
        "id": "kit-paladin-longsword",
        "name": "Espada Larga Consagrada",
        "quantity": 1,
        "category": "weapon",
        "equipped": true,
        "slot": "mainHand",
        "hands": 1,
        "weapon": {
          "category": "martial",
          "damageDice": "1d8",
          "damageType": "slashing",
          "properties": [
            "versatile"
          ],
          "versatileDice": "1d10"
        },
        "attuned": false
      },
      {
        "id": "kit-paladin-chainmail",
        "name": "Cota de Malla",
        "quantity": 1,
        "category": "armor",
        "equipped": true,
        "slot": "body",
        "armor": {
          "category": "heavy",
          "baseAc": 16,
          "dexCap": 0,
          "strMin": 13,
          "stealthDisadv": true
        },
        "attuned": false
      },
      {
        "id": "kit-paladin-shield",
        "name": "Escudo Sagrado",
        "quantity": 1,
        "category": "armor",
        "equipped": true,
        "slot": "shield",
        "armor": {
          "category": "shield",
          "baseAc": 2
        },
        "attuned": false
      },
      {
        "id": "pocion-curacion",
        "name": "Poción de Curación",
        "category": "potion",
        "icon": "science",
        "description": "Bebida carmesí brillante. Recupera 7 PG (2d4 + 2) al instante.",
        "usableType": "drinkable",
        "healAmount": 7,
        "healDice": "2d4+2",
        "activationCondition": "1 acción",
        "quantity": 2,
        "equipped": false,
        "attuned": false
      },
      {
        "id": "mochila-aventurero",
        "name": "Mochila de Aventurero",
        "category": "gear",
        "icon": "backpack",
        "description": "Mochila con saco de dormir, yesquero, 10 antorchas y raciones de viaje.",
        "usableType": "none",
        "quantity": 1,
        "equipped": false,
        "attuned": false
      }
    ],
    "spells": [
      {
        "id": "kit-spell-divine-smite",
        "name": "Castigo Divino (Divine Smite)",
        "level": 1,
        "school": "Evocación",
        "castingTime": "Acción adicional al impactar",
        "range": "Personal",
        "duration": "Instantáneo",
        "components": "V",
        "damageDice": "2d8",
        "damageType": "Radiante",
        "notes": "Descargas energía radiante adicional sobre el objetivo impactado (+1d8 contra no-muertos o infernales)."
      },
      {
        "id": "kit-spell-shield-of-faith",
        "name": "Escudo de Fe",
        "level": 1,
        "school": "Abjuración",
        "castingTime": "Acción adicional",
        "range": "60 ft",
        "duration": "Concentración, hasta 10 min",
        "components": "V, S, M",
        "notes": "Un campo resplandeciente rodea a una criatura otorgándole +2 a la CA."
      }
    ]
  },
  {
    "id": "premade-picaro",
    "className": "Pícaro",
    "name": "Vex Sombraveloz",
    "title": "Espía del Gremio del Ocaso",
    "race": "Mediano Piesligeros",
    "subclass": "Asesino",
    "alignment": "Neutral",
    "description": "Especialista en sigilo, cerraduras y ataques furtivos letales desde las sombras.",
    "avatar": 2,
    "stats": {
      "str": 8,
      "dex": 16,
      "con": 14,
      "int": 13,
      "wis": 12,
      "cha": 12
    },
    "hpMax": 10,
    "speedFt": 25,
    "gold": 25,
    "demo": true,
    "skills": [
      "acrobatics",
      "deception",
      "investigation",
      "perception",
      "sleight-of-hand",
      "stealth"
    ],
    "expertise": [
      "perception",
      "stealth"
    ],
    "items": [
      {
        "id": "kit-rogue-rapier",
        "name": "Estoque Fino",
        "quantity": 1,
        "category": "weapon",
        "equipped": true,
        "slot": "mainHand",
        "hands": 1,
        "weapon": {
          "category": "martial",
          "damageDice": "1d8",
          "damageType": "piercing",
          "properties": [
            "finesse"
          ]
        },
        "attuned": false
      },
      {
        "id": "kit-rogue-dagger",
        "name": "Daga Equilibrada",
        "quantity": 1,
        "category": "weapon",
        "equipped": true,
        "slot": "offHand",
        "hands": 1,
        "weapon": {
          "category": "simple",
          "damageDice": "1d4",
          "damageType": "piercing",
          "properties": [
            "finesse",
            "light",
            "thrown"
          ],
          "range": {
            "normal": 20,
            "long": 60
          }
        },
        "attuned": false
      },
      {
        "id": "kit-rogue-leather",
        "name": "Armadura de Cuero Oscuro",
        "quantity": 1,
        "category": "armor",
        "equipped": true,
        "slot": "body",
        "armor": {
          "category": "light",
          "baseAc": 11,
          "dexCap": null
        },
        "attuned": false
      },
      {
        "id": "pocion-curacion",
        "name": "Poción de Curación",
        "category": "potion",
        "icon": "science",
        "description": "Bebida carmesí brillante. Recupera 7 PG (2d4 + 2) al instante.",
        "usableType": "drinkable",
        "healAmount": 7,
        "healDice": "2d4+2",
        "activationCondition": "1 acción",
        "quantity": 2,
        "equipped": false,
        "attuned": false
      },
      {
        "id": "mochila-aventurero",
        "name": "Mochila de Aventurero",
        "category": "gear",
        "icon": "backpack",
        "description": "Mochila con saco de dormir, yesquero, 10 antorchas y raciones de viaje.",
        "usableType": "none",
        "quantity": 1,
        "equipped": false,
        "attuned": false
      }
    ],
    "spells": []
  }
];
