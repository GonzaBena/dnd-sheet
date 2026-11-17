# Fase D — Tokens Secundarios en el VTT, Tests y Cierre · [Completada]

Plan de implementación para la **Fase D de la Spec 13 (H6)**.
Requisitos cubiertos: **RF-352** (Guía Visual de Alcance en el Mapa) y **RF-354** (Permisos y Movimiento de Tokens Secundarios).
**Estado: Completada y verificada.**

---

## Objetivo

Permitir que los tokens de compañeros, monturas e invocaciones se desplieguen en el mapa del VTT y sean movidos en tiempo real por el jugador dueño, añadir controles de centrado de cámara y guía visual de alcance en el mapa, y cerrar la etapa H6 con la suite completa de pruebas.

---

## Tareas

### T-362: Despliegue de Token de Compañero en el Mapa
- Función en `src/scripts/data/mapService.ts` / `tokens.ts`:
  * `deployCompanionToken(cid: string, mid: string, companion: CharacterCompanion, char: CharacterData, ownerUid: string): Promise<string>`
  * Crea el token con:
    * `name`: companion.name
    * `x, y`: posición adyacente al token principal del personaje o centro del viewport.
    * `size`: companion.size (1 a 4).
    * `imageUrl`: companion.avatarUrl o icono por defecto.
    * `ownerUid`: `ownerUid` del jugador (permite control directo sin intervención del DM).
    * `characterId`: `char.id`.
    * `kind`: `companion.type === 'mount' ? 'mount' : companion.type === 'summon' ? 'summon' : 'companion'`.
    * `companionId`: companion.id.
  * Actualiza `companion.tokenId` en la hoja para vincular ambos mundos.

### T-363: Validación de Permisos y Movimiento en Vivo
- En `src/scripts/vtt/tokens.ts`:
  * Verificar que `canMoveToken(token, viewer, status)` valide con éxito los tokens de compañeros:
    * Si `viewer.isDm`: `true`.
    * Si `viewer.uid && token.ownerUid === viewer.uid`: `true`.
  * Como el token se guarda con `ownerUid = viewer.uid`, tanto Firestore como RTDB autorizan los movimientos del jugador de manera automática.

### T-364: HUD de Control y Centrado en el Mapa (`MapStage.astro`)
- En el HUD inferior del jugador:
  * Si el jugador tiene tokens de compañeros en el mapa activo:
    - Selector desplegable o botón secundario junto al botón de centrado principal:
      * *"Centrar en [Personaje]"*
      * *"Centrar en [Nombre del Compañero]"*
    - Al hacer clic, anima el viewport para encuadrar el token correspondiente.

### T-365: Guía Visual de Alcance en el Mapa Táctico (RF-352)
- En `src/scripts/vtt/mapStage.ts`:
  * Al seleccionar un token propio o activar una acción con alcance:
    - Dibujar en `fxLayer` un contorno o halo circular sutil con el radio del alcance en píxeles (`reachFeet / 5 * grid.size`).
    - Al pasar el cursor sobre un token objetivo mientras se apunta, dibujar una línea segmentada con el texto de la distancia y validación (ej. *"25 ft · En alcance"* o *"5 ft · Desventaja a quemarropa"*).
  * Opcional: botón de alternancia en la barra de herramientas del mapa para activar/desactivar la guía visual.

### T-366: Suite Completa de Tests y Cierre de Etapa H6
- Pruebas en `tests/tokens_companion.test.mjs` y `tests/tactical_distance.test.mjs`.
- Ejecución de la suite completa del proyecto (`pnpm test`) garantizando 0 fallos y sin regresiones.
- Actualización de estado en `docs/Specs/13-alcance-y-tokens.spec.md` y `docs/ROADMAP.md` marcando H6 como **Cerrada**.

---

## Criterio de Cierre

1. El jugador puede desplegar su compañero en el mapa y mover su token en tiempo real.
2. El mapa muestra la guía visual de alcance y calcula la distancia con el objetivo.
3. Toda la suite de tests del proyecto pasa limpia (100% verde).
