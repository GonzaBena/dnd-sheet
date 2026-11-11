// src/scripts/ui/modalSteps.ts
// Formulario por pasos para los modales de objeto y de arma. Los pasos disponibles cambian según lo que el
// usuario activa (categoría, "Entrada propia", modo Manual), así que la lista se pide cada vez que se renderiza.

/** Página a mostrar: la actual si sigue disponible; si no, la primera. */
export function resolvePage(list: string[], current: string | undefined): string {
  return current && list.includes(current) ? current : list[0];
}

/** Pasos que acaban de aparecer (para destacarlos). En el primer render no hay ninguno nuevo. */
export function newPages(prev: string[], next: string[]): string[] {
  return prev.length ? next.filter((id) => !prev.includes(id)) : [];
}

export interface StepProblem {
  message: string;
  focus?: HTMLElement | null;
}

export interface StepsConfig {
  form: HTMLFormElement;
  labels: Record<string, string>;
  /** Pasos visibles, en orden. Se vuelve a llamar en cada `refresh()`. */
  pages: () => string[];
  /** Texto del botón principal en el último paso. */
  finalLabel?: () => string;
  /** Si devuelve un problema, no se puede avanzar desde ese paso. */
  validate?: (id: string) => StepProblem | null;
  onRender?: (info: { id: string; index: number; total: number }) => void;
}

/**
 * Marcas que espera en el formulario: `[data-step-rail]` (lista), `[data-page="id"]` (cada paso),
 * `[data-step-back]`, `[data-step-next]`, `[data-step-count]` y `[data-step-error]` (opcionales).
 */
export function initSteps(cfg: StepsConfig) {
  const { form } = cfg;
  const rail = form.querySelector<HTMLElement>('[data-step-rail]');
  const backBtn = form.querySelector<HTMLElement>('[data-step-back]');
  const nextBtn = form.querySelector<HTMLElement>('[data-step-next]');
  const cancelBtn = form.querySelector<HTMLElement>('[data-step-cancel]');
  const countEl = form.querySelector<HTMLElement>('[data-step-count]');
  const errorEl = form.querySelector<HTMLElement>('[data-step-error]');
  const body = form.querySelector<HTMLElement>('[data-step-body]');

  let current = '';
  let prevIds: string[] = [];

  const list = () => cfg.pages();
  const indexOf = () => list().indexOf(current);

  function showProblem(problem: StepProblem | null) {
    if (errorEl) {
      errorEl.textContent = problem?.message ?? '';
      errorEl.classList.toggle('hidden', !problem);
    }
    problem?.focus?.focus();
  }

  function renderRail(ids: string[], idx: number, fresh: string[]) {
    if (!rail) return;
    rail.replaceChildren(
      ...ids.map((id, i) => {
        const li = document.createElement('li');
        li.className = [i < idx ? 'is-done' : '', i === idx ? 'is-current' : '', fresh.includes(id) ? 'is-new' : '']
          .filter(Boolean).join(' ');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.go = id;
        if (i === idx) btn.setAttribute('aria-current', 'step');
        const dot = document.createElement('span');
        dot.className = 'step-dot';
        if (i < idx) {
          const check = document.createElement('span');
          check.className = 'material-symbols-outlined';
          check.textContent = 'check';
          dot.append(check);
        } else dot.textContent = String(i + 1);
        const label = document.createElement('span');
        label.className = 'step-label';
        label.textContent = cfg.labels[id] ?? id;
        btn.append(dot, label);
        li.append(btn);
        return li;
      }),
    );
  }

  function render(direction: 'fwd' | 'back' = 'fwd') {
    const ids = list();
    current = resolvePage(ids, current);
    const idx = ids.indexOf(current);
    const fresh = newPages(prevIds, ids);
    prevIds = ids;

    renderRail(ids, idx, fresh);
    form.querySelectorAll<HTMLElement>('[data-page]').forEach((page) => {
      const on = page.dataset.page === current;
      const wasHidden = page.classList.contains('hidden');
      page.classList.toggle('hidden', !on);
      if (on && wasHidden) {
        page.classList.remove('step-fwd', 'step-back');
        void page.offsetWidth; // reinicia la animación de entrada
        page.classList.add(direction === 'back' ? 'step-back' : 'step-fwd');
      }
    });

    const last = idx === ids.length - 1;
    backBtn?.classList.toggle('hidden', idx === 0);
    cancelBtn?.classList.toggle('hidden', idx !== 0);
    if (nextBtn) {
      nextBtn.textContent = last ? (cfg.finalLabel?.() ?? 'Guardar') : 'Siguiente';
      nextBtn.dataset.last = last ? '1' : '';
    }
    if (countEl) countEl.textContent = `Paso ${idx + 1} de ${ids.length}`;
    cfg.onRender?.({ id: current, index: idx, total: ids.length });
  }

  function goTo(id: string, direction?: 'fwd' | 'back') {
    const ids = list();
    if (!ids.includes(id)) return;
    const dir = direction ?? (ids.indexOf(id) < indexOf() ? 'back' : 'fwd');
    current = id;
    showProblem(null);
    render(dir);
    if (body) body.scrollTop = 0;
  }

  /** Avanza si el paso actual lo permite. En el último paso envía el formulario. */
  function next() {
    const problem = cfg.validate?.(current) ?? null;
    if (problem) return showProblem(problem);
    const ids = list();
    const idx = ids.indexOf(current);
    if (idx === ids.length - 1) return form.requestSubmit();
    goTo(ids[idx + 1], 'fwd');
  }

  function back() {
    const ids = list();
    const idx = ids.indexOf(current);
    if (idx > 0) goTo(ids[idx - 1], 'back');
  }

  nextBtn?.addEventListener('click', next);
  backBtn?.addEventListener('click', back);
  rail?.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-go]')?.dataset.go;
    if (!id || id === current) return;
    const ids = list();
    if (ids.indexOf(id) > ids.indexOf(current)) {
      const problem = cfg.validate?.(current) ?? null;
      if (problem) return showProblem(problem);
    }
    goTo(id);
  });
  // Los botones del formulario no son "submit": Enter en un campo de texto o número avanza.
  form.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (e.key !== 'Enter' || e.isComposing) return;
    if (t instanceof HTMLInputElement && ['text', 'number', 'url'].includes(t.type)) {
      e.preventDefault();
      next();
    }
  });

  return {
    /** Vuelve a calcular los pasos (por ejemplo, tras cambiar de categoría). */
    refresh: () => render(),
    goTo,
    /** Muestra un aviso en el formulario (y enfoca el campo indicado). */
    problem: showProblem,
    /** Empieza de cero: primer paso y sin pasos "nuevos" destacados. */
    reset() {
      current = '';
      prevIds = [];
      showProblem(null);
      render();
      if (body) body.scrollTop = 0;
    },
    current: () => current,
  };
}
