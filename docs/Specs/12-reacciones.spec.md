# Spec 12: Reacciones en Vivo — dnd.gonzabena.com.ar

Nov 17, 2026 · @Gonzalo Benavente · **Estado: Cerrada**

Etapa H5 del [roadmap](../ROADMAP.md). Depende de H1 ([Spec 07](07-cimientos-de-la-hoja.spec.md), efectos activos y recursos), H2 ([Spec 08](08-equipo.spec.md), armaduras y armas), H3 ([Spec 10](10-descansos-y-recursos.spec.md), descansos) y H4 ([Spec 11](11-combate-en-la-hoja.spec.md), combate en la hoja y concentración).

---

## Objetivo y Alcance

Permitir que los jugadores y el Dungeon Master **detecten, ofrezcan y ejecuten reacciones de combate en tiempo real fuera de su turno** (durante el turno de un adversario o de un aliado) según las reglas oficiales de **D&D 5e (SRD 5.1)**, sin interrumpir el ritmo de la partida con pausas incómodas ni olvidar qué personaje ya gastó su única reacción del asalto.

Al cerrar esta etapa:
1. **Gestión unificada del recurso "Reacción":** Cada combatiente tiene exactamente **1 Reacción por asalto (ronda)**. Se rastrea de forma reactiva en la ficha (`turnState.reactionUsed`) y en el `CombatTracker` del DM. Se consume al ejecutar cualquier reacción y **se restablece automáticamente al inicio del turno del propio combatiente** (o manualmente con un clic en la hoja y en el panel del DM).
2. **Detección inteligente de oportunidades:** Al ocurrir un evento detonante en el combate (un ataque impacta la CA del personaje, se recibe daño elemental, un enemigo sale del alcance cuerpo a cuerpo, etc.), la hoja evalúa en milisegundos los conjuros conocidos/preparados con ranuras disponibles y los rasgos/dotes de la ficha para identificar qué reacciones son aplicables.
3. **Banner contextual no bloqueante (`ReactionPromptBanner`):** Si hay reacciones viables y la reacción está disponible, el jugador recibe un aviso flotante claro (ej. *"⚡ ¡Ataque impacta tu CA 14! ¿Lanzar Escudo (+5 CA)? [Usar Escudo] [Omitir]"*), permitiendo resolver la reacción con un solo clic o descartarla rápidamente.
4. **Resolución mecánica inmediata:** 
   - ***Escudo* (*Shield*):** Aplica reactivamente el efecto `+5 CA` con duración *"hasta el inicio de tu próximo turno"*, evalúa si el ataque que detonó la reacción ahora falla y descuenta 1 ranura de conjuro nivel 1+.
   - ***Esquiva Asombrosa* (*Uncanny Dodge*):** Para pícaros de nivel 5+, divide a la mitad ($\lfloor \text{daño} / 2 \rfloor$) el daño recibido de un atacante visible antes de consolidar la pérdida de PG.
   - ***Absorber Elementos* (*Absorb Elements*):** Otorga resistencia inmediata al tipo elemental recibido (fuego, frío, ácido, rayo, trueno) y aplica un modificador de daño extra (+1d6) al siguiente ataque cuerpo a cuerpo.
   - ***Ataque de Oportunidad*:** Abre de inmediato la Torre de Dados para tirar con el arma cuerpo a cuerpo principal contra el enemigo que abandona el alcance.
   - ***Castigo Infernal* (*Hellish Rebuke*):** Descuenta la ranura de conjuro y registra en la bitácora la tirada de daño (2d10 de fuego) y la salvación de DES (CD del personaje) para el agresor.
5. **Catálogo manual en la hoja y visibilidad para el DM:** La hoja cuenta con una sección/pestaña dedicada a "Reacciones" con lista de todas las reacciones posibles y botón de activación manual. El DM ve en su lista de iniciativa qué criaturas ya gastaron su reacción con un distintivo visual `[⚡]`.

---

### Dentro del Alcance (v1)

1. **Gestión del recurso Reacción (RF-340):**
   - Estado de reacción en `character.turnState.reactionUsed: boolean`.
   - Estado de reacción en el combatiente del VTT (`Combatant.reactionUsed?: boolean`).
   - Ciclo de asalto: reseteo automático de la reacción cuando la iniciativa avanza y comienza el turno de esa criatura (`nextTurn` / `advanceTurn`).
   - Controles manuales: indicador interactivo en la cabecera/sección de combate de la hoja (*"⚡ Reacción Disponible / Gastada"*) y botón de alternancia en cada combatiente del `CombatTracker`.
   - Soporte para reinicio de turno local en la hoja sin VTT activo.

2. **Motor de Detección de Reacciones por Disparador (RF-341):**
   - Clasificación de disparadores:
     * `attack_hits`: Un ataque iguala o supera la CA del personaje.
     * `damage_taken`: El personaje sufre una reducción de PG (con tipo de daño opcional: `fire`, `cold`, `lightning`, `acid`, `thunder`, `any`).
     * `opportunity_attack`: Una criatura hostil abandona el área de amenaza cuerpo a cuerpo.
     * `spell_cast`: Una criatura a la vista lanza un conjuro (detección manual o declarada).
     * `manual`: Activación libre por decisión del jugador.
   - Filtrado automático según disponibilidad de recursos:
     * Ranuras de nivel apropiado para conjuros.
     * Requisitos de equipo (ej. tener escudo equipado para dotes defensivas de escudo).
     * Nivel de clase requerido (ej. Pícaro nivel 5+ para Esquiva Asombrosa).
     * Verificación de que la reacción no haya sido consumida en la ronda en curso.

3. **Resolución Mecánica de Reacciones Oficiales SRD 5.1 (RF-342):**
   - Implementación pura en `src/scripts/dnd/reactions.ts`:
     * Conjuro *Escudo* (*Shield*): +5 CA temporal con tipo de duración `untilNextTurn`.
     * Conjuro *Absorber Elementos* (*Absorb Elements*): resistencia al elemento recibido + bono al próximo impacto.
     * Rasgo *Esquiva Asombrosa* (*Uncanny Dodge*): reducción a la mitad del daño de la transacción actual.
     * *Ataque de Oportunidad*: disparo directo a la ruleta de ataque con arma cuerpo a cuerpo.
     * Conjuro *Castigo Infernal* (*Hellish Rebuke*): evento de reacción con salvación y daño.
   - Descuento reactivo de ranuras o usos de recursos con `saveAndNotify()`.
   - Publicación del evento en la bitácora pública de la mesa (`partyLog` / `#Combate`).

4. **UI Reactiva y Banner de Decisión (`ReactionPromptBanner`) (RF-343):**
   - Banner emergente en la parte inferior de la pantalla del jugador cuando se detecta un detonante mientras la reacción está disponible.
   - Presenta el evento detonante, el desglose de la reacción sugerida y botones de acción rápida (*"Lanzar Escudo"*, *"Usar Esquiva Asombrosa"*, *"Omitir"*).
   - Selector de nivel de espacio de conjuro en caso de escalado (upcasting).
   - Comportamiento no intrusivo: no bloquea la navegación de la hoja y puede cerrarse en cualquier momento.

5. **Panel de Reacciones en la Hoja y Control del DM (RF-344):**
   - Pestaña o bloque "Reacciones" en el panel de combate y acciones de la hoja (`WeaponActionCard` / `SpellcastingPanel`).
   - Muestra descripción, detonante, alcance y costo de cada reacción que posee el personaje.
   - En el `CombatTracker` del DM: indicador `⚡` junto a la CA de cada combatiente; color ámbar si la reacción está disponible, atenuado si ya fue gastada en la ronda actual.

---

### Fuera del Alcance (v1)

- Inteligencia artificial para decidir automáticamente si al jugador le conviene gastar una ranura en *Escudo* o no: la decisión siempre la toma el jugador mediante el prompt o el botón manual.
- Intercepción de paquetes de red o websocket peer-to-peer personalizado: se utiliza la infraestructura existente de Firestore / Realtime Database (`combatService`, `partyLog` y eventos DOM).
- Medición de conos, esferas o plantillas de área en el mapa: corresponde a **H8 (Spec 15: Zonas de Hechizo)**.
- Desplazamiento metro a metro con tokens de compañeros/invocaciones: corresponde a **H6 (Spec 13: Alcance y Tokens)**.

---

## Requisitos Funcionales

| ID | Requisito | Descripción |
| --- | --- | --- |
| **RF-340** | **Recurso Reacción y Ciclo de Asalto** | El personaje y cada combatiente del tracker poseen un flag booleano `reactionUsed` (1 uso por ronda). Se restablece automáticamente cuando el turno de la criatura comienza en la iniciativa (`nextTurn`) o manualmente en la UI. |
| **RF-341** | **Motor de Detección de Reacciones** | Función pura `findAvailableReactions(character, trigger)` que evalúa conjuros preparados con tiempo de reacción, ranuras vigentes y rasgos de clase activos frente a un detonante (`attack_hits`, `damage_taken`, `opportunity_attack`, `manual`). |
| **RF-342** | **Mecánicas SRD 5.1 de Reacciones Clave** | Soporte específico para *Escudo* (+5 CA hasta el inicio del próximo turno e inmunidad a Proyectil Mágico), *Esquiva Asombrosa* (½ daño recibido), *Absorber Elementos* (resistencia elemental + daño de retorno) y *Ataque de Oportunidad*. |
| **RF-343** | **Banner Flotante de Decisión** | Componente visual `ReactionPromptBanner` que escucha eventos en vivo de ataque y daño, alertando al jugador con opciones de ejecución o descarte con 1 solo clic. |
| **RF-344** | **Panel de Reacciones y Control del DM** | Sección visual en la hoja con el listado de reacciones disponibles y sus detonantes, e indicador visual interactivo `[⚡]` en el `CombatTracker` del DM. |

---

## Modelo de Datos

### Tipos en `src/scripts/models/reaction.ts`

```typescript
export type ReactionTriggerType =
  | 'attack_hits'         // Un ataque iguala o supera la CA
  | 'damage_taken'        // Recibe daño de cualquier tipo o elemental
  | 'opportunity_attack'  // Criatura hostil abandona alcance cuerpo a cuerpo
  | 'spell_cast'          // Criatura a la vista lanza un conjuro
  | 'ally_attacked'       // Aliado adyacente es atacado
  | 'manual';             // Activación a demanda por el usuario

export interface ReactionTriggerPayload {
  triggerType: ReactionTriggerType;
  sourceCombatantName?: string;
  targetCharacterId: string;
  attackRoll?: number;
  targetAc?: number;
  damageAmount?: number;
  damageType?: string; // 'fire', 'cold', 'lightning', 'acid', 'thunder', etc.
  spellName?: string;
}

export interface AvailableReaction {
  id: string;
  name: string;
  sourceType: 'spell' | 'feature' | 'action';
  description: string;
  triggerDescription: string;
  resourceCost?: {
    spellSlotLevel?: number;
    resourceId?: string;
    amount?: number;
  };
  effectSummary: string;
  canExecute: boolean;
  reasonDisabled?: string;
}

export interface ReactionExecutionResult {
  success: boolean;
  reactionName: string;
  logMessage: string;
  appliedEffectName?: string;
  consumedSlotLevel?: number;
  damageMitigated?: number;
}
```

### Ampliación del Modelo de Criatura y Combate

1. En `src/scripts/models/combat.ts`:
   ```typescript
   export interface Combatant {
     // ... campos existentes ...
     /** Indica si el combatiente ya gastó su reacción en la ronda actual */
     reactionUsed?: boolean;
   }
   ```

2. En `src/scripts/models/character.ts`:
   ```typescript
   export interface CharacterData {
     // ...
     turnState?: {
       usedModifiers?: string[];
       /** Indica si la reacción fue gastada en la ronda en curso */
       reactionUsed?: boolean;
     };
   }
   ```

3. En `src/scripts/models/effect.ts`:
   ```typescript
   export type EffectDuration =
     | { kind: 'rounds'; remaining: number }
     | { kind: 'untilRest'; rest: 'short' | 'long' }
     | { kind: 'concentration' }
     | { kind: 'untilUsed' }
     | { kind: 'untilNextTurn' } // Nuevo: expira al inicio del próximo turno del personaje
     | { kind: 'indefinite' };
   ```

---

## Criterios de Aceptación (Definición de Terminado)

1. **Gestión de Reacción:** Un personaje con reacción disponible puede gastarla con un clic; una vez gastada, la hoja muestra *"⚡ Reacción Gastada"* y no ofrece nuevas reacciones hasta que se restablezca.
2. **Ciclo de Turno:** Al avanzar la iniciativa en el `CombatTracker`, el combatiente que entra en su turno recupera automáticamente su reacción (`reactionUsed: false`).
3. **Escudo (*Shield*):** Al activarse ante un impacto, se descuenta 1 ranura de conjuro nivel 1, se aplica el efecto de +5 CA en la hoja, se recalcula la CA inmediatamente y se registra el evento en la bitácora.
4. **Esquiva Asombrosa (*Uncanny Dodge*):** Al recibir daño de un ataque, un pícaro de nivel 5+ con reacción disponible puede reducir el daño recibido a la mitad ($\lfloor \text{daño} / 2 \rfloor$).
5. **Absorber Elementos:** Al recibir daño elemental (fuego, frío, etc.), ofrece la reacción, otorga resistencia al elemento y prepara el bono de daño para el siguiente turno.
6. **Integración con el DM:** El DM puede ver en el `CombatTracker` qué criaturas han gastado su reacción y puede alternar el indicador con un solo clic.
7. **Suite de Tests Verdes:** Nueva suite `tests/reactions.test.mjs` con cobertura de todas las reglas de reacción, y tests E2E y de build estático 100% limpios.
