import type { JournalEntry } from '../models/journal';

export const defaultJournal: JournalEntry[] = [
  {
    id: 'entry-1',
    timestamp: Date.now() - 1000 * 60 * 12, // 12 mins ago
    sessionNumber: 15,
    timeAgoText: 'Hace 12 min',
    title: 'Tirada de Percepción Pasiva / Activa',
    content: 'Trampilla camuflada bajo la alfombra raída del salón de baile. Se detecta una runa con forma de murciélago tallada en piedra volcánica.',
    tags: ['#Tirada', '#Pista'],
    diceRoll: {
      formula: 'd20 + 5 (Percepción)',
      result: 25,
      breakdown: '20 (Crítico Nat.) + 5'
    }
  },
  {
    id: 'entry-2',
    timestamp: Date.now() - 1000 * 60 * 55, // 55 mins ago
    sessionNumber: 15,
    timeAgoText: 'Hace 55 min',
    title: 'Emboscada en el Cruce de Molino',
    content: 'Eliminados 3 lobos huargos invocados por la bruma. Elyssian conectó 2 flechazos certeros con el arco élfico. Se recuperaron 14 PO de un mercader caído.',
    tags: ['#Combate', '#Botín']
  },
  {
    id: 'entry-3',
    timestamp: Date.now() - 1000 * 60 * 60 * 24, // Session 14
    sessionNumber: 14,
    timeAgoText: 'Sesión 14',
    title: 'Encuentro con Lord Cassian',
    content: 'Promete 200 PO si traemos intacto el relicario de Santa Markovia desde la abadía de Krezk. Advierte sobre los espantapájaros animados de Baba Lysaga.',
    tags: ['#NPC', '#Pista']
  },
  {
    id: 'entry-4',
    timestamp: Date.now() - 1000 * 60 * 60 * 26, // Session 14
    sessionNumber: 14,
    timeAgoText: 'Sesión 14',
    title: 'Llave de bronce con el sello del Cuervo',
    content: 'Encontrada en el fondo del estanque bendito tras descifrar la inscripción en lengua celestial.',
    tags: ['#Botín', '#Pista']
  }
];
