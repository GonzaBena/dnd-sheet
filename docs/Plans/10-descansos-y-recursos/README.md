# Planes de Implementación — Spec 10: Descansos y Recursos

Planes derivados de [`docs/Specs/10-descansos-y-recursos.spec.md`](../../Specs/10-descansos-y-recursos.spec.md). Cada plan es **autocontenido**: un desarrollador o agente de IA puede ejecutarlo leyendo únicamente ese archivo y el código del repositorio.

---

## Cuándo se Ejecuta

Esta es la etapa **H3** del [roadmap](../../ROADMAP.md). Depende de **H1** (Spec 07) y **H2** (Spec 08), las cuales están cerradas y verificadas.
El objetivo es automatizar de forma interactiva y fiel a las reglas oficiales 5e la recuperación de salud, dados de golpe (monoclass y multiclass), espacios de conjuro, recursos y dados guardados (Portento).

---

## Índice de Fases

| Plan | Tareas | Requisitos | Objetivo |
| --- | --- | --- | --- |
| [Fase A — Modelo y Lógica Pura](fase-a-modelo-y-logica.plan.md) | T-280 … T-283 | RF-300, RF-301, RF-303, RF-305, RF-306, RF-307, RF-308 | Tipos `HitDicePool`, funciones puras en `src/scripts/dnd/rests.ts`, cálculo con CON, recuperación de dados y tests unitarios. |
| [Fase B — Descanso Corto Interactivo](fase-b-descanso-corto-ui.plan.md) | T-284, T-285 | RF-302, RF-303, RF-304, RF-305 | Selector interactivo en `RestModal.astro`, tirada paso a paso o en lote, entrada manual en mesa y actualización reactiva de PG. |
| [Fase C — Descanso Largo, Portento y Resumen](fase-c-descanso-largo-portento.plan.md) | T-286 … T-288 | RF-306, RF-307, RF-308, RF-309, RF-310, RF-312 | Flujo guiado de descanso largo con recuperación multiclase, tirada de dados de Portento, widget en la hoja y modal de resumen táctico. |
| [Fase D — Sincronización DM y Cierre](fase-d-dm-y-cierre.plan.md) | T-289, T-290 | RF-311, RNF-300 … RNF-303 | Sincronización en tiempo real de descansos grupales del DM, pruebas de regresión, build estático y verificación final. |

---

## Secuencia de Ejecución

```
Fase A: Modelo y Lógica Pura
        │
        ▼
Fase B: Descanso Corto Interactivo
        │
        ▼
Fase C: Descanso Largo, Portento y Resumen
        │
        ▼
Fase D: Sincronización DM, Verificación y Cierre
```

---

## Mapa del Repositorio (Archivos Involucrados)

| Componente / Archivo | Función |
| --- | --- |
| `src/scripts/models/character.ts` | Definición de `HitDicePool`, ampliación de `CharacterData['hitDice']`. |
| `src/scripts/models/resource.ts` | Soporte para `values?: number[]` y `dieType?: string` en recursos guardados. |
| `src/scripts/models/rest.ts` | Nuevos tipos `SpentHitDie`, `ShortRestResult` y `LongRestResult`. |
| `src/scripts/dnd/rests.ts` | **(Nuevo)** Módulo de lógica pura para descansos: tiradas de dados, CON, algoritmos de recuperación multiclase y portento. |
| `src/scripts/dnd/calculations.ts` | Función `syncHitDicePools` integrada en `recalculateCharacter` para consistencia de dados y nivel. |
| `src/scripts/state/characterStore.ts` | Métodos `shortRest` interactivo, `longRest`, consumo de dados guardados y persistencia atómica. |
| `src/components/modals/RestModal.astro` | Rediseño integral: vista de descanso corto interactivo con ruleta/dados y descanso largo con selección. |
| `src/components/modals/RestSummaryModal.astro` | **(Nuevo)** Modal interactivo de resumen y celebración del descanso completado. |
| `src/components/character/VitalsGrid.astro` | Disparadores de descanso y visualización de reservas de dados de golpe. |
| `src/components/character/ResourcesSection.astro` | Visualización y botón de gasto táctico de dados de Portento guardados. |
| `src/scripts/state/groupRestSync.ts` | Coordinación de descansos de grupo emitidos por el DM desde el Grimorio. |
| `tests/rests.test.mjs` | **(Nuevo)** Suite completa de tests unitarios de lógica pura de descansos. |

---

## Decisiones Globales de Arquitectura

Se aplican las decisiones estándar del proyecto:
- **D1:** Firebase se accede solo a través de `src/scripts/data/`.
- **D2:** Tipos en `src/scripts/models/`.
- **D3:** Componentes `.astro` con scripts vanilla, sin frameworks pesados.
- **D11:** Tests automatizados con `node:test` (`tests/*.test.mjs`).
- **H3-1 (Pureza):** Toda la matemática de tiradas, modificador de CON y recuperación de dados es pura y reside en `src/scripts/dnd/rests.ts`.
- **H3-2 (Cuota Spark):** El descanso interactivo mantiene los dados tirados en memoria; solo al pulsar "Confirmar Descanso" se realiza una única llamada a `saveAndNotify()`.
- **H3-3 (Regla SRD 5.1):** En descanso corto, cada dado cura `Math.max(0, roll + conMod)`. En descanso largo se recupera hasta `Math.max(1, Math.floor(total / 2))` dados.
- **H3-4 (Dados Guardados):** Los dados como Portento se tiran en descanso largo y se guardan en `resource.values`. Gastar uno decrementa el recurso y remueve el valor usado.
