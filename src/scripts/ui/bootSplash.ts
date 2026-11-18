// src/scripts/ui/bootSplash.ts
// Motor y coordinador de la pantalla de carga (Spec 16)
// Asegura que ninguna página muestre saltos, texto crudo de íconos ni estados vacíos intermedios.

export type SplashPage = 'home' | 'sheet' | 'party' | 'none';
export type HoldKey = 'session' | 'view' | 'icons';

export interface SplashState {
  holds: Set<HoldKey>;
  shownAt: number;
  now: number;
}

export const SPLASH_MIN_MS = 300;       // Evita un flash/micro-parpadeo si todo ya estaba en memoria
export const SPLASH_SOFT_MAX_MS = 8000;  // Tope blando del módulo: se retira aunque falten esperas
export const SPLASH_HARD_MAX_MS = 12000; // Tope duro inline en <head>: se retira aunque el módulo no haya cargado
export const ICONS_MAX_MS = 1500;        // La fuente de íconos no puede retener el splash más que esto

export const BOOT_PHRASES = [
  'Tirando iniciativa…',
  'Afilando espadas…',
  'Desenrollando el mapa…',
  'Preparando grimorios…',
  'Alineando los astros…',
];
export const BOOT_PHRASE_SLOW = 'Sincronizando tus datos con el grimorio…';

/**
 * Decisión pura: ¿Debe mostrarse el splash en el primer pintado?
 * La réplica inline de esta función corre bloqueante en el <head>.
 */
export function shouldShowSplash(input: {
  page: SplashPage;
  wasAuthed: boolean;
  isDemo: boolean;
  forceLanding: boolean;
}): boolean {
  if (input.page === 'none') return false;
  if (input.page === 'home') {
    return !input.forceLanding && (input.wasAuthed || input.isDemo);
  }
  return true; // 'sheet' y 'party' siempre esperan datos
}

/**
 * Decisión pura: ¿Debe retirarse el splash en este momento?
 */
export function shouldDismiss(s: SplashState): boolean {
  const elapsed = s.now - s.shownAt;
  if (elapsed >= SPLASH_SOFT_MAX_MS) return true;
  return s.holds.size === 0 && elapsed >= SPLASH_MIN_MS;
}

class BootSplashManager {
  private active = false;
  private holds = new Set<HoldKey>(['session', 'view', 'icons']);
  private shownAt = 0;
  private dismissed = false;
  private phraseIndex = 0;
  private phraseTimer: ReturnType<typeof setInterval> | null = null;
  private softMaxTimer: ReturnType<typeof setTimeout> | null = null;
  private iconsTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (typeof window === 'undefined') return;

    // Detectar si el script inline en <head> activó el splash
    this.active = document.documentElement.hasAttribute('data-booting');
    if (!this.active) return;

    this.shownAt = (window as any).__bootSplashShownAt || performance.now();

    this.initA11y();
    this.initFontCheck();
    this.initPhraseRotation();
    this.initSoftMaxTimeout();
    this.listenToGlobalEvents();
  }

  public isActive(): boolean {
    return this.active && !this.dismissed;
  }

  public getPendingHolds(): HoldKey[] {
    return Array.from(this.holds);
  }

  public hold(key: HoldKey): void {
    if (!this.isActive()) return;
    this.holds.add(key);
  }

  public release(key: HoldKey): void {
    if (!this.isActive()) return;
    this.holds.delete(key);
    this.checkDismiss();
  }

  public dismiss(reason: 'ready' | 'timeout' | 'error' = 'ready'): void {
    if (this.dismissed) return;
    this.dismissed = true;
    this.active = false;

    // Limpiar temporizadores
    if (this.phraseTimer) clearInterval(this.phraseTimer);
    if (this.softMaxTimer) clearTimeout(this.softMaxTimer);
    if (this.iconsTimer) clearTimeout(this.iconsTimer);

    if (reason === 'timeout') {
      console.warn('[BootSplash] Retirado por tope blando (8s) con esperas pendientes:', Array.from(this.holds));
    }

    if (typeof window !== 'undefined') {
      this.teardownA11y();
      document.documentElement.removeAttribute('data-booting');

      const splash = document.getElementById('boot-splash');
      if (splash) {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) {
          splash.remove();
        } else {
          splash.classList.add('opacity-0', 'pointer-events-none', 'transition-opacity', 'duration-200');
          setTimeout(() => splash.remove(), 250);
        }
      }

      window.dispatchEvent(new CustomEvent('boot-splash-dismissed', {
        detail: { reason, elapsed: performance.now() - this.shownAt }
      }));
    }
  }

  private checkDismiss(): void {
    if (!this.isActive()) return;

    const now = performance.now();
    const state: SplashState = {
      holds: this.holds,
      shownAt: this.shownAt,
      now,
    };

    if (shouldDismiss(state)) {
      this.dismiss('ready');
      return;
    }

    // Si ya no quedan esperas pero aún no se cumplió el tiempo mínimo (300ms)
    if (this.holds.size === 0) {
      const remaining = Math.max(0, SPLASH_MIN_MS - (now - this.shownAt));
      setTimeout(() => {
        if (this.isActive() && this.holds.size === 0) {
          this.dismiss('ready');
        }
      }, remaining);
    }
  }

  private initA11y(): void {
    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.setAttribute('aria-busy', 'true');
      try {
        (mainEl as any).inert = true;
      } catch (_) {}
    }
  }

  private teardownA11y(): void {
    const mainEl = document.querySelector('main');
    if (mainEl) {
      mainEl.removeAttribute('aria-busy');
      try {
        (mainEl as any).inert = false;
      } catch (_) {}
    }
  }

  private initFontCheck(): void {
    // Si la fuente ya está cargada o el browser no soporta document.fonts
    if (!('fonts' in document)) {
      this.release('icons');
      return;
    }

    // Timeout de seguridad exclusivo para íconos
    this.iconsTimer = setTimeout(() => {
      this.release('icons');
    }, ICONS_MAX_MS);

    (document as any).fonts.load('24px "Material Symbols Outlined"').then(() => {
      this.release('icons');
    }).catch(() => {
      this.release('icons');
    });
  }

  private initPhraseRotation(): void {
    const phraseEl = document.getElementById('boot-splash-phrase');
    if (!phraseEl) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      phraseEl.textContent = 'Preparando la mesa…';
      return;
    }

    phraseEl.textContent = BOOT_PHRASES[0];
    this.phraseIndex = 0;

    this.phraseTimer = setInterval(() => {
      if (!this.isActive()) return;
      const elapsed = performance.now() - this.shownAt;
      if (elapsed >= 4000) {
        phraseEl.textContent = BOOT_PHRASE_SLOW;
        return;
      }
      this.phraseIndex = (this.phraseIndex + 1) % BOOT_PHRASES.length;
      phraseEl.textContent = BOOT_PHRASES[this.phraseIndex];
    }, 1500);
  }

  private initSoftMaxTimeout(): void {
    this.softMaxTimer = setTimeout(() => {
      if (this.isActive()) {
        this.dismiss('timeout');
      }
    }, SPLASH_SOFT_MAX_MS);
  }

  private listenToGlobalEvents(): void {
    // Si la sesión en la nube falla o pasa a signed-out, liberar para que la página muestre el login / error
    window.addEventListener('cloud-error', () => {
      this.dismiss('error');
    });

    window.addEventListener('cloud-session-changed', ((e: CustomEvent<{ state: string }>) => {
      if (e.detail?.state === 'signed-out') {
        this.dismiss('ready');
      }
    }) as EventListener);
  }
}

export const bootSplash = new BootSplashManager();
