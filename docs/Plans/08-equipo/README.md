# Planes de implementación — Spec 08: Equipo

Planes derivados de [`docs/Specs/08-equipo.spec.md`](../../Specs/08-equipo.spec.md). Cada plan es **autocontenido**: un agente puede ejecutarlo leyendo solo ese archivo (y el código del repo). La spec sigue siendo la referencia de requisitos (RF-xx); los planes adaptan la spec al código real.

## Cuándo se ejecutan

Es la etapa **H2** del [roadmap](../../ROADMAP.md) y depende de **H1** (Spec 07): antes de empezar, H1 debe estar cerrada (tests verdes, prueba manual con DM y jugador, T-251 marcada). Se ejecuta una fase a la vez, cerrando cada una con tests verdes.

## Índice

| Plan | Tareas | Requisitos | Depende de |
| --- | --- | --- | --- |
| [Fase A — Modelo, slots y sintonización](fase-a-slots.plan.md) | T-252…T-255 | RF-260…RF-264 | H1 |
| [Fase B — Armaduras y armas en el catálogo](fase-b-catalogo-equipo.plan.md) | T-256…T-259 | RF-265, RF-266, RF-279, RF-281 | Fase A |
| [Fase C — Competencias y compatibilidad](fase-c-compatibilidad.plan.md) | T-260…T-262 | RF-267…RF-272 | Fase B |
| [Fase D — CA derivada](fase-d-ca.plan.md) | T-263…T-266 | RF-273…RF-278 | Fase C |
| [Fase E — Armas en acción y cierre](fase-e-armas-cierre.plan.md) | T-267…T-269 | RF-280, RF-282 | Fases B y D |

```
Fase A ──► Fase B ──► Fase C ──► Fase D ──┐
              │                            ├──► Fase E ──► cierre de la etapa
              └────────────────────────────┘
```

## Mapa del repo (lo que la spec no dice y conviene saber)

| Qué | Dónde |
| --- | --- |
| **Tipo del personaje** | `src/scripts/models/character.ts` (`AttackAction` `:17`, `InventoryItem` `:58`, `CharacterData` `:101+`; `armorClass` y `armorNote` ~`:139-140`) |
| **Valores por defecto** | `src/scripts/models/defaultCharacter.ts` |
| **Store del personaje** | `src/scripts/state/characterStore.ts`. Toda mutación termina en `saveAndNotify()`; `updateAttunedItems` `:712` |
| **Cálculos y migraciones** | `src/scripts/dnd/calculations.ts` (`recalculateCharacter` `:48` llama `migrateSlots` y `migrateResources`: ahí se suman las migraciones nuevas) |
| **Motor de efectos** | `src/scripts/dnd/effects.ts` (`collectModifiers` `:70`), tipos en `src/scripts/models/effect.ts` |
| **Catálogo** | `src/scripts/models/catalog.ts`, `src/scripts/dnd/catalog.ts` (`srdToEntry` `:32`, `toCatalogEntry` `:100`, `parseEffectsText` `:175`) |
| **Ficha de objeto** | `src/scripts/dnd/detailView.ts`, `src/components/modals/ItemDetailModal.astro`, `src/scripts/ui/detailModals.ts` |
| **Alta de objetos** | `AddItemModal`, `AddWeaponModal`, `CompendiumModal`, `src/components/ui/CustomEntryFields.astro`, `BackpackGrid.astro` |
| **Sintonización** | `src/components/modals/EditAttunedModal.astro` |
| **CA en pantalla** | `src/components/character/VitalsGrid.astro:50-52,200-208`, `EditCharacterModal.astro:183,266,396`, `InitiativeList.astro:272`, `WildShapePanel.astro:123-184` |
| **Datos SRD** | `public/data/srd/{2014,2024}/equipment.json`, `weapon-properties.json`; acceso por `src/scripts/api/dndApiService.ts` y `srdCacheManager.ts` |
| **Reglas y tests** | `firestore.rules:282-318`, `tests/rules/firestore_rules.test.mjs`, `tests/*.test.mjs` |

## Decisiones globales (cada plan las repite)

Se mantienen las decisiones **D1–D13** de [`Plans/01-dm-panel/README.md`](../01-dm-panel/README.md) y **H1-1 a H1-6** de la [Spec 07](../07-cimientos-de-la-hoja/README.md). Las más usadas:

- **D1** Firebase solo pasa por `src/scripts/data/`.
- **D2** Tipos en `src/scripts/models/`.
- **D4** Componentes `.astro` + `<script>`, comunicación con `CustomEvent` en `window`.
- **D11** Tests: `pnpm test` (`node --test tests/*.test.mjs`, importa `.ts` directo: sin `enum` ni sintaxis TS no "strippeable") y `pnpm test:rules` (emuladores, requiere Java).
- **D12** Decisiones no cubiertas: la opción más simple, anotada con `// DECISION:`.

Decisiones propias de la Spec 08:

- **H2-1** Todo el equipo vive en `characters/{id}` como campos del inventario y del personaje. No hay colecciones ni reglas nuevas.
- **H2-2** Solo el dueño escribe equipo, competencias y CA. El `hasOnly` del DM no se toca.
- **H2-3** La lógica va en funciones **puras** en `src/scripts/dnd/` (`equipment.ts`, `compat.ts`, `ac.ts`); el store solo las llama y guarda.
- **H2-4** Las migraciones son **idempotentes** y viven en `recalculateCharacter`.
- **H2-5** La CA **no se guarda**: se calcula al leer. Solo persiste el override manual.
- **H2-6** Las incompatibilidades avisan y declaran penalizaciones; no bloquean. La única restricción dura es el tope de 3 sintonizaciones.
- **H2-7** Ventaja y desventaja se **declaran** como modificadores (`when` sin evaluar); H4 las aplica a las tiradas.
- **H2-8** Las competencias se cargan a mano; no se derivan del SRD ni hay multiclase.

## Comandos de verificación

```bash
pnpm test          # tests unitarios (node:test)
pnpm test:rules    # reglas Firestore + RTDB en el emulador (requiere Java)
pnpm build         # astro build estático, sin errores
pnpm emulators     # para la prueba manual
```

Prueba manual estándar: jugador con un personaje **ya existente** (con `attunedItems` y `armorClass` manual, para probar migración y override) en `/campaigns`, y DM en otra ventana para ver la CA en la iniciativa, con la partida `active`.
