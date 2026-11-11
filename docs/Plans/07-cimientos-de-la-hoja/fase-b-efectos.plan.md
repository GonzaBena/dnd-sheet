# Plan Fase B — Motor de efectos (T-235 … T-239)

Spec: `docs/Specs/07-cimientos-de-la-hoja.spec.md`, sección *2. Efectos activos* y RF-237 a RF-242.

## 1. Contexto y objetivo

La hoja no sabe qué está pasando en el personaje. Esta fase crea el registro de **efectos activos**, las funciones puras que lo manejan y el descuento automático de rondas. Los modificadores se guardan y se pueden reunir con `collectModifiers`, pero ningún cálculo los lee todavía (H1-5).

Al terminar, desde la consola o el store se puede aplicar un efecto de 2 rondas, ver que baja al avanzar el combate y que expira, y que un descanso quita los efectos "hasta el descanso".

## 2. Prerrequisitos verificables

| Debe existir | Cómo comprobarlo |
| --- | --- |
| Fase A completa (`resources`, `resetOn`) | `src/scripts/dnd/resources.ts` |
| `characterStore` con `saveAndNotify()` y descansos | `characterStore.ts:608`, `:636` |
| `subscribeCombat(cid, cb)` con un solo listener por campaña | `src/scripts/data/combatService.ts` |
| Combate con `round` y `turnIndex` | `src/scripts/models/combat.ts` |
| `campaignStore.getActiveCampaignId()` y evento `active-campaign-changed` | `src/scripts/state/campaignStore.ts` |
| Reglas del personaje: el DM no escribe campos nuevos | `firestore.rules:297-301` |

## 3. Decisiones vigentes

- **D1/D2/D4/D11/D12** y **H1-1 a H1-6** (ver README).

Decisiones propias:

- **FB-1** Los efectos viven en `char.activeEffects` y se manipulan **solo** con funciones puras de `effects.ts`; el store las envuelve y guarda.
- **FB-2** Descuento de rondas en el **cliente del dueño** (el DM no escribe el documento del jugador). Se guarda `char.effectsLastRound = { campaignId, round }`.
  - Si `round > effectsLastRound.round` y es la misma campaña: se descuentan `round - lastRound` rondas, y se actualiza la marca.
  - Si la campaña es otra, o no hay marca, o `round < lastRound` (el DM reinició el combate): solo se fija la marca, **sin descontar**.
  - Si el combate termina, no se toca nada: los efectos `rounds` siguen con lo que quedaba.
- **FB-3** Un efecto `rounds` con `remaining <= 0` se elimina. El panel de la Fase E avisa con un toast ("Terminó: Bendición").
- **FB-4** Un descanso corto quita `untilRest: short`. Un descanso largo quita `untilRest: short` y `untilRest: long`.
- **FB-5** `collectModifiers(char, target)` devuelve los modificadores de todos los efectos cuyo `target` coincide exactamente o por prefijo con punto (`save` coincide con `save.dex`). No evalúa `when` (lo hará H4).
- **FB-6** Efecto de concentración: `addEffect` devuelve el efecto de concentración previo (si lo había) en el resultado, para que la UI avise (RF-243); no lo reemplaza por sí solo.

## 4. Modelo de datos

```ts
// src/scripts/models/effect.ts   (ver la spec: EffectDuration, Modifier, ActiveEffect)

// campos nuevos en CharacterData
activeEffects: ActiveEffect[];                              // default []
effectsLastRound?: { campaignId: string; round: number };
```

Funciones puras en `src/scripts/dnd/effects.ts`:

```ts
export interface AddResult { effects: ActiveEffect[]; replaced?: ActiveEffect }

export function addEffect(effects: ActiveEffect[], effect: ActiveEffect): AddResult;
export function removeEffect(effects: ActiveEffect[], id: string): ActiveEffect[];
export function tickRounds(effects: ActiveEffect[], rounds: number): { effects: ActiveEffect[]; expired: ActiveEffect[] };
export function expireOnRest(effects: ActiveEffect[], rest: 'short' | 'long'): { effects: ActiveEffect[]; expired: ActiveEffect[] };
export function collectModifiers(char: { activeEffects?: ActiveEffect[] }, target: string): Modifier[];
export function describeDuration(d: EffectDuration): string;            // "2 rondas", "hasta descanso largo", "concentración"…
export function roundDelta(last: { campaignId: string; round: number } | undefined,
                           current: { campaignId: string; round: number }): number;   // FB-2: 0 si no hay que descontar
```

## 5. Archivos

**Crear**
- `src/scripts/models/effect.ts`
- `src/scripts/dnd/effects.ts` (puro)
- `src/scripts/state/effectsRoundSync.ts` (suscripción al combate, ver T-238)
- `tests/effects.test.mjs`

**Modificar**
- `src/scripts/models/character.ts`: `activeEffects`, `effectsLastRound`.
- `src/scripts/models/defaultCharacter.ts`: `activeEffects: []`.
- `src/scripts/state/characterStore.ts`: acciones de efectos; expiración en los descansos.
- `src/scripts/dnd/calculations.ts`: normalizar `activeEffects` a `[]` si falta (migración trivial).
- `src/pages/campaigns.astro`: iniciar `effectsRoundSync` una vez.

## 6. Pasos por tarea

### T-235 — Tipos y campo (RF-237, RF-238)

1. Crear `effect.ts` con los tipos de la spec.
2. Agregar `activeEffects` y `effectsLastRound` a `CharacterData` y a los valores por defecto.
3. En `recalculateCharacter`, si `activeEffects` no es un array, ponerlo en `[]`.

### T-236 — Funciones puras (RF-241, RF-242)

1. `addEffect`: si el efecto nuevo es `concentration` y ya hay otro, devuelve `replaced` con el anterior **sin** quitarlo (FB-6). Si ya existe un efecto con el mismo `sourceId` y `sourceType`, lo reemplaza (evita duplicados de un mismo hechizo).
2. `removeEffect(effects, id)`: devuelve copia sin ese id.
3. `tickRounds(effects, n)`: resta `n` a los `rounds`; los que llegan a 0 o menos pasan a `expired` y se quitan. Los demás tipos de duración no cambian. `n <= 0` no cambia nada.
4. `expireOnRest`: FB-4.
5. `collectModifiers`: FB-5.
6. `describeDuration`: textos en español, singular y plural ("1 ronda", "2 rondas").
7. `roundDelta`: FB-2. Devuelve 0 si no hay marca, si la campaña cambió o si la ronda retrocedió.

### T-237 — Store y descansos (RF-240)

1. `characterStore`: `applyEffect(effect)` (devuelve `AddResult` para que la UI avise), `endEffect(id)`, `tickEffects(rounds)` (devuelve los expirados), `clearEffects()`. Todas con `saveAndNotify()`.
2. En `shortRest` y `longRest`, después de `resetOn`, llamar a `expireOnRest`. El texto de la bitácora incluye los efectos terminados.
3. Disparar un `CustomEvent` `effects-expired` con `detail.expired` para que la Fase E muestre el toast.

### T-238 — Descuento de rondas (RF-239)

1. `effectsRoundSync.ts`: al iniciar, escucha `active-campaign-changed` y mantiene **una** suscripción con `subscribeCombat(cid, cb)`, comparte el listener existente y no crea otro.
2. En cada snapshot con combate activo: `delta = roundDelta(char.effectsLastRound, { campaignId, round })`.
   - Si `delta > 0`: `tickEffects(delta)` y actualizar `effectsLastRound`.
   - Si `delta === 0` y no hay marca o cambió la campaña: solo fijar la marca.
3. Ignorar los snapshots del propio jugador sin combate, o con la partida `paused`/`ended`.
4. Un solo `saveAndNotify()` por snapshot (agrupar el tick y la marca en una escritura).
5. Si el usuario es el DM de esa campaña, no hacer nada.
6. Anotar con `// DECISION:` la regla de "no descontar si la ronda retrocede".

### T-239 — Tests (todas)

Ver la sección 7.

## 7. Tests

`tests/effects.test.mjs`:

- `addEffect`: agrega; un segundo efecto de concentración devuelve `replaced`; mismo `sourceId` reemplaza.
- `removeEffect`: quita por id; id inexistente no cambia nada.
- `tickRounds`: 3 → 2; 1 → expira; efectos no `rounds` no cambian; `n = 0` no cambia; `n` mayor que lo restante expira.
- `expireOnRest`: el corto quita `short`; el largo quita `short` y `long`; `concentration` e `indefinite` no se tocan.
- `collectModifiers`: coincidencia exacta y por prefijo (`save` → `save.dex`); no coincide `ac` con `acrobatics`.
- `describeDuration`: singular, plural y el resto de los tipos.
- `roundDelta`: sin marca → 0; misma campaña y ronda mayor → diferencia; otra campaña → 0; ronda menor → 0.

## 8. Verificación

```bash
pnpm test
pnpm build
```

Prueba manual (con `pnpm emulators`; la UI llega en la Fase E, así que se usa la consola del navegador):

1. En la consola: `characterStore.applyEffect({...})` con una duración de 2 rondas.
2. Como DM en otra ventana, iniciar el combate y avanzar dos rondas completas: el efecto baja a 1 y luego desaparece, y se emite `effects-expired`.
3. Recargar la hoja entre rondas: no se descuenta dos veces.
4. Aplicar un efecto `untilRest: long`; un descanso corto no lo quita, el largo sí.
5. Reiniciar el combate desde el DM: los efectos no se descuentan.

## 9. Fuera de alcance

- Interfaz del panel y toasts (Fase E).
- Que los modificadores cambien CA o tiradas (H2, H4).
- El DM aplicando efectos (H5).
- Salvación de concentración al recibir daño (H4).

## 10. Checklist de cierre

- [ ] T-235 … T-239 marcadas en la spec.
- [ ] `// DECISION:` en FB-2 (ronda que retrocede) y FB-6.
- [ ] Un solo listener de combate compartido (comprobado en la consola de red del emulador).
- [ ] `pnpm test` y `pnpm build` en verde.
