// src/scripts/ui/detailModals.ts
// Abre y cierra las fichas de objeto y hechizo (Spec 07, Fase D, T-245…T-247).
// Todo texto de usuario se inserta con textContent, nunca con innerHTML (FD-7).
import type { CatalogEntry, CatalogKind } from '../models/catalog';
import { toCatalogEntry, sanitizeImageUrl } from '../dnd/catalog';
import {
  headerFields, detailSections, availableActions, castableLevels,
  type DetailAction, type DetailContext,
} from '../dnd/detailView';
import { characterStore } from '../state/characterStore';

export interface DetailOpenDetail {
  /** Entrada ya convertida o un elemento crudo (objeto, hechizo, dote) que se convierte aquí. */
  entry?: CatalogEntry;
  raw?: Record<string, unknown>;
  context: DetailContext;
}

/** Detalle de los eventos `item-action` y `spell-action` (FD-3). */
export interface DetailActionDetail {
  entryId: string;
  action: DetailAction;
  context: DetailContext;
  entry: CatalogEntry;
  /** Solo en 'cast': nivel del espacio elegido; ausente en trucos. */
  level?: number;
}

const ACTION_LABEL: Record<DetailAction, { text: string; icon: string; primary?: boolean; danger?: boolean }> = {
  equip: { text: 'Equipar', icon: 'shield' },
  edit: { text: 'Modificar', icon: 'edit' },
  use: { text: 'Usar', icon: 'science', primary: true },
  give: { text: 'Dar', icon: 'redeem' },
  drop: { text: 'Quitar', icon: 'delete', danger: true },
  add: { text: 'Agregar', icon: 'add_circle', primary: true },
  cast: { text: 'Lanzar', icon: 'auto_fix_high', primary: true },
  'apply-effect': { text: 'Aplicar efecto', icon: 'bolt' },
  remove: { text: 'Olvidar', icon: 'delete', danger: true },
};

const FALLBACK_ICON: Record<CatalogKind, string> = {
  item: 'inventory_2', spell: 'auto_awesome', feat: 'military_tech',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function btn(action: DetailAction, label?: string): HTMLButtonElement {
  const cfg = ACTION_LABEL[action];
  const b = el('button',
    'px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer border transition-colors ' +
    (cfg.primary
      ? 'bg-[#5c3a1e] text-[#f7ecd5] border-[#3a1d08] hover:bg-[#3a1d08]'
      : cfg.danger
        ? 'bg-transparent text-rose-900 border-rose-900/40 hover:bg-rose-900/10'
        : 'bg-transparent text-[#3a1d08] border-[#8c673b]/60 hover:bg-[#5c3a1e]/10'));
  b.type = 'button';
  const icon = el('span', 'material-symbols-outlined text-[15px]', cfg.icon);
  b.append(icon, el('span', '', label ?? cfg.text));
  return b;
}

let initialized = false;
let openId: string | null = null;

export function initDetailModals(): void {
  if (initialized) return;
  initialized = true;
  mount('item', 'open-item-detail', 'item-action');
  mount('spell', 'open-spell-detail', 'spell-action');

  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !openId) return;
    document.getElementById(`${openId}-modal`)?.classList.add('hidden');
    openId = null;
  });
}

function mount(prefix: 'item' | 'spell', openEvent: string, actionEvent: string): void {
  const id = `${prefix}-detail`;
  const root = document.getElementById(`${id}-modal`);
  if (!root) return;
  const $ = (suffix: string) => document.getElementById(`${id}-${suffix}`) as HTMLElement;

  const close = () => {
    root.classList.add('hidden');
    if (openId === id) openId = null;
  };

  $('close').addEventListener('click', close);
  root.addEventListener('click', (e) => { if (e.target === root) close(); });

  const dispatch = (entry: CatalogEntry, action: DetailAction, context: DetailContext, level?: number) => {
    const detail: DetailActionDetail = { entryId: entry.id, action, context, entry };
    if (level !== undefined) detail.level = level;
    window.dispatchEvent(new CustomEvent(actionEvent, { detail }));
  };

  function renderHeader(entry: CatalogEntry) {
    $('title').textContent = entry.name;

    // Imagen con icono de respaldo si no hay o falla la carga.
    const img = $('image') as HTMLImageElement;
    const fallback = $('fallback');
    fallback.textContent = FALLBACK_ICON[entry.kind];
    const url = sanitizeImageUrl(entry.imageUrl);
    const showFallback = () => { img.classList.add('hidden'); fallback.classList.remove('hidden'); };
    img.onerror = showFallback;
    if (url) {
      img.alt = entry.name;
      img.src = url;
      img.classList.remove('hidden');
      fallback.classList.add('hidden');
    } else {
      img.removeAttribute('src');
      showFallback();
    }

    const badges = $('badges');
    badges.replaceChildren();
    if (entry.source === 'custom') {
      badges.append(el('span',
        'px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-900 border border-sky-700/40 text-[9px] font-bold uppercase tracking-wider',
        'Propio'));
    }
    const rarity = entry.meta?.rarity;
    if (typeof rarity === 'string' && rarity.trim()) {
      badges.append(el('span',
        'px-1.5 py-0.5 rounded bg-amber-900/15 text-amber-950 border border-amber-900/30 text-[9px] font-bold uppercase tracking-wider',
        rarity));
    }

    const fields = $('fields');
    fields.replaceChildren();
    for (const f of headerFields(entry)) {
      const row = el('div', 'flex gap-1');
      row.append(el('dt', 'font-bold', `${f.label}:`), el('dd', '', f.value));
      fields.append(row);
    }
  }

  function renderBody(entry: CatalogEntry) {
    const desc = $('description');
    desc.textContent = entry.description;
    desc.classList.toggle('hidden', !entry.description);

    const sections = $('sections');
    sections.replaceChildren();
    for (const s of detailSections(entry)) {
      const box = el('div', 'rounded-lg border border-[#8c673b]/40 bg-[#5c3a1e]/10 p-2.5');
      box.append(el('h4', 'text-[10px] font-bold uppercase tracking-wider text-[#785125] mb-1', s.title));
      for (const r of s.rows) {
        const line = el('div', 'text-xs flex gap-1.5 py-0.5');
        line.append(el('span', 'font-bold shrink-0', `${r.label}:`), el('span', 'break-words', r.value));
        box.append(line);
      }
      sections.append(box);
    }
  }

  function renderActions(entry: CatalogEntry, context: DetailContext) {
    const actions = $('actions');
    actions.replaceChildren();
    const picker = document.getElementById(`${id}-slot-picker`);
    picker?.classList.add('hidden');

    for (const action of availableActions(entry, context)) {
      if (action === 'cast') {
        actions.append(buildCastButton(entry, context));
        continue;
      }
      const b = btn(action);
      b.addEventListener('click', () => {
        dispatch(entry, action, context);
        close();
      });
      actions.append(b);
    }
  }

  // DECISION (FD-4): lanzar NO valida componentes, concentración ni estado del personaje (H4); solo ofrece
  // los niveles con espacio y deja que quien abrió la ficha (grimorio) descuente el espacio con useSpellSlot.
  function buildCastButton(entry: CatalogEntry, context: DetailContext): HTMLButtonElement {
    const spellLevel = typeof entry.meta?.level === 'number' ? (entry.meta.level as number) : 0;
    if (spellLevel === 0) {
      const b = btn('cast');
      b.addEventListener('click', () => { dispatch(entry, 'cast', context); close(); });
      return b;
    }
    const slots = characterStore.get()?.spellcasting?.slots ?? {};
    const levels = castableLevels(spellLevel, slots);
    const anyLeft = levels.some((l) => l.remaining > 0);
    if (!anyLeft) {
      const b = btn('cast', 'Sin espacios');
      b.disabled = true;
      b.classList.add('opacity-50', 'cursor-not-allowed');
      return b;
    }
    const b = btn('cast');
    b.addEventListener('click', () => {
      const picker = document.getElementById(`${id}-slot-picker`);
      const options = document.getElementById(`${id}-slot-options`);
      if (!picker || !options) return;
      options.replaceChildren();
      for (const l of levels) {
        const o = el('button',
          'px-2.5 py-1 rounded-lg border border-[#3a1d08] text-xs font-bold ' +
          (l.remaining > 0
            ? 'bg-[#5c3a1e] text-[#f7ecd5] hover:bg-[#3a1d08] cursor-pointer'
            : 'opacity-40 cursor-not-allowed'),
          `Nivel ${l.level} (${l.remaining})`);
        o.type = 'button';
        if (l.remaining <= 0) {
          o.disabled = true;
        } else {
          o.addEventListener('click', () => { dispatch(entry, 'cast', context, l.level); close(); });
        }
        options.append(o);
      }
      picker.classList.remove('hidden');
    });
    return b;
  }

  window.addEventListener(openEvent, (e) => {
    const d = (e as CustomEvent<DetailOpenDetail>).detail;
    if (!d) return;
    const kind: CatalogKind = prefix === 'spell' ? 'spell' : 'item';
    const entry = d.entry ?? (d.raw ? toCatalogEntry(d.raw.kind === 'feat' ? 'feat' : kind, d.raw as any) : null);
    if (!entry) return;
    renderHeader(entry);
    renderBody(entry);
    renderActions(entry, d.context);
    root.classList.remove('hidden');
    openId = id;
    $('close').focus();
  });
}
