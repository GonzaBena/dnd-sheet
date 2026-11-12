// Dado de golpe por clase. Lógica pura.
export const HIT_DICE = ['d6', 'd8', 'd10', 'd12'] as const;
export type HitDie = (typeof HIT_DICE)[number];

// DECISION: `className` es texto libre, así que se reconoce por prefijo (es/en, sin tildes ni género:
// "Maga", "Wizard"…). Sin coincidencia devuelve undefined y el dado queda como esté: la base es una
// sugerencia, el jugador siempre puede cambiarlo a mano.
const BY_CLASS: [RegExp, HitDie][] = [
  [/^(barbar[oa]|barbarian)/, 'd12'],
  [/^(guerrer[oa]|fighter|paladin|explorador|ranger|montaraz)/, 'd10'],
  [/^(bardo|bard|clerig[oa]|cleric|druida|druid|monje|monk|picar[oa]|rogue|bruj[oa]|warlock|ladron)/, 'd8'],
  [/^(hechicer[oa]|sorcerer|mago|maga|wizard)/, 'd6'],
];

const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();

export function hitDieForClass(className: string): HitDie | undefined {
  const name = plain(className ?? '');
  return BY_CLASS.find(([re]) => re.test(name))?.[1];
}
