# Plan Fase B — Aviso de turno (T-62 … T-65)

Spec: `docs/Specs/02-mesa-viva.spec.md`, sección *1. Aviso de turno* y RF-60 a RF-66.

## 1. Contexto y objetivo

En la mesa física, el jugador tiene abierta su **hoja** (`/campaigns`), no la vista de partida. Hoy solo `InitiativeList` (en `/partida`) sabe si es "tu turno", con lógica inline. Esta fase:

- Saca esa lógica a funciones puras compartidas.
- Crea un servicio de avisos (banner, vibración, sonido, título que parpadea) reutilizable.
- Monta un notificador global en la hoja y en la partida, que avisa cuando es tu turno y cuando sos el siguiente.
- Agrega preferencias por dispositivo, incluida "pantalla siempre encendida".

Al terminar, con el jugador en su hoja y el DM avanzando el turno, el celular del jugador muestra "¡Tu turno, Thorin!", vibra y suena.

## 2. Prerrequisitos verificables

| Debe existir | Cómo comprobarlo |
| --- | --- |
| Combate con `turnIndex`, `round`, `combatants[]` (`ownerUid`, `characterId`) | `src/scripts/models/combat.ts` |
| `subscribeCombat(cid, cb)` con un solo listener por campaña | `src/scripts/data/combatService.ts:86` |
| Lógica inline de "mi turno" | `src/components/party/InitiativeList.astro:246-261` |
| `campaignStore.getMyCharacterForCampaign(cid)` e `isCurrentUserDm(cid)` | `src/scripts/state/campaignStore.ts:1006` |
| Evento `session-status-changed` | `src/scripts/data/sessionStatusService.ts` |
| Header compartido | `src/components/layout/Header.astro`, montado en `campaigns.astro` y `partida.astro` |
| anime.js | `package.json` |

## 3. Decisiones vigentes

- **D1/D2/D4/D11/D12** (ver README).
- **M1** Montar en `campaigns.astro` y `partida.astro`.
- **M2** Preferencias en `localStorage`, deduplicación en `sessionStorage`, todo con `try/catch`.
- **M3** `alerts.ts` es el único punto que muestra banners, vibra o suena.

Decisiones propias:

- **FB-1** La campaña del notificador: en `/partida`, el `?id=` de la URL; en `/campaigns`, `campaignStore.getActiveCampaignId()`. Escucha `active-campaign-changed` para cambiar de suscripción.
- **FB-2** El DM no recibe avisos de turno (`isCurrentUserDm(cid)`).
- **FB-3** Deduplicación por clave `turnKey = round:turnIndex:combatantId`. Al recargar en medio del propio turno, se muestra el banner **sin** vibración ni sonido (la clave ya está en `sessionStorage`). La primera respuesta de `subscribeCombat` después de cargar la página también cuenta: si ya es tu turno, se muestra el banner.
- **FB-4** Sonido con Web Audio: un acorde corto de dos notas generado con `OscillatorNode` (sin archivos). El `AudioContext` se crea y se reanuda en el primer `pointerdown` o `keydown` de la página.
- **FB-5** Vibración: turno `[120, 60, 240]`; siguiente `[60]`.
- **FB-6** Si `navigator.vibrate` o `navigator.wakeLock` no existen, los controles correspondientes se ocultan.

## 4. Modelo de datos

Sin cambios en Firestore. Preferencias locales:

```ts
// localStorage 'turnAlerts.v1'
export interface TurnAlertPrefs {
  enabled: boolean;     // true
  vibrate: boolean;     // true
  sound: boolean;       // true (decisión de la spec: mostrar el potencial)
  nextUp: boolean;      // true
  keepAwake: boolean;   // false
}
```

Funciones puras nuevas en `src/scripts/vtt/initiative.ts`:

```ts
export interface TurnViewer { uid: string; characterIds: string[]; characterNames: string[] }

/** ownerUid si el combatiente lo tiene; si no, characterId; el nombre solo como último recurso. */
export function isOwnedBy(c: Combatant, viewer: TurnViewer): boolean;

/** `${round}:${turnIndex}:${combatantId}`, o null si no hay combate activo o la lista está vacía. */
export function turnKey(combat: Combat | null): string | null;

/** Índice y ronda del siguiente turno (misma lógica que nextTurn, sin construir el combate). */
export function peekNext(combat: Combat): { index: number; round: number } | null;

/** 'mine' si el turno actual es del viewer; 'next' si lo es el siguiente; null si no. */
export function turnRelation(
  combat: Combat | null,
  viewer: TurnViewer
): { kind: 'mine' | 'next'; combatant: Combatant; key: string } | null;

/** Solo por ownerUid (es lo que validan las reglas, Fase C). */
export function canEndTurn(combat: Combat | null, uid: string): boolean;
```

Preferencias puras en `src/scripts/ui/alertPrefs.ts`:

```ts
export const DEFAULT_PREFS: TurnAlertPrefs;
export function parsePrefs(raw: string | null): TurnAlertPrefs;   // JSON inválido o campos faltantes → defaults
```

## 5. Archivos

**Crear**
- `src/scripts/ui/alertPrefs.ts` (puro)
- `src/scripts/ui/alerts.ts`
- `src/scripts/ui/wakeLock.ts`
- `src/components/party/TurnNotifier.astro`
- `src/components/layout/AlertPrefsMenu.astro`
- `tests/turn_relation.test.mjs`
- `tests/alert_prefs.test.mjs`

**Modificar**
- `src/scripts/vtt/initiative.ts`: funciones de la sección 4.
- `src/components/party/InitiativeList.astro`: reemplazar la lógica inline de `isMyTurn` por `isOwnedBy`.
- `src/components/layout/Header.astro`: botón campana que abre `AlertPrefsMenu`.
- `src/pages/campaigns.astro` y `src/pages/partida.astro`: montar `<TurnNotifier />`.

## 6. Pasos por tarea

### T-62 — Funciones puras (RF-65)

1. Implementar las funciones de la sección 4. `turnRelation` usa `turnKey` para la clave y `peekNext` para el siguiente.
2. Caso especial: si el viewer es dueño del actual **y** del siguiente (dos combatientes seguidos), devuelve `mine`.
3. En `InitiativeList.astro`, construir el `TurnViewer` con `getMyCharacterForCampaign` (o `characterStore.get()` como hoy) y usar `isOwnedBy` donde se calcula `isMyTurn` y la marca de "tu combatiente". El comportamiento visible no cambia.

### T-63 — `alerts.ts` (servicio reutilizable)

API:

```ts
export function getPrefs(): TurnAlertPrefs;
export function setPrefs(patch: Partial<TurnAlertPrefs>): void;   // dispara 'alert-prefs-changed'
export function canVibrate(): boolean;
export function showBanner(opts: {
  title: string; subtitle?: string; icon?: string;
  tone: 'turn' | 'next' | 'whisper';
  timeoutMs?: number;                // 6000 por defecto; 0 = no se cierra solo
  actions?: { label: string; onClick: () => void }[];
}): () => void;                      // devuelve "cerrar"
export function buzz(kind: 'turn' | 'next' | 'whisper'): void;   // respeta prefs.vibrate
export function chime(kind: 'turn' | 'next' | 'whisper'): void;  // respeta prefs.sound
export function flashTitle(text: string): void;                  // alterna document.title hasta 'focus'
```

- **Banner:** un `div` fijo arriba (`fixed top-3 inset-x-3 z-[95]`), creado una sola vez y reutilizado. Entra con anime.js (`translateY` y `opacity`, 350 ms) y se cierra al tocarlo o a los `timeoutMs`. Si llega un banner nuevo, reemplaza al anterior. Tonos: `turn` ámbar, `next` gris azulado, `whisper` violeta (como `to_dm`).
- **Desbloqueo de audio (FB-4):** un `pointerdown`/`keydown` en `window`, con `{ once: true }`, crea o reanuda el `AudioContext`.
- **`chime`:** dos osciladores (`turn`: 660 Hz → 880 Hz; `next`: una nota suave; `whisper`: 520 Hz → 390 Hz), cada uno con envolvente de ganancia de unos 150 ms. Si el contexto está suspendido, no hace nada (no lanza error).
- **`flashTitle`:** guarda el título original, alterna cada 1 s y lo restaura con `window.focus` o `visibilitychange` a `visible`.

### T-64 — `TurnNotifier.astro` (RF-60 a RF-63)

1. Solo actúa si `cloudSession.isCloud()` o hay un combate local, y el usuario **no** es el DM de la campaña (FB-2).
2. Resolver la campaña (FB-1) y llamar a `subscribeCombat(cid, onCombat)`. Cancelar y volver a suscribir al cambiar de campaña.
3. `onCombat(combat)`:
   - `rel = turnRelation(combat, viewer)`.
   - Si `rel?.kind === 'mine'`:
     - Si `rel.key` es nuevo (no está en `sessionStorage` `turnAlerts.seen`): `showBanner({ title: '¡Tu turno, {nombre}!', tone: 'turn' })`, `buzz('turn')`, `chime('turn')`, y `flashTitle('⚔️ ¡Tu turno!')` si `document.hidden`. Guardar la clave.
     - Si ya estaba (recarga): solo `showBanner` (FB-3).
     - En los dos casos, mostrar la **barra de turno** (paso 4).
   - Si `rel?.kind === 'next'` y `prefs.nextUp` y la clave es nueva: toast pequeño "Sos el siguiente ({nombre})" con `showBanner({ tone: 'next', timeoutMs: 3000 })` y `buzz('next')`.
   - Si no es mi turno: ocultar la barra.
   - `turnAlerts.seen` guarda como máximo las últimas 50 claves.
4. **Barra de turno:** fija abajo (`fixed bottom-3 inset-x-3 z-[80]`, por encima del FAB de la bitácora; ajustar si se superpone con `QuickJournalFab`), con "⚔️ Tu turno · {nombre}". En esta fase no tiene botón: la Fase C le agrega "Terminar turno". Dejar un contenedor `#turn-bar-actions` vacío.
5. Si `prefs.enabled` es `false`, no muestra nada (ni banner ni barra).

### T-65 — Preferencias y pantalla encendida (RF-64, RF-66)

1. `AlertPrefsMenu.astro`: popover que se abre desde un botón campana (`notifications`) en el `Header`, con cinco interruptores (sección 4). Usa `getPrefs`/`setPrefs`. Oculta "Vibración" si `!canVibrate()` y "Pantalla siempre encendida" si `!('wakeLock' in navigator)`. Incluye una nota corta de limitaciones: "En iPhone no hay vibración. El sonido se activa después del primer toque en la página".
2. Botón "Probar aviso" en el popover: dispara un banner, una vibración y un sonido de ejemplo (sirve, además, para desbloquear el audio).
3. `wakeLock.ts`:
   ```ts
   export function initKeepAwake(getStatus: () => SessionStatus | null): void;
   ```
   - Pide `navigator.wakeLock.request('screen')` cuando `prefs.keepAwake && status === 'active' && document.visibilityState === 'visible'`.
   - Lo suelta (`sentinel.release()`) si cambia cualquiera de las tres condiciones.
   - Reevalúa en `alert-prefs-changed`, `session-status-changed` y `visibilitychange`.
   - Los errores (por ejemplo, batería baja) se ignoran con `console.warn`.
4. Llamar a `initKeepAwake` desde `TurnNotifier` (que ya conoce la campaña y su estado).

## 7. Tests

**`tests/turn_relation.test.mjs`**:
- `isOwnedBy`: por `ownerUid`; sin `ownerUid` pero con `characterId`; solo por nombre; `ownerUid` de otro con el mismo nombre → `false`.
- `turnKey`: combate inactivo o vacío → `null`.
- `peekNext`: en el medio, en el último (vuelve a 0, ronda +1), con un solo combatiente.
- `turnRelation`: mío, siguiente, siguiente en la ronda nueva (soy el primero y el turno está en el último), dos combatientes míos seguidos, nada.
- `canEndTurn`: dueño por `ownerUid` → `true`; coincidencia solo por `characterId` o nombre → `false`.

**`tests/alert_prefs.test.mjs`**:
- `parsePrefs(null)` → defaults (con `sound: true` y `keepAwake: false`).
- JSON inválido → defaults.
- Campos faltantes se completan; campos desconocidos se ignoran.

No hay reglas nuevas.

## 8. Verificación

1. `pnpm test` y `pnpm build`.
2. Manual (DM en la PC en `/campaigns`; jugador en un celular Android en `/campaigns`, con la hoja abierta; partida `active`):
   1. El jugador toca la página una vez (desbloquea el audio).
   2. El DM avanza hasta el combatiente anterior al del jugador: aparece "Sos el siguiente".
   3. El DM avanza al del jugador: banner "¡Tu turno, …!", vibración y sonido, y la barra de turno abajo.
   4. Recargar el celular: aparece el banner sin vibrar ni sonar.
   5. El DM avanza: la barra desaparece.
   6. Desactivar el sonido en la campana y repetir: vibra pero no suena.
   7. Activar "Pantalla siempre encendida": el celular no se apaga durante 5 minutos sin tocarlo. Pausar la partida: vuelve a apagarse normalmente.
   8. El DM no ve banners en su propio navegador.
3. En `/partida` el comportamiento es el mismo y la lista de iniciativa sigue marcando el combatiente propio.
4. En la pestaña Network o en el emulador, sigue habiendo **un solo** listener de `combat/current` por pestaña.

## 9. Fuera de alcance

- Notificaciones push con la app cerrada.
- El botón "Terminar turno" (Fase C).
- Avisos de susurros (Fase D, que reutiliza `alerts.ts`).

## 10. Checklist de cierre

- [ ] T-62 … T-65 marcadas en la spec.
- [ ] `// DECISION:` para FB-1, FB-3 y FB-4.
- [ ] `InitiativeList` usa `isOwnedBy`, sin lógica duplicada.
- [ ] Tests verdes y build estático OK.
