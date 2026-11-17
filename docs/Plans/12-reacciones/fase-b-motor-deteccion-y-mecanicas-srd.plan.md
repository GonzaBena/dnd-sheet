# Fase B — Motor de Detección de Reacciones y Mecánicas SRD 5.1

Parte de la implementación de la [Spec 12: Reacciones en Vivo](../../Specs/12-reacciones.spec.md).

---

## Objetivo

Implementar la lógica pura de detección y resolución de reacciones oficiales de D&D 5e en un módulo dedicado `src/scripts/dnd/reactions.ts`. El sistema debe evaluar de forma inmediata qué reacciones son viables frente a un detonante (`attack_hits`, `damage_taken`, etc.), comprobar ranuras de conjuro o usos de dotes, y aplicar los efectos correspondientes (*Escudo*, *Esquiva Asombrosa*, *Absorber Elementos*, *Ataque de Oportunidad*).

---

## Requisitos que Cubre

- **RF-341:** Motor de Detección de Reacciones por Disparador.
- **RF-342:** Mecánicas SRD 5.1 de Reacciones Clave (*Escudo*, *Esquiva Asombrosa*, *Absorber Elementos*, *Ataque de Oportunidad*, *Castigo Infernal*).

---

## Tareas

### T-344: Catálogo y Especificación de Reacciones Estándar SRD 5.1
- En `src/scripts/dnd/reactions.ts`:
  * Definir el catálogo de reacciones base con sus reglas oficiales:
    1. **Escudo (*Shield*):**
       - Detonante: `attack_hits` o impacto de *Proyectil Mágico*.
       - Costo: 1 ranura nivel 1+.
       - Efecto: Modificador `target: 'ac', op: 'add', value: 5` con duración `untilNextTurn`.
       - Inmunidad a *Proyectil Mágico* documentada en el log.
    2. **Esquiva Asombrosa (*Uncanny Dodge*):**
       - Detonante: `damage_taken` de un atacante visible (Pícaro nivel 5+).
       - Costo: Gratuito (solo consume la reacción de la ronda).
       - Efecto: Reduce a la mitad el daño recibido en el golpe ($\lfloor \text{daño} / 2 \rfloor$).
    3. **Absorber Elementos (*Absorb Elements*):**
       - Detonante: `damage_taken` de tipo elemental (`fire`, `cold`, `lightning`, `acid`, `thunder`).
       - Costo: 1 ranura nivel 1+.
       - Efecto: Resistencia al tipo de daño elemental recibido en ese impacto (daño a la mitad) y efecto activo de `+1d6` (o escalado) al daño del próximo ataque cuerpo a cuerpo.
    4. **Ataque de Oportunidad:**
       - Detonante: `opportunity_attack` cuando un enemigo abandona el alcance cuerpo a cuerpo.
       - Requisito: Arma cuerpo a cuerpo equipada en mano principal o secundaria.
       - Efecto: Dispara tirada de ataque estándar con el arma designada.
    5. **Castigo Infernal (*Hellish Rebuke*):**
       - Detonante: `damage_taken` por una criatura visible a 60 pies.
       - Costo: 1 ranura nivel 1+.
       - Efecto: Salvación de DES vs CD del personaje y tirada de daño (2d10 fuego a nivel 1).

### T-345: Algoritmo Detector `findAvailableReactions`
- Implementar la función pura:
  ```typescript
  export function findAvailableReactions(
    character: CharacterData,
    trigger: ReactionTriggerPayload
  ): AvailableReaction[]
  ```
- Si la reacción del personaje ya fue gastada (`character.turnState?.reactionUsed`), todas las reacciones devuelven `canExecute: false` con `reasonDisabled: 'Ya usaste tu reacción este asalto'`.
- Evaluar conjuros preparados/conocidos que coincidan con el detonante y comprobar disponibilidad de espacios de conjuro de nivel 1 a 9 (`character.spellcasting.slots`).
- Evaluar rasgos de clase (`character.features`) y armas equipadas (`character.actions`).

### T-346: Función de Ejecución `executeReaction`
- Implementar:
  ```typescript
  export function executeReaction(
    character: CharacterData,
    reactionId: string,
    options?: { spellSlotLevel?: number; damageTaken?: number }
  ): {
    updatedCharacter: CharacterData;
    result: ReactionExecutionResult;
  }
  ```
- Si la reacción requiere ranura de conjuro: invoca `useSpellSlot` descontando el nivel indicado.
- Si aplica modificador temporal (ej. *Escudo*): añade un `ActiveEffect` con `duration: { kind: 'untilNextTurn' }`.
- Si mitiga daño (ej. *Esquiva Asombrosa* o *Absorber Elementos*): calcula el monto mitigado y ajusta los PG resultantes.
- Marca `reactionUsed: true` en `turnState`.

### T-347: Tests Unitarios del Motor de Reacciones
- Crear archivo `tests/reactions.test.mjs` probando:
  * Detección de *Escudo* ante impacto a la CA y verificación de ranuras.
  * Inviabilidad de *Escudo* si no hay ranuras o la reacción ya se gastó.
  * Cálculo de mitigación de daño con *Esquiva Asombrosa* en pícaro nivel 5+.
  * Resistencia y bono de daño en *Absorber Elementos*.
  * Expiración correcta del bono de CA de *Escudo* con `resetReaction`.

---

## Verificación

- Ejecutar `node --test tests/reactions.test.mjs` y verificar que todas las aserciones de reglas pasen limpiamente.
