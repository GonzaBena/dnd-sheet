# Reporte de bugs — suites E2E (Playwright + Brave)

**Fecha:** 2026-11-17
**Alcance:** 107 escenarios en `tests/e2e/`. 92 corren en modo local y 15 en modo nube, contra Firebase Emulator Suite con dos usuarios reales (DM y jugadora).
**Resultado actual (2026-11-18):** todos los bugs del reporte están corregidos. Suites locales 95/95 PASS y suite de nube 17/17 PASS, sin XFAIL ni XPASS. Tests unitarios 1209/1209.

Cada bug que sigue abierto tiene un caso marcado con `known_bug=...` en la suite. Mientras el bug exista, el caso da **XFAIL**. Cuando se corrija dará **XPASS**, y en ese momento hay que quitarle la marca. Para ver cómo ejecutar las suites, consulta `tests/e2e/README.md`.

---

## Resumen

| # | Gravedad | Área | Bug | Estado |
|---|---|---|---|---|
| 1 | 🔴 Alta | Nube / sync | La vista de jugador lanza consultas reservadas al DM y el cliente de Firestore se rompe (`INTERNAL ASSERTION FAILED`) | ✅ Corregido |
| 2 | 🔴 Alta | Nube / reglas | `firestore.rules` no deja al jugador crear tokens: el ritual del familiar y «Desplegar» fallan | ✅ Corregido |
| 3 | 🔴 Alta | Compañeros | `isDeployed is not defined` dejaba sin funcionar todo el `CompanionsPanel` | ✅ Corregido |
| 4 | 🟠 Media | Compañeros ↔ mapa | Editar un compañero desplegado no actualiza su token (nombre y tamaño) | ✅ Corregido |
| 5 | 🟠 Media | Compañeros ↔ mapa | Eliminar un compañero deja su token huérfano en el mapa | ✅ Corregido |
| 6 | 🟠 Media | Compañeros | Editar un compañero herido le devuelve todos los PG (`hp.current = max`) | ✅ Corregido |
| 7 | 🟠 Media | Compañeros ↔ DM | Cuando el DM despliega el compañero, el jugador sigue viendo «Fuera del mapa» | ✅ Corregido (efecto del #1) |
| 8 | 🟠 Media | Mapa táctico | `TokenEditor` escucha `'characters-updated'`, un evento que nadie emite, y la lista de aventureros no se refresca | ✅ Corregido |
| 9 | 🟠 Media | Mapa táctico | `renderChips` sale antes de tiempo cuando quedan 0 tokens y la lista de criaturas queda desactualizada | ✅ Corregido |
| 10 | 🟠 Media | Mapa táctico | La papelera de un enemigo se rompe porque usa `kind: 'danger'`, que no existe en `notify.ts` | ✅ Corregido |
| 11 | 🟠 Media | Compañeros | La papelera de «Retirar» compañero usaba `kind: 'danger'` | ✅ Corregido |
| 12 | 🟡 Baja | Ficha (móvil) | La «Mesa Física» muestra CA 10 en lugar de la CA real | ✅ Corregido |
| 13 | 🟡 Baja | Mapa táctico | La tarjeta de aventurero muestra «Aventurero» en lugar de la clase | ✅ Corregido |
| 14 | 🟡 Baja | Bitácora | En modo local, las entradas de una campaña aparecen en el Grimorio de otras campañas | ✅ Corregido |
| 15 | 🟡 Baja | Mochila | Se puede guardar un objeto con cantidad negativa (`-3`) | ✅ Corregido |
| 16 | 🔴 Seguridad | XSS | Nombres con HTML se ejecutan en `TokenEditor` y `WeaponActionCard` | ✅ Corregido |
| 17 | 🔴 Seguridad | XSS | Mismo problema en `CompanionsPanel` | ✅ Corregido |
| 18 | 🔴 Alta | Nube / mapas | Bucle infinito de `maps-updated`: más de 1000 lecturas de Firestore por segundo en las vistas del DM y del jugador | ✅ Corregido |

---

## Detalle

### 1. ✅ La sincronización en vivo del jugador muere en la nube (corregido)

> **Arreglo aplicado:** `TokenEditor` se suscribe a `private/dmOnly` y `HandoutManager` al listado de handouts solo si `campaignStore.isCurrentUserDm(cid)`. Si el rol cambia, la condición se vuelve a evaluar en `campaigns-updated`. Los 9 casos de sync de la suite de nube pasan.

- **Dónde:** la vista de jugador monta `HandoutManager` y `TokenEditor`, que se suscriben a colecciones reservadas al DM (handouts y `maps/*/private/dmOnly`).
- **Qué pasa:**
  1. Las reglas rechazan esas suscripciones (`permission-denied`), lo cual es correcto.
  2. Tras ese rechazo, el SDK de Firestore 10.14.1 entra en `FIRESTORE INTERNAL ASSERTION FAILED: Unexpected state`.
  3. Desde ese momento ningún `onSnapshot` vuelve a entregar datos: el jugador deja de recibir los cambios de PG, la inspiración, la pausa de la sesión y los compañeros.
- **Reproducción:** inicia sesión como jugador, abre `/campaigns?campaign=…&character=…&mode=player` y haz que el DM dañe al PJ. La ficha del jugador no cambia.
- **Evidencia:** en una copia aparte del código agregué una guarda `if (isCurrentUserDm)` antes de esas dos suscripciones. Con ella, los 9 casos de sync que fallaban pasan a XPASS.
- **Arreglo sugerido:** suscribirse a datos de DM solo si `isCurrentUserDm`, o no montar esos componentes en la vista de jugador.
- **Tests:** todos los casos de `tests/e2e/test_cloud_sync.py` marcados con `known_bug=ROOT_CAUSE`.

### 2. ✅ El jugador no puede poner su familiar en el mapa (nube) (corregido, opción A)

> **Arreglo aplicado:**
> - `firestore.rules` tiene una regla nueva: con la partida `active`, un jugador puede **crear** un token de compañero propio y **borrar** uno suyo. El token debe tener `kind` igual a companion, mount o summon y un `companionId`. Su `ownerUid` tiene que ser el del jugador, y su `characterId` tiene que ser una ficha del jugador que esté en esa campaña. Solo se aceptan los campos de un token de compañero. Igual que al mover, la regla identifica el token por `lastMove.tokenId`.
> - `addToken` y `removeToken` (`src/scripts/data/mapService.ts`) agregan `lastMove` cuando quien escribe es un jugador. Con la partida en pausa avisan con un error claro.
> - Hay 4 tests nuevos en `tests/rules/tokens_live_rules.test.mjs`, con el camino feliz y 14 intentos que deben fallar. `pnpm test:rules` da 156/156.
> - **Limitación:** RTDB (`tokenOwners`) sigue siendo solo del DM. El jugador mueve a su compañero y la posición se guarda al soltarlo, pero los demás no lo ven moverse en vivo mientras arrastra. Si quieres eso, hay que ampliar `database.rules.json`.

- **Dónde:** `firestore.rules`, en la colección `maps/{mapId}/tokens`. Hoy el jugador solo puede actualizar `x`/`y` de sus propios tokens, no crearlos.
- **Qué pasa:** el ritual *Encontrar Familiar* y el botón «Desplegar» del `CompanionsPanel` intentan crear el token y reciben `permission-denied`. El jugador ve «Familiar creado. Puedes desplegarlo…», pero el token nunca aparece.
- **Decisión pendiente:** hay dos caminos.
  - Ampliar las reglas para que el jugador pueda crear tokens de **sus propios** compañeros, validando `ownerId`, `companionOf` y el tamaño.
  - O que el despliegue sea solo cosa del DM, y en ese caso quitar el botón de la vista de jugador.
- **Test:** `tests/e2e/test_cloud_sync.py:150`.

### 3. ✅ `isDeployed is not defined` en `CompanionsPanel`

Se introdujo en el commit `4404937`. En el `dist/` original tumbaba todo el panel: había 11 casos en FAIL. Ya está corregido en el árbol de trabajo.

### 4. ✅ Editar un compañero desplegado no actualiza su token (corregido)

> **Arreglo aplicado:** al guardar la edición, `CompanionsPanel` busca el token del compañero en el mapa activo, solo por `comp.tokenId` o `token.companionId` y nunca por nombre. Si lo encuentra, actualiza `name`, `size`, `kind` y `color` con `updateToken`. En la nube, `firestore.rules` deja al jugador editar el token de su propio compañero, pero sin cambiar dueño, ficha ni compañero (2 tests de reglas nuevos). `updateToken` manda el marcador `lastMove` cuando escribe un jugador. La suite de nube verifica el nombre nuevo en Firestore, que se conserve el tamaño 2×2 y que el lienzo del DM muestre el nombre nuevo.

- **Dónde:** `updateCompanion` en `src/scripts/state/characterStore.ts`.
- **Qué pasa:** el compañero se renombra (por ejemplo, «Búho» → «Lechuza») o cambia de tamaño. La ficha se actualiza, pero el token del mapa conserva el nombre y el tamaño viejos.
- **Tests:** `tests/e2e/test_companions.py:213` y `tests/e2e/test_cloud_sync.py:164`.

### 5. ✅ Eliminar un compañero deja el token huérfano (corregido)

> **Arreglo aplicado:** al eliminar el compañero, `CompanionsPanel` también retira su token del mapa con `removeToken`. En la nube ya lo permitía la regla del bug #2.

- **Dónde:** `removeCompanion` en `src/scripts/state/characterStore.ts`.
- **Qué pasa:** el compañero desaparece de la ficha, pero su token sigue en el mapa y nadie lo controla.
- **Test:** `tests/e2e/test_companions.py:231`.

### 6. ✅ Editar un compañero herido le devuelve todos los PG (corregido)

> **Arreglo aplicado:** editar conserva los PG actuales con tope en el nuevo máximo. Si el compañero estaba a tope y el máximo sube, sigue a tope.

- **Dónde:** el submit del formulario de edición de `CompanionsPanel` fuerza `hp.current = max`.
- **Qué pasa:** un familiar con 1/3 PG pasa a 3/3 PG solo por renombrarlo.
- **Test:** `tests/e2e/test_companions.py:309`.

### 7. ✅ Si el DM despliega el compañero, el jugador ve «Fuera del mapa» (corregido con el #1)

Con la sincronización restablecida, el panel recibe el mapa activo y detecta el token. El caso pasó a XPASS y se le quitó la marca.

- **Dónde:** el despliegue desde `TokenEditor` crea el token pero no guarda `comp.tokenId`. `CompanionsPanel` decide si el compañero está desplegado mirando solo `tokenId`.
- **Test:** `tests/e2e/test_cloud_sync.py:145`.

### 8. ✅ La lista de aventureros del DM no se refresca (corregido)

> **Arreglo aplicado:** `TokenEditor` escucha `'all-characters-updated'`. `healTokenOwners` solo escribe cuando a un token le falta el dueño, así que no genera escrituras en bucle en la nube.

- **Dónde:** `src/components/dm/TokenEditor.astro` escucha `'characters-updated'`, pero el store emite `'all-characters-updated'`.
- **Qué pasa:** si un jugador cambia su nombre o sus PG en otra pestaña, la tarjeta del DM no cambia hasta recargar la página.
- **Tests:** `tests/e2e/test_tactical_map.py:310` y `tests/e2e/test_tactical_map.py:335`.

### 9. ✅ Al borrar el último token, la lista sigue diciendo «1 criatura» (corregido)

> **Arreglo aplicado:** con 0 tokens, `renderChips` vuelve a dibujar aventureros y monstruos antes de salir.

- **Dónde:** `renderChips` en `TokenEditor` hace `return` cuando hay 0 tokens, antes de volver a dibujar las listas de monstruos y aventureros.
- **Test:** `tests/e2e/test_tactical_map.py:160`.

### 10. ✅ La papelera de un enemigo lanza un error (corregido)

> **Arreglo aplicado:** usa `kind: 'warning'`, igual que «Retirar» compañero (#11).

- **Dónde:** `TokenEditor` llama a `showConfirm({ kind: 'danger' })`. `KIND_STYLES` en `src/scripts/ui/notify.ts` no tiene `danger`, y el código falla con `Cannot read properties of undefined (reading 'iconClass')`.
- **Arreglo sugerido:** usar un `kind` que exista, o agregar `danger` a `KIND_STYLES`.
- **Test:** `tests/e2e/test_tactical_map.py:177`.

### 11. ✅ `kind: 'danger'` en «Retirar» compañero

Era el mismo bug que el #10, pero en `CompanionsPanel`. Ya está corregido en el árbol de trabajo.

### 12. ✅ «Mesa Física» (móvil) muestra CA 10 (corregido)

> **Arreglo aplicado:** `PhysicalTableSheet` usa `getArmorClass(char)`.

- **Dónde:** `PhysicalTableSheet` usa `char.armorClass || 10` en lugar de `getArmorClass(char)`.
- **Qué pasa:** un PJ con DES 14 sin armadura muestra CA 12 en la ficha completa y CA 10 en el móvil.
- **Test:** `tests/e2e/test_player_sheet.py:424`.

### 13. ✅ La tarjeta de aventurero muestra «Aventurero» (corregido)

> **Arreglo aplicado:** `TokenEditor` lee `char.className`, en la tarjeta y en el selector de PJ del editor de tokens.

- **Dónde:** `TokenEditor` lee `char.characterClass`, pero el campo real es `char.className`.
- **Test:** `tests/e2e/test_tactical_map.py:85`.

### 14. ✅ La bitácora se mezcla entre campañas (corregido)

> **Arreglo aplicado:** `renderJournalFeed` descarta las entradas de otra campaña. Las entradas antiguas sin `campaignId` se siguen mostrando para no ocultar datos.

- **Dónde:** `renderJournalFeed` en `DmControlGrimoire` usa `journalStore.getEntries()` sin filtrar por `campaignId`.
- **Test:** `tests/e2e/test_dm_tools.py:203`.

### 15. ✅ Cantidad negativa en la mochila (corregido)

> **Arreglo aplicado:** la cantidad se limita al rango 1–999, el mismo que declara el input.

- **Dónde:** en `AddItemModal`, `parseInt('-3') || 1` da `-3`. El `min=1` del input no se valida porque el botón no es de tipo submit.
- **Test:** `tests/e2e/test_player_sheet.py:336`.

### 16. ✅ XSS en `TokenEditor`, `WeaponActionCard` y otros componentes (corregido)

Al corregirlo aparecieron más lugares con el mismo problema: texto escrito por usuarios que se metía en `innerHTML` sin escapar. En la nube esos textos los escriben otros jugadores, así que un jugador podía ejecutar código en el navegador del DM o de otro jugador. Se corrigieron estos componentes, todos con `escapeHtml` de `src/scripts/dnd/catalog.ts`:

| Componente | Qué se escapaba mal |
|---|---|
| `TokenEditor` | nombre, tamaño y avatar de tokens, aventureros y compañeros. El color ahora solo acepta un hex (`safeColor`) porque va dentro de un `style` |
| `WeaponActionCard` | nombre, tipo, daño, bono, notas y etiquetas del arma; listado de reacciones |
| `DiceRollerModal` | etiqueta de la tirada (trae el nombre del arma o conjuro), nombre del objetivo, fórmulas, tipo de daño y opciones de objetivo |
| `CombatTracker` | nombres y avatares de combatientes (los PJ son de los jugadores) |
| `InitiativeList` | nombre y avatar de combatientes; armas, conjuros y objetos |
| `DmControlGrimoire` | tarjetas del roster (nombre, clase, jugador, avatar) y bitácora |
| `JournalModal`, `PartyView` | bitácora: título, contenido, autor, etiquetas, tiradas y hitos |
| `TheaterOfTheMindStage` | tarjetas de PJ en las zonas |
| `PhysicalTableSheet`, `WildShapePanel`, `BackpackGrid` | recursos, armas, efectos, ataques de forma salvaje y objetos de la mochila |

Los diálogos de `notify.ts` ya usaban `textContent`, así que no hubo que tocarlos.

**Tests:**
- `tests/e2e/test_tactical_map.py` y `tests/e2e/test_player_sheet.py`: los dos casos XSS ya no tienen la marca de bug. El del arma ahora también abre el lanzador de dados.
- Casos nuevos en `tests/e2e/test_dm_tools.py`: bitácora con HTML, y PJ con HTML en el nombre visto por el DM en el Grimorio y en el combate.
- Una búsqueda de `<img onerror>` inyectados en la vista del DM, en la ficha del jugador y en la vista móvil no encontró ninguno.

**Pendiente:** en otras partes de la app quedan plantillas `innerHTML` con datos de catálogo, que son estáticos. Si un día pasan a mostrar texto de usuarios, conviene usar `esc()` o `textContent`.

### 17. ✅ XSS en `CompanionsPanel`

Ya está corregido en el árbol de trabajo.

### 18. ✅ Bucle infinito de `maps-updated` en modo nube (corregido)

> **Arreglo aplicado:**
> - `MapManager` ya no llama a `listMaps()` cuando recibe `maps-updated`: relee la caché local con `getLocalMaps()`.
> - Como defensa, `saveLocalMaps()` no emite `maps-updated` si el contenido guardado no cambió.
> - Con el arreglo se emiten 0 eventos por segundo en reposo (antes eran ~1400 en la jugadora y ~1100 en el DM).
> - El caso de la suite de nube ya no está marcado como bug conocido, y el de renombrar volvió a usar el click normal de Playwright. La suite de nube da 17/17 en dos corridas seguidas.

- **Cómo apareció:** al verificar el bug #4 en la nube. La lista de compañeros se redibujaba unas 1400 veces por segundo y el botón «Editar» nunca quedaba estable.
- **Dónde:**
  - `src/components/dm/MapManager.astro` escucha `maps-updated` y llama a `reloadMaps()`.
  - `reloadMaps()` llama a `listMaps(cid)`, que en la nube lee Firestore (`getDocs`).
  - `listMaps` guarda el resultado con `saveLocalMaps()`, que vuelve a emitir `maps-updated`.
- **Qué pasa:** el ciclo no termina nunca. Se midieron 1369 eventos por segundo en la vista de la jugadora y 1092 en la del DM. Cada uno es una lectura de la colección de mapas, lo que en producción se traduce en coste de Firestore y en CPU. Además, todos los componentes que escuchan `maps-updated` se redibujan sin parar (`CompanionsPanel`, entre otros).
- **Arreglo sugerido:**
  - Que `MapManager` relea la caché local (`getLocalMaps`) en `maps-updated` en lugar de volver a pedir los mapas a Firestore.
  - O bien que `saveLocalMaps` no emita el evento si el contenido no cambió.
- **Test:** `tests/e2e/test_cloud_sync.py`, caso «Ni la jugadora ni el DM entran en un bucle de 'maps-updated'» (`known_bug`).

---

## Hallazgos menores (sin test dedicado)

- `newTokenId(prefix)` ignora el argumento `prefix`.
- `SpellcastingPanel` lanza un error si el personaje no tiene `spellcasting` (por ejemplo, datos viejos o importados).
- Si se publica una entrada de bitácora con el contenido vacío, no se guarda y no se muestra ningún aviso.

## Prioridad sugerida

1. ~~**#1 y #2**~~ ✅ corregidos.
2. ~~**#16 (XSS)**~~ ✅ corregido.
3. ~~**#4–#6**~~ ✅ corregidos.
3. ~~**#18**~~ ✅ corregido.
4. ~~**#8–#10, #12–#15**~~ ✅ corregidos.
