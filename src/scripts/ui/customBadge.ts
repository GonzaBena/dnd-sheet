// src/scripts/ui/customBadge.ts
// Insignia "Propio" para las listas que se renderizan con strings HTML (Spec 07, Fase C, FC-3).
// DECISION: se hace función y no componente .astro porque las listas (mochila, grimorio, rasgos)
// se construyen en el cliente con template strings; un componente Astro no se puede usar ahí.

/** Devuelve la insignia solo si la entrada se creó con el formulario de entrada propia. */
export function customBadgeHtml(entity: { custom?: boolean } | null | undefined): string {
  if (!entity || entity.custom !== true) return '';
  return '<span class="px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/30 text-[9px] font-bold uppercase tracking-wider shrink-0" title="Entrada propia">Propio</span>';
}
