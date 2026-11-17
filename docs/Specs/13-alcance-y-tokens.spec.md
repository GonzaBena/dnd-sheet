# Spec 13: Alcance Táctico y Tokens Propios — dnd.gonzabena.com.ar

Nov 17, 2026 · @Gonzalo Benavente · **Estado: Cerrada**

Etapa H6 del [roadmap](../ROADMAP.md). Depende de H1 ([Spec 07](07-cimientos-de-la-hoja.spec.md), cimientos de la hoja), H2 ([Spec 08](08-equipo.spec.md), armas y equipo), H4 ([Spec 11](11-combate-en-la-hoja.spec.md), combate en la hoja y tiradas contra CA), H5 ([Spec 12](12-reacciones.spec.md), reacciones en vivo) y la base del VTT ([Spec 01](01-dm-panel.spec.md) y [Spec 02](02-mesa-viva.spec.md), cuadrícula, mapas y sincronización de tokens).

---

## Objetivo y Alcance

Conectar la **hoja de personaje viva** con la **geometría espacial del mapa táctico** en dos frentes indispensables para D&D 5e:
1. **Detección y validación automática de distancias tácticas:** Que al seleccionar un objetivo para un ataque con arma, proyectil o conjuro, la app calcule en tiempo real la distancia entre los tokens sobre la cuadrícula (regla 5/5/5 de 5e), compruebe si está en alcance normal, en alcance largo con desventaja o fuera de alcance, y aplique las penalizaciones correspondientes sin cálculos manuales de casillas.
2. **Tokens propios y entidades secundarias (Compañeros, Monturas e Invocaciones):** Permitir que los jugadores registren en su hoja y desplieguen/controlen en el mapa sus propias criaturas subordinadas (familiares de mago, compañeros de explorador, monturas de paladín, espíritus invocados o armas espirituales), con permisos nativos para moverlos en tiempo real sin requerir que el DM mueva cada ficha secundaria.

Al cerrar esta etapa:
- **Cálculo de distancia token a token borde a borde:** Se calcula la distancia mínima entre las casillas ocupadas por el atacante y el defensor (contemplando tamaños Mediano 1x1, Grande 2x2, Enorme 3x3 y Gigantesco 4x4 bajo la regla Chebyshev de 5e).
- **Resolución contextual en combate:** Al declarar una acción contra un objetivo en el tracker de combate o en la hoja, la distancia se rellena automáticamente desde las posiciones del mapa activo, mostrando el estado táctico (*"En alcance óptimo"*, *"Desventaja por largo alcance"*, *"Desventaja a quemarropa"* o *"Fuera de alcance"*).
- **Visualización de alcance en el mapa:** Guía visual interactiva de rango y línea de mira/ataque entre el token activo y el objetivo.
- **Sección de Compañeros en la Hoja y control de tokens:** El jugador puede gestionar sus entidades secundarias (nombre, tipo, PG, CA, velocidad, tamaño) y mover sus tokens correspondientes en el VTT gracias al modelo de propiedad `ownerUid`.

---

### Dentro del Alcance (v1)

1. **Geometría Táctica Token a Token (RF-350):**
   - Cálculo puro `calculateTokenDistanceFeet(tokenA, tokenB, grid)`:
     * Soporte para tokens de tamaños 1x1, 2x2, 3x3 y 4x4 casillas.
     * Medición de distancia de borde a borde (mínima separación entre las celdas de ambos tokens).
     * Regla oficial 5/5/5 (distancia Chebyshev): diagonales cuentan como 5 pies (1 celda = 5 pies).
     * Tokens adyacentes (u ortogonales o diagonales) = 5 pies de distancia.
     * Tokens superpuestos o en la misma casilla = 0 pies de distancia.

2. **Validación Automática de Alcance y Desventaja en Combate (RF-351):**
   - Integración entre la lista de iniciativa (`InitiativeList`) y los tokens del mapa:
     * Detección automática del token del atacante y del token del defensor a partir de `combatant.tokenId` o `combatant.characterId`.
     * Autocompletado del campo de distancia con la medida real del mapa táctico.
     * Indicador visual en la UI de combate: badge con distancia medida y etiqueta de validez (óptimo, desventaja, fuera de rango).
     * Detección de armas a distancia a quemarropa: desventaja automática si un arma a distancia ataca a un objetivo a $\le 5$ pies.
     * Fallback suave: Si la partida no tiene mapa activo o algún combatiente carece de token en el mapa, se mantiene el selector manual de distancia (presets 5/10/30/60 ft o entrada libre) sin bloquear el combate.

3. **Guía Visual de Alcance en el Mapa táctico (RF-352):**
   - Aro o halo sutil de alcance alrededor del token seleccionado según el arma equipada o acción activa (5 ft para melé, 10 ft para armas con alcance, radio de proyectil o conjuro).
   - Al apuntar a un objetivo, línea de tiro punteada con indicador de distancia en pies.
   - Opción para encender o apagar la guía visual desde la barra de herramientas del mapa.

4. **Modelo y Gestión de Compañeros e Invocaciones en la Hoja (RF-353):**
   - Nuevo bloque/pestaña en la hoja de personaje: "Compañeros e Invocaciones" (`companions`).
   - Soporte para tipos: `familiar` (Familiar), `mount` (Montura), `companion` (Compañero animal), `summon` (Invocación) y `sidekick` (Acompañante).
   - Campos mínimos: nombre, tipo, tamaño (1 a 4), PG actuales/máximos, CA, velocidad (ft) y notas/habilidades.
   - Persistencia local y en Firestore en el documento del personaje (`characters/{charId}`).

5. **Tokens de Criaturas Subordinadas en el VTT (RF-354):**
   - Creación y colocación de token de compañero en el mapa activo:
     * El jugador puede colocar el token de su compañero en el mapa activo (o el DM puede vincularlo).
     * El token se crea con `ownerUid = user.uid`, `characterId = char.id` y `kind = 'companion' | 'mount' | 'summon'`.
     * Gracias a las reglas vigentes de Firestore y RTDB, el jugador tiene permisos inmediatos para arrastrar y mover el token de su compañero en tiempo real.
   - HUD del mapa del jugador: botón de conmutación o centrado rápido para alternar la cámara entre el personaje y sus compañeros.
   - Enlace opcional en el `CombatTracker`: visualización del compañero en la lista de iniciativa identificado como aliado bajo el control del jugador.

---

### Fuera del Alcance (v1)

- Plantillas de área para conjuros (esferas, conos, cilindros, cubos): corresponden a **H8 (Spec 15: Zonas de Hechizo en el Mapa)**.
- Línea de visión con paredes bloqueantes (Fog of War dinámico o Raycasting estilo Foundry): el proyecto prioriza ligereza y rendimiento en dispositivos móviles.
- Automatización de IA para turnos de mascotas: el jugador o el DM deciden las acciones manualmente según las reglas del manual.

---

## Requisitos Funcionales

| ID | Requisito | Descripción |
| --- | --- | --- |
| **RF-350** | **Geometría Token a Token Borde a Borde** | Función pura que determina la distancia en celdas y pies entre dos tokens de cualquier tamaño (1 a 4 celdas) bajo la regla Chebyshev 5/5/5 de D&D 5e. |
| **RF-351** | **Validación Automática de Alcance en Combate** | Al seleccionar un objetivo en el tracker de iniciativa o en la hoja, la distancia se obtiene automáticamente del mapa activo si ambos tokens están presentes, alertando de desventajas (largo alcance, quemarropa) o imposibilidad de ataque. |
| **RF-352** | **Guía Visual de Alcance en el Mapa** | Halo de alcance opcional y vector visual de objetivo al seleccionar combatientes en el mapa táctico. |
| **RF-353** | **Gestión de Compañeros en la Hoja** | Registro de familiares, monturas y compañeros en la ficha del personaje con seguimiento de PG, CA y tamaño. |
| **RF-354** | **Permisos y Movimiento de Tokens Secundarios** | El jugador puede mover en vivo sus tokens de acompañantes e invocaciones en el mapa sin intervención del DM, respetando `ownerUid`. |

---

## Modelo de Datos

### 1. Extensión de `Token` en `src/scripts/models/map.ts`

```typescript
export type TokenKind = 'character' | 'companion' | 'mount' | 'summon' | 'monster' | 'npc';

export interface Token {
  name: string;
  x: number;
  y: number;
  size: 1 | 2 | 3 | 4;
  imageUrl?: string;
  color?: string;
  ownerUid: string | null;
  characterId?: string;
  /** Tipo de entidad representada para diferenciación visual y lógica táctica (Spec 13, H6). */
  kind?: TokenKind;
  /** Identificador del compañero específico en character.companions si aplica */
  companionId?: string;
}
```

### 2. Estructura de Compañeros en `src/scripts/models/character.ts`

```typescript
export type CompanionType = 'familiar' | 'mount' | 'companion' | 'summon' | 'sidekick';

export interface CharacterCompanion {
  id: string;
  name: string;
  type: CompanionType;
  size: 1 | 2 | 3 | 4; // 1 = Pequeño/Mediano, 2 = Grande, 3 = Enorme, 4 = Gigantesco
  hp: {
    current: number;
    max: number;
  };
  armorClass?: number;
  speedFt?: number;
  avatarUrl?: string;
  notes?: string;
  /** ID del token en el mapa si está desplegado actualmente */
  tokenId?: string;
}

// En CharacterData:
export interface CharacterData {
  // ... campos existentes ...
  companions?: CharacterCompanion[];
}
```

### 3. Modelo de Distancia Táctica en `src/scripts/vtt/tacticalCombat.ts`

```typescript
export interface TokenBounds {
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

export interface TokenDistanceResult {
  cells: number;
  feet: number;
  adjacent: boolean;
  overlapping: boolean;
}
```

---

## Lógica Algorítmica de Distancia (Reglas 5e)

Dadas dos casillas $A$ y $B$, donde $A$ ocupa las celdas desde $[\text{minCol}_A, \text{minRow}_A]$ hasta $[\text{maxCol}_A, \text{maxRow}_A]$ y $B$ ocupa $[\text{minCol}_B, \text{minRow}_B]$ hasta $[\text{maxCol}_B, \text{maxRow}_B]$:

1. **Separación horizontal ($\Delta \text{col}$):**
   $$\Delta \text{col} = \begin{cases} 
   \text{minCol}_B - \text{maxCol}_A & \text{si } \text{minCol}_B > \text{maxCol}_A \\
   \text{minCol}_A - \text{maxCol}_B & \text{si } \text{minCol}_A > \text{maxCol}_B \\
   0 & \text{si hay solapamiento de columnas}
   \end{cases}$$

2. **Separación vertical ($\Delta \text{row}$):**
   $$\Delta \text{row} = \begin{cases} 
   \text{minRow}_B - \text{maxRow}_A & \text{si } \text{minRow}_B > \text{maxRow}_A \\
   \text{minRow}_A - \text{maxRow}_B & \text{si } \text{minRow}_A > \text{maxRow}_B \\
   0 & \text{si hay solapamiento de filas}
   \end{cases}$$

3. **Distancia en celdas y pies (Chebyshev):**
   $$\text{cells} = \max(\Delta \text{col}, \Delta \text{row})$$
   $$\text{feet} = \text{cells} \times 5$$

- **Tokens adyacentes:** Si $\text{cells} = 1$, la distancia es de **5 pies** (alcance cuerpo a cuerpo estándar de melé).
- **Armas con alcance (*Reach*):** Pueden impactar a objetivos con $\text{cells} \le 2$ (hasta **10 pies**).
- **Solapamiento:** Si $\text{cells} = 0$, los tokens comparten casilla (**0 pies**).

---

## Interacción de Usuarios y UI

1. **Flujo de Combate con Mapa Activo:**
   - El combatiente activo selecciona a su objetivo en la lista de iniciativa.
   - El sistema busca si existen tokens vinculados para ambos combatientes en el mapa cargado.
   - Si existen, calcula la distancia mediante `calculateTokenDistanceFeet()` y actualiza el campo de distancia con un distintivo visual (*"Medido en mapa: 20 pies"*).
   - Se evalúa la acción seleccionada contra la distancia:
     * Si es una espada (5 pies) y la distancia es 20 pies $\rightarrow$ aviso de fuera de alcance.
     * Si es un arco corto (80/320 pies) y la distancia es 5 pies $\rightarrow$ aviso de desventaja por disparo a corta distancia.
     * Si es un arco corto y la distancia es 20 pies $\rightarrow$ disparo normal óptimo.
   - Si no hay tokens o no hay mapa, el usuario puede seguir usando los botones de presets manuales (5, 10, 30, 60 ft) sin que la app lo bloquee (principio de *"La hoja avisa, no bloquea"*).

2. **Gestión de Criaturas Subordinadas en la Ficha:**
   - En la hoja del personaje, bajo la pestaña de combate o una pestaña dedicada "Compañeros", se listan los familiares/mascotas creados.
   - Un botón *"Añadir Compañero"* permite ingresar nombre, tipo, tamaño y estadísticas básicas.
   - Cada tarjeta de compañero cuenta con un botón *"Desplegar en Mapa"* (o solicitar al DM su colocación).
   - Cuando el token está en el mapa, el jugador puede moverlo libremente con el mouse o dedo.

3. **Cámara y Enfoque en el Mapa:**
   - En la esquina inferior del mapa (HUD del jugador), junto al botón de centrar en mi personaje, aparece un selector desplegable o botón secundario: *"Centrar en [Nombre del Compañero]"*.

---

## Seguridad y Reglas de Firebase

- Las reglas de Firestore vigentes ya admiten actualizaciones de movimiento de tokens cuando:
  `resource.data.tokens[request.resource.data.lastMove.tokenId].ownerUid == uid()`
- Las reglas de RTDB ya autorizan movimientos en vivo cuando:
  `root.child('rooms/' + $room + '/tokenOwners/' + $mid + '/' + $tid).val() === auth.uid`
- Por lo tanto, al registrar un token de compañero con `ownerUid = auth.uid` del jugador, **no se requieren cambios destructivos en las reglas de seguridad de Firebase**, garantizando compatibilidad total con la arquitectura existente.

---

## Criterios de Aceptación y Pruebas

1. **Pruebas Unitarias de Distancia Geométrica:**
   - Medición exacta entre dos tokens 1x1 contiguos (horizontal, vertical y diagonal) = 5 pies.
   - Medición exacta entre un token 1x1 y un token 2x2 (Grande) contiguos = 5 pies.
   - Medición a 2 casillas de distancia = 10 pies (alcance de alabarda / alcance cuerpo a cuerpo extendido).
   - Medición diagonal a 3 casillas = 15 pies.
   - Medición de tokens solapados = 0 pies.
2. **Pruebas de Validación de Alcance:**
   - Arma cuerpo a cuerpo estándar falla a $> 5$ pies.
   - Arma con propiedad Reach (10 pies) es válida a 10 pies pero falla a 15 pies.
   - Arma a distancia a 5 pies devuelve `disadvantage: true` (a quemarropa).
   - Arma a distancia entre rango normal y largo devuelve `disadvantage: true`.
   - Arma a distancia más allá del rango largo devuelve `valid: false`.
   - Conjuro de toque (Touch) es válido a 5 pies y falla a $> 5$ pies.
3. **Pruebas de Compañeros y Tokens:**
   - La estructura de `CharacterData` persiste `companions` de forma segura.
   - `canMoveToken` devuelve `true` para el jugador dueño tanto en su token principal como en su token de compañero.
   - Generación de token secundario con `ownerUid` correcto y `kind = 'companion' | 'mount' | 'summon'`.
4. **Pruebas de Integración y Suite Completa:**
   - Todos los tests existentes (1.143+) se mantienen pasando en verde.
   - La suite de tests nueva cubre todos los casos de esquina de distancias y permisos.
