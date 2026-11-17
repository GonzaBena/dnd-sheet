# Fase C: Modo Teatro de la Mente (TotM)

Nov 17, 2026 · **Estado: Cerrada**

## Objetivos
* Ofrecer un modo de combate abstracto y narrativo cuando no hay un mapa de cuadrícula cargado o para escaramuzas improvisadas.
* Estructurar el tablero en 3 zonas tácticas:
  1. *Cuerpo a Cuerpo (Melé, $\le 5$ ft)*
  2. *Rango Cercano (Medio Alcance, $30$ ft)*
  3. *Largo Alcance ($60+$ ft)*
* Calcular distancias algebraicas de forma automática para la lista de iniciativa (`InitiativeList`) respetando reglas de alcance y desventaja a quemarropa de H6.
* Añadir selector de modo en `MapStage` (`[ 🗺️ Cuadrícula | 🎭 Teatro de la Mente ]`).

## Cambios Implementados
1. `src/scripts/models/map.ts`: Tipos `TotmZone` y `TotmCombatantState`.
2. `src/scripts/vtt/tacticalCombat.ts`: Funciones `calculateTotmDistanceFeet` y extensión de `resolveCombatantDistance`.
3. `src/components/map/TheaterOfTheMindStage.astro`: Tablero interactivo con 3 columnas de zonas y movimiento táctico de combatientes.
4. `src/components/map/MapStage.astro`: Alternador de modo escenario en cabecera y montaje condicional de `TheaterOfTheMindStage`.
5. `src/components/party/InitiativeList.astro`: Resolución automática de distancias con badge `🎭 Teatro de la mente (X ft)`.
6. `tests/theater_of_the_mind.test.mjs`: Tests unitarios de medición por zonas y validación de armas.
