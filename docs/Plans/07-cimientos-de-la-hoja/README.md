# Planes de implementación — Spec 07: Cimientos de la hoja

Planes derivados de [`docs/Specs/07-cimientos-de-la-hoja.spec.md`](../../Specs/07-cimientos-de-la-hoja.spec.md). Cada plan es **autocontenido**: un agente puede ejecutarlo leyendo solo ese archivo (y el código del repo). La spec sigue siendo la referencia de requisitos (RF-xx); los planes adaptan la spec al código real.

## Cuándo se ejecutan

Es la etapa **H1** del [roadmap](../../ROADMAP.md) y no depende de ninguna otra etapa abierta. Las etapas H2 a H7 dependen de esta. Se ejecuta una fase a la vez, cerrando cada una con tests verdes.

## Índice

| Plan | Tareas | Requisitos | Depende de |
| --- | --- | --- | --- |
| [Fase A — Recursos y migración](fase-a-recursos.plan.md) | T-230…T-234 | RF-230…RF-236 | — |
| [Fase B — Motor de efectos](fase-b-efectos.plan.md) | T-235…T-239 | RF-237…RF-242 | Fase A |
| [Fase C — Catálogo y entradas propias](fase-c-catalogo.plan.md) | T-240…T-244 | RF-245…RF-250, RF-256 | Fase A |
| [Fase D — Modales genéricos](fase-d-modales.plan.md) | T-245…T-248 | RF-251…RF-253, RF-255 | Fase C |
| [Fase E — Panel de efectos y cierre](fase-e-panel-efectos.plan.md) | T-249…T-251 | RF-243, RF-244, RF-254, RF-257, RF-258 | Fases B y D |

```
Fase A ──┬──► Fase B ──────────────┐
         │                         ├──► Fase E ──► cierre de la etapa
         └──► Fase C ──► Fase D ───┘
```

Las Fases B y C son independientes entre sí.

## Mapa del repo (lo que la spec no dice y conviene saber)

| Qué | Dónde |
| --- | --- |
| **Tipo del personaje** | `src/scripts/models/character.ts` (`CharacterData` `:101-205`; `AttackAction` `:17`, `SpellItem` `:36`, `InventoryItem` `:58`, `WildShapeForm` `:73`) |
| **Valores por defecto** | `src/scripts/models/defaultCharacter.ts` |
| **Store del personaje** | `src/scripts/state/characterStore.ts` (`CharacterStoreManager` `:12`, export `:935`). Todas las mutaciones terminan en `saveAndNotify()` |
| **Cálculos** | `src/scripts/dnd/calculations.ts` (`recalculateCharacter` `:47`, normaliza personajes viejos) |
| **Sincronización** | `src/scripts/data/cloudSync.ts` (`updateDoc` de campos de primer nivel `:573`, debounce `:545`, `onSnapshot` `:288` y `:341`) |
| **Descansos** | `characterStore.shortRest` `:608`, `longRest` `:636`; UI en `src/components/modals/RestModal.astro` |
| **Catálogo SRD** | `public/data/srd/{2014,2024}/`; acceso por `src/scripts/api/srdCacheManager.ts` y `dndApiService.ts` |
| **Modales** | `src/components/modals/` (`AddItemModal`, `AddSpellModal`, `AddWeaponModal`, `EditFeaturesModal`, `EditAttunedModal`, `CompendiumModal`) |
| **Pergamino** | `src/components/ui/ParchmentEnvelope.astro`, `src/scripts/ui/parchmentModal.ts:53` |
| **Combate** | `src/scripts/data/combatService.ts` (`subscribeCombat`: un solo `onSnapshot` por campaña), `src/scripts/models/combat.ts` |
| **Hoja** | `src/pages/campaigns.astro` y `src/pages/index.astro` (ver M1 de la Spec 02: `/campaigns` es la hoja) |
| **Reglas y tests** | `firestore.rules:282-318`, `tests/rules/firestore_rules.test.mjs` |

## Decisiones globales (cada plan las repite)

Se mantienen las decisiones **D1–D13** de [`Plans/01-dm-panel/README.md`](../01-dm-panel/README.md). Las más usadas acá:

- **D1** Firebase solo pasa por `src/scripts/data/`, con `getFirebase()`.
- **D2** Tipos en `src/scripts/models/`.
- **D4** Componentes `.astro` + `<script>`, comunicación con `CustomEvent` en `window`.
- **D11** Tests: `pnpm test` (`node --test tests/*.test.mjs`, importa `.ts` directo: sin `enum` ni sintaxis TS no "strippeable") y `pnpm test:rules` (emuladores, requiere Java).
- **D12** Decisiones no cubiertas: la opción más simple, anotada con `// DECISION:`.

Decisiones propias de la Spec 07:

- **H1-1** Todo el estado nuevo vive en `characters/{id}`, como campos de primer nivel. No hay colecciones ni reglas nuevas.
- **H1-2** Solo el dueño de la hoja escribe recursos y efectos. El `hasOnly` del DM no se toca.
- **H1-3** La lógica va en funciones **puras** (`src/scripts/dnd/`) que reciben el personaje y devuelven el resultado; el store solo las llama y guarda. Así se testean sin Firebase ni DOM.
- **H1-4** La migración de personajes viejos es **idempotente** y vive en `recalculateCharacter`: abrir el mismo personaje dos veces no cambia nada la segunda vez.
- **H1-5** Los modificadores de los efectos se guardan pero nadie los lee todavía (salvo `collectModifiers`). No se cambia ningún cálculo existente en H1.
- **H1-6** Las incompatibilidades avisan y no bloquean.

## Comandos de verificación

```bash
pnpm test          # tests unitarios (node:test)
pnpm test:rules    # reglas Firestore + RTDB en el emulador (requiere Java)
pnpm build         # astro build estático, sin errores
pnpm emulators     # para la prueba manual
```

Prueba manual estándar: jugador con un personaje **ya existente** (para probar la migración) en `/campaigns`, y DM en otra ventana para el avance de rondas, con la partida `active`.
