# Fase B: Cockpit Táctico del DM

Nov 17, 2026 · **Estado: Cerrada**

## Objetivos
* Crear una pantalla de mando horizontal tipo *DM Screen* optimizada para monitores y laptops.
* Implementar el **Party Dashboard** con filas compactas por aventurero (Avatar, CA, PP, Estados, PG y barra de vida).
* Optimizar controles de vitales reemplazando los 4 botones por dos botones compactos:
  - `[-]` (Dañar): solicita cantidad y restaura/daña atómicamente.
  - `[+]` (Curar): solicita cantidad y cura al aventurero.
* Integrar selector de modo de mando en el Grimorio (`[ 📜 Clásico | 🎛️ Cockpit ]`) con persistencia en `localStorage`.

## Cambios Implementados
1. `src/components/dm/DmCockpitPartyDashboard.astro`: Componente compacto del Party Dashboard con botones `[-]` y `[+]`.
2. `src/components/dm/DmControlGrimoire.astro`: Selector de vista en header, inclusión del Party Dashboard en la columna táctica derecha y conmutación de filas.
3. `tests/layout_dm_cockpit.test.mjs`: Tests unitarios de agregación de personajes y mutación atómica de PG vía `campaignStore.mutateHp`.
