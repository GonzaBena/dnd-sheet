# Plan Fase E — Panel de efectos activos y cierre (T-249 … T-251)

Spec: `docs/Specs/07-cimientos-de-la-hoja.spec.md`, sección *5. Panel de efectos activos* y RF-243, RF-244, RF-254, RF-257, RF-258.

## 1. Contexto y objetivo

Las fases anteriores dejan el motor de efectos (B), el catálogo (C) y los modales (D), pero sin una pantalla que los junte. Esta fase:

- Agrega el **panel de efectos activos** a la hoja.
- Permite **aplicar un efecto** desde un hechizo o una dote.
- Agrega la UI mínima para **crear y gastar recursos**, que la Fase A dejó sin pantalla.
- Cierra la etapa con la pasada de criterios de aceptación.

Al terminar se cumple el criterio de cierre de H1: se agrega un objeto propio y uno del catálogo, ambos se abren en el modal, y un efecto con duración aparece y expira en el panel.

## 2. Prerrequisitos verificables

| Debe existir | Cómo comprobarlo |
| --- | --- |
| Fase B completa (`applyEffect`, `endEffect`, evento `effects-expired`) | `characterStore.ts`, `src/scripts/dnd/effects.ts` |
| Fase A completa (acciones de recursos) | `characterStore.ts` |
| Fase D completa (`spell-action`, `item-action`, `apply-effect`) | `src/scripts/ui/detailModals.ts` |
| Toasts | evento `cloud-toast` o `showAlert` en `src/scripts/ui/notify.ts` |
| Hoja y su layout | `src/pages/campaigns.astro`, componentes de `src/components/character/` |
| Ancla visible para el panel | `src/components/character/VitalsGrid.astro` (CA, PG, iniciativa) |

## 3. Decisiones vigentes

- **D1/D2/D4/D11/D12** y **H1-1 a H1-6** (ver README).

Decisiones propias:

- **FE-1** El panel se monta **bajo la fila de signos vitales** (`VitalsGrid`). En móvil, es una franja que se desplaza en horizontal; en escritorio, ocupa una fila propia. Si no hay efectos, no ocupa espacio.
- **FE-2** Cada chip muestra nombre, origen (icono por `sourceType`) y duración restante (`describeDuration`). Tocar el chip abre una hoja con los modificadores y el botón **Terminar**.
- **FE-3** Los chips se ordenan: concentración primero, luego por rondas restantes ascendente, luego el resto.
- **FE-4** Al llegar el evento `effects-expired`, un toast "Terminó: <nombre>" (varios efectos en un solo toast).
- **FE-5** "Aplicar efecto" desde un hechizo o dote pregunta por la duración **solo si la entrada no la trae**. Si la entrada trae `effects`, se usa la duración que declare el hechizo (campo `duration` de `meta`, interpretado por una función pura `durationFromText`); si no se reconoce, se pregunta.
- **FE-6** Si el efecto es de concentración y ya hay otro activo (`AddResult.replaced`), se muestra `showConfirm` "Ya concentras en X. ¿Reemplazarlo?"; solo con **Sí** se quita el anterior y se agrega el nuevo (RF-243).
- **FE-7** Si la entrada está vinculada a un recurso (`resourceId`), aplicar el efecto **gasta 1** del recurso, y avisa si no queda (RF-244): "Sin usos de X". Con el recurso agotado, no se aplica.
- **FE-8** La UI de recursos: una sección "Recursos" (dentro del panel o junto a él) con una fila por recurso: nombre, `usados/máximo` y botones de gastar y recuperar, más un botón "Nuevo recurso" (nombre, máximo, regla de reinicio). Sin esto, la Fase A no se puede usar.

## 4. Modelo de datos

Sin cambios. Funciones puras nuevas en `src/scripts/dnd/effectFactory.ts`:

```ts
/** Duración declarada en el texto de un hechizo ("1 minuto", "Concentración, hasta 1 hora", "Instantáneo"). */
export function durationFromText(text: string | undefined): EffectDuration | null;

/** Arma un ActiveEffect desde una entrada de catálogo y una duración. */
export function effectFromEntry(entry: CatalogEntry, duration: EffectDuration, now: number): ActiveEffect;

/** Ordena para el panel (FE-3). */
export function sortForPanel(effects: ActiveEffect[]): ActiveEffect[];
```

Reglas de `durationFromText` (español e inglés del SRD):

| Texto | Resultado |
| --- | --- |
| "Instantáneo" / "Instantaneous" | `null` (no genera efecto) |
| "Concentración, hasta 1 minuto" / "Concentration, up to 1 minute" | `{ kind: 'concentration' }` |
| "1 minuto" / "1 minute" | `{ kind: 'rounds', remaining: 10 }` |
| "1 hora" o más | `{ kind: 'untilRest', rest: 'long' }` |
| "Hasta disipar" / "Until dispelled" | `{ kind: 'indefinite' }` |
| otro | `null` (se pregunta) |

## 5. Archivos

**Crear**
- `src/components/character/ActiveEffectsPanel.astro`
- `src/components/character/ResourcesSection.astro`
- `src/scripts/dnd/effectFactory.ts` (puro)
- `tests/effect_factory.test.mjs`

**Modificar**
- `src/pages/campaigns.astro` (o el componente que arma la hoja): montar el panel bajo `VitalsGrid`.
- `src/scripts/ui/detailModals.ts` y las listas: atender `apply-effect` y `cast` (con efecto).
- `src/components/modals/EditFeaturesModal.astro` o la lista de rasgos: botón "Activar" para dotes `active` con efectos.
- `docs/Specs/07-cimientos-de-la-hoja.spec.md`: marcar tareas y criterios.
- `docs/ROADMAP.md`: estado de la Spec 07.

## 6. Pasos por tarea

### T-249 — `ActiveEffectsPanel` (RF-257)

1. Componente que escucha `character-changed` (o el evento del store) y re-renderiza los chips con `sortForPanel`.
2. Chip: icono por origen, nombre, duración restante. Tocarlo abre una hoja con la lista de modificadores en texto legible (`ac +2`, `ventaja en salvaciones de DES`) y el botón **Terminar** (`endEffect`).
3. Estado vacío: el componente queda oculto (`hidden`).
4. Escuchar `effects-expired` y mostrar el toast (FE-4).
5. `ResourcesSection.astro` (FE-8): filas con `usados/máximo`, botones − y +, "Nuevo recurso" con un formulario (`showForm` de `notify.ts`) y botón de borrar con confirmación.
6. Todo texto de usuario con `textContent` (FD-7).

### T-250 — Aplicar un efecto (RF-243, RF-244, RF-254)

1. En `detailModals.ts`: `apply-effect` y el lanzamiento de un hechizo con efectos llaman a `applyFromEntry(entry)`.
2. `applyFromEntry`:
   1. Si la entrada tiene `resourceId`, comprobar `remaining > 0` (FE-7); si no, avisar y salir; si sí, `spendResource`.
   2. Duración: `durationFromText(entry.meta.duration)`; si es `null`, preguntar con `showChoice` (rondas / hasta descanso corto / hasta descanso largo / hasta usarse / indefinida) y, si elige rondas, pedir el número.
   3. `effectFromEntry` y `applyEffect`.
   4. Si devuelve `replaced`, `showConfirm` (FE-6); solo con **Sí** se llama a `endEffect(replaced.id)` y se agrega el nuevo.
3. En dotes `active` con efectos, un botón "Activar" en la lista de rasgos que usa el mismo flujo.

### T-251 — Cierre (RF-258)

1. Recorrer los 10 criterios de aceptación de la spec con una persona jugadora real o con el emulador.
2. Comprobar el presupuesto de cuota (sección *Presupuesto de cuota* de la spec): en el emulador, aplicar un efecto, gastar un recurso y avanzar una ronda, y contar las escrituras: una por acción, agrupadas por el debounce.
3. Marcar T-230 … T-251 en la spec; actualizar `docs/ROADMAP.md` (Spec 07 → hecha) y la sección "Preguntas abiertas" (resolver las que sigan abiertas o pasarlas a la Spec 08).
4. Revisar `grep -rn "innerHTML" src/components/character src/components/modals` en los archivos nuevos.

## 7. Tests

`tests/effect_factory.test.mjs`:

- `durationFromText`: cada fila de la tabla de la sección 4; texto vacío y `undefined` devuelven `null`; "10 minutos" → `rounds 100`; "8 horas" → `untilRest long`.
- `effectFromEntry`: copia nombre, `sourceType` según el `kind` (`spell` / `item` / `feat`), `sourceId`, modificadores y `resourceId`; `appliedAt` es el `now` recibido.
- `sortForPanel`: concentración primero; luego rondas ascendente; el resto estable.

La UI se prueba a mano (sección 8). La lógica de efectos y recursos ya la cubren las Fases A y B.

## 8. Verificación

```bash
pnpm test
pnpm test:rules
pnpm build
```

Prueba manual completa (cierre de la etapa), con `pnpm emulators`, un personaje **existente** y el DM en otra ventana con la partida `active`:

1. Abrir el personaje antiguo: nada se perdió.
2. Crear un recurso "Inspiración Bárdica" (3, descanso largo), gastarlo y recuperarlo con un descanso largo.
3. Agregar un objeto propio con imagen y un objeto del SRD; abrir ambos en el modal.
4. Agregar un hechizo propio y uno del SRD; abrir ambos y lanzar uno con espacio de nivel 3 o superior.
5. Aplicar "Bendición" (concentración): aparece el chip al instante.
6. Aplicar un segundo hechizo de concentración: pide confirmación; con **Sí**, reemplaza.
7. Aplicar un efecto de 2 rondas; el DM avanza dos rondas; el chip baja a 1 y desaparece con toast.
8. Recargar la hoja entre rondas: no se descuenta de más.
9. Aplicar un efecto "hasta descanso largo": el corto no lo quita; el largo, sí.
10. Con el DM: intentar escribir `activeEffects` en el personaje desde la consola falla (regla).

## 9. Fuera de alcance

- Que los modificadores cambien CA o tiradas (H2, H4).
- El DM aplicando o quitando efectos (H5).
- Salvación de concentración al recibir daño (H4).
- Tiradas de los dados de golpe y el resumen de descanso (H3).

## 10. Checklist de cierre

- [ ] T-249 … T-251 marcadas en la spec; todas las tareas T-230 … T-251 en `[x]`.
- [ ] Los 10 criterios de aceptación de la spec comprobados.
- [ ] `docs/ROADMAP.md` con la Spec 07 hecha.
- [ ] `pnpm test`, `pnpm test:rules` y `pnpm build` en verde.
