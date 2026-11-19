/// <reference path="../.astro/types.d.ts" />

interface Window {
  /** Sobre de pergamino animado; lo registra ParchmentEnvelope.astro. */
  dndEnvelope?: {
    open(options: import('./scripts/ui/parchmentModal').ParchmentOptions): boolean;
    close(): void;
  };
}
