// src/scripts/ui/tabs.ts
// Pestañas accesibles (role=tablist) con indicador deslizante y fundido entre paneles.
// Markup esperado dentro de `root`:
//   [role="tab"][data-tab="x"]            botones (flechas/Home/End navegan)
//   [data-tab-indicator]                  barra que se desliza bajo la pestaña activa
//   [data-tab-panel="x"]                  paneles; los inactivos llevan `hidden`
// El índice flotante abre una pestaña disparando `index:open-tab` con { tab }.

export function initTabs(root: HTMLElement | null, storageKey: string, defaultTab = 'journal'): void {
  if (!root) return;
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  const panels = Array.from(root.querySelectorAll<HTMLElement>('[data-tab-panel]'));
  const indicator = root.querySelector<HTMLElement>('[data-tab-indicator]');
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let current: string | null = null;

  function moveIndicator(btn: HTMLElement | undefined) {
    if (!indicator || !btn) return;
    indicator.style.width = `${btn.offsetWidth}px`;
    indicator.style.transform = `translateX(${btn.offsetLeft}px)`;
  }

  function setTab(name: string, opts: { focus?: boolean; persist?: boolean } = {}) {
    const activeBtn = buttons.find(b => b.dataset.tab === name);
    if (!activeBtn) return;
    buttons.forEach(b => {
      const on = b === activeBtn;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && opts.focus) b.focus();
    });

    const previous = current;
    const isFirst = previous === null;
    current = name;
    // En la carga inicial el indicador se coloca sin deslizarse desde cero
    if (isFirst && indicator) indicator.style.transition = 'none';
    moveIndicator(activeBtn);
    if (isFirst && indicator) {
      void indicator.offsetWidth;
      indicator.style.transition = '';
    }

    if (previous !== name) {
      const outgoing = panels.find(p => p.dataset.tabPanel === previous);
      const incoming = panels.find(p => p.dataset.tabPanel === name);
      const animate = !isFirst && !reduceMotion() && typeof incoming?.animate === 'function';

      panels.forEach(p => {
        if (p !== incoming && p !== outgoing) p.classList.add('hidden');
      });

      // El saliente se desvanece y el entrante aparece subiendo un poco
      const showIncoming = () => {
        outgoing?.classList.add('hidden');
        outgoing?.getAnimations().forEach(a => a.cancel()); // suelta el opacity:0 que dejó el fundido
        incoming?.classList.remove('hidden');
        if (animate && incoming) {
          incoming.animate(
            [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
            { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
          );
        }
      };

      if (animate && outgoing) {
        outgoing.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, easing: 'ease-in', fill: 'forwards' })
          .finished.then(showIncoming, showIncoming);
      } else {
        showIncoming();
      }
    }

    if (opts.persist !== false) {
      try { sessionStorage.setItem(storageKey, name); } catch { /* modo privado: no es crítico */ }
    }
  }

  buttons.forEach((btn, i) => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab || defaultTab));
    btn.addEventListener('keydown', (e) => {
      const last = buttons.length - 1;
      let next = -1;
      if (e.key === 'ArrowRight') next = i === last ? 0 : i + 1;
      else if (e.key === 'ArrowLeft') next = i === 0 ? last : i - 1;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = last;
      if (next < 0) return;
      e.preventDefault();
      setTab(buttons[next].dataset.tab || defaultTab, { focus: true });
    });
  });

  let initial = defaultTab;
  try {
    initial = sessionStorage.getItem(storageKey) || initial;
  } catch { /* sin storage: queda la pestaña por defecto */ }
  if (!buttons.some(b => b.dataset.tab === initial)) initial = defaultTab;
  setTab(initial, { persist: false });

  // La vista puede estar oculta al cargar: el indicador se recoloca cuando la barra se ve o cambia de ancho
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => moveIndicator(buttons.find(b => b.dataset.tab === current))).observe(root);
  }

  window.addEventListener('index:open-tab', (e) => setTab((e as CustomEvent).detail?.tab));
}
