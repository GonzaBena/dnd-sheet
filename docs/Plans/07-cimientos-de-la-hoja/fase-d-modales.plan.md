# Plan Fase D — Modales genéricos (T-245 … T-248)

Spec: `docs/Specs/07-cimientos-de-la-hoja.spec.md`, sección *4. Modales genéricos* y RF-251 a RF-253, RF-255.

## 1. Contexto y objetivo

Hoy cada lugar muestra los objetos y hechizos a su manera. Esta fase crea **un modal de objeto y uno de hechizo**, que reciben una `CatalogEntry` (Fase C) y sirven en el inventario, el compendio, la hoja, el botín y los handouts. La ficha lleva la imagen arriba a la izquierda y, al lado, título y datos.

Al terminar, tocar cualquier objeto o hechizo abre la misma ficha, con sus botones de acción.

## 2. Prerrequisitos verificables

| Debe existir | Cómo comprobarlo |
| --- | --- |
| Fase C completa (`CatalogEntry`, `toCatalogEntry`, `CustomBadge`) | `src/scripts/dnd/catalog.ts`, `src/components/ui/CustomBadge.astro` |
| Sobre de pergamino reutilizable | `src/scripts/ui/parchmentModal.ts:53` (`showParchment`), `src/components/ui/ParchmentEnvelope.astro` |
| Modales existentes y su patrón de apertura | `src/components/modals/` (abrir con `CustomEvent`, ver `DiceRollerModal` y `RestModal`) |
| Navegador del compendio | `src/components/modals/CompendiumModal.astro` |
| Espacios de conjuro 1–9 | Fase A |
| Handouts con ítems | `src/scripts/models/handout.ts`, `src/scripts/data/handoutService.ts` |

## 3. Decisiones vigentes

- **D1/D2/D4/D11/D12** y **H1-1 a H1-6** (ver README).

Decisiones propias:

- **FD-1** Dos componentes, `ItemDetailModal` y `SpellDetailModal`, que se abren con un `CustomEvent` en `window`: `open-item-detail` y `open-spell-detail`, con `detail: { entry: CatalogEntry; context: DetailContext }`.
- **FD-2** `DetailContext` dice **de dónde** se abrió (`'inventory' | 'spellbook' | 'compendium' | 'loot'`) y define qué botones se ven. Una función pura decide los botones (T-248), así se testea.
- **FD-3** El modal **no** modifica el personaje por sí mismo: dispara eventos de acción (`item-action`, `spell-action`) con `{ entryId, action }` y quien lo abrió los atiende. Así sirve también para el botín, donde "Equipar" no tiene sentido.
- **FD-4** Lanzar un hechizo desde el modal muestra el selector de espacio (niveles desde el del hechizo hasta 9) y llama a `useSpellSlot`. **No valida** componentes ni estado del personaje (H4). Anotar con `// DECISION:`.
- **FD-5** Disposición de la ficha: columna de imagen a la izquierda (96–128 px, sin imagen → icono por tipo), a su derecha título, insignias (`CustomBadge`, rareza) y datos de una línea; debajo, descripción y secciones. En móvil, la imagen queda arriba a la izquierda con el título a su lado, sin apilarse.
- **FD-6** Estilo coherente con el pergamino (fondo y tipografía de `ParchmentEnvelope`), pero **sin** la animación de sobre: el modal es de uso frecuente y debe abrirse al instante.
- **FD-7** Todo texto de usuario (nombre, descripción, efectos) se inserta con `textContent`, nunca con `innerHTML`.

## 4. Modelo de datos

Sin cambios en Firestore. Contratos en `src/scripts/dnd/detailView.ts` (puro):

```ts
export type DetailContext = 'inventory' | 'spellbook' | 'compendium' | 'loot';
export type DetailAction = 'equip' | 'use' | 'give' | 'drop' | 'add' | 'cast' | 'apply-effect' | 'remove';

export interface DetailField { label: string; value: string }

/** Campos de una línea que se muestran bajo el título, según el tipo. */
export function headerFields(entry: CatalogEntry): DetailField[];

/** Secciones de detalle (propiedades, efectos, requisitos…); omite las vacías. */
export function detailSections(entry: CatalogEntry): { title: string; rows: DetailField[] }[];

/** Botones visibles según tipo y contexto. */
export function availableActions(entry: CatalogEntry, ctx: DetailContext): DetailAction[];

/** Niveles de espacio elegibles para lanzar un hechizo. */
export function castableLevels(spellLevel: number, slots: Record<number, { total: number; used: number }>): { level: number; remaining: number }[];
```

Reglas de `availableActions`:

| Tipo \ Contexto | inventory | spellbook | compendium | loot |
| --- | --- | --- | --- | --- |
| item | equip, use, give, drop | — | add | add |
| spell | — | cast, apply-effect, remove | add | — |
| feat | — | — | add | — |

`apply-effect` solo si `entry.effects?.length`. `use` solo si el objeto es consumible (`usableType`).

## 5. Archivos

**Crear**
- `src/components/modals/ItemDetailModal.astro`
- `src/components/modals/SpellDetailModal.astro`
- `src/scripts/dnd/detailView.ts` (puro)
- `src/scripts/ui/detailModals.ts` (abrir y cerrar; escucha los eventos)
- `tests/detail_view.test.mjs`

**Modificar**
- `src/pages/campaigns.astro` y `src/pages/index.astro`: montar los dos modales.
- Las listas de inventario y grimorio: al tocar una fila, `open-item-detail` / `open-spell-detail`.
- `CompendiumModal.astro`: abrir la ficha con contexto `compendium` y botón "Agregar".
- El visor de botín y de handouts (donde se muestran los `items[]` del sobre): abrir la ficha con contexto `loot`.

## 6. Pasos por tarea

### T-245 — `ItemDetailModal` (RF-251)

1. Estructura (FD-5): contenedor modal con el patrón de los modales existentes (cerrar con ✕, clic fuera y `Escape`).
2. Cabecera: imagen (`<img>` con `entry.imageUrl`, `alt` con el nombre, `referrerpolicy="no-referrer"`, y un icono de respaldo si falla la carga), título, insignias y `headerFields`.
3. Cuerpo: descripción y `detailSections` (propiedades de daño y CA, efectos que aplica con `describeDuration` si corresponde, requisitos y sintonización).
4. Pie: botones de `availableActions`; cada uno dispara `item-action`.

### T-246 — `SpellDetailModal` (RF-252)

1. Misma estructura. Cabecera: nivel y escuela. Datos: tiempo de lanzamiento, alcance, componentes (V, S, M con su descripción), duración, etiquetas de concentración y ritual.
2. Sección de "A niveles superiores" con el texto del escalado (FD-4: solo texto en H1).
3. Botón "Lanzar": abre un selector con `castableLevels`; los niveles sin espacios restantes aparecen atenuados y no se pueden elegir. Si no hay ninguno, el botón muestra "Sin espacios".
4. Los trucos (nivel 0) se lanzan sin selector.
5. Al elegir, dispara `spell-action` con `{ action: 'cast', level }`.

### T-247 — Montaje y reuso (RF-253, RF-255)

1. `detailModals.ts` escucha `open-item-detail` y `open-spell-detail`, convierte con `toCatalogEntry` si llega un elemento crudo y abre el modal correspondiente.
2. Inventario y grimorio: al tocar, abrir la ficha. Atender `item-action` y `spell-action` en cada lista llamando a las acciones del store (`equip`/`use`/`drop`, `useSpellSlot`, `removeSpell`).
3. `CompendiumModal`: la ficha en contexto `compendium` con "Agregar" (usa el flujo de alta existente con `source: 'srd'`).
4. Botín y handouts: abrir la ficha con contexto `loot`. Reutilizar los estilos de `ParchmentEnvelope` (FD-6) sin su animación.

### T-248 — Lógica de presentación (tests)

1. Implementar `headerFields`, `detailSections`, `availableActions` y `castableLevels` en `detailView.ts` (puro).
2. Los tests de la sección 7 se escriben antes de montar los modales, para fijar el contrato.

## 7. Tests

`tests/detail_view.test.mjs`:

- `availableActions`: un objeto en `inventory` ofrece equip/give/drop; en `loot`, solo `add`; un hechizo en `spellbook` ofrece cast y remove; `apply-effect` solo aparece con `effects`.
- `castableLevels`: hechizo de nivel 3 con espacios 1–5 devuelve 3, 4, 5 con lo que queda; niveles agotados quedan con `remaining: 0`; truco (nivel 0) devuelve `[]`.
- `headerFields`: un objeto con rareza y peso muestra ambos; uno sin datos devuelve `[]`.
- `detailSections`: omite las secciones vacías; los efectos aparecen con su descripción.
- Un nombre o descripción con `<script>` se devuelve tal cual (el escape es responsabilidad del render con `textContent`, FD-7).

## 8. Verificación

```bash
pnpm test
pnpm build
```

Prueba manual (con `pnpm emulators`):

1. Tocar un objeto del inventario: abre la ficha con imagen arriba a la izquierda y título al lado (en escritorio y en móvil).
2. Un objeto propio con imagen y uno del compendio sin imagen: el segundo muestra el icono de respaldo.
3. Un hechizo de nivel 3 en el grimorio: "Lanzar" ofrece los niveles 3 a 9 y descuenta el espacio elegido.
4. Un hechizo sin espacios disponibles: el botón dice "Sin espacios".
5. Un truco se lanza sin selector.
6. Un handout con objetos: tocar uno abre la ficha con contexto `loot`, sin botones de equipar.
7. Una descripción con `<img src=x onerror=alert(1)>` se muestra como texto.

## 9. Fuera de alcance

- Validar componentes, estado del personaje o distancia al lanzar (H4, H6).
- Calcular el daño por nivel de espacio.
- Armaduras, desglose de CA y compatibilidad (H2).
- Reemplazar el sobre animado de los handouts.

## 10. Checklist de cierre

- [ ] T-245 … T-248 marcadas en la spec.
- [ ] `// DECISION:` en FD-4 (lanzar sin validar).
- [ ] Ningún `innerHTML` con texto de usuario en los dos modales.
- [ ] `pnpm test` y `pnpm build` en verde.
