# Planes de implementación — Spec 02: Mesa viva

Planes derivados de [`docs/Specs/02-mesa-viva.spec.md`](../../Specs/02-mesa-viva.spec.md). Cada plan es **autocontenido**: un agente puede ejecutarlo leyendo solo ese archivo (y el código del repo). La spec sigue siendo la referencia de requisitos (RF-xx); los planes adaptan la spec al código real.

## Cuándo se ejecutan

Según el [roadmap](../../ROADMAP.md), esta etapa va **después de la Etapa 0** (Spec 01, Fases 2 y 3: mapa y tokens). Excepción: la **Fase A (QR)** es independiente y se puede hacer en cualquier momento.

## Índice

| Plan | Tareas | Requisitos | Depende de |
| --- | --- | --- | --- |
| [Fase A — QR de invitación](fase-a-qr-invitacion.plan.md) | T-60, T-61 | RF-90…RF-92 | — |
| [Fase B — Aviso de turno](fase-b-aviso-turno.plan.md) | T-62…T-65 | RF-60…RF-66 | Spec 01 Fase 1 (hecha) |
| [Fase C — Terminar mi turno](fase-c-terminar-turno.plan.md) | T-66…T-69 | RF-70…RF-74 | Fase B |
| [Fase D — Susurros del DM](fase-d-susurros.plan.md) | T-80…T-83 | RF-80…RF-84 | Fase B (T-63) |

```
Fase A ─────────────────────────────────────────┐
Fase B (T-62 … T-65) ──┬──► Fase C (T-66 … T-69) ┼──► cierre de la etapa
                       └──► Fase D (T-80 … T-83) ┘
```

Las Fases C y D son independientes entre sí.

## Mapa del repo (lo que la spec no dice y conviene saber)

| Qué | Dónde |
| --- | --- |
| **Hoja de personaje y panel del DM** | `src/pages/campaigns.astro` (monta `Header`, la hoja, `DmControlGrimoire`, `JournalModal`, `DiceRollerModal`, etc.) |
| **Lista de campañas y unión por link** | `src/pages/index.astro` (botón "Unirse", handler `/?join=`, líneas ~660-700) |
| **Vista de partida** | `src/pages/partida.astro` → `PartyView.astro`, `InitiativeList.astro` |
| Layout base y login | `src/layouts/BaseLayout.astro` monta `AuthGate.astro` (modal de login, toast `#cloud-toast`) |
| Estado de la sesión en la nube | `cloudSession` en `src/scripts/data/cloudSync.ts`: `ready()`, `getUid()`, `isCloud()`, evento `cloud-session-changed` (`detail.state`: `loading`, `ready`, `signed-out`, `local`) |
| Diálogos | `src/scripts/ui/notify.ts`: `showAlert`, `showConfirm`, `showPrompt`, `showChoice`, `showForm` |
| Combate | `src/scripts/data/combatService.ts`: `subscribeCombat` comparte **un solo** `onSnapshot` por campaña entre todos los callbacks; `getCurrentCombat`; `saveCombat` (setDoc completo, F1-4) |
| Lógica pura del combate | `src/scripts/vtt/initiative.ts` (`nextTurn`, `prevTurn`, `visibleHp`…), tests en `tests/initiative.test.mjs` |
| Bitácora | `src/scripts/state/journalStore.ts` (`log`, `addEntry`, `getEntryVisibility`, `withVisibility`) y escritura/lectura en `cloudSync.ts` (`writeJournalEntry`, `syncJournalListeners`) |
| Reglas e índices | `firestore.rules`, `firestore.indexes.json`, tests en `tests/rules/` |

## Decisiones globales (cada plan las repite)

Se mantienen las decisiones **D1–D13** de [`Plans/01-dm-panel/README.md`](../01-dm-panel/README.md). Las más usadas acá:

- **D1** Firebase solo pasa por `src/scripts/data/`, con `getFirebase()`. Los componentes no importan `firebase/*` en el frontmatter.
- **D2** Tipos en `src/scripts/models/`.
- **D4** Componentes `.astro` + `<script>`, comunicación con `CustomEvent` en `window`.
- **D7** Matriz de estados (`active` / `paused` / `ended`); en la UI se usa `canPerform(action, role, status)` de `src/scripts/vtt/sessionStatus.ts`.
- **D11** Tests: `pnpm test` (`node --test tests/*.test.mjs`, importa `.ts` directo: sin `enum` ni sintaxis TS no "strippeable") y `pnpm test:rules` (emuladores, requiere Java).
- **D12** Decisiones no cubiertas: la opción más simple, anotada con `// DECISION:`.

Decisiones propias de la Spec 02:

- **M1** La hoja está en `/campaigns` (y ahí también vive el panel del DM). `/` es la lista de campañas. Todo lo "global" de esta spec se monta en `campaigns.astro` y `partida.astro`.
- **M2** Preferencias por dispositivo en `localStorage` y deduplicación de avisos en `sessionStorage`, siempre dentro de `try/catch` (pueden fallar en modo privado). La app funciona igual si fallan.
- **M3** `src/scripts/ui/alerts.ts` (Fase B) es el **único** punto que muestra banners, vibra o suena. Las Fases C y D lo reutilizan.
- **M4** El turno se escribe con `runTransaction` y **escritura parcial** (`turnIndex`, `round`, `updatedAt`), tanto del jugador como del DM (Fase C). El resto de las escrituras del combate siguen como en F1-4.
- **M5** Modo local (sin Firebase): aviso de turno y QR funcionan si tienen sentido; susurros y "terminar turno" muestran "Requiere iniciar sesión con cuenta" (D10).

## Comandos de verificación

```bash
pnpm test          # tests unitarios (node:test)
pnpm test:rules    # reglas Firestore + RTDB en el emulador (requiere Java)
pnpm build         # astro build estático, sin errores
pnpm emulators     # para la prueba manual
```

Prueba manual estándar: DM en la PC (navegador A, `/campaigns`) y jugador en un **celular real** (Android para probar la vibración), con la partida `active`.
