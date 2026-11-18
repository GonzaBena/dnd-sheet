# Spec 11: Combate en la Hoja — dnd.gonzabena.com.ar

Nov 17, 2026 · @Gonzalo Benavente · **Estado: Cerrada**

Etapa H4 del [roadmap](../ROADMAP.md). Depende de H1 ([Spec 07](07-cimientos-de-la-hoja.spec.md)), H2 ([Spec 08](08-equipo.spec.md)) y H3 ([Spec 10](10-descansos-y-recursos.spec.md)).

---

## Objetivo y Alcance

Que **atacar, lanzar conjuros y recibir daño en la hoja de personaje respete las reglas oficiales de D&D 5e (SRD 5.1)** sin obligar a los jugadores o al Dungeon Master a memorizar excepciones, calcular CD sobre la marcha o llevar notas en papel sobre qué facultades ya se gastaron este turno.

Al cerrar esta etapa:
1. Al atacar con un arma o conjuro, el jugador puede activar modificadores opcionales al impacto y al daño (ej. *Ataque Furtivo*, *Castigo Divino*, *Inspiración Bárdica*, *Maniobras del Maestro de la Batalla*). **Si el ataque falla, el recurso o facultad no se gasta**; solo se descuenta si el ataque impacta.
2. Al lanzar un conjuro, la hoja valida de forma amigable sus componentes (**V, S, M**) según el equipo en manos y el inventario, permite lanzar conjuros con la etiqueta **Ritual (+10 minutos)** sin gastar espacios de conjuro si la clase lo permite, y descuenta el espacio de conjuro correspondiente de manera reactiva e inmediata.
3. Se garantiza la **unicidad de la concentración**: concentrarse en un nuevo conjuro retira el anterior con confirmación previa; y al recibir daño, la hoja detecta automáticamente si el personaje está concentrado y calcula la tirada de **salvación de Constitución con CD = máx(10, daño / 2)**, ofreciendo resolver la salvación con un solo clic.
4. Toda tirada de d20 sujeta a **Ventaja o Desventaja** muestra una **justificación clara y legible** de sus causas (armaduras sin competencia, desventaja en sigilo, efectos activos, alcances tácticos y condiciones), tirando 2d20 de forma interactiva y aplicando la regla de anulación mutua.

---

### Dentro del Alcance (v1)

1. **Selector de modificadores al impacto y consumo condicional "1 vez por turno":**
   - Detección automática de facultades y recursos disponibles que aplican al impacto o al daño (ej. *Sneak Attack* del Pícaro, *Divine Smite* del Paladín, *Bardic Inspiration*, Maniobras de combate, dados de daño extra por conjuros como *Marca del Cazador* o *Maleficio*).
   - Selector en la preparación del ataque y en la Torre de Dados (`DiceRollerModal`).
   - Flag de estado de turno (`turnConsumed: Record<string, boolean>`) en el estado volátil del personaje, con botón "Reiniciar Turno" / "Siguiente Turno" y sincronización con el tracker de combate.
   - **Regla condicional estricta:** Si el ataque falla contra la CA del objetivo, las facultades seleccionadas marcadas como "al impactar" no se descuentan.
2. **Validación de conjuros, componentes V/S/M, rituales y descuento de espacios:**
   - **Componente Verbal (V):** Alerta no bloqueante si el personaje sufre una condición o efecto de silencio/inmovilización vocal.
   - **Componente Somático (S):** Comprobación de manos ocupadas (armas de dos manos o arma + escudo). Si ambas manos están ocupadas sin canalizador o rasgo habilitante, la hoja advierte la restricción.
   - **Componente Material (M):** Detección de componentes en el inventario o foco arcano/bolsa de componentes; alerta destacada si el conjuro exige componentes con coste en oro o consumibles.
   - **Lanzamiento de Rituales:** Para conjuros con `ritual: true` en clases aptas (Mago, Clérigo, Druida, Bardo, etc.), opción de lanzar como ritual añadiendo 10 minutos y sin consumir espacios de conjuro.
   - **Descuento reactivo de espacios:** Descuento directo tanto desde el botón rápido del panel como desde el modal de detalle de conjuro (`SpellDetailModal`), con soporte para lanzamiento en niveles superiores (escalado de daño).
3. **Concentración activa y salvación al daño:**
   - Control de concentración en `activeEffects`: máximo 1 efecto activo de tipo concentración.
   - Al lanzar o aplicar un conjuro/efecto con concentración, si ya existe uno activo, se notifica y solicita confirmación: *"Ya estás concentrado en [Nombre]. ¿Deseas reemplazarlo? El efecto actual terminará."*
   - Al recibir daño (vía `hpTransaction` o ajuste de PG en la hoja): si el personaje mantiene un efecto de concentración, se calcula de inmediato la dificultad:
     $$\text{CD} = \max(10, \lfloor \text{daño} / 2 \rfloor)$$
   - Banner interactivo flotante en la hoja: *"⚡ Concentración en riesgo: Tira Salvación de CON (CD X)"*, con botón directo para abrir la Torre de Dados y opción rápida de mantener o perder la concentración.
4. **Ventaja y Desventaja explicadas en la Torre de Dados:**
   - Algoritmo unificado de evaluación de modificadores de tirada que recopila:
     * Penalización por armaduras sin competencia (`compat.ts`).
     * Desventaja en Sigilo por tipo de armadura.
     * Efectos activos (`op === 'advantage'` o `op === 'disadvantage'`).
     * Condiciones tácticas (Cegado, Envenenado, Derribado, Asustado, etc.).
     * Alcance de armas (a quemarropa o largo alcance de `tacticalCombat.ts`).
     * Maestrías de arma (ej. *Vex*, *Sap*).
   - Regla oficial 5e: si coexisten $\ge 1$ ventajas y $\ge 1$ desventajas, se anulan mutuamente resultando en una tirada normal.
   - Visualización explicativa en `DiceRollerModal`: cartel legible que lista el desglose de pros y contras y muestra los dos dados d20 en la ruleta, destacando el elegido (mayor o menor según corresponda).

---

### Fuera del Alcance (v1)

- Inteligencia artificial o cálculo automático de línea de visión con oclusión geométrica de paredes complejas (eso se gestiona en el VTT / Fog of War).
- Automatización de reacciones fuera de turno (ej. lanzar *Escudo* / *Shield* o *Contraconjuro* en el turno de un enemigo): esto corresponde a la etapa **H5 (Spec 12: Reacciones en Vivo)**.
- Desplazamiento táctico metro a metro y cálculo de áreas de efecto de plantilla sobre mapa: corresponde a **H6 (Spec 13: Alcance y Tokens)**.

---

## Usuarios y Beneficios

| Rol | Beneficio Concreto |
| --- | --- |
| **Jugador** | No tiene que calcular mentalmente si su Ataque Furtivo se gasta cuando falla un ataque; la hoja no consume sus recursos si no impacta. Cuando recibe daño mientras mantiene un conjuro, la hoja le calcula la CD exacta y le permite tirar la salvación de CON con un clic. |
| **Dungeon Master** | Ve que las tiradas de los jugadores vienen con sus ventajas o desventajas justificadas ("Ventaja por Flanqueo + Vex"). Sabe que los espacios de conjuro y la concentración se descuentan fielmente según las reglas SRD 5.1. |
| **Mesa Presencial / Mixta** | Quienes tiran dados físicos en la mesa pueden seguir introduciendo el número resultante; la hoja se encarga de evaluar si impacta, avisar sobre la concentración y explicar la ventaja. |

---

## Estado Actual del Repo (Punto de Partida)

| Área | Estado Actual | Ubicación |
| --- | --- | --- |
| **Ataques con Armas** | `buildAttackFromWeapon` y `upsertAttack` calculan bono e impacto base, pero no admiten selección previa de bonos de daño condicionales ni tracking de "1 vez por turno". | `src/scripts/dnd/weaponAttack.ts`, `src/components/combat/WeaponActionCard.astro` |
| **Tiradas de Daño Encadenadas** | `DiceRollerModal` encadena d20 e impacto a daño (`followUpDamage`), pero si el ataque falla solo muestra un botón de "tirar de todas formas"; no gestiona la deducción de recursos condicionales. | `src/components/modals/DiceRollerModal.astro:842-1000` |
| **Espacios de Conjuro** | `SpellcastingPanel` renderiza pips de ranuras 1–9 y descuenta con `useSpellSlot()`, pero no valida manos ocupadas ni componentes M, ni contempla lanzamiento como Ritual. | `src/components/combat/SpellcastingPanel.astro:82-108,595-685` |
| **Concentración en Efectos** | `applyEffectFlow.ts` comprueba si el efecto a aplicar tiene `duration.kind === 'concentration'` y pide confirmación para reemplazar, pero la concentración no se vincula al recibir daño. | `src/scripts/ui/applyEffectFlow.ts:73-77`, `src/scripts/dnd/effects.ts:66` |
| **Recepción de Daño** | `hpTransaction` y `applyHpOp` modifican los PG de forma atómica, pero no disparan evento ni banner de salvación de concentración. | `src/scripts/data/hpTransaction.ts`, `src/scripts/dnd/hp.ts` |
| **Ventaja / Desventaja** | `calculations.ts` tiene lógica estática para pasivas y `compat.ts` declara desventajas de armadura; `tacticalCombat.ts` tiene detección de desventaja por distancia, pero `DiceRollerModal` no cuenta con ruleta de 2d20 explicativa ni motor unificado de justificación. | `src/scripts/dnd/calculations.ts:58-96`, `src/components/modals/DiceRollerModal.astro` |

---

## Stack, Restricciones y Reglas de Arquitectura

Se aplican las reglas **D1–D13** del proyecto:
1. **Astro estático sin SSR:** Todo corre en el navegador. La reactividad se maneja con vanilla JS y eventos `CustomEvent` sobre `window`.
2. **Cero colecciones nuevas en Firestore:** Los estados de combate y concentración viven dentro del documento del personaje (`characters/{id}`).
3. **Eficiencia en Cuota Spark:**
   - La selección de modificadores al impacto y la pre-tirada ocurren en memoria del cliente.
   - El gasto de espacios de conjuro y recursos se persiste en el documento del personaje mediante `saveAndNotify()`.
4. **Pureza y Testabilidad:**
   - Las reglas de validación de componentes, cálculo de CD de concentración, ventaja/desventaja y modificadores condicionales se implementan como funciones puras en `src/scripts/dnd/combat.ts`.
   - Se testean con el runner nativo de Node (`node --test tests/combat_sheet.test.mjs`).
5. **Regla de Oro: La hoja avisa, no bloquea:**
   - Si un jugador carece de una mano libre para un componente somático o le falta el componente material, la interfaz emite una advertencia visual clara (`⚠️`), pero permite proceder si el DM así lo autoriza.

---

## 1. Modelo de Datos y Contratos (TypeScript)

### 1.1 Modificadores al Impacto y Daño (`CombatModifier`)

```ts
export type CombatModifierType = 'attack' | 'damage' | 'both';

export interface CombatModifierOption {
  id: string;
  name: string;
  description: string;
  type: CombatModifierType;
  /** Fórmula o número a añadir (ej. "+1d6", "+2d8", "+2", "+1d10") */
  formula: string;
  damageType?: string;
  /** Identificador de recurso que se gastará al impactar (ej. 'sneak-attack', 'spell-slot-1', 'bardic-inspiration') */
  resourceCost?: {
    resourceId?: string;
    spellSlotLevel?: number;
    amount: number;
    /** 'onHit' significa que solo se descuenta si el ataque impacta */
    consumeTiming: 'onHit' | 'onAttack';
  };
  /** Indica si esta opción es de "1 vez por turno" */
  oncePerTurn?: boolean;
  /** Si ya fue utilizada en el turno actual */
  usedThisTurn?: boolean;
}
```

### 1.2 Validación de Componentes de Conjuros

```ts
export interface SpellComponentCheck {
  canCast: boolean;
  warnings: string[];
  verbalOk: boolean;
  somaticOk: boolean;
  materialOk: boolean;
  hasFreeHand: boolean;
  hasFocusOrPouch: boolean;
  missingMaterial?: string;
}
```

### 1.3 Estado de Concentración y Chequeo de Daño

```ts
export interface ConcentrationStatus {
  isConcentrating: boolean;
  effectId?: string;
  sourceName?: string; // Ej: "Bendición", "Marca del Cazador"
  startedAt?: number;
}

export interface ConcentrationCheckRequired {
  characterId: string;
  damageTaken: number;
  dc: number; // Math.max(10, Math.floor(damageTaken / 2))
  sourceName: string;
  effectId: string;
}
```

### 1.4 Explicación de Ventaja / Desventaja

```ts
export type RollAdvantageState = 'normal' | 'advantage' | 'disadvantage';

export interface AdvantageEvaluation {
  state: RollAdvantageState;
  advantages: string[];     // Lista de motivos ("Flanqueo táctico", "Vex", etc.)
  disadvantages: string[];  // Lista de motivos ("Armadura sin competencia", "Envenenado", etc.)
  isCanceled: boolean;      // true si hubo tanto ventajas como desventajas
  summaryText: string;      // Resumen legible en español
}
```

---

## 2. Requisitos Funcionales

### RF-320: Selector de Modificadores al Impacto y Daño
- **RF-320.1:** En la tarjeta de acción de arma (`WeaponActionCard.astro`) y en el diálogo de tirada de ataque, debe desplegarse un selector de modificadores aplicables antes de tirar el d20.
- **RF-320.2:** La lista de modificadores se alimenta dinámicamente de:
  - Rasgos con uso "1 vez por turno" (ej. *Ataque Furtivo* si el personaje es Pícaro y usa arma sutil/a distancia).
  - Recursos disponibles (ej. *Inspiración Bárdica*, Dados de Golpe de Superioridad / Maniobras).
  - Espacios de conjuro para *Castigo Divino* (Paladín).
- **RF-320.3:** Los modificadores seleccionados se previsualizan con su fórmula adicional sumada al desglose del ataque o del daño.

### RF-321: Consumo Condicional "1 vez por turno"
- **RF-321.1:** Si el ataque falla (el d20 + bono no alcanza la CA del objetivo), cualquier modificador marcado con `consumeTiming: 'onHit'` **no se descuenta**.
- **RF-321.2:** Cuando el ataque impacta (supera la CA o el jugador pulsa "Confirmar Impacto"), los recursos asociados se descuentan automáticamente y se marcan como consumidos en el turno (`usedThisTurn = true`).
- **RF-321.3:** En la barra de combate de la hoja o junto a las armas, se incluye un botón rápido *"Nuevo Turno"* que restablece los usos de "1 vez por turno".

### RF-322: Validación de Conjuros y Componentes V/S/M
- **RF-322.1:** Analizar la cadena de componentes del conjuro (ej. `"V, S"`, `"V, S, M (una pluma)"`).
- **RF-322.2:** Comprobar si el personaje tiene al menos una mano libre para componentes somáticos (S), considerando el equipo empuñado (`equipped` en manos y escudo). Si ambas manos están ocupadas y el personaje no tiene foco canalizador integrado, mostrar aviso de incompatibilidad.
- **RF-322.3:** Comprobar componentes materiales (M) con coste en oro (ej. `"una perla que valga al menos 100 po"`). Avisar si el inventario no cuenta con el objeto o el dinero suficiente.
- **RF-322.4:** Permitir lanzar siempre; la hoja advierte pero no bloquea (Regla 3).

### RF-323: Lanzamiento como Ritual
- **RF-323.1:** Para cualquier conjuro catalogado como ritual (`ritual: true` o con etiqueta de ritual), habilitar la opción *"Lanzar como Ritual (+10 min)"*.
- **RF-323.2:** Lanzar como ritual añade una nota en la bitácora ("Lanzado como ritual: duración +10 min") y **no descuenta ningún espacio de conjuro**.

### RF-324: Descuento Automático de Espacios y Escalado
- **RF-324.1:** Al lanzar desde `SpellcastingPanel.astro` o `SpellDetailModal`, se descuenta de inmediato el espacio de nivel correspondiente (`useSpellSlot(level)`).
- **RF-324.2:** Si se lanza a un nivel superior (*Upcasting*), el daño adicional del conjuro se calcula y ajusta automáticamente según la regla del conjuro.

### RF-325: Gestión Activa de Concentración
- **RF-325.1:** Solo puede haber **un efecto** de concentración activo en `activeEffects`.
- **RF-325.2:** Si el usuario lanza o aplica un nuevo conjuro de concentración mientras ya mantiene otro, se muestra un diálogo de confirmación claro advirtiendo que el conjuro previo expirará. Al confirmar, el efecto anterior se retira de forma inmediata.

### RF-326: Salvación de Concentración al Recibir Daño
- **RF-326.1:** Al aplicarse daño a la salud del personaje (`hp.current` disminuye) a través de `hpTransaction` o la hoja, si el personaje tiene concentración activa:
  - Se calcula $\text{CD} = \max(10, \lfloor \text{daño recibido} / 2 \rfloor)$.
- **RF-326.2:** Se despliega un banner prominente en la hoja: *"Concentración amenazada: Tira Salvación de CON (CD {X})"*.
- **RF-326.3:** El banner ofrece dos acciones:
  1. *"Tirar Salvación de CON"*: abre la Torre de Dados configurada en d20 con el bono de salvación de Constitución del personaje y la CD fijada.
  2. *"Perder Concentración"*: cancela la concentración y elimina el efecto activo.
- **RF-326.4:** Si la tirada en la Torre de Dados es exitosa ($\ge \text{CD}$), se informa el éxito en la bitácora y se mantiene el efecto. Si falla, se ofrece remover el efecto con un clic.

### RF-327: Explicación Visible de Ventajas y Desventajas
- **RF-327.1:** Recopilar todas las fuentes activas de ventaja y desventaja aplicables a una tirada (armaduras sin competencia, desventaja en sigilo, efectos de condiciones, distancia táctica, etc.).
- **RF-327.2:** Aplicar la regla oficial 5e de anulación mutua.
- **RF-327.3:** Mostrar en `DiceRollerModal.astro` el desglose textual exacto:
  - Si es ventaja: *"Ventaja por: [Fuentes]"*.
  - Si es desventaja: *"Desventaja por: [Fuentes]"*.
  - Si se anulan: *"Tirada normal: Ventaja y Desventaja se neutralizan mutuamente"*.
- **RF-327.4:** Cuando hay ventaja o desventaja activa, la Torre de Dados lanza 2d20 (o solicita 2 valores en modo físico), iluminando el dado válido y atenuando el descartado.

---

## 3. Plan de Trabajo por Fases

```
Fase A: Modificadores al Impacto y Consumo 1 Vez por Turno
        │
        ▼
Fase B: Validación de Conjuros, Componentes V/S/M y Rituales
        │
        ▼
Fase C: Concentración Activa y Salvación al Daño (CD máx(10, daño/2))
        │
        ▼
Fase D: Ventaja/Desventaja Explicada, Verificación y Cierre
```

| Fase | Tareas | Archivos Principales | Entregable |
| --- | --- | --- | --- |
| **Fase A** | T-320 … T-323 | `src/scripts/dnd/combat.ts`, `src/scripts/models/combat.ts`, `WeaponActionCard.astro`, `DiceRollerModal.astro` | Selector de bonos de ataque/daño y consumo de facultades condicional al acertar. |
| **Fase B** | T-324 … T-327 | `src/scripts/dnd/spellcasting.ts`, `SpellcastingPanel.astro`, `SpellDetailModal.astro` | Validación de componentes V/S/M, lanzamiento como ritual sin espacios y descuento reactivo. |
| **Fase C** | T-328 … T-331 | `src/scripts/dnd/concentration.ts`, `src/scripts/state/characterStore.ts`, `src/scripts/ui/hpActions.ts`, banner UI | Control de concentración única y chequeo automático de salvación al daño con CD calculada. |
| **Fase D** | T-332 … T-335 | `src/scripts/dnd/advantage.ts`, `DiceRollerModal.astro`, `tests/combat_sheet.test.mjs` | Motor de ventaja/desventaja explicado, animación 2d20, suite de tests verdes y build estático. |

---

## 4. Criterios de Aceptación y Checklist de Cierre

- [x] **Ataque con Modificadores:** El jugador puede activar un bono (ej. *Ataque Furtivo* o *Inspiración*); si el ataque falla la tirada de impacto, el recurso no se descuenta; si acierta, se suma al daño y se consume.
- [x] **Regla 1 Vez por Turno:** Un botón "Nuevo Turno" o el avance de combate reinicia las facultades de 1 vez por turno.
- [x] **Validación de Conjuros:** Conjuros que requieren componentes somáticos con ambas manos ocupadas muestran advertencia; conjuros con coste en oro avisan si falta el objeto.
- [x] **Rituales:** Los conjuros rituales se pueden lanzar sin consumir ranuras de conjuro.
- [x] **Concentración Única:** Reemplazar un conjuro de concentración avisa y finaliza el anterior.
- [x] **Salvación al Daño:** Al recibir daño estando concentrado, la hoja alerta con la CD exacta ($\max(10, \lfloor \text{daño}/2 \rfloor)$) y permite tirar salvación de CON con un clic.
- [x] **Ventaja / Desventaja Explicadas:** Las tiradas muestran el desglose justificado de ventajas y desventajas según el equipo y condiciones activas.
- [x] **Tests y Build:** `tests/combat_sheet.test.mjs` y demás suites pasan al 100%, y `astro build` genera el sitio sin errores.
