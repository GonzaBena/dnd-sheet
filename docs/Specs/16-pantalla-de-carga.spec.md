# Spec 16: Pantalla de Carga (Splash) — dnd.gonzabena.com.ar

Nov 17, 2026 · @Gonzalo Benavente · **Estado: Implementado**

Pulido transversal, fuera de la secuencia H/M del [roadmap](../ROADMAP.md). No depende de ninguna etapa abierta y no bloquea ninguna; es chica (S–M) y puede entrar entre H4 y H5.

---

## Objetivo y Alcance

Que **al abrir la app no se vean tarjetas, íconos ni secciones apareciendo de a una** mientras se resuelve la sesión y llegan los datos. En su lugar, una **pantalla de carga** con la identidad de *Crónicas del Aventurero* cubre la página desde el primer pintado y se retira con un fundido **una sola vez**, cuando la vista ya está en su estado final.

Al cerrar esta etapa:
1. Un usuario que ya inició sesión y entra a `/`, `/campaigns` o `/partida` ve el splash y, al irse, el tablero, la hoja o la mesa **ya completos**: sin estado vacío intermedio ("no tenés campañas"), sin tarjetas que aparecen tarde y sin nombres de íconos en texto (`swords`, `favorite`) antes de que cargue la fuente.
2. Un visitante nuevo entra a la landing **sin splash** (Regla de Oro: la propuesta de valor se ve al instante).
3. Si algo falla o tarda demasiado, el splash **nunca queda trabado**: se retira solo y la página muestra sus avisos de error habituales.

---

### Dentro del Alcance (v1)

1. **Splash en el HTML estático** de `BaseLayout`, visible desde el primer pintado (sin esperar al JS de módulos).
2. **Decisión temprana de mostrarlo** con un script inline en `<head>`, según página y sesión recordada.
3. **Módulo `bootSplash`** con un registro de "esperas" (`hold`/`release`) que cada página declara, y una decisión pura de cuándo retirarlo.
4. **Espera de la fuente de íconos** (Material Symbols) con tope de tiempo.
5. **Tiempo mínimo y máximo** de visualización, y **failsafe inline** independiente de los módulos.
6. **Integración en las tres páginas con datos:** `index.astro` (tablero), `campaigns.astro` (hoja / grimorio del DM) y `partida.astro` (mesa).
7. **Accesibilidad:** `role="status"`, contenido detrás marcado como `inert` + `aria-busy`, y sin animación con `prefers-reduced-motion`.

---

### Fuera del Alcance (v1)

- *Skeletons* por tarjeta o por sección (la v1 oculta todo detrás del splash; los skeletons pueden venir después para cambios dentro de la página).
- Barra de progreso real por colección de Firestore.
- Transiciones entre páginas (View Transitions) y caché offline / service worker.
- Splash en páginas sin datos (`/privacidad`, `/terminos`, `/test/*`).
- Reescribir los cargadores internos existentes (`#campaigns-workspace-loading`, `#party-loading`, `#auth-loading`): se conservan para estados posteriores a la primera carga.

---

## Usuarios y Beneficios

| Rol | Beneficio Concreto |
| --- | --- |
| **Jugador** | Abre su hoja desde el celular en la mesa y la ve armada de una vez, sin saltos que le hagan tocar el botón equivocado. |
| **Dungeon Master** | El grimorio y la mesa aparecen completos; no hay un instante en que parezca que "se perdieron" las campañas. |
| **Visitante nuevo** | La landing sigue cargando instantánea, sin pantallas intermedias. |
| **Marketing** | Primera impresión prolija en demos y capturas; mejor CLS (*Cumulative Layout Shift*). |

---

## Estado Actual del Repo (Punto de Partida)

| Área | Estado Actual | Ubicación |
| --- | --- | --- |
| **Sesión en la nube** | `cloudSession.state` pasa por `'loading'` → `'ready'` / `'signed-out'` / `'local'`. `'ready'` se fija **después** de `subscribeBase()` (primeros snapshots de campañas y personajes). Red de seguridad de 20 s en `ready()`. | `src/scripts/data/cloudSync.ts:34`, `:120-170`, `:258`, `:314` |
| **Tablero (`/`)** | Si `dnd_cloud_authed === '1'`, muestra el tablero **como si estuviera listo** antes de que lleguen los datos (para evitar el parpadeo de la landing). `renderView()` corre al cargar y en cada `campaigns-updated` / `all-characters-updated`: las tarjetas de campaña se pintan vacías o desde caché local y luego se rearman. | `src/pages/index.astro:1130-1250`, `:491`, `:1336-1342` |
| **Hoja (`/campaigns`)** | Spinner propio "Conectando con el espacio de juego…" que se oculta en `updateWorkspaceMode()`, tras `cloudSession.ready()`. Las secciones (HeroCard, VitalsGrid, Abilities…) se renderizan en el HTML estático con valores por defecto y luego se rellenan → saltos. | `src/pages/campaigns.astro:80-86`, `:313`, `:424` |
| **Mesa (`/partida`)** | Spinner propio `#party-loading` y `#party-content` oculto hasta tener datos. | `src/components/party/PartyView.astro:41-47`, `:361` |
| **Auth** | `AuthGate` tiene su propio estado `#auth-loading` dentro del modal. | `src/components/auth/AuthGate.astro:29`, `:194-197` |
| **Íconos** | Material Symbols se carga con `display=swap`: mientras baja la fuente se ven las ligaduras como texto. | `src/layouts/BaseLayout.astro:58-60` |
| **Movimiento reducido** | Ya se respeta en `tabs.ts` y `StepRail`. | `src/scripts/ui/tabs.ts:14`, `src/components/ui/StepRail.astro:52` |

---

## Stack, Restricciones y Reglas de Arquitectura

Se aplican las reglas del proyecto y del roadmap:
1. **Cero lecturas extra de Firestore.** El splash solo escucha eventos y promesas que ya existen (`cloudSession.ready()`, `cloud-session-changed`, `cloud-error`, `campaigns-updated`). No agrega listeners ni consultas.
2. **Regla de Oro.** La landing para visitantes sin sesión **no** muestra splash ni se demora.
3. **Primer pintado sin JS de módulos.** El markup y su CSS crítico van inline en `BaseLayout`; la decisión de mostrarlo es un script inline bloqueante y mínimo (< 1 KB) en `<head>`.
4. **Nunca trabado.** Hay un tope duro inline (no depende de que carguen los módulos) y un tope blando en el módulo.
5. **Funciones puras y testeables.** La decisión de "¿mostrar?" y "¿retirar?" vive en `src/scripts/ui/bootSplash.ts` como funciones puras, con tests en `tests/bootSplash.test.mjs` (`node --test`).
6. **Sin dependencias nuevas.** CSS + TypeScript propio; logo desde `public/favicon.svg`.

---

## 1. Modelo de Datos y Contratos (TypeScript)

### 1.1 Decisión de mostrar (inline en `<head>`)

```ts
// Réplica inline (sin imports) de esta función pura, que vive en bootSplash.ts para testearla.
export type SplashPage = 'home' | 'sheet' | 'party' | 'none';

export function shouldShowSplash(input: {
  page: SplashPage;            // prop de BaseLayout: splash={'home'|'sheet'|'party'} (default 'none')
  wasAuthed: boolean;          // localStorage 'dnd_cloud_authed' === '1'
  isDemo: boolean;             // ?demo=1 o 'dnd_demo_mode' === '1'
  forceLanding: boolean;       // ?landing=1
}): boolean {
  if (input.page === 'none') return false;
  if (input.page === 'home') return !input.forceLanding && (input.wasAuthed || input.isDemo);
  return true; // hoja y mesa siempre esperan datos
}
```

Si devuelve `true`, el script agrega `data-booting` a `<html>`; el CSS muestra `#boot-splash` solo con ese atributo. Si devuelve `false`, el splash nunca se pinta.

### 1.2 Registro de esperas y decisión de retirar

```ts
export type HoldKey = 'session' | 'view' | 'icons';

export interface SplashState {
  holds: Set<HoldKey>;  // esperas pendientes
  shownAt: number;      // performance.now() del primer pintado
  now: number;
}

export const SPLASH_MIN_MS = 300;    // evita un "flash" si todo ya estaba en caché
export const SPLASH_SOFT_MAX_MS = 8000;  // tope del módulo: se retira aunque falten esperas
export const SPLASH_HARD_MAX_MS = 12000; // tope inline: se retira aunque el módulo no haya cargado
export const ICONS_MAX_MS = 1500;        // la fuente de íconos no puede retener más que esto

export function shouldDismiss(s: SplashState): boolean {
  const elapsed = s.now - s.shownAt;
  if (elapsed >= SPLASH_SOFT_MAX_MS) return true;
  return s.holds.size === 0 && elapsed >= SPLASH_MIN_MS;
}

// API del módulo
export const bootSplash: {
  hold(key: HoldKey): void;
  release(key: HoldKey): void;
  dismiss(reason: 'ready' | 'timeout' | 'error'): void; // idempotente
};
```

### 1.3 Esperas por página

| Página | `session` se libera cuando… | `view` se libera cuando… |
| --- | --- | --- |
| `/` (tablero) | `cloudSession.ready()` resuelve (o `'local'`) | el primer `renderView()` **posterior** a `ready()` terminó de pintar las tarjetas |
| `/campaigns` (hoja) | `cloudSession.ready()` resuelve | `updateWorkspaceMode()` dejó visible el workspace correcto (DM o jugador) y el personaje cargado |
| `/partida` (mesa) | `cloudSession.ready()` resuelve | `#party-content` (o un aviso `party-*-notice`) quedó visible |

`icons` es común: se libera con `document.fonts.load('24px "Material Symbols Outlined"')` o a los `ICONS_MAX_MS`, lo que ocurra primero.

---

## 2. Requisitos Funcionales

### RF-600: Primer pintado con splash
Con `data-booting`, `#boot-splash` cubre todo el viewport (`position: fixed; inset: 0; z-index` por encima de modales y AuthGate) desde el primer pintado, con fondo `#0a0d12`, el logo, el nombre *Crónicas del Aventurero* y una frase corta de estado. El `<body>` no hace scroll mientras está activo.

### RF-601: Landing sin splash para visitantes
En `/` sin sesión recordada, sin demo, o con `?landing=1`, el splash no se muestra y el comportamiento actual de `syncLandingVsDashboard` no cambia.

### RF-602: Retiro único cuando la vista está lista
El splash se retira **una sola vez**, con un fundido de 200 ms, cuando `shouldDismiss` da `true`. Después de retirado se quita del DOM; eventos posteriores (`campaigns-updated`, cambios de sesión) no lo vuelven a mostrar.

### RF-603: Sin estados intermedios visibles
Mientras el splash está activo, los cargadores internos (`#campaigns-workspace-loading`, `#party-loading`, `#auth-loading`) pueden existir pero no se ven, y el estado vacío del tablero ("crear tu primera campaña") no se muestra si la sesión todavía está en `'loading'`.

### RF-604: Íconos sin texto crudo
La fuente de Material Symbols pasa a `display=block`, y el splash espera la espera `icons` (máx. 1,5 s). Al retirarse no debe verse ninguna ligadura como texto.

### RF-605: Topes y failsafe
- Tope blando (módulo, 8 s): se retira con `reason: 'timeout'` y se registra `console.warn('[BootSplash] …')` con las esperas pendientes.
- Tope duro (inline, 12 s): quita `data-booting` aunque el módulo no haya cargado (error de red, excepción en un `<script>`).
- `cloud-error` y `signed-out` liberan todas las esperas: la página queda en su estado de error / login normal, y el AuthGate se ve sin el splash encima.

### RF-606: Accesibilidad
`#boot-splash` tiene `role="status"` y `aria-live="polite"` con el texto de estado. El contenido principal lleva `inert` y `aria-busy="true"` mientras el splash está activo, y se le quitan al retirarlo. Con `prefers-reduced-motion: reduce` no hay animación del logo ni fundido (el retiro es inmediato).

### RF-607: Frases de carga
El texto de estado rota cada ~1,5 s entre frases cortas con tono de mesa ("Tirando iniciativa…", "Afilando espadas…", "Desenrollando el mapa…"). Con movimiento reducido se muestra una sola frase fija.

---

## 3. Riesgos y Decisiones Abiertas

| # | Tema | Recomendación |
| --- | --- | --- |
| D1 | **¿Splash también para el usuario con sesión en `/`?** Hoy se muestra el tablero "optimista". | Sí: es justo donde más se nota el *pop* de tarjetas. |
| D2 | **Tiempo mínimo de 300 ms.** Podría sentirse como demora artificial con caché caliente. | Mantener 300 ms: menos que eso se percibe como parpadeo. Revisar tras la prueba manual. |
| D3 | **`display=block` en íconos** puede dejar huecos invisibles hasta 3 s en páginas sin splash (landing). | Aceptable: en la landing hay pocos íconos y el hueco es preferible al texto crudo. Alternativa: precargar la fuente con `<link rel="preload">`. |
| D4 | **Splash tapando errores**: si `handleSignIn` tarda (migración local grande), el usuario ve el splash hasta 8 s. | Tras 4 s, cambiar la frase a "Sincronizando tus datos…" para que no parezca colgado. |
| R1 | Script inline en `<head>` y CSP futura. | Hoy no hay CSP; si se agrega, usar hash del script inline. |
| R2 | Tests E2E que esperan selectores visibles al instante. | Hacer que `tests/run_e2e_browser.py` espere a que `html:not([data-booting])` antes de interactuar. |

---

## 4. Plan de Trabajo por Fases

| Fase | Contenido | Tamaño |
| --- | --- | --- |
| **A · Núcleo** | `bootSplash.ts` (funciones puras + API), tests `tests/bootSplash.test.mjs`, markup + CSS crítico en `BaseLayout`, prop `splash`, script inline de decisión y failsafe. | S |
| **B · Integración** | `hold`/`release` en `index.astro`, `campaigns.astro` y `PartyView.astro`; evitar el estado vacío del tablero en `'loading'`; liberar en `cloud-error` / `signed-out`. | M |
| **C · Íconos y pulido** | `display=block` (o preload) de Material Symbols, espera `icons`, frases rotativas, movimiento reducido, `inert`/`aria-busy`. Ajuste de E2E y medición de CLS. | S |

---

## 5. Criterios de Aceptación y Checklist de Cierre

- [x] `node --test tests/bootSplash.test.mjs` verde: `shouldShowSplash` cubre landing nueva / con sesión / demo / `?landing=1` / hoja / mesa / legales; `shouldDismiss` cubre mínimo, esperas pendientes y tope blando.
- [x] Build estático limpio (`astro build`).
- [x] En `/` con sesión: no se ve nunca el estado vacío del tablero ni tarjetas que aparecen tarde.
- [x] En `/campaigns`: al retirarse el splash, la hoja ya tiene el personaje real (sin valores por defecto que cambian).
- [x] En `/partida`: al retirarse, se ve la mesa o el aviso correspondiente, no el spinner interno.
- [x] Landing sin sesión: sin splash y sin demora perceptible respecto de hoy.
- [x] Sin red / Firebase caído: el splash se retira solo (≤ 12 s) y se ve el error o el login.
- [x] Ninguna ligadura de Material Symbols visible como texto al retirarse.
- [x] Lector de pantalla anuncia la carga; con `prefers-reduced-motion` no hay animaciones.
