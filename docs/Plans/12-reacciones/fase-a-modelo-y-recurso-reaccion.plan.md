# Fase A — Modelo de Datos y Recurso "Reacción" (1 por Asalto)

Parte de la implementación de la [Spec 12: Reacciones en Vivo](../../Specs/12-reacciones.spec.md).

---

## Objetivo

Establecer las estructuras de datos y la máquina de estados del recurso **Reacción** en el personaje (`CharacterData`), en los efectos activos (`EffectDuration`) y en los combatientes del VTT (`Combatant`). Al finalizar esta fase, el personaje y cada criatura en iniciativa tienen un control estricto de su única reacción por ronda, que se consume al usarse y se recarga automáticamente al comenzar su propio turno de combate.

---

## Requisitos que Cubre

- **RF-340:** Recurso Reacción y ciclo de recuperación al inicio del turno del combatiente.

---

## Tareas

### T-340: Tipos de Reacción en `src/scripts/models/reaction.ts`
- Crear el archivo `src/scripts/models/reaction.ts` con las interfaces:
  * `ReactionTriggerType`: `'attack_hits' | 'damage_taken' | 'opportunity_attack' | 'spell_cast' | 'ally_attacked' | 'manual'`.
  * `ReactionTriggerPayload`: información del evento detonante (atacante, tirada de ataque, CA objetivo, monto de daño, tipo de daño elemental, etc.).
  * `AvailableReaction`: definición estructurada de una reacción utilizable (id, nombre, fuente, descripción de detonante, costo de recursos, etc.).
  * `ReactionExecutionResult`: informe tras ejecutar una reacción (éxito, mensaje de registro, ranura consumida, CA otorgada o daño mitigado).

### T-341: Duración `untilNextTurn` en `src/scripts/models/effect.ts` y Expiración en `effects.ts`
- En `src/scripts/models/effect.ts`, agregar `{ kind: 'untilNextTurn' }` a la unión `EffectDuration`.
- En `src/scripts/dnd/effects.ts`:
  * Crear función `expireUntilNextTurn(effects: ActiveEffect[]): { remaining: ActiveEffect[]; expired: ActiveEffect[] }` que retira los efectos de esta duración.
  * Añadir tests unitarios que comprueben que los efectos con `untilNextTurn` se conservan durante el asalto del enemigo y expiran al comenzar el turno del personaje.

### T-342: Ampliación de Modelos de Personaje y Combatiente
- En `src/scripts/models/combat.ts`:
  * Agregar `reactionUsed?: boolean` a la interfaz `Combatant`.
- En `src/scripts/models/character.ts`:
  * Ampliar `turnState` para incluir `reactionUsed?: boolean`.
- En `src/scripts/state/characterStore.ts`:
  * `isReactionAvailable(): boolean`: retorna `!this.character.turnState?.reactionUsed`.
  * `useReaction(name: string): boolean`: marca `reactionUsed: true`, guarda y emite el evento `'character-reaction-changed'`.
  * `resetReaction(): void`: marca `reactionUsed: false`, expira efectos de duración `untilNextTurn`, guarda y emite `'character-reaction-changed'`.

### T-343: Ciclo de Recuperación en la Iniciativa (`src/scripts/vtt/initiative.ts`)
- En `nextTurn(combat: Combat): Combat`:
  * Al determinar el nuevo `nextIndex`, identificar al combatiente que toma el turno (`combat.combatants[nextIndex]`).
  * Si ese combatiente tenía `reactionUsed: true`, restablecerlo a `false`.
- En `prevTurn(combat: Combat): Combat`:
  * Manejo consistente del retroceso de turno sin inconsistencias de estado.

---

## Verificación

- Ejecutar tests unitarios para validar que `resetReaction()` restablece el recurso y que `nextTurn` en iniciativa restablece `reactionUsed: false` del combatiente que entra en turno.
