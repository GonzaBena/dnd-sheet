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
