// src/scripts/dnd/catalog.ts
// Adaptadores y validaciones puras del catálogo (Spec 07, Fase C).
import type { CatalogEntry, CatalogKind } from '../models/catalog.ts';
import type { Modifier } from '../models/effect.ts';

type Raw = Record<string, unknown>;

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v : undefined);
const nameOf = (v: unknown): string | undefined =>
  v && typeof v === 'object' ? str((v as Raw).name) : undefined;

/** Escapa texto de usuario antes de insertarlo en un template HTML. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Adaptador SRD → CatalogEntry.
 * DECISION: las dos ediciones del SRD difieren y se cubren ambas sin ramificar por edición:
 *  - Descripción: 2014 usa `desc: string[]` (+ `higher_level: string[]` en conjuros); 2024 usa `description: string`.
 *  - Conjuros: 2024 trae `level`/`school` igual que 2014, pero `damage` es objeto (2024) o arreglo (2014); no se mapea el daño.
 *  - Equipo 2014 trae `equipment_category`; 2024 solo `equipment_categories[]`. Se toma la primera disponible.
 *  - Dotes: 2024 trae `type` ('origin', …); 2014 no (solo `prerequisites`).
 *  - `image` de los objetos mágicos es una ruta relativa de la API, no una URL https: no se usa como `imageUrl`.
 * Los campos ausentes quedan `undefined` en `meta` y no rompen.
 */
export function srdToEntry(kind: CatalogKind, raw: Raw): CatalogEntry {
  const r = raw ?? {};
  let description = '';
  if (Array.isArray(r.desc)) description = r.desc.filter((x) => typeof x === 'string').join('\n');
  else if (typeof r.description === 'string') description = r.description;
  if (Array.isArray(r.higher_level) && r.higher_level.length) {
    description += `${description ? '\n' : ''}A niveles superiores: ${r.higher_level.join(' ')}`;
  }

  let meta: Record<string, unknown> = {};
  if (kind === 'spell') {
    meta = {
      level: typeof r.level === 'number' ? r.level : undefined,
      school: nameOf(r.school),
      castingTime: str(r.casting_time),
      range: str(r.range),
      components: Array.isArray(r.components) ? r.components.join(', ') : undefined,
      material: str(r.material),
      duration: str(r.duration),
      concentration: typeof r.concentration === 'boolean' ? r.concentration : undefined,
      ritual: typeof r.ritual === 'boolean' ? r.ritual : undefined,
    };
  } else if (kind === 'item') {
    const cats = Array.isArray(r.equipment_categories) ? (r.equipment_categories as unknown[]) : [];
    const cost = r.cost && typeof r.cost === 'object' ? (r.cost as Raw) : undefined;
    meta = {
      category: nameOf(r.equipment_category) ?? nameOf(cats[0]),
      rarity: nameOf(r.rarity),
      weight: typeof r.weight === 'number' ? r.weight : undefined,
      cost: cost ? `${cost.quantity} ${cost.unit}` : undefined,
      attunement: typeof r.attunement === 'boolean' ? r.attunement : undefined,
    };
  } else {
    meta = {
      type: str(r.type),
      prerequisites: Array.isArray(r.prerequisites) ? r.prerequisites : undefined,
    };
  }

  return {
    id: `srd:${kind}:${str(r.index) ?? str(r.name) ?? 'sin-id'}`,
    kind,
    source: 'srd',
    name: str(r.name) ?? '',
    description,
    meta,
  };
}

interface ThingLike {
  id?: string;
  name?: string;
  title?: string;
  description?: string;
  notes?: string;
  source?: 'srd' | 'custom';
  custom?: boolean;
  imageUrl?: string;
  effects?: Modifier[];
  [key: string]: unknown;
}

/**
 * Convierte un objeto, hechizo o rasgo existente al esquema común.
 * DECISION (FC-2): `source` ausente se interpreta como 'custom' (lo cargado a mano), salvo que el elemento
 * tenga `srdIndex`, que se toma como 'srd'. Los modales actuales no guardan `srdIndex`; el origen SRD se
 * marca explícitamente con `source: 'srd'` al agregar desde el compendio.
 */
export function toCatalogEntry(kind: CatalogKind, thing: ThingLike): CatalogEntry {
  const source: 'srd' | 'custom' =
    thing.source ?? (thing.custom ? 'custom' : thing.srdIndex ? 'srd' : 'custom');
  const name = thing.name ?? thing.title ?? '';
  let description = '';
  let meta: Record<string, unknown> = {};
  if (kind === 'item') {
    description = thing.description ?? thing.notes ?? '';
    meta = {
      category: thing.category,
      quantity: thing.quantity,
      weightLb: thing.weightLb,
      usableType: thing.usableType,
      healAmount: thing.healAmount,
      activationCondition: thing.activationCondition,
      notes: thing.notes,
    };
  } else if (kind === 'spell') {
    description = thing.notes ?? '';
    meta = {
      level: thing.level,
      school: thing.school,
      castingTime: thing.castingTime,
      range: thing.range,
      duration: thing.duration,
      components: thing.components,
      damageDice: thing.damageDice,
      damageType: thing.damageType,
    };
  } else {
    description = thing.description ?? '';
    meta = { featType: thing.featType, resourceId: thing.resourceId, uses: thing.uses };
  }
  const entry: CatalogEntry = {
    id: thing.id ?? `${source}:${kind}:${name}`,
    kind,
    source,
    name,
    description,
    meta,
  };
  if (thing.imageUrl) entry.imageUrl = thing.imageUrl;
  if (thing.effects?.length) entry.effects = thing.effects;
  return entry;
}

const MAX_URL_LENGTH = 2048;
const MAX_DATA_LENGTH = 50_000;

/**
 * FC-4: acepta `https://…` o `data:image/(png|jpeg|gif|webp);base64,…` cortas. Todo lo demás se descarta.
 * Se muestra solo en un `<img>` (nunca como HTML).
 */
export function sanitizeImageUrl(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  const value = url.trim();
  if (!value) return undefined;
  if (/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(value)) {
    return value.length <= MAX_DATA_LENGTH ? value : undefined;
  }
  if (value.length > MAX_URL_LENGTH) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname ? value : undefined;
  } catch {
    return undefined;
  }
}

const OPS: Modifier['op'][] = ['add', 'set', 'advantage', 'disadvantage', 'resistance'];

/**
 * Editor simple de efectos: una línea por modificador, `objetivo operación [valor]`
 * (por ejemplo `ac add 2`, `save.dex advantage`). Texto vacío → [].
 */
export function parseEffectsText(text: string): Modifier[] | { error: string } {
  const out: Modifier[] = [];
  const lines = String(text ?? '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const n = i + 1;
    const [target, op, ...rest] = line.split(/\s+/);
    if (!target || !op) return { error: `Línea ${n}: usa "objetivo operación valor" (ej: ac add 2).` };
    if (!/^[a-z][a-z0-9_-]*(\.[a-z0-9_-]+)*$/i.test(target)) {
      return { error: `Línea ${n}: el objetivo "${target}" no es válido.` };
    }
    if (!(OPS as string[]).includes(op)) {
      return { error: `Línea ${n}: operación "${op}" desconocida (${OPS.join(', ')}).` };
    }
    const rawValue = rest.join(' ');
    const mod: Modifier = { target, op: op as Modifier['op'] };
    if (op === 'add' || op === 'set') {
      const num = Number(rawValue);
      if (!rawValue || !Number.isFinite(num)) {
        return { error: `Línea ${n}: "${op}" necesita un valor numérico.` };
      }
      mod.value = num;
    } else if (rawValue) {
      mod.value = rawValue;
    }
    out.push(mod);
  }
  return out;
}

/** Inverso de `parseEffectsText`, para mostrar los efectos guardados en el cuadro de texto. */
export function effectsToText(effects: Modifier[] | undefined): string {
  return (effects ?? [])
    .map((m) => [m.target, m.op, m.value ?? ''].filter((x) => x !== '').join(' '))
    .join('\n');
}
