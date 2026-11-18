# Fase B — Validación Automática de Alcance en Combate · [Completada]

Plan de implementación para la **Fase B de la Spec 13 (H6)**.
Requisito cubierto: **RF-351** (Validación Automática de Alcance y Desventaja en Combate).
**Estado: Completada y verificada.**

---

## Objetivo

Integrar la detección automática de distancias tácticas en el selector de objetivos de combate (`InitiativeList.astro` y la hoja de personaje), reemplazando la necesidad de seleccionar manualmente los pies cuando hay un mapa activo con tokens colocados, y alertando de desventajas de combate (a quemarropa y largo alcance) o fuera de rango.

---

## Tareas

### T-354: Detección Automática de Distancia al Seleccionar Objetivo en `InitiativeList`
- Cuando se abre el modal de acción táctica contra un objetivo (`openTargetActionModal`):
  * Obtener el mapa activo de la campaña mediante `campaignStore` / `mapService`.
  * Invocar `resolveCombatantDistance(actor, target, activeMap)`.
  * Si se obtiene un resultado:
    - Establecer la distancia calculada en el visualizador (`#party-modal-distance-display`).
    - Añadir indicador o badge de procedencia: *"🎯 Medido en el mapa"*.
    - Activar el botón de preset coincidente o marcarlo como seleccionado.
  * Si no hay mapa o tokens:
    - Mantener el valor por defecto (5 pies) y los presets manuales (5, 10, 30, 60 ft) sin mostrar errores.

### T-355: Actualización Reactiva de Validación de Alcance
- Al cambiar de acción (arma, conjuro, objeto) o cambiar la distancia:
  * Evaluar el alcance con `validateActionForDistance(reach, distanceFeet)`:
    - Si `valid === false` (distancia > max):
      * Mostrar badge llamativo en rojo: `🚫 Fuera de alcance (máx ${reach.max} pies)`.
      * Resaltar el botón de tirada con aviso de advertencia ("Objetivo fuera de alcance"), sin bloquear de forma absoluta (permitiendo forzar si el DM lo autoriza).
    - Si `disadvantage === true`:
      * Si es arma a distancia a $\le 5$ pies: badge ámbar `⚠️ Desventaja (a quemarropa)`.
      * Si es a largo alcance: badge ámbar `⚠️ Desventaja (largo alcance)`.
      * Preseleccionar automáticamente el modo de tirada en "Desventaja" en el DiceRoller o avisar en la tarjeta.
    - Si `valid === true && !disadvantage`:
      * Badge verde: `✓ En alcance óptimo`.

### T-356: Sincronización en la Hoja de Personaje
- En la hoja del jugador, al tirar una acción de ataque con un objetivo seleccionado en el tracker de combate:
  * Comprobar la distancia con el token del combatiente objetivo.
  * Informar en el desglose de la tirada si se aplicó desventaja por distancia ("Largo alcance" o "A quemarropa").

### T-357: Pruebas de Integración de Validación de Alcance
- Pruebas en `tests/tactical_combat.test.mjs`:
  * Selección de objetivo con tokens a 30 pies y espada de 5 pies marca `valid: false`.
  * Selección de objetivo con tokens a 30 pies y arco corto (80/320) marca `valid: true, disadvantage: false`.
  * Selección de objetivo con tokens a 5 pies y arco marca `disadvantage: true` (a quemarropa).
  * Selección de objetivo con tokens a 120 pies y arco corto (80/320) marca `disadvantage: true` (largo alcance).

---

## Criterio de Cierre

La UI de `InitiativeList` refleja automáticamente la distancia de los tokens del mapa, clasifica correctamente el alcance de armas y conjuros, y la suite de tests pasa en verde.
