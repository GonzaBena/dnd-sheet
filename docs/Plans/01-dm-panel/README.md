# Planes de implementación — Spec 01: VTT y panel de DM

Planes derivados de [`docs/Specs/01-dm-panel.spec.md`](../../Specs/01-dm-panel.spec.md). Cada plan es **autocontenido**: un agente puede ejecutarlo leyendo solo ese archivo (y el código del repo). La spec sigue siendo la referencia de requisitos (RF-xx); los planes adaptan la spec al código real.

## Índice

| Plan | Tareas | Requisitos | Depende de |
| --- | --- | --- | --- |
| [Fase 0 — Base y seguridad](fase-0-base-seguridad.plan.md) | T-01…T-05 | Seguridad, modelo de datos | — |
| [Fase 0B — Vista de partida y estado](fase-0b-vista-partida-estado.plan.md) | T-06…T-09 | RF-50…RF-57 | Fase 0 |
| [Fase 1 — Iniciativa y combate](fase-1-iniciativa-combate.plan.md) | T-10…T-14 | RF-01…RF-04 | Fase 0, 0B |
| [Fase 2 — Mapa estático](fase-2-mapa-estatico.plan.md) | T-20…T-24 | RF-10…RF-12 | Fase 0, 0B |
| [Fase 3 — Tokens en vivo](fase-3-tokens-en-vivo.plan.md) | T-30…T-36 | RF-20…RF-23 | Fase 2 |
| [Fase 4 — Niebla y tokens ocultos](fase-4-niebla-tokens-ocultos.plan.md) | T-40…T-43 | RF-24, RF-30, RF-31 | Fase 3 |
| [Fase 5 — Extras](fase-5-extras.plan.md) | T-50…T-55 | RF-05, RF-13, RF-14, RF-25, RF-40…RF-43 | Según subsección |

```
Fase 0 ──► Fase 0B ──┬──► Fase 1 ─────────────────────────┐
                     └──► Fase 2 ──► Fase 3 ──► Fase 4 ───┴──► Fase 5 (cada extra declara lo suyo)
```

La Fase 1 y la Fase 2 son independientes entre sí. Regla de la spec: no empezar una fase sin cerrar la anterior en su cadena y sin que pasen todos los tests.

## Diferencias entre la spec y el repo (ya resueltas)

| La spec dice | El repo tiene | Se hace |
| --- | --- | --- |
| Capa `src/lib/` (`firebase.ts`, `mapService.ts`…) | `src/scripts/firebase/client.ts` (`getFirebase()` → `{ app, auth, db }`), `src/scripts/data/cloudSync.ts` (`cloudSession`), stores en `src/scripts/state/` | Servicios nuevos en `src/scripts/data/` |
| Tipos en `src/types/` | `src/scripts/models/` | Tipos nuevos en `src/scripts/models/` |
| `dmUid`, `memberUids` | `dmId`, `memberUserIds` (+ `creatorId`) | Se usan los nombres existentes; no hay migración |
| Bitácora `campaigns/{cid}/log` con `visibility: 'dm' \| 'party'` | `campaigns/{cid}/journal` con `visibility: 'party' \| 'dm' \| 'player' \| 'to_dm'` y reglas `canSee()` | Se reutiliza tal cual; RF-53 ya está cumplido |
| `status: 'active' \| 'paused' \| 'ended'` | `Campaign.status: 'active' \| 'paused' \| 'completed'` (default `'active'`) | El tipo pasa a `'ended'`, `'completed'` se lee como `'ended'`, las campañas nuevas nacen en `'paused'` |
| Isla `client:only` | No hay framework UI: todo es `.astro` + `<script>` vanilla | `.astro` + `<script>` con `import()` dinámico de Konva/Firebase (equivale a `client:only`) |
| Auth anónimo o Google | Google + email/contraseña ya implementados (`src/scripts/firebase/authService.ts`) | Se mantiene lo existente |
| RTDB `/live/{cid}/…`, `/members/{cid}/…`, `/status/{cid}` | No hay RTDB | Todo bajo `/rooms/{roomId}/…` con `roomId` secreto (ver D13) |
| `/partida?id=` | Solo existen `/` y `/campaigns` | Página nueva `src/pages/partida.astro` |

## Decisiones globales (cada plan las repite)

- **D1** Capa de datos: servicios nuevos en `src/scripts/data/`, que obtienen el SDK con `getFirebase()` de `src/scripts/firebase/client.ts`. Los componentes `.astro` nunca importan `firebase/*` ni `konva` en el frontmatter; solo en `<script>` y con `import()` dinámico.
- **D2** Tipos en `src/scripts/models/`, TypeScript estricto.
- **D3** Nombres reales: `dmId`, `memberUserIds`, `creatorId`, bitácora en `campaigns/{cid}/journal`.
- **D4** Sin framework UI: componentes `.astro` + `<script>`, comunicación con `CustomEvent` en `window` (patrón existente: `campaigns-updated`, `active-campaign-changed`, `dm-grimoire-refresh`).
- **D5** Auth existente (Google + email). El uid en modo nube es `userStore.getCurrentUser().id`; se espera `await cloudSession.ready()` antes de leer.
- **D6** Estados de partida: `active | paused | ended`. Ausente = `paused`. Legado `'completed'` = `ended`.
- **D7** En `paused` el DM puede *preparar contenido*: crear/editar mapas y tokens, elegir mapa activo, ocultar/revelar tokens, notas privadas. No puede: combate, bitácora, mover tokens, niebla, `dm_events`. En `ended` todo es solo lectura; el DM solo puede reabrir (→ `paused`).
- **D8** Hoja de personaje: la edita su dueño en cualquier estado. El DM conserva `hp`/`inspiration` (descansos y botones de PG del panel) **solo con la partida `active`**.
- **D9** Imágenes de mapa por URL externa `https://`. Monstruos con carga manual. 5 ft por celda. Niebla con rectángulos en v1, polígonos en Fase 5.
- **D10** Modo local (sin Firebase configurado): las funciones VTT nuevas muestran "Requiere iniciar sesión con cuenta" y no tienen fallback en localStorage.
- **D11** Tests: `pnpm test` (`node --test tests/*.test.mjs`; Node importa `.ts` directo, así que las utilidades puras no usan `enum` ni sintaxis TS que no se pueda "strippear") y `pnpm test:rules` (emuladores, requiere Java).
- **D12** Decisión no cubierta: la más simple dentro de la cuota gratuita y extensible, anotada con `// DECISION:` en el código.
- **D13** RTDB vive bajo `/rooms/{roomId}`, donde `roomId` es un id aleatorio de 20 caracteres guardado en `campaigns/{cid}.liveRoomId` (solo los miembros lo leen). Motivo: las reglas de RTDB no ven Firestore, y los ids de campaña (`slug-xxxx`) se pueden adivinar; con un id secreto nadie puede "reclamar" la sala antes que el DM. Si cambia el DM, el nuevo DM genera otra sala.

### Mapa de rutas RTDB (spec → implementación)

| Spec | Implementación |
| --- | --- |
| — | `/rooms/{roomId}/meta = { dm: uid, cid: string }` |
| `/members/{cid}/{uid}` | `/rooms/{roomId}/members/{uid} = true` |
| `/status/{cid}` | `/rooms/{roomId}/status = 'active' \| 'paused' \| 'ended'` |
| — (necesario para validar dueño) | `/rooms/{roomId}/tokenOwners/{mid}/{tid} = uid` |
| `/live/{cid}/{mid}/{tid}` | `/rooms/{roomId}/live/{mid}/{tid} = { x, y, by }` |
| `/presence/{cid}/{uid}` | `/rooms/{roomId}/presence/{uid} = { name, online, lastSeen }` |
| — (Fase 5, ping) | `/rooms/{roomId}/pings/{mid}/{pingId} = { x, y, by, at }` |

## Comandos de verificación

```bash
pnpm test          # tests unitarios (node:test)
pnpm test:rules    # reglas Firestore + RTDB en el emulador (requiere Java)
pnpm build         # astro build estático, sin errores
pnpm emulators     # para la prueba manual con dos navegadores
```

Prueba manual estándar: navegador A (DM) y navegador B en ventana privada (jugador) contra los emuladores (`PUBLIC_USE_EMULATORS=true`), ambos miembros de la misma campaña.
