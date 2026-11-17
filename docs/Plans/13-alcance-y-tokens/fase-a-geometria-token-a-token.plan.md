# Fase A — Geometría Táctica Token a Token y Medición 5e · [Completada]

Plan de implementación para la **Fase A de la Spec 13 (H6)**.
Requisito cubierto: **RF-350** (Geometría Token a Token Borde a Borde).
**Estado: Completada y verificada.**

---

## Objetivo

Implementar funciones matemáticas puras en `src/scripts/vtt/tacticalCombat.ts` (sin dependencias de DOM, UI ni Firebase) que calculen la distancia en celdas y pies entre dos tokens de cualquier tamaño (1 a 4 celdas) bajo las reglas oficiales 5e (distancia Chebyshev 5/5/5 borde a borde).

---

## Tareas

### T-350: Cálculo de Límites de Celdas de un Token (`getTokenGridBounds`)
- Entrada:
  * `token`: `{ x: number; y: number; size: number }` (en px de imagen original).
  * `grid`: `{ size: number; offsetX: number; offsetY: number }`.
- Salida:
  * `TokenBounds`: `{ minCol: number; maxCol: number; minRow: number; maxRow: number }`.
- Lógica:
  * `gridSize = Math.max(1, grid.size)`.
  * `tokenCells = Math.max(1, token.size || 1)`.
  * `minCol = Math.round((token.x - grid.offsetX) / gridSize)`.
  * `minRow = Math.round((token.y - grid.offsetY) / gridSize)`.
  * `maxCol = minCol + tokenCells - 1`.
  * `maxRow = minRow + tokenCells - 1`.

### T-351: Cálculo de Distancia Borde a Borde (`calculateTokenDistanceFeet`)
- Entrada:
  * `tokenA`: `Pick<Token, 'x' | 'y' | 'size'>`.
  * `tokenB`: `Pick<Token, 'x' | 'y' | 'size'>`.
  * `grid`: `GridConfigLike`.
- Salida:
  * `TokenDistanceResult`:
    ```typescript
    export interface TokenDistanceResult {
      cells: number;
      feet: number;
      adjacent: boolean;
      overlapping: boolean;
    }
    ```
- Lógica:
  * Calcular `boundsA` y `boundsB` con `getTokenGridBounds`.
  * Calcular separación horizontal:
    $$\Delta \text{col} = \begin{cases}
    \text{minCol}_B - \text{maxCol}_A & \text{si } \text{minCol}_B > \text{maxCol}_A \\
    \text{minCol}_A - \text{maxCol}_B & \text{si } \text{minCol}_A > \text{maxCol}_B \\
    0 & \text{en otro caso}
    \end{cases}$$
  * Calcular separación vertical:
    $$\Delta \text{row} = \begin{cases}
    \text{minRow}_B - \text{maxRow}_A & \text{si } \text{minRow}_B > \text{maxRow}_A \\
    \text{minRow}_A - \text{maxRow}_B & \text{si } \text{minRow}_A > \text{maxRow}_B \\
    0 & \text{en otro caso}
    \end{cases}$$
  * `cells = Math.max(deltaCol, deltaRow)`.
  * `feet = cells * 5`.
  * `adjacent = cells === 1`.
  * `overlapping = cells === 0`.

### T-352: Resolución de Distancia entre Combatientes (`resolveCombatantDistance`)
- Entrada:
  * `actor`: `{ id: string; tokenId?: string; characterId?: string }`.
  * `target`: `{ id: string; tokenId?: string; characterId?: string }`.
  * `mapDoc`: `Pick<MapDoc, 'grid' | 'tokens'> | null | undefined`.
- Salida:
  * `TokenDistanceResult | null`.
- Lógica:
  * Si `mapDoc` no existe o no tiene tokens, retorna `null`.
  * Busca el token del `actor` en `mapDoc.tokens`:
    1. Por `actor.tokenId`.
    2. O por coincidencia en `token.characterId === actor.characterId`.
  * Busca el token del `target` con la misma jerarquía.
  * Si ambos tokens existen en el mapa, calcula y retorna `calculateTokenDistanceFeet(tokenA, tokenB, mapDoc.grid)`.
  * Si alguno no tiene token colocado en el mapa, retorna `null` (indicando fallback manual).

### T-353: Suite de Pruebas Unitarias (`tests/tactical_distance.test.mjs`)
- Casos de prueba:
  * Dos tokens 1x1 ortogonalmente adyacentes: `cells: 1`, `feet: 5`, `adjacent: true`.
  * Dos tokens 1x1 diagonalmente adyacentes: `cells: 1`, `feet: 5`, `adjacent: true` (regla 5/5/5).
  * Token 1x1 y Token 2x2 (Grande) contiguos: `feet: 5`.
  * Dos tokens separados por 1 casilla vacía: `cells: 2`, `feet: 10`, `adjacent: false` (rango de alabarda).
  * Dos tokens a 5 casillas de distancia: `feet: 25`.
  * Dos tokens solapados en la misma casilla: `cells: 0`, `feet: 0`, `overlapping: true`.
  * `resolveCombatantDistance` con tokens presentes retorna distancia correcta.
  * `resolveCombatantDistance` con tokens ausentes retorna `null`.

---

## Criterio de Cierre

Todos los tests de `tests/tactical_distance.test.mjs` pasan en verde con `node --test tests/tactical_distance.test.mjs`.
