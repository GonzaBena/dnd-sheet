# Fase A: Modo Mesa Física para Jugadores

Nov 17, 2026 · **Estado: Cerrada**

## Objetivos
* Proveer una vista simplificada, táctil y de alta legibilidad para jugadores que utilizan su teléfono celular como apoyo en mesas presenciales.
* Activar por defecto el modo en pantallas móviles (< 640px) permitiendo alternar a la Ficha Completa en 1 clic.
* Representar los espacios de conjuro del 1 al 9 como botones táctiles interactivos de un toque (`●` disponible, `○` gastada).
* Mostrar PG gigantes (`text-3xl` / `text-5xl`), barra de vida, defensas, recursos y armas preparadas.

## Cambios Implementados
1. `src/scripts/models/character.ts`: Extendido `LayoutConfig` con `viewMode?: SheetViewMode`.
2. `src/scripts/state/characterStore.ts`: Métodos `setViewMode` y `getViewMode`.
3. `src/components/character/PhysicalTableSheet.astro`: Componente visual de la ficha física.
4. `src/pages/campaigns.astro`: Barra de alternancia de vista, contenedor `#player-sheet-table-view`, resolución móvil por defecto (< 640px) y persistencia en `localStorage`.
5. `tests/layout_physical_table.test.mjs`: Tests unitarios de consumo de slots, recursos y vitales.
