// Competencias y compatibilidad del equipo (Spec 08, Fase C). Lógica pura: no toca el store ni el DOM.
// La hoja avisa; no bloquea. Las penalizaciones se declaran como modificadores y no se evalúan en tiradas (H4).
import type { ArmorData, CharacterData, InventoryItem, Proficiencies } from '../models/character.ts';
import type { Modifier } from '../models/effect.ts';
import { equippedItems, isDefenseItem, isShield } from './equipment.ts';

export interface CompatWarning { itemId: string; text: string; ignorable: boolean }
export interface CompatResult {
  warnings: CompatWarning[];
  modifiers: Modifier[]; // penalizaciones declaradas (FC-5, FC-7, FC-8)
  proficiencyMissing: boolean; // FC-3: no hay competencias cargadas
  weaponsWithoutProficiency: string[]; // ids de armas sin competencia: la Fase E no suma el bono (FC-9)
}

export const ARMOR_PROFICIENCY_LABELS: Record<ArmorData['category'], string> = {
  light: 'armadura ligera', medium: 'armadura media', heavy: 'armadura pesada', shield: 'escudos',
};
const WEAPON_PROFICIENCY_LABELS = { simple: 'armas simples', martial: 'armas marciales' } as const;

/** `index` de un arma concreta: minúsculas, sin tildes, con guiones ("Espada larga" → "espada-larga"). */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function hasArmorProficiency(prof: Proficiencies | undefined, a: ArmorData): boolean {
  return !!prof?.armor?.includes(a.category);
}

export function hasWeaponProficiency(prof: Proficiencies | undefined, item: InventoryItem): boolean {
  const list = prof?.weapons ?? [];
  if (item.weapon && list.includes(item.weapon.category)) return true;
  return list.includes(slugify(item.name)) || list.includes(item.id);
}

const ARMOR_PENALTY_TARGETS = ['attack', 'save.str', 'save.dex', 'check.str', 'check.dex'];
const armorPenalties = (): Modifier[] => [
  ...ARMOR_PENALTY_TARGETS.map((target): Modifier => ({ target, op: 'disadvantage' })),
  { target: 'spellcasting', op: 'set', value: 'blocked' },
];

export function checkCompatibility(char: CharacterData): CompatResult {
  const prof = char.proficiencies;
  const proficiencyMissing = !(prof?.armor?.length || prof?.weapons?.length);
  const warnings: CompatWarning[] = [];
  const modifiers: Modifier[] = [];
  const weaponsWithoutProficiency: string[] = [];

  // Los modificadores iguales (p. ej. armadura + escudo sin competencia) se declaran una sola vez.
  const push = (mods: Modifier[]) => {
    for (const m of mods) {
      const dup = m.target !== 'speed' &&
        modifiers.some((x) => x.target === m.target && x.op === m.op && x.value === m.value);
      if (!dup) modifiers.push(m);
    }
  };
  // DECISION: con ambas listas vacías no hay avisos por objeto, solo `proficiencyMissing` para mostrar
  // un único mensaje ("Cargá tus competencias..."). Si no, un personaje sin cargar vería un aviso por
  // cada objeto equipado y ninguno sería fiable. Los avisos aparecen con al menos una competencia cargada.
  const warn = (itemId: string, text: string, ignorable = true) => {
    if (!proficiencyMissing) warnings.push({ itemId, text, ignorable });
  };

  const str = char.stats?.str?.score ?? 10;

  for (const item of equippedItems(char.inventory ?? [])) {
    if (isDefenseItem(item)) {
      const category = item.armor?.category ?? (isShield(item) ? 'shield' : undefined);
      // DECISION: "Ignorar" quita el aviso y las penalizaciones declaradas del objeto (competencia y
      // Sigilo), pero no la FUE mínima: esa es una regla de velocidad que no depende de la competencia
      // y por eso su aviso tampoco es ignorable.
      const ignored = !!item.ignoreWarnings;

      if (category && !ignored && !proficiencyMissing && !hasArmorProficiency(prof, { baseAc: 0, ...item.armor, category })) {
        const faltante = ARMOR_PROFICIENCY_LABELS[category];
        warn(
          item.id,
          `${item.name}: no tienes competencia con ${faltante}. Desventaja en ataques, salvaciones y pruebas de FUE y DES; no puedes lanzar conjuros.`,
        );
        push(armorPenalties());
      }

      const strMin = item.armor?.strMin;
      if (strMin && str < strMin) {
        warn(item.id, `${item.name}: requiere FUE ${strMin} (tienes ${str}). Velocidad -10 pies.`, false);
        push([{ target: 'speed', op: 'add', value: -10 }]);
      }

      // FC-8: no genera aviso, solo aparece en el desglose.
      if (item.armor?.stealthDisadv && !ignored) push([{ target: 'skill.stealth', op: 'disadvantage' }]);
      continue;
    }

    if (item.weapon && !item.ignoreWarnings && !proficiencyMissing && !hasWeaponProficiency(prof, item)) {
      weaponsWithoutProficiency.push(item.id);
      warn(
        item.id,
        `${item.name}: no tienes competencia con ${WEAPON_PROFICIENCY_LABELS[item.weapon.category]}. No sumas el bono de competencia al ataque.`,
      );
    }
  }

  return { warnings, modifiers, proficiencyMissing, weaponsWithoutProficiency };
}
