// src/scripts/ui/presenceBadge.ts
// Marca el estado de presencia (T-51a, RF-42) sobre las cards de miembros: borde de color + punto en la esquina.
// Las cards llevan `data-presence-uid="<uid del usuario>"`; no hay sección aparte para ahorrar espacio.

import { formatLastSeen, type PresenceEntry } from '../data/presenceService.ts';

export interface PresenceVisual {
  state: 'online' | 'offline' | 'unknown';
  /** Color del borde; '' deja el borde original de la card. */
  borderColor: string;
  dotColor: string;
  title: string;
}

/** Función pura: cómo se ve un miembro según su entrada de presencia. */
export function presenceVisual(entry: PresenceEntry | undefined, now = Date.now()): PresenceVisual {
  if (!entry) return { state: 'unknown', borderColor: '', dotColor: '', title: '' };
  if (entry.online) {
    return { state: 'online', borderColor: 'rgba(52,211,153,0.7)', dotColor: '#34d399', title: 'En línea' };
  }
  return {
    state: 'offline',
    borderColor: '',
    dotColor: '#64748b',
    title: entry.lastSeen ? `Desconectado · ${formatLastSeen(entry.lastSeen, now)}` : 'Desconectado',
  };
}

const DOT_ATTR = 'data-presence-dot';
const DOT_SIZE = 12;

/** Avatar de la card: la primera <img>, o (cards sin imagen) el primer bloque del primer contenedor. */
function avatarAnchor(card: HTMLElement): HTMLElement | null {
  const img = card.querySelector<HTMLElement>('img');
  if (img) return img;
  const first = card.querySelector<HTMLElement>(`:scope > :not([${DOT_ATTR}])`);
  return (first?.firstElementChild as HTMLElement | null) ?? first;
}

/**
 * Coloca el punto sobre la esquina inferior derecha del avatar (coordenadas relativas a la card).
 * Se mide el DOM porque las cards tienen estructuras distintas; hay que llamarlo de nuevo si cambia el tamaño.
 */
function positionDot(card: HTMLElement, dot: HTMLElement): void {
  const anchor = avatarAnchor(card);
  const cardRect = card.getBoundingClientRect();
  if (!anchor || cardRect.width === 0) return; // oculta: se recoloca cuando se vuelva a aplicar
  const a = anchor.getBoundingClientRect();
  const left = a.right - cardRect.left - card.clientLeft - DOT_SIZE + 3;
  const top = a.bottom - cardRect.top - card.clientTop - DOT_SIZE + 3;
  dot.style.left = `${Math.round(left)}px`;
  dot.style.top = `${Math.round(top)}px`;
}

function applyToCard(card: HTMLElement, entry: PresenceEntry | undefined): void {
  const v = presenceVisual(entry);
  card.style.borderColor = v.borderColor;
  card.dataset.presence = v.state;

  let dot = card.querySelector<HTMLElement>(`:scope > [${DOT_ATTR}]`);
  if (v.state === 'unknown') {
    dot?.remove();
    card.removeAttribute('title');
    return;
  }
  if (!dot) {
    card.style.position = 'relative';
    dot = document.createElement('span');
    dot.setAttribute(DOT_ATTR, '');
    dot.setAttribute('aria-hidden', 'true');
    dot.style.cssText = `position:absolute;width:${DOT_SIZE}px;height:${DOT_SIZE}px;border-radius:9999px;box-shadow:0 0 0 2px #121721;pointer-events:none;z-index:1;`;
    card.prepend(dot);
  }
  dot.style.backgroundColor = v.dotColor;
  card.title = v.title;
  positionDot(card, dot);
}

/** Aplica la presencia a todas las cards con `data-presence-uid` dentro de `root`. */
export function applyPresence(root: ParentNode, byUid: Map<string, PresenceEntry>): void {
  root.querySelectorAll<HTMLElement>('[data-presence-uid]').forEach((card) => {
    applyToCard(card, byUid.get(card.dataset.presenceUid || ''));
  });
}
