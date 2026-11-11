// src/scripts/ui/sectionOrganizer.ts
import { characterStore } from '../state/characterStore.ts';
import type { CharacterData, SectionOrderConfig } from '../models/character.ts';

export interface SectionMeta {
  id: string;
  name: string;
  icon: string;
  description: string;
  defaultCol: 'col1' | 'col2';
}

export const SECTIONS_META: Record<string, SectionMeta> = {
  abilities: {
    id: 'abilities',
    name: 'Puntuaciones de Característica',
    icon: 'view_in_ar',
    description: 'Fuerza, Destreza, Constitución, Inteligencia, Sabiduría, Carisma',
    defaultCol: 'col1'
  },
  saves: {
    id: 'saves',
    name: 'Tiradas de Salvación',
    icon: 'security',
    description: 'Modificadores y competencias de salvación',
    defaultCol: 'col1'
  },
  skills: {
    id: 'skills',
    name: 'Habilidades Calculadas',
    icon: 'verified',
    description: 'Lista completa de pericias y valores',
    defaultCol: 'col1'
  },
  features: {
    id: 'features',
    name: 'Rasgos y Dotes',
    icon: 'psychology',
    description: 'Rasgos de clase, pasivas y dotes',
    defaultCol: 'col1'
  },
  weapons: {
    id: 'weapons',
    name: 'Armas y Acciones de Ataque',
    icon: 'swords',
    description: 'Ataques cuerpo a cuerpo y a distancia',
    defaultCol: 'col2'
  },
  wildshape: {
    id: 'wildshape',
    name: 'Forma Salvaje',
    icon: 'pets',
    description: 'Bestiario y transformaciones druídicas',
    defaultCol: 'col2'
  },
  currency: {
    id: 'currency',
    name: 'Monedas y Sintonización',
    icon: 'monetization_on',
    description: 'Bolsa de monedas y objetos sintonizados',
    defaultCol: 'col2'
  },
  backpack: {
    id: 'backpack',
    name: 'Mochila y Pociones',
    icon: 'backpack',
    description: 'Inventario, consumibles y equipo',
    defaultCol: 'col2'
  },
  spells: {
    id: 'spells',
    name: 'Magia y Conjuros',
    icon: 'auto_fix_high',
    description: 'Espacios de conjuro, trucos y hechizos preparados',
    defaultCol: 'col2'
  }
};

export const ALL_SECTION_IDS = Object.keys(SECTIONS_META);

/**
 * Reordena las secciones en el DOM de workspace-col-1 y workspace-col-2
 * según la configuración sectionOrder del personaje.
 * En pantallas de 1 columna (< 1024px), todas las secciones se unifican
 * en workspace-col-1 siguiendo unifiedOrder.
 */
export function reorderSectionsDOM(char: CharacterData) {
  if (typeof document === 'undefined') return;

  // Si estamos en el nuevo layout estructurado de 3 bloques (Bloque 1: Stats/Saves/Weapons vs Skills,
  // Bloque 2: Mochila fila única, Bloque 3: Rasgos vs Magia), respetamos la ubicación semántica de cada bloque.
  const block2 = document.getElementById('sheet-block-2');
  const block3 = document.getElementById('sheet-block-3');
  if (block2 && block3) {
    return;
  }

  const col1 = document.getElementById('workspace-col-1');
  const col2 = document.getElementById('workspace-col-2');
  if (!col1 || !col2) return;

  const order: SectionOrderConfig = char.layoutConfig?.sectionOrder || {
    col1: ['abilities', 'saves', 'skills', 'features'],
    col2: ['weapons', 'wildshape', 'currency', 'backpack', 'spells'],
    unifiedOrder: ['abilities', 'saves', 'skills', 'features', 'weapons', 'wildshape', 'currency', 'backpack', 'spells']
  };

  const isSingleColMode = typeof window !== 'undefined' && window.innerWidth < 1024;

  if (isSingleColMode) {
    // Modo 1 Columna (Móvil / Pantalla Estrecha): todo unificado en col1
    const unifiedList = order.unifiedOrder && order.unifiedOrder.length > 0
      ? order.unifiedOrder
      : [...order.col1, ...order.col2];

    unifiedList.forEach((secId) => {
      const el = document.querySelector<HTMLElement>(`[data-section-id="${secId}"]`) || document.getElementById(`section-${secId}`);
      if (el) {
        col1.appendChild(el);
      }
    });

    // En 1 columna, col2 no tiene tarjetas visibles
    col2.classList.add('hidden');
    col1.classList.remove('hidden');
  } else {
    // Modo 2 Columnas (Escritorio): distribuir entre col1 y col2
    col2.classList.remove('hidden');

    // Reorganizar columna 1
    order.col1.forEach((secId) => {
      const el = document.querySelector<HTMLElement>(`[data-section-id="${secId}"]`) || document.getElementById(`section-${secId}`);
      if (el) col1.appendChild(el);
    });

    // Reorganizar columna 2
    order.col2.forEach((secId) => {
      const el = document.querySelector<HTMLElement>(`[data-section-id="${secId}"]`) || document.getElementById(`section-${secId}`);
      if (el) col2.appendChild(el);
    });
  }
}

/**
 * Aplica los estados de colapso a las secciones en base a char.layoutConfig.collapsedSections
 */
export function applyCollapseStates(char: CharacterData) {
  if (typeof document === 'undefined') return;

  const collapsed = new Set(char.layoutConfig?.collapsedSections || []);

  ALL_SECTION_IDS.forEach((secId) => {
    const sectionEl = document.querySelector<HTMLElement>(`[data-section-id="${secId}"]`) || document.getElementById(`section-${secId}`);
    if (!sectionEl) return;

    const isCollapsed = collapsed.has(secId);
    const body = sectionEl.querySelector<HTMLElement>('.section-body');
    const chevron = sectionEl.querySelector<HTMLElement>('.section-collapse-icon');
    const summaryPill = sectionEl.querySelector<HTMLElement>('.section-collapsed-summary');

    if (isCollapsed) {
      sectionEl.classList.add('is-collapsed');
      if (body) body.classList.add('hidden');
      if (chevron) chevron.textContent = 'expand_more';
      if (summaryPill) summaryPill.classList.remove('hidden');
    } else {
      sectionEl.classList.remove('is-collapsed');
      if (body) body.classList.remove('hidden');
      if (chevron) chevron.textContent = 'expand_less';
      if (summaryPill) summaryPill.classList.add('hidden');
    }
  });
}

/**
 * Salta suavemente a una sección, la expande si estaba colapsada,
 * asegura que su pestaña esté visible y resalta visualmente el contenedor.
 */
export function jumpToSection(sectionId: string) {
  if (typeof document === 'undefined') return;

  const sectionEl = document.querySelector<HTMLElement>(`[data-section-id="${sectionId}"]`) || document.getElementById(`section-${sectionId}`);
  if (!sectionEl) return;

  const char = characterStore.get();

  // 1. Si la sección está colapsada, expandirla
  if (characterStore.isSectionCollapsed(sectionId)) {
    characterStore.toggleSectionCollapsed(sectionId, false);
  }

  // 2. Si la pestaña actual la oculta, cambiar a 'all'
  const activeTab = char.layoutConfig?.activeTab || 'all';
  if (activeTab !== 'all') {
    // Si la pestaña actual oculta la sección objetivo, cambiamos a 'all'
    const allowedTabs: Record<string, string[]> = {
      abilities: ['all', 'combat'],
      saves: ['all', 'skills', 'combat'],
      skills: ['all', 'skills'],
      features: ['all', 'skills', 'combat'],
      weapons: ['all', 'combat'],
      wildshape: ['all', 'wildshape'],
      currency: ['all', 'inventory'],
      backpack: ['all', 'inventory'],
      spells: ['all', 'spells']
    };

    const tabsForSec = allowedTabs[sectionId] || ['all'];
    if (!tabsForSec.includes(activeTab)) {
      characterStore.setActiveTab('all');
    }
  }

  // 3. Scroll suave al elemento
  setTimeout(() => {
    sectionEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // 4. Resaltado temporal ámbar
    sectionEl.classList.add('ring-2', 'ring-amber-400', 'shadow-[0_0_30px_rgba(245,158,11,0.5)]', 'transition-all', 'duration-500');
    setTimeout(() => {
      sectionEl.classList.remove('ring-2', 'ring-amber-400', 'shadow-[0_0_30px_rgba(245,158,11,0.5)]');
    }, 1800);
  }, 50);
}

/**
 * Configura Drag & Drop en la hoja principal para reordenar secciones
 */
let isDndInitialized = false;

export function setupSheetDragAndDrop() {
  if (typeof document === 'undefined' || isDndInitialized) return;
  isDndInitialized = true;

  const col1 = document.getElementById('workspace-col-1');
  const col2 = document.getElementById('workspace-col-2');
  if (!col1 || !col2) return;

  let draggedSecId: string | null = null;
  let dragSourceEl: HTMLElement | null = null;

  // Placeholder para indicar posición de inserción
  const placeholder = document.createElement('div');
  placeholder.id = 'section-drop-placeholder';
  placeholder.className = 'w-full h-16 rounded-xl border-2 border-dashed border-amber-500/60 bg-amber-500/10 transition-all duration-150 flex items-center justify-center text-xs font-bold text-amber-400';
  placeholder.innerHTML = '<span class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[16px]">touch_app</span><span>Soltar aquí para reordenar</span></span>';

  // Configurar cada card de sección
  const cards = document.querySelectorAll<HTMLElement>('[data-section-id]');
  cards.forEach((card) => {
    const handle = card.querySelector<HTMLElement>('.section-drag-handle') || card;

    card.setAttribute('draggable', 'true');

    card.addEventListener('dragstart', (e) => {
      // Si el target no es el handle o header, permitir sólo si comenzó en el header
      draggedSecId = card.getAttribute('data-section-id');
      dragSourceEl = card;
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedSecId || '');
      }
      card.classList.add('opacity-40', 'scale-[0.98]', 'border-dashed', 'border-amber-500');
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('opacity-40', 'scale-[0.98]', 'border-dashed', 'border-amber-500');
      if (placeholder.parentElement) {
        placeholder.parentElement.removeChild(placeholder);
      }
      draggedSecId = null;
      dragSourceEl = null;
    });
  });

  // Manejadores para las dos columnas como drop zones
  [col1, col2].forEach((col) => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      if (!dragSourceEl) return;

      // Determinar posición más cercana respecto a los hijos
      const afterElement = getDragAfterElement(col, e.clientY);
      if (afterElement == null) {
        col.appendChild(placeholder);
      } else {
        col.insertBefore(placeholder, afterElement);
      }
    });

    col.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!dragSourceEl || !placeholder.parentElement) return;

      placeholder.parentElement.insertBefore(dragSourceEl, placeholder);
      placeholder.parentElement.removeChild(placeholder);

      // Guardar el nuevo orden de ambas columnas en characterStore
      saveOrderFromDOM();
    });
  });

  function getDragAfterElement(container: HTMLElement, y: number) {
    const draggableElements = [...container.querySelectorAll<HTMLElement>('[data-section-id]:not(.opacity-40)')];

    return draggableElements.reduce<{ offset: number; element: HTMLElement | null }>(
      (closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
          return { offset: offset, element: child };
        } else {
          return closest;
        }
      },
      { offset: Number.NEGATIVE_INFINITY, element: null }
    ).element;
  }

  function saveOrderFromDOM() {
    const isSingleColMode = typeof window !== 'undefined' && window.innerWidth < 1024;

    if (isSingleColMode) {
      const col1Cards = col1 ? [...col1.querySelectorAll<HTMLElement>('[data-section-id]')].map((el) => el.getAttribute('data-section-id')!) : [];
      const validUnified = col1Cards.filter(Boolean);

      // Auto-balance en 2 columnas para compatibilidad cuando pase a escritorio
      const col1Balanced = validUnified.slice(0, 4);
      const col2Balanced = validUnified.slice(4);

      characterStore.updateSectionOrder({
        col1: col1Balanced,
        col2: col2Balanced,
        unifiedOrder: validUnified
      });
    } else {
      const col1Cards = col1 ? [...col1.querySelectorAll<HTMLElement>('[data-section-id]')].map((el) => el.getAttribute('data-section-id')!) : [];
      const col2Cards = col2 ? [...col2.querySelectorAll<HTMLElement>('[data-section-id]')].map((el) => el.getAttribute('data-section-id')!) : [];

      const validCol1 = col1Cards.filter(Boolean);
      const validCol2 = col2Cards.filter(Boolean);

      characterStore.updateSectionOrder({
        col1: validCol1,
        col2: validCol2,
        unifiedOrder: [...validCol1, ...validCol2]
      });
    }
  }
}

// Escuchar cambios de tamaño de pantalla para alternar dinámicamente entre 1 y 2 columnas
if (typeof window !== 'undefined') {
  let resizeTimer: any = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      reorderSectionsDOM(characterStore.get());
    }, 200);
  });
}
