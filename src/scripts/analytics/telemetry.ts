// src/scripts/analytics/telemetry.ts
// Fachada desacoplada para telemetría, embudos y analíticas de producto.
// Compatible con PostHog Cloud (1M eventos/mes + grabaciones de sesión gratuitas).
// Diseñado para no bloquear la app si no hay clave, no hay internet o se usa AdBlock.

export type TelemetryEvent =
  | 'page_view'
  | 'landing_cta_demo_click'
  | 'landing_cta_auth_click'
  | 'auth_modal_open'
  | 'auth_success'
  | 'character_creator_open'
  | 'character_creator_step'
  | 'character_creator_abandon'
  | 'character_creator_complete'
  | 'campaign_created'
  | 'campaign_joined'
  | 'dice_roll'
  | 'combat_action_used'
  | 'reaction_triggered'
  | 'rest_executed'
  | 'ui_error'
  | 'rage_click'
  | 'admin_test_event';

export interface EventProperties {
  path?: string;
  creatorType?: 'quick' | 'manual' | 'premade';
  step?: number | string;
  stepName?: string;
  source?: string;
  diceType?: string;
  isCrit?: boolean;
  isFumble?: boolean;
  actionType?: string;
  errorMessage?: string;
  [key: string]: any;
}

export class TelemetryService {
  private initialized = false;
  private posthogKey: string = '';
  private posthogHost: string = 'https://us.i.posthog.com';

  constructor() {
    this.refreshEnv();
  }

  public refreshEnv(): void {
    const env = (typeof import.meta !== 'undefined' && (import.meta as any).env) || {};
    this.posthogKey = (env.PUBLIC_POSTHOG_KEY || '').trim();
    this.posthogHost = (env.PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').trim();
  }

  public isConfigured(): boolean {
    return Boolean(this.posthogKey && this.posthogKey.startsWith('phc_'));
  }

  public getHost(): string {
    return this.posthogHost;
  }

  public init(): void {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    if (this.isConfigured()) {
      this.loadPostHog();
    }

    this.setupErrorCapture();
    this.setupRageClickCapture();
  }

  private loadPostHog(): void {
    try {
      const win = window as any;
      if (win.posthog && win.posthog.__loaded) return;

      // Inicialización de la cola oficial de PostHog
      win.posthog = win.posthog || [];
      const ph = win.posthog;
      if (!ph.init) {
        ph._i = ph._i || [];
        ph.init = function (apiKey: string, config: any, name: string) {
          const target = name ? (ph[name] = []) : ph;
          target.people = target.people || [];
          target.toString = function () { return 'posthog'; };
          const methods = [
            'capture', 'identify', 'alias', 'people.set', 'people.set_once', 'set_config',
            'register', 'register_once', 'unregister', 'opt_out_capturing', 'opt_in_capturing',
            'has_opted_out_capturing', 'clear_opt_out_capturing', 'reset', 'isFeatureEnabled',
            'onFeatureFlags', 'reloadFeatureFlags', 'group', 'updateEarlyAccessFeatureEnrollment',
            'getEarlyAccessFeatures', 'getActiveMatchingSurveys', 'renderSurvey'
          ];
          for (const method of methods) {
            const parts = method.split('.');
            if (parts.length === 2) {
              target[parts[0]] = target[parts[0]] || {};
              target[parts[0]][parts[1]] = function (...args: any[]) { target.push([method, ...args]); };
            } else {
              target[method] = function (...args: any[]) { target.push([method, ...args]); };
            }
          }
          ph._i.push([apiKey, config, name]);
        };
        ph.__SV = 1;
      }

      ph.init(this.posthogKey, {
        api_host: this.posthogHost,
        person_profiles: 'identified_only',
        autocapture: true,
        capture_pageview: true,
        capture_pageleave: true,
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: '[data-private]',
        },
      });

      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.src = `${this.posthogHost}/static/array.js`;
      document.head.appendChild(script);
    } catch (e) {
      console.warn('[Telemetry] No se pudo cargar PostHog:', e);
    }
  }

  private setupErrorCapture(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('error', (event) => {
      this.track('ui_error', {
        errorMessage: event.message || 'Error no especificado',
        source: `${event.filename || 'unknown'}:${event.lineno || 0}`,
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      this.track('ui_error', {
        errorMessage: reason?.message || String(reason) || 'Unhandled Promise Rejection',
        source: 'promise',
      });
    });
  }

  private setupRageClickCapture(): void {
    if (typeof window === 'undefined') return;
    let clickCount = 0;
    let lastClickTime = 0;
    let lastTarget: EventTarget | null = null;

    window.addEventListener('click', (e) => {
      const now = Date.now();
      if (lastTarget === e.target && now - lastClickTime < 500) {
        clickCount++;
        if (clickCount >= 3) {
          const el = e.target as HTMLElement;
          this.track('rage_click', {
            tagName: el.tagName,
            id: el.id || undefined,
            className: el.className ? String(el.className).slice(0, 50) : undefined,
          });
          clickCount = 0;
        }
      } else {
        clickCount = 1;
        lastTarget = e.target;
      }
      lastClickTime = now;
    }, { passive: true });
  }

  public track(event: TelemetryEvent, properties?: EventProperties): void {
    if (typeof window === 'undefined') return;
    try {
      const ph = (window as any).posthog;
      if (ph && typeof ph.capture === 'function') {
        ph.capture(event, properties);
      }
    } catch (_) {}
  }

  public trackStep(flow: 'quick' | 'manual' | 'premade', stepName: string, stepIndex: number): void {
    this.track('character_creator_step', {
      creatorType: flow,
      step: stepIndex,
      stepName,
    });
  }

  public identify(userId: string, email?: string): void {
    if (typeof window === 'undefined') return;
    try {
      const ph = (window as any).posthog;
      if (ph && typeof ph.identify === 'function') {
        ph.identify(userId, email ? { email } : undefined);
      }
    } catch (_) {}
  }

  public reset(): void {
    if (typeof window === 'undefined') return;
    try {
      const ph = (window as any).posthog;
      if (ph && typeof ph.reset === 'function') {
        ph.reset();
      }
    } catch (_) {}
  }

  public async sendDirectTestEvent(event: string, properties?: Record<string, any>): Promise<{ ok: boolean; status?: number; error?: string }> {
    if (!this.isConfigured()) {
      return { ok: false, error: 'PUBLIC_POSTHOG_KEY no configurado en .env' };
    }
    try {
      const endpoint = `${this.posthogHost}/capture/`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: this.posthogKey,
          event,
          properties: {
            distinct_id: properties?.tester || 'anonymous_tester',
            ...properties,
            $lib: 'dnd_sheet_direct',
          },
        }),
      });

      if (res.ok) {
        return { ok: true, status: res.status };
      } else {
        const text = await res.text();
        return { ok: false, status: res.status, error: text };
      }
    } catch (err: any) {
      return { ok: false, error: err?.message || String(err) };
    }
  }
}

export const telemetry = new TelemetryService();
