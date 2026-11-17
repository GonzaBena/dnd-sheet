# Fase D — Panel en la Hoja, Control del DM, Tests y Cierre

Parte de la implementación de la [Spec 12: Reacciones en Vivo](../../Specs/12-reacciones.spec.md).

---

## Objetivo

Completar la visibilidad y el control de las reacciones en la hoja del personaje (sección dedicada a Reacciones con activación manual) y en el `CombatTracker` del DM (indicador de estado y toggle rápido por combatiente). Verificar la integridad completa de la aplicación mediante tests unitarios, compilación estática limpia y pruebas E2E, cerrando formalmente la etapa **H5**.

---

## Requisitos que Cubre

- **RF-344:** Panel de Reacciones en la Hoja y Control del DM en el Combat Tracker.
- Verificación integral, tests de regresión y cierre en `ROADMAP.md`.

---

## Tareas

### T-352: Sección / Pestaña de Reacciones en la Hoja de Personaje
- En `src/components/combat/` (o en `WeaponActionCard.astro` / `SpellcastingPanel.astro`):
  * Crear un sub-panel o bloque colapsable "Reacciones" que liste todas las reacciones que puede realizar el personaje.
  * Para cada reacción: nombre, icono, tipo (Conjuro / Rasgo / Arma), detonante oficial (ej. *"Al ser impactado por un ataque"*), descripción breve y botón "⚡ Activar Reacción".
  * Badge de estado general de la reacción en la cabecera del panel de combate:
    - `[⚡ Reacción Disponible]` (verde/ámbar)
    - `[⚡ Reacción Gastada]` (gris/atenuado con botón de reinicio manual)
  * Si la reacción está gastada, los botones de activación manual se deshabilitan o advierten de la falta de reacción disponible.

### T-353: Indicador de Reacción en el `CombatTracker` del DM
- En `src/components/dm/CombatTracker.astro`:
  * En cada fila de combatiente, junto a los PG y la CA, añadir un indicador interactivo de reacción:
    - Icono de relámpago `⚡` o badge `[R]`.
    - Si `reactionUsed` es `false` (o ausente): resaltado en ámbar brillante con tooltip *"Reacción disponible"*.
    - Si `reactionUsed` es `true`: atenuado con tooltip *"Reacción gastada este asalto"*.
  * Clic en el indicador: permite al DM alternar manualmente el estado de la reacción del combatiente (`toggleReaction` en `combatService.ts`).
  * Al sincronizar cambios del DM, el jugador ve actualizado su estado de reacción de inmediato.

### T-354: Métodos de Servicio en `src/scripts/data/combatService.ts`
- Agregar método:
  ```typescript
  export async function toggleCombatantReaction(
    cid: string,
    combatantId: string,
    reactionUsed?: boolean
  ): Promise<void>
  ```
- Si se omite `reactionUsed`, invierte el valor actual.
- Actualiza el documento de combate con persistencia local y en Firestore si aplica.

### T-355: Suite de Pruebas Automatizadas y Cierre de Etapa
- Ampliar `tests/reactions.test.mjs` con cobertura de:
  * Activación manual de reacciones desde la hoja.
  * Alternancia y sincronización de reacción en el `CombatTracker`.
  * Ciclo de restauración tras múltiples rondas de iniciativa.
  * Modificadores de CA acumulados y retirados limpiamente al inicio del siguiente turno.
- Ejecutar suite global: `pnpm test` (unitarios + integración + browser E2E).
- Ejecutar build estático: `pnpm build`.
- Actualizar `docs/ROADMAP.md` y `docs/Specs/12-reacciones.spec.md` marcando la etapa **H5** como **Cerrada**.

---

## Verificación

- `pnpm test` en verde sin fallos.
- `pnpm build` sin errores ni advertencias de TypeScript.
- Prueba manual del ciclo de reacción en navegador (activación, reflejo en DM tracker y reseteo por turno).
