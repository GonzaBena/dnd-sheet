# Planes de Implementación — Spec 11: Combate en la Hoja

Planes derivados de [`docs/Specs/11-combate-en-la-hoja.spec.md`](../../Specs/11-combate-en-la-hoja.spec.md). Cada plan es **autocontenido**: un desarrollador o agente de IA puede ejecutarlo leyendo únicamente ese archivo y el código del repositorio.

---

## Cuándo se Ejecuta

Esta es la etapa **H4** del [roadmap](../../ROADMAP.md). Depende de **H1** (Spec 07), **H2** (Spec 08) y **H3** (Spec 10), las cuales están cerradas y verificadas.
El objetivo es automatizar las mecánicas de combate en la hoja según las reglas oficiales SRD 5.1: consumo condicional de modificadores al impacto, validación y rituales en conjuros, concentración activa con salvación al recibir daño, y ventajas/desventajas explicadas.

---

## Índice de Fases

| Plan | Tareas | Requisitos | Objetivo |
| --- | --- | --- | --- |
| [Fase A — Modificadores al Impacto y Consumo Condicional](fase-a-modificadores-impacto-consumo.plan.md) | T-320 … T-323 | RF-320, RF-321 | Selector de bonos de impacto y daño (Ataque Furtivo, Castigo Divino, Maniobras, Inspiración), consumo "1 vez por turno" y regla de no consumir recursos si el ataque falla. |
| [Fase B — Validación de Conjuros, Componentes y Rituales](fase-b-validacion-conjuros-rituales.plan.md) | T-324 … T-327 | RF-322, RF-323, RF-324 | Análisis de componentes V/S/M según manos y equipo, opción de lanzamiento como Ritual (+10 min, sin ranuras) y descuento reactivo de espacios. |
| [Fase C — Concentración Activa y Salvación al Daño](fase-c-concentracion-salvacion-dano.plan.md) | T-328 … T-331 | RF-325, RF-326 | Unicidad de concentración en efectos activos, intercepción de daño en PG y cálculo automático de CD ($\max(10, \lfloor\text{daño}/2\rfloor)$) con banner de salvación de Constitución. |
| [Fase D — Ventajas/Desventajas Explicadas y Cierre](fase-d-ventaja-desventaja-explicada-cierre.plan.md) | T-332 … T-335 | RF-327 | Motor de evaluación de ventaja/desventaja justificada en tiradas, ruleta con 2d20 interactiva, tests unitarios en `tests/combat_sheet.test.mjs` y cierre de etapa. |

---

## Secuencia de Ejecución

```
Fase A: Modificadores al Impacto y Consumo 1 Vez por Turno
        │
        ▼
Fase B: Validación de Conjuros, Componentes V/S/M y Rituales
        │
        ▼
Fase C: Concentración Activa y Salvación al Daño (CD máx(10, daño/2))
        │
        ▼
Fase D: Ventaja/Desventaja Explicada, Verificación y Cierre
```

---

## Mapa del Repositorio (Archivos Involucrados)

| Componente / Archivo | Función |
| --- | --- |
| `src/scripts/models/combat.ts` | Nuevos tipos `CombatModifierOption`, `ConcentrationStatus`, `AdvantageEvaluation`. |
| `src/scripts/dnd/combat.ts` | **(Nuevo)** Módulo de lógica pura de combate: modificadores condicionales, componentes de conjuros y ventaja/desventaja. |
| `src/scripts/dnd/concentration.ts` | **(Nuevo)** Lógica de concentración única y cálculo de CD ante daño. |
| `src/scripts/state/characterStore.ts` | Métodos para tracking de turno (`resetTurn()`, `consumeTurnFeature()`), concentración y salvaciones. |
| `src/scripts/data/hpTransaction.ts` / `hpActions.ts` | Detección de daño para disparar chequeo de concentración. |
| `src/components/combat/WeaponActionCard.astro` | Integración del selector de modificadores y botón "Nuevo Turno". |
| `src/components/combat/SpellcastingPanel.astro` | Validación de componentes V/S/M, lanzamiento ritual y concentración. |
| `src/components/modals/DiceRollerModal.astro` | Desglose explicativo de ventaja/desventaja, 2d20 y deducción diferida de recursos al impactar. |
| `src/components/modals/SpellDetailModal.astro` | Opción de lanzamiento como ritual y advertencia de componentes. |
| `tests/combat_sheet.test.mjs` | **(Nuevo)** Suite completa de tests unitarios de reglas de combate y concentración. |

---

## Decisiones Globales de Arquitectura

- **H4-1 (Consumo Condicional):** Los recursos de combate marcados con `consumeTiming: 'onHit'` residen en memoria durante la tirada del d20; solo al confirmarse el impacto se aplica la deducción al personaje con `saveAndNotify()`. Si el ataque falla, la selección se descarta sin restar usos.
- **H4-2 (La Hoja Avisa, No Bloquea):** Si un conjuro requiere componente somático y el personaje tiene ambas manos ocupadas, se muestra una alerta visual con icono `warning`, pero no se desactiva el botón de lanzar.
- **H4-3 (Rituales Sin Ranura):** Un conjuro lanzado como ritual no llama a `useSpellSlot()`, sino que registra un evento en la bitácora con `tag: '#Ritual'`.
- **H4-4 (Fórmula de Concentración SRD):** Al recibir daño, la dificultad de salvación es exactamente $\max(10, \lfloor\text{daño}/2\rfloor)$. Si el daño es 0, no se exige salvación.
- **H4-5 (Anulación Mutua de Ventaja):** Si hay al menos una ventaja y al menos una desventaja, la tirada es normal independientemente de cuántas haya de cada lado.
