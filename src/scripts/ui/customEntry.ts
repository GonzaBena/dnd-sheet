// src/scripts/ui/customEntry.ts
// Lógica compartida del bloque "Entrada propia" de los modales de objeto y hechizo (Spec 07, Fase C).
import { sanitizeImageUrl, parseEffectsText, effectsToText, parseArmorInput, parseWeaponInput } from '../dnd/catalog.ts';
import type { Modifier } from '../models/effect.ts';
import type { ArmorData, WeaponData } from '../models/character.ts';

export type EntryOrigin = 'new' | 'srd' | 'edit';

interface EditableEntry {
  source?: 'srd' | 'custom';
  custom?: boolean;
  imageUrl?: string;
  effects?: Modifier[];
  // Equipo (Spec 08, Fase B)
  armor?: ArmorData;
  weapon?: WeaponData;
  hands?: 1 | 2;
}

export type CustomEntryResult =
  | { ok: true; patch: Record<string, unknown>; imageRejected: boolean }
  | { ok: false; error: string; page?: 'armor' | 'weapon' | 'custom' };

/**
 * Conecta el bloque "Entrada propia" con el prefijo dado: `CustomEntryFields.astro` (hechizos) o
 * `CustomEntryToggle` + `CustomEntryPages.astro` (objetos, donde cada bloque es un paso del modal).
 */
export function initCustomEntry(prefix: string) {
  const toggle = document.getElementById(`${prefix}-custom-toggle`) as HTMLInputElement | null;
  const fields = document.getElementById(`${prefix}-custom-fields`);
  const imageInp = document.getElementById(`${prefix}-image-input`) as HTMLInputElement | null;
  const effectsInp = document.getElementById(`${prefix}-effects-input`) as HTMLTextAreaElement | null;
  const errorEl = document.getElementById(`${prefix}-effects-error`);

  // Campos de equipo: solo existen en el modal de objetos (`CustomEntryPages.astro`).
  const $ = (suffix: string) => document.getElementById(`${prefix}-${suffix}`) as HTMLInputElement | null;
  const armorBox = document.getElementById(`${prefix}-armor-fields`);
  const weaponBox = document.getElementById(`${prefix}-weapon-fields`);
  const equipErrorEls = {
    armor: document.getElementById(`${prefix}-armor-error`),
    weapon: document.getElementById(`${prefix}-weapon-error`),
  };
  const hasEquipment = !!(armorBox && weaponBox);

  let origin: EntryOrigin = 'new';
  let editing: EditableEntry | undefined;
  let category = '';

  // Con `data-paged` los bloques son pasos del modal: quien muestra u oculta es `modalSteps`, no este módulo.
  const paged = !!fields?.hasAttribute('data-paged');

  const syncEquip = () => {
    if (!hasEquipment) return;
    if (!paged) {
      armorBox!.classList.toggle('hidden', category !== 'armor');
      weaponBox!.classList.toggle('hidden', category !== 'weapon');
    }
    const isShield = $('armor-category')?.value === 'shield';
    armorBox!.querySelectorAll('[data-armor-only]').forEach((el) => el.classList.toggle('hidden', isShield));
  };
  const sync = () => {
    if (!paged) fields?.classList.toggle('hidden', !toggle?.checked);
    syncEquip();
  };
  toggle?.addEventListener('change', sync);
  $('armor-category')?.addEventListener('change', syncEquip);

  function showEquipError(message: string | null, page?: 'armor' | 'weapon') {
    (Object.keys(equipErrorEls) as Array<'armor' | 'weapon'>).forEach((key) => {
      const el = equipErrorEls[key];
      if (!el) return;
      const text = message && key === page ? message : '';
      el.textContent = text;
      el.classList.toggle('hidden', !text);
    });
  }

  // Atajos de efectos (+1 CA, ventaja…): añaden la línea al cuadro de efectos.
  fields?.querySelectorAll<HTMLElement>('[data-fx]').forEach((btn) =>
    btn.addEventListener('click', () => {
      if (!effectsInp) return;
      const line = btn.dataset.fx ?? '';
      effectsInp.value = `${effectsInp.value.trim() ? effectsInp.value.trim() + '\n' : ''}${line}`;
      effectsInp.focus();
    }),
  );

  function loadEquipment(entry?: EditableEntry) {
    if (!hasEquipment) return;
    const a = entry?.armor;
    ($('armor-category') as HTMLSelectElement).value = a?.category ?? 'light';
    $('armor-ac')!.value = a ? String(a.baseAc) : '';
    $('armor-dexcap')!.value = a && typeof a.dexCap === 'number' ? String(a.dexCap) : '';
    $('armor-str')!.value = a?.strMin ? String(a.strMin) : '';
    $('armor-bonus')!.value = a?.bonus ? String(a.bonus) : '';
    $('armor-stealth')!.checked = !!a?.stealthDisadv;
    const w = entry?.weapon;
    ($('weapon-category') as HTMLSelectElement).value = w?.category ?? 'simple';
    $('weapon-dice')!.value = w?.damageDice ?? '';
    $('weapon-type')!.value = w?.damageType ?? '';
    $('weapon-versatile')!.value = w?.versatileDice ?? '';
    $('weapon-props')!.value = (w?.properties ?? []).join(', ');
    $('weapon-range')!.value = w?.range ? String(w.range.normal) : '';
    $('weapon-range-long')!.value = w?.range ? String(w.range.long) : '';
    $('weapon-bonus')!.value = w?.magicBonus ? String(w.magicBonus) : '';
  }

  /** Datos de equipo según la categoría actual; `error` si algún valor no valida (FB-5). */
  function readEquipment(): { patch: Record<string, unknown> } | { error: string; page: 'armor' | 'weapon' } {
    if (!hasEquipment) return { patch: {} };
    showEquipError(null);
    const none = { armor: undefined, weapon: undefined, hands: undefined };
    // Los datos de compendio o de una edición ya están cargados en los campos (`loadEquipment`), así que se leen
    // siempre, con o sin "Entrada propia".
    // Alta rápida: con todos los campos de equipo vacíos queda como objeto común (sin datos estructurados).
    const blank = (ids: string[]) => ids.every((id) => !$(id)!.value.trim());
    if (category === 'armor' && blank(['armor-ac', 'armor-dexcap', 'armor-str', 'armor-bonus']) && !$('armor-stealth')!.checked) {
      return { patch: none };
    }
    if (category === 'weapon' && blank(['weapon-dice', 'weapon-type', 'weapon-versatile', 'weapon-props', 'weapon-range', 'weapon-range-long', 'weapon-bonus'])) {
      return { patch: none };
    }
    if (category === 'armor') {
      const r = parseArmorInput({
        category: $('armor-category')!.value, baseAc: $('armor-ac')!.value, dexCap: $('armor-dexcap')!.value,
        strMin: $('armor-str')!.value, stealthDisadv: $('armor-stealth')!.checked, bonus: $('armor-bonus')!.value,
      });
      if (!r.ok) showEquipError(r.error, 'armor');
      return r.ok ? { patch: { ...none, armor: r.value } } : { error: r.error, page: 'armor' };
    }
    if (category === 'weapon') {
      const r = parseWeaponInput({
        category: $('weapon-category')!.value, damageDice: $('weapon-dice')!.value, damageType: $('weapon-type')!.value,
        properties: $('weapon-props')!.value, rangeNormal: $('weapon-range')!.value, rangeLong: $('weapon-range-long')!.value,
        versatileDice: $('weapon-versatile')!.value, magicBonus: $('weapon-bonus')!.value,
      });
      if (!r.ok) showEquipError(r.error, 'weapon');
      return r.ok ? { patch: { ...none, weapon: r.value.weapon, hands: r.value.hands } } : { error: r.error, page: 'weapon' };
    }
    return { patch: none };
  }

  function showError(message: string | null) {
    if (!errorEl) return;
    errorEl.textContent = message ?? '';
    errorEl.classList.toggle('hidden', !message);
  }

  return {
    /**
     * - 'new': alta manual → "Entrada propia" activada, salvo en el modal por pasos (ahí se activa a propósito).
     * - 'srd': viene del compendio → desactivada (no muestra insignia).
     * - 'edit': refleja `entry.custom`; los objetos antiguos (sin source ni custom) no cambian de origen salvo que se active.
     */
    reset(nextOrigin: EntryOrigin, entry?: EditableEntry) {
      origin = nextOrigin;
      editing = entry;
      // En el modal por pasos (objetos) el alta nueva empieza sin "Entrada propia": activarla suma un paso.
      // En el bloque clásico (hechizos) se conserva el comportamiento anterior: el alta manual nace como propia.
      if (toggle) toggle.checked = (nextOrigin === 'new' && !paged) || (nextOrigin === 'edit' && entry?.custom === true);
      if (imageInp) imageInp.value = entry?.imageUrl ?? '';
      if (effectsInp) effectsInp.value = effectsToText(entry?.effects);
      loadEquipment(entry);
      showError(null);
      showEquipError(null);
      sync();
    },

    /** Categoría del objeto del modal ('armor' | 'weapon' muestran los campos de equipo). */
    setCategory(next: string) {
      category = next;
      syncEquip();
    },

    /** ¿Está activada "Entrada propia"? Decide si el modal ofrece el paso "Imagen y efectos". */
    isCustom(): boolean {
      return !!toggle?.checked;
    },

    read(): CustomEntryResult {
      showError(null);
      const equip = readEquipment();
      if ('error' in equip) return { ok: false, error: equip.error, page: equip.page };
      const res = readBase();
      if (res.ok) res.patch = { ...res.patch, ...equip.patch };
      return res;
    },
  };

  function readBase(): CustomEntryResult {
    if (toggle?.checked) {
      const effects = parseEffectsText(effectsInp?.value ?? '');
      if (!Array.isArray(effects)) {
        showError(effects.error);
        return { ok: false, error: effects.error, page: 'custom' };
      }
      const rawImage = (imageInp?.value ?? '').trim();
      const imageUrl = sanitizeImageUrl(rawImage);
      return {
        ok: true,
        imageRejected: !!rawImage && !imageUrl,
        patch: {
          source: 'custom',
          custom: true,
          imageUrl,
          effects: effects.length ? effects : undefined,
        },
      };
    }
    // Desactivada: no se tocan imagen ni efectos ya guardados.
    let patch: Record<string, unknown>;
    if (origin === 'srd') patch = { source: 'srd', custom: false };
    else if (origin === 'new') patch = { source: 'custom', custom: false };
    else if (editing?.source === undefined && editing?.custom === undefined) patch = {};
    else patch = { source: editing?.source ?? 'custom', custom: false };
    return { ok: true, patch, imageRejected: false };
  }
}
