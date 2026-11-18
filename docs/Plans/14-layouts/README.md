# Plan Maestro: H7 · Layouts Especializados (Spec 14)

Nov 17, 2026 · @Gonzalo Benavente · **Estado: Cerrada**

Este directorio desglosa la implementación técnica de la etapa **H7 (Spec 14)** en 4 fases ejecutables y verificadas:

---

## Estructura de Fases

| Fase | Archivo | Alcance | Estado |
|---|---|---|---|
| **Fase A** | [`fase-a-modo-mesa-fisica.plan.md`](fase-a-modo-mesa-fisica.plan.md) | Componente `PhysicalTableSheet.astro`, vitales gigantes, matriz de ranuras de conjuro táctiles 1–9, recursos de clase, acciones preparadas y selector móvil por defecto (< 640px). | Cerrada |
| **Fase B** | [`fase-b-cockpit-dm.plan.md`](fase-b-cockpit-dm.plan.md) | Componente `DmCockpitPartyDashboard.astro`, controles compactos `[-]` y `[+]` para dañar/curar aventureros solicitando cantidad, alternador de vista en Grimorio del DM y persistencia. | Cerrada |
| **Fase C** | [`fase-c-teatro-de-la-mente.plan.md`](fase-c-teatro-de-la-mente.plan.md) | Componente `TheaterOfTheMindStage.astro`, 3 zonas tácticas (Melé 5ft, Cerca 30ft, Lejos 60ft), función pura `calculateTotmDistanceFeet` e integración automática en `InitiativeList`. | Cerrada |
| **Fase D** | [`fase-d-integracion-y-verificacion.plan.md`](fase-d-integracion-y-verificacion.plan.md) | Documentación técnica (`14-layouts.spec.md`), actualización de `ROADMAP.md`, 1.211 tests unitarios pasando y compilación limpia en Astro. | Cerrada |

---

## Verificación Global

* `node --test tests/layout_physical_table.test.mjs`: Pruebas de vista móvil, slots de conjuro 1-9 y vitales.
* `node --test tests/layout_dm_cockpit.test.mjs`: Pruebas de agregación de party y mutación de PG del DM.
* `node --test tests/theater_of_the_mind.test.mjs`: Pruebas de medición de distancias por zonas TotM y compatibilidad H6.
* `pnpm test`: 1.211 tests unitarios automáticos (0 fallos).
* `pnpm build`: 7 páginas estáticas compiladas en 1.4s.
