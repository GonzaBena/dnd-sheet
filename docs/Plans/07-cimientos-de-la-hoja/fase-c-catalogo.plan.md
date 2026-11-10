# Plan Fase C — Catálogo y entradas propias (T-240 … T-244)

Spec: `docs/Specs/07-cimientos-de-la-hoja.spec.md`, sección *3. Catálogo base y entradas propias* y RF-245 a RF-250, RF-256.

## 1. Contexto y objetivo

Objetos, hechizos y dotes tienen hoy formas distintas (`InventoryItem`, `SpellItem`, `features[]`) y el SRD en `public/data/srd/` es solo texto. Esta fase define un **esquema común** (`CatalogEntry`), un adaptador desde el SRD, y permite crear entradas **propias** guardadas dentro del personaje, con una insignia. También da a las dotes un tipo y un recurso opcional.

Al terminar, el jugador agrega un objeto o hechizo del SRD y uno propio, el propio muestra la insignia, y las dotes aceptan tipo y recurso.

## 2. Prerrequisitos verificables

| Debe existir | Cómo comprobarlo |
| --- | --- |
| Fase A completa (`resources`) | `src/scripts/dnd/resources.ts` |
| Subtipos actuales | `src/scripts/models/character.ts:36` (`SpellItem`), `:58` (`InventoryItem`), `features[]` |
| Acceso al SRD | `src/scripts/api/srdCacheManager.ts`, `dndApiService.ts` |
| Formato de dotes del SRD | `public/data/srd/2014/feats.json`: `{index, name, description, type, url}` |
| Modales de alta | `src/components/modals/{AddItemModal,AddSpellModal,EditFeaturesModal}.astro` |
| Navegador del compendio | `src/components/modals/CompendiumModal.astro` |
| Mutaciones del store | `characterStore.ts:334-359` (inventario), `:391-417` (conjuros), `:578-594` (rasgos) |
| Reglas del personaje | `firestore.rules:282-318`; tests en `tests/rules/firestore_rules.test.mjs` |

## 3. Decisiones vigentes

- **D1/D2/D4/D11/D12** y **H1-1 a H1-6** (ver README).

Decisiones propias:

- **FC-1** Los tipos existentes (`InventoryItem`, `SpellItem`, `features[]`) **no se reemplazan** por `CatalogEntry`: se les agregan campos opcionales (`source`, `imageUrl`, `effects`, y en las dotes `featType` y `resourceId`). `CatalogEntry` es la forma común con la que los modales y los adaptadores hablan, y se obtiene con funciones `toCatalogEntry(item)`.
- **FC-2** `source` ausente se interpreta como `'custom'` para lo que ya estaba cargado a mano, y como `'srd'` si el elemento tiene el campo `srdIndex` (lo que ya guarden los modales al agregar desde el compendio; confirmarlo leyendo `AddItemModal` y `AddSpellModal`). Anotar con `// DECISION:`.
- **FC-3** La insignia solo se muestra a las entradas con `source === 'custom'` que fueron creadas con el formulario de entrada propia (campo `custom: true`). Las migradas implícitamente no la muestran, para no llenar de insignias lo ya cargado.
- **FC-4** `imageUrl` es una URL `https://` o `data:image/` corta. Se valida con una función pura; cualquier otra cosa se descarta. Se muestra solo en un `<img>` (nunca como HTML).
- **FC-5** El tipo de dote (`featType`) por defecto es `passive` si el texto no sugiere otra cosa; no se infiere del texto, es solo un campo que el jugador elige.
- **FC-6** Los efectos estructurados de una entrada son opcionales. En esta fase **no se cargan efectos al SRD**; solo se permite escribirlos a mano en una entrada propia, con un editor simple (ver T-241).

## 4. Modelo de datos

```ts
// src/scripts/models/catalog.ts
export type CatalogKind = 'item' | 'spell' | 'feat';
export interface CatalogEntry {
  id: string; kind: CatalogKind;
  source: 'srd' | 'custom';
  name: string; description: string;
  imageUrl?: string;
  meta: Record<string, unknown>;     // rareza, peso, nivel, escuela, componentes…
  effects?: Modifier[];
}
export type FeatType = 'passive' | 'conditional' | 'active' | 'reaction';
```

Campos opcionales añadidos a los tipos existentes:

```ts
// InventoryItem, SpellItem
source?: 'srd' | 'custom'; custom?: boolean; imageUrl?: string; effects?: Modifier[];
// features[]
featType?: FeatType; resourceId?: string; effects?: Modifier[]; custom?: boolean;
```

Funciones puras en `src/scripts/dnd/catalog.ts`:

```ts
export function srdToEntry(kind: CatalogKind, raw: Record<string, unknown>): CatalogEntry;
export function toCatalogEntry(kind: CatalogKind, thing: InventoryItem | SpellItem | Feature): CatalogEntry;
export function sanitizeImageUrl(url: unknown): string | undefined;
export function parseEffectsText(text: string): Modifier[] | { error: string };   // editor simple de T-241
```

## 5. Archivos

**Crear**
- `src/scripts/models/catalog.ts`
- `src/scripts/dnd/catalog.ts` (puro)
- `src/components/ui/CustomBadge.astro` (la insignia)
- `tests/catalog.test.mjs`

**Modificar**
- `src/scripts/models/character.ts`: campos opcionales de FC-1.
- `src/components/modals/AddItemModal.astro`, `AddSpellModal.astro`, `EditFeaturesModal.astro`: modo "entrada propia", imagen, tipo de dote, efectos.
- `src/components/modals/CompendiumModal.astro`: marcar `source: 'srd'` al agregar.
- Las listas que muestran objetos, conjuros y rasgos: usar `CustomBadge`.
- `tests/rules/firestore_rules.test.mjs`: caso nuevo (T-244).

## 6. Pasos por tarea

### T-240 — Esquema y adaptadores (RF-245)

1. Crear `catalog.ts` (modelo) y `dnd/catalog.ts` (puro).
2. `srdToEntry`: conjuros (nivel, escuela, tiempo, alcance, componentes, duración, concentración, ritual), equipo y objetos mágicos (rareza, peso, categoría), dotes (tipo, descripción). Los campos que falten en el JSON quedan en `meta` como `undefined` y no rompen.
3. `toCatalogEntry`: convierte un `InventoryItem`, `SpellItem` o feature existente al esquema común (lo usan los modales de la Fase D).
4. Revisar los JSON de `public/data/srd/2014/` y `2024/` para confirmar los nombres reales de los campos antes de escribir el adaptador; documentar las diferencias entre ediciones con `// DECISION:`.

### T-241 — Entradas propias (RF-246, RF-247)

1. En cada modal de alta, un conmutador "Entrada propia" que muestra los campos completos (nombre, descripción, imagen, datos propios del tipo, efectos).
2. Al guardar una entrada propia: `source: 'custom'`, `custom: true`. Las agregadas desde el compendio: `source: 'srd'`.
3. Editor simple de efectos: un cuadro de texto con una línea por modificador, formato `objetivo operación valor` (por ejemplo `ac add 2`, `save.dex advantage`). `parseEffectsText` lo convierte o devuelve el error con el número de línea. Es opcional y puede quedar vacío.
4. `CustomBadge.astro`: una insignia pequeña "Propio". Se muestra donde se lista cada tipo (inventario, grimorio, rasgos) cuando `custom === true`.

### T-242 — Dotes con tipo y recurso (RF-249, RF-250)

1. En `EditFeaturesModal`, agregar el selector de tipo (`passive | conditional | active | reaction`) y un selector opcional de recurso (lista `char.resources`, con la opción "Crear recurso nuevo", que usa `addResource` de la Fase A).
2. Mostrar el tipo como etiqueta en la lista de rasgos.
3. Una dote sin `effects` se sigue mostrando como solo texto (FC-6).

### T-243 — Imagen (RF-248)

1. Campo "Imagen (URL)" en los modales de objeto y de hechizo.
2. `sanitizeImageUrl` (FC-4) antes de guardar. Si no pasa, mostrar un aviso y no guardar la imagen.
3. En las listas, no mostrar la imagen todavía (la muestran los modales de la Fase D).

### T-244 — Test de reglas (RF-256)

1. En `tests/rules/firestore_rules.test.mjs`: el **dueño** actualiza un personaje con `resources`, `activeEffects`, `effectsLastRound` e `inventory[].imageUrl` y puede (`assertSucceeds`).
2. El **DM** de la campaña intenta escribir `activeEffects` y `resources`: falla (`assertFails`).
3. El DM sigue pudiendo escribir `hp` e `inspiration` (regresión).

## 7. Tests

`tests/catalog.test.mjs`:

- `srdToEntry`: un conjuro, un objeto y una dote reales (cargados de `public/data/srd/2014/`) producen entradas con nombre y descripción; un JSON incompleto no lanza.
- `toCatalogEntry`: de un `InventoryItem` con `custom: true` sale `source: 'custom'`.
- `sanitizeImageUrl`: acepta `https://…` y `data:image/png;base64,…`; rechaza `javascript:`, `http://`, vacío y no-string.
- `parseEffectsText`: `"ac add 2"` → un modificador; `"save.dex advantage"` → uno sin valor; línea inválida → `{ error }` con el número de línea; texto vacío → `[]`.

Reglas del emulador (T-244): ver arriba.

## 8. Verificación

```bash
pnpm test
pnpm test:rules
pnpm build
```

Prueba manual:

1. Agregar un objeto del compendio: no muestra insignia.
2. Agregar un objeto propio con imagen y un efecto `ac add 1`: muestra la insignia "Propio" y guarda el efecto.
3. Pegar una imagen con `javascript:alert(1)` como URL: se rechaza con aviso.
4. Editar una dote: elegir tipo "reacción" y vincularle un recurso; la lista muestra la etiqueta.
5. Un personaje antiguo, con objetos cargados a mano, sigue funcionando sin insignias.

## 9. Fuera de alcance

- Mostrar el detalle en el modal genérico (Fase D).
- Cargar efectos al SRD completo.
- Biblioteca de entradas propias compartida entre personajes.
- Evaluar `effects` o `featType` en cálculos (H2, H4).

## 10. Checklist de cierre

- [ ] T-240 … T-244 marcadas en la spec.
- [ ] `// DECISION:` en FC-2 y en las diferencias entre ediciones del SRD.
- [ ] Ningún valor de entrada de usuario se inserta como HTML sin escapar.
- [ ] `pnpm test`, `pnpm test:rules` y `pnpm build` en verde.
