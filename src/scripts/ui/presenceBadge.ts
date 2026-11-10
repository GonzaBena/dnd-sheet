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
    dot.style.cssText =
      'position:absolute;top:-4px;left:-4px;width:10px;height:10px;border-radius:9999px;box-shadow:0 0 0 2px #121721;pointer-events:none;';
    card.prepend(dot);
  }
  dot.style.backgroundColor = v.dotColor;
  card.title = v.title;
}

/** Aplica la presencia a todas las cards con `data-presence-uid` dentro de `root`. */
export function applyPresence(root: ParentNode, byUid: Map<string, PresenceEntry>): void {
  root.querySelectorAll<HTMLElement>('[data-presence-uid]').forEach((card) => {
    applyToCard(card, byUid.get(card.dataset.presenceUid || ''));
  });
}
