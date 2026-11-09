# Plan Fase 2 — Mapa estático (T-20 … T-24)

Spec: `docs/Specs/01-dm-panel.spec.md`, RF-10, RF-11 y RF-12, y las secciones *Modelo de datos* (`MapDoc`) y *Arquitectura en tiempo real*.

## 1. Contexto y objetivo

Mapa táctico **sin tokens interactivos todavía**:

- El DM crea mapas a partir de una URL de imagen y configura la grilla (tamaño, desplazamiento, visible).
- El DM elige el mapa activo.
- Todos lo ven en un canvas Konva con zoom y pan, también táctil.
- Cuando el DM cambia de mapa, los jugadores cambian automáticamente con una transición animada.

Esta fase deja lista la isla del canvas con sus 4 capas (fondo, grilla, tokens, niebla) para las Fases 3 y 4.

## 2. Prerrequisitos verificables

| Debe existir | Cómo comprobarlo |
| --- | --- |
| Tipos `MapDoc` y `GridConfig` | `src/scripts/models/map.ts` |
| `Campaign.activeMapId?` | `src/scripts/models/campaign.ts` |
| Regla `match /maps/{mapId}`: lectura para miembros; el DM crea y edita con `canPrepare()` y `validMap()` | `firestore.rules` |
| Estado de partida: `canPerform()` en `src/scripts/vtt/sessionStatus.ts` y evento `session-status-changed` | Fase 0B |
| `/partida` con `#party-map-slot` | `src/components/party/PartyView.astro` |

Si falta `map.ts` o la regla, crearlos según la sección 4 y sumar sus tests. Si falta la Fase 0B, `canPrepare()` puede ser `true` temporalmente, pero eso hay que anotarlo.

## 3. Decisiones vigentes

- **D1** La UI no importa `firebase/*` ni `konva` en el frontmatter. **Konva se carga con `await import('konva')` dentro del `<script>`** del componente: nunca corre en build, igual que una isla `client:only`.
- **D2/D4** Tipos en `src/scripts/models/`, componentes `.astro` + `<script>`, sin framework UI.
- **D7** Crear y editar mapas y elegir el mapa activo cuenta como *preparar*: se permite en `active` y en `paused`, no en `ended`.
- **D9** La imagen es una URL `https://` externa: no hay Storage ni subida de archivos.
- **D11** Tests con `node:test`.
- **D12** Las decisiones no cubiertas por la spec se anotan con `// DECISION:`.

Decisiones propias:

- **F2-1** Coordenadas: todo se guarda en **píxeles de la imagen original** (`imageWidth`/`imageHeight`). Al stage Konva se le aplican `scale` y `position` para el zoom y el pan; los nodos usan coordenadas de imagen. Así no hace falta convertir nada al persistir.
- **F2-2** El tamaño de la imagen lo lee el cliente del DM (`img.naturalWidth/Height`) al crear el mapa y se guarda. Sin CORS especial: Konva dibuja la imagen sin `toDataURL`. Si la imagen no carga, se muestra un error en el formulario y no se crea el mapa.
- **F2-3** La lista de mapas la lee solo el DM, con `getDocs` (una sola lectura, sin listener). El mapa activo usa un único `onSnapshot`, que se cierra al cambiar de mapa (regla 6 de sincronización).
- **F2-4** Límites del zoom: de 0.1× a 8×. Al abrir el mapa, se encuadra completo ("fit") en el contenedor.

## 4. Modelo de datos

```ts
// src/scripts/models/map.ts (de la Fase 0; crear si no existe)
export interface GridConfig { size: number; offsetX: number; offsetY: number; visible: boolean }
export interface MapDoc {
  id: string; name: string; imageUrl: string;
  imageWidth: number; imageHeight: number;
  grid: GridConfig;
  tokens: Record<string, Token>;  // vacío en esta fase
  fogRevealed: FogShape[];        // vacío en esta fase
  lastMove?: LastMove;
  updatedAt: number;
}
```

- `campaigns/{cid}/maps/{mid}`: el `id` no se guarda en el documento; se agrega al leerlo.
- `campaigns/{cid}.activeMapId`

Regla: `imageUrl.matches('^https://.*')`, de 2048 caracteres como máximo, y `grid.size` entre 8 y 512 (agregarlo a `validMap()`).

## 5. Archivos

**Crear**
- `src/scripts/vtt/geometry.ts`: lógica pura.
- `src/scripts/data/mapService.ts`
- `src/scripts/vtt/mapStage.ts`: controlador Konva, sin Firebase, que recibe datos y emite eventos.
- `src/components/map/MapStage.astro`: contenedor + `<script>` que monta `mapStage.ts`.
- `src/components/dm/MapManager.astro`
- `tests/geometry.test.mjs`

**Modificar**
- `package.json`: `pnpm add konva`. Es la única dependencia nueva permitida por la spec.
- `src/components/dm/DmControlGrimoire.astro`: sección "Mapa" con `<MapManager />` y `<MapStage mode="dm" />`.
- `src/components/party/PartyView.astro`: reemplazar `#party-map-slot` por `<MapStage mode="player" />`.
- `firestore.rules`: completar `validMap()` si hace falta.

**Reutilizar**
- `campaignStore.updateCampaign` (para `activeMapId`)
- `showForm` / `showAlert` de `notify.ts`
- `canPerform`

## 6. Pasos por tarea

### Utilidades puras (`geometry.ts`)

- `screenToMap(p, view: { scale, x, y })` y `mapToScreen(p, view)`.
- `snapToGrid(pos, grid, tokenSize)`: ajusta la esquina superior izquierda del token a la celda más cercana, teniendo en cuenta `offsetX/offsetY`. La deja lista para la Fase 3.
- `clampZoom(scale, min=0.1, max=8)`.
- `zoomAtPoint(view, pointer, factor)`: devuelve una vista nueva en la que el punto bajo el puntero queda fijo.
- `fitToContainer(imgW, imgH, boxW, boxH)`: devuelve la vista inicial.
- `pinchZoom(view, p1Prev, p2Prev, p1, p2)`: devuelve una vista nueva a partir de la distancia y del centro de dos dedos.

### T-20 — Isla `MapStage.astro`

- El markup es un `<div data-map-stage data-mode="dm|player">` con altura fija responsive (`h-[60vh] md:h-[70vh]`), más un overlay de carga y otro de "sin mapa activo".
- `<script>`:
  1. `const Konva = (await import('konva')).default`.
  2. Crea `new MapStageController(container, Konva, { mode })`, definido en `mapStage.ts`.
  3. Capas en orden: `bgLayer` (imagen, `listening: false`), `gridLayer` (`listening: false`), `tokenLayer` (vacía; Fase 3) y `fogLayer` (vacía; Fase 4).
- API del controlador:
  - `setMap(map: MapDoc | null)`
  - `setGrid(grid)`
  - `fit()`
  - `destroy()`
  - eventos con `EventTarget` propio: `'view-changed'`, `'map-click'`
- Redimensionar con `ResizeObserver` (`stage.size()` + `fit()` solo la primera vez).
- La grilla es un único `Konva.Shape` con `sceneFunc`, que dibuja solo las líneas visibles. Es barato con mapas grandes.

### T-21 — Imagen y configuración de grilla (`MapManager.astro`, solo DM)

- **Lista de mapas**: `listMaps(cid)` muestra nombre, miniatura (`<img loading=lazy>`) y un botón "Activar". El mapa activo aparece marcado.
- **"Nuevo mapa"**: `showForm` con nombre y URL https.
  1. Precarga `new Image()` y espera `onload`.
  2. Llama a `createMap(cid, { name, imageUrl, imageWidth, imageHeight, grid: { size: 70, offsetX: 0, offsetY: 0, visible: true } })`.
- **Panel de grilla** del mapa abierto:
  - Inputs numéricos de tamaño y offset X/Y, y toggle de visible.
  - La vista previa es local e inmediata (`controller.setGrid`).
  - El botón "Guardar" llama a `updateMapConfig`: **una sola escritura**, no una por cada tecla.
- Deshabilitado si `!canPerform('dmPrepare','dm',status)`.

### T-22 — Zoom y pan, también táctil

- **Rueda**: `stage.on('wheel')`, con `zoomAtPoint` y un factor de 1.1.
- **Pan**:
  - `stage.draggable(true)` cuando se arrastra el fondo.
  - En la Fase 3 los tokens frenan la propagación (`cancelBubble`), así que arrastrar un token no mueve el stage.
- **Pellizco**:
  - Con `touchmove` de 2 dedos se aplica `pinchZoom`, y durante el gesto se desactiva `stage.draggable`. Es el patrón de multi-touch de la documentación de Konva (`Konva.hitOnDragEnabled = true`).
  - Se agregan `touch-action: none` en el contenedor y `e.evt.preventDefault()`.
- **Botones flotantes**: +, − y "encuadrar", para accesibilidad y mobile.
- **La vista (zoom y pan) es local**: no se sincroniza ni se persiste.

### T-23 — `mapService.ts`

- `createMap(cid, data) → mid`: id `map-${Date.now().toString(36)}-${random}`; escribe `tokens: {}`, `fogRevealed: []` y `updatedAt`.
- `listMaps(cid): Promise<MapDoc[]>`: `getDocs` (F2-3).
- `updateMapConfig(cid, mid, patch: Partial<Pick<MapDoc,'name'|'imageUrl'|'imageWidth'|'imageHeight'|'grid'>>)`.
- `deleteMap(cid, mid)`: borra el mapa y su `private/dmOnly`, si existe. Pide confirmación en la UI y no permite borrar el mapa activo.
- `setActiveMap(cid, mid | null)`: `campaignStore.updateCampaign(cid, { activeMapId })`.
- `subscribeMap(cid, mid, cb): () => void`: un solo `onSnapshot`.
- `watchActiveMap(cid, cb)`:
  1. Escucha los cambios de `campaign.activeMapId` (evento `campaigns-updated` + `campaignStore.getCampaign(cid)`).
  2. Cuando cambia, cierra la suscripción anterior y abre `subscribeMap` del nuevo.
  3. Devuelve una función que cancela todo.

### T-24 — Cambio de mapa con transición

- En `MapStage` (los dos modos), con `watchActiveMap`:
  1. Cuando cambia el `mid`, ejecuta la animación de salida de anime.js sobre el contenedor (`opacity 1→0`, `scale 1→0.98`, 200 ms).
  2. `controller.setMap(newMap)` + `fit()`.
  3. Animación de entrada (`opacity 0→1`, `scale 1.02→1`, 250 ms, `easeOutCubic`).
- Si los snapshots llegan con el mismo `mid`, se actualiza sin animar.
- El DM puede abrir para editar un mapa que no es el activo. Para eso, `MapStage` en modo DM acepta `openMap(mid)` además de seguir el activo, y un selector indica "Viendo: X (activo: Y)".

## 7. Tests

**`tests/geometry.test.mjs`**:
- Que `screenToMap` y `mapToScreen` sean inversas (ida y vuelta).
- `zoomAtPoint`: el punto bajo el puntero queda fijo.
- `clampZoom`.
- `fitToContainer`: imagen horizontal y vertical.
- `snapToGrid` con offset y con tamaños 1 a 4, incluidos los bordes.
- `pinchZoom`: al separar los dedos aumenta la escala.

**Reglas**, si no existen:
- El DM crea un mapa en `active` y en `paused`, y no en `ended`.
- Falla con `imageUrl` `http://` y con más de 2048 caracteres.
- Falla con `grid.size` fuera de rango.
- El jugador no crea ni edita mapas.
- El jugador no cambia `activeMapId`: ya lo cubre la regla de campaña, que solo deja editar al DM o al creador.

## 8. Verificación

1. `pnpm test`, `pnpm test:rules` y `pnpm build`.
2. `grep -rl "konva" dist/*.html`: Konva no aparece inline en el HTML, solo en un chunk JS importado de forma dinámica.
3. Manual:
   1. El DM crea dos mapas desde URLs públicas y ajusta la grilla hasta que coincida con la del dibujo.
   2. Recarga: la grilla queda igual.
   3. Activa el mapa A: el jugador, en `/partida`, lo ve con la grilla.
   4. Activa el B: el jugador ve la transición y el mapa nuevo sin recargar.
   5. Zoom con la rueda (fijo en el puntero) y pan arrastrando.
   6. En un celular, o con la emulación táctil de DevTools: pellizco y pan con un dedo.
   7. Con la partida `ended`, crear un mapa falla y la UI lo deshabilita.

## 9. Fuera de alcance
- Tokens (Fase 3) y niebla (Fase 4). Las capas quedan vacías.
- Regla de medición y ping (Fase 5).
- Subir archivos.

## 10. Checklist de cierre
- [x] T-20 … T-24 marcadas en la spec.
- [x] `// DECISION:` para F2-1, F2-2 y F2-3, y en `MapStage.astro` para el reemplazo de `client:only`.
- [x] Tests verdes y build estático OK.
