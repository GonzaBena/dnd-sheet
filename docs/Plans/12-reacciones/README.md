# Planes de Implementación — Spec 12: Reacciones en Vivo

Planes derivados de [`docs/Specs/12-reacciones.spec.md`](../../Specs/12-reacciones.spec.md). Cada plan es **autocontenido**: un desarrollador o agente de IA puede ejecutarlo leyendo únicamente ese archivo y el código del repositorio.

---

## Cuándo se Ejecuta

Esta es la etapa **H5** del [roadmap](../../ROADMAP.md). Depende de **H1** (Spec 07), **H2** (Spec 08), **H3** (Spec 10) y **H4** (Spec 11), las cuales están cerradas y verificadas.
El objetivo es automatizar las reacciones de combate en tiempo real fuera de turno según las reglas oficiales SRD 5.1: consumo de 1 reacción por asalto, restauración al inicio del propio turno, detección de detonantes (impactos a CA, daño recibido, ataques de oportunidad), banner emergente de decisión, resolución de conjuros defensivos (*Escudo*, *Absorber Elementos*) y rasgos (*Esquiva Asombrosa*), y sincronización con el `CombatTracker` del DM.

---

## Índice de Fases

| Plan | Tareas | Requisitos | Objetivo |
| --- | --- | --- | --- |
| [Fase A — Modelo de Datos y Recurso "Reacción"](fase-a-modelo-y-recurso-reaccion.plan.md) | T-340 … T-343 | RF-340 | Tipos de reacción en `models/reaction.ts`, ampliación de `turnState` y `Combatant`, duración `untilNextTurn` en efectos, ciclo de recuperación al entrar en turno y toggle manual. |
| [Fase B — Motor de Detección y Mecánicas SRD](fase-b-motor-deteccion-y-mecanicas-srd.plan.md) | T-344 … T-347 | RF-341, RF-342 | Algoritmo puro `findAvailableReactions` en `dnd/reactions.ts`: catálogo de reacciones estándar (*Escudo*, *Absorber Elementos*, *Esquiva Asombrosa*, *Ataque de Oportunidad*), comprobación de ranuras/equipo y ejecución mecánica de efectos. |
| [Fase C — UI de Decisión en Vivo y Banner Flotante](fase-c-ui-banner-flotante-y-prompt.plan.md) | T-348 … T-351 | RF-343 | Componente `ReactionPromptBanner.astro` y controlador reactivo `reactionPrompt.ts`: captura de eventos de impacto o daño, prompt con 1 clic para aceptar/omitir, y notificación en bitácora (`partyLog`). |
| [Fase D — Panel en la Hoja, Control del DM, Tests y Cierre](fase-d-panel-hoja-dm-tracker-tests-cierre.plan.md) | T-352 … T-355 | RF-344 | Sección de Reacciones en la hoja del personaje, indicador visual interactivo `[⚡]` en el `CombatTracker` del DM, suite completa `tests/reactions.test.mjs` y cierre de etapa H5. |

---

## Secuencia de Ejecución

```
Fase A: Modelo de Datos, Recurso "Reacción" (1/ronda) y Ciclo de Turno
        │
        ▼
Fase B: Motor de Detección de Reacciones y Mecánicas SRD (Escudo, Esquiva, etc.)
        │
        ▼
Fase C: UI de Decisión en Vivo (ReactionPromptBanner y Eventos)
        │
        ▼
Fase D: Panel en la Hoja, Indicador DM Tracker, Suite de Tests y Cierre
```

---

## Mapa del Repositorio (Archivos Involucrados)

| Componente / Archivo | Función |
| --- | --- |
| `src/scripts/models/reaction.ts` | **(Nuevo)** Tipos de detonantes, reacciones disponibles y resultados de ejecución. |
| `src/scripts/models/combat.ts` | Campo `reactionUsed?: boolean` en `Combatant`. |
| `src/scripts/models/character.ts` | Campo `turnState.reactionUsed?: boolean` en `CharacterData`. |
| `src/scripts/models/effect.ts` | Soporte para duración `{ kind: 'untilNextTurn' }`. |
| `src/scripts/dnd/reactions.ts` | **(Nuevo)** Motor puro de detección y resolución de reacciones SRD 5.1. |
| `src/scripts/state/characterStore.ts` | Métodos `isReactionAvailable()`, `useReaction()`, `resetReaction()`. |
| `src/scripts/vtt/initiative.ts` | Restablecimiento de la reacción al avanzar al turno del combatiente. |
| `src/scripts/ui/reactionPrompt.ts` | **(Nuevo)** Controlador de eventos para disparar y descartar prompts de reacción. |
| `src/components/combat/ReactionPromptBanner.astro` | **(Nuevo)** Banner flotante contextual para responder a detonantes en combate. |
| `src/components/dm/CombatTracker.astro` | Indicador visual y toggle `[⚡]` de reacción en cada fila de combatiente. |
| `tests/reactions.test.mjs` | **(Nuevo)** Suite exhaustiva de pruebas unitarias de reacciones y consumo de recursos. |

---

## Decisiones Globales de Arquitectura

- **H5-1 (Recuperación al Inicio del Propio Turno):** Según las reglas oficiales 5e, la reacción no se recarga al iniciar la ronda 1, 2, 3 general, sino exactamente cuando la iniciativa llega al turno del combatiente que la usó.
- **H5-2 (Prompt No Bloqueante):** Las oportunidades de reacción no muestran alertas modales bloqueantes (`window.alert` o diálogos que congelen la pantalla). Se presentan en un banner flotante contextual con opción rápida de omitir o aceptar, preservando la fluidez del juego.
- **H5-3 (Duración `untilNextTurn`):** El efecto de *Escudo* (+5 CA) o la resistencia de *Absorber Elementos* expiran de forma limpia cuando el personaje vuelve a tener su turno, aprovechando la sincronización de combate.
- **H5-4 (La Hoja Avisa, el Jugador Elige):** Si un personaje no tiene ranuras nivel 1 pero sí nivel 2 para *Escudo*, la hoja le ofrece lanzarlo con ranura nivel 2 (escalado), informando el costo.
