# Spec 10: Descansos y Recursos — dnd.gonzabena.com.ar

Nov 17, 2026 · @Gonzalo Benavente · **Estado: Cerrada**

Etapa H3 del [roadmap](../ROADMAP.md). Depende de H1 ([Spec 07](07-cimientos-de-la-hoja.spec.md)) y H2 ([Spec 08](08-equipo.spec.md)).

---

## Objetivo y Alcance

Automatizar y transformar la mecánica de recuperación de salud y recursos diarios en una experiencia viva, interactiva y fiel a las reglas oficiales de **D&D 5e (SRD 5.1)**, tanto para juego presencial en mesa con dados físicos como para juego virtual online.

En 5e, descansar es un momento táctico y narrativo fundamental:
- En un **Descanso Corto (1 hora)**, los aventureros vendan sus heridas gastando sus Dados de Golpe uno a uno, sumando su modificador de Constitución, viendo subir sus puntos de golpe y decidiendo si gastan otro dado o se detienen.
- En un **Descanso Largo (8 horas)**, recuperan el 100% de sus puntos de golpe, recuperan hasta la mitad de sus Dados de Golpe máximos (eligiendo cuáles en personajes multiclase), recargan todos sus espacios de conjuro y facultades, obtienen nuevas tiradas para rasgos como *Portento* del Mago de Adivinación, y ven un **resumen interactivo claro** de todo lo recuperado y los efectos que han expirado.

### Dentro del Alcance (v1)

1. **Modelo de Dados de Golpe con soporte monoclass y multiclass:**
   - Compatibilidad total hacia atrás con el modelo simple `{ total: number, remaining: number, die: string }`.
   - Soporte opcional estructurado para múltiples reservas de dados (`pools?: HitDicePool[]`), donde cada reserva registra su tipo de dado (`d6`, `d8`, `d10`, `d12`), total y disponibles.
   - Sincronización y migración idempotente en `recalculateCharacter` para garantizar que la suma de dados coincida con el nivel del personaje.
2. **Descanso Corto interactivo y táctil:**
   - Selección flexible de la cantidad y tipo de Dados de Golpe a gastar.
   - Tirada paso a paso o en lote con suma automática del modificador de Constitución por cada dado (mínimo 0 puntos curados por dado de golpe, según SRD 5.1).
   - Doble modo de entrada: tirada virtual con ruleta/animación o ingreso manual de tirada con dados físicos en mesa.
   - Previsualización dinámica de la barra de salud mientras se tiran dados, permitiendo detenerse al alcanzar el máximo de PG sin desperdiciar dados ("El jugador puede decidir tirar un dado más tras ver el resultado anterior").
   - Restablecimiento automático de recursos con `rechargeOn: 'shortRest'` (Forma Salvaje, Segundo Aliento, Espacios de Pacto del Brujo, etc.).
   - Expiración de efectos activos de duración "hasta descanso corto".
3. **Descanso Largo automático y guiado:**
   - Restauración completa de PG al 100% (`hp.current = hp.max`).
   - Recuperación automática de hasta la mitad de los Dados de Golpe máximos (mínimo 1 dado): `Math.max(1, Math.floor(totalHitDice / 2))`.
   - En personajes multiclase, asignación inteligente sugerida (priorizando dados mayores: d12 > d10 > d8 > d6) con posibilidad de ajuste manual por el jugador.
   - Restablecimiento de todos los espacios de conjuro (niveles 1–9 y pacto).
   - Restablecimiento de todos los recursos diarios (`rechargeOn === 'longRest'` y `'shortRest'`).
   - Expiración de efectos activos "hasta descanso corto" y "hasta descanso largo".
4. **Dados guardados (Portento / Portent del Mago de Adivinación y similares):**
   - Recursos con soporte para almacenar valores numéricos (`values?: number[]`, `dieType?: string`).
   - Al finalizar un descanso largo, se lanzan automáticamente las tiradas correspondientes (ej. 2d20 para Mago de Adivinación nivel 2–13, o 3d20 a nivel 14+) o se ingresan los resultados físicos de la mesa, guardándose en el recurso.
   - Interfaz en la hoja y en la Torre de Dados para inspeccionar los dados guardados disponibles y gastarlos con un clic para sustituir una tirada.
5. **Resumen Interactivo del Descanso ("Bitácora de Reposo"):**
   - Modal o diálogo interactivo post-descanso que desglosa detalladamente:
     * PG recuperados y salud actual / máxima.
     * Dados de golpe gastados o recuperados (desglosados por tipo de dado).
     * Espacios de conjuro restablecidos (por nivel).
     * Recursos y facultades recargadas.
     * Efectos temporales expirados.
     * Nuevos dados de Portento disponibles para el día.
   - Registro limpio y enriquecido en el diario de la partida (`journalStore`).
6. **Integración con Descansos de Grupo del Dungeon Master:**
   - Recepción en tiempo real del evento `group_rest` emitido por el DM desde el Grimorio de Control:
     * Descanso largo grupal: ejecuta el descanso largo en los clientes de los jugadores conectados y despliega el resumen interactivo.
     * Descanso corto grupal: recarga de fondo los recursos de descanso corto y muestra un banner o aviso flotante al jugador para que decida cuántos Dados de Golpe gastar para curarse.

### Fuera del Alcance (v1)

- Reglas variantes del Manual del Dungeon Master (Realismo descarnado: descanso corto de 8 horas y largo de 7 días; o Descanso épico: descanso corto de 5 minutos y largo de 1 hora). Se mantiene la regla estándar SRD 5.1 (1 hora / 8 horas).
- Gestión de consumo de raciones de comida y odres de agua, o penalizaciones de agotamiento por deshidratación o inanición.
- Interrupciones de descanso por combates nocturnos con cálculo automático de guardias (lo resuelve el DM en la mesa / VTT).
- Resolución de combate activo, concentración al recibir daño y tiradas de ataque (pertenecen a la etapa H4, Spec 11).

---

## Usuarios y Beneficios

| Rol | Qué gana |
| --- | --- |
| **Jugador** | No tiene que calcular a mano cuántos PG cura su tirada con CON ni llevar cuentas confusas de dados gastados. Ve cómo se cura su personaje dado a dado, puede tirar dados físicos o virtuales, y al despertar tras un descanso largo tiene todos sus conjuros listos y sus dados de Portento tirados. |
| **Dungeon Master** | Puede ordenar descansos de grupo con un clic desde el Grimorio de Control sabiendo que los jugadores recibirán la notificación sin descalabrar sus hojas ni requerir escrituras conflictivas en Firestore. La bitácora registra los descansos fielmente. |
| **Mesa Presencial / Mixta** | Aquellos que prefieren tirar dados plásticos en la mesa pueden teclear el resultado numérico en el modal de descanso y la hoja aplica la Constitución, topes y reglas automáticamente. |

---

## Estado Actual del Repo (Punto de Partida)

| Área | Estado Actual | Ubicación |
| --- | --- | --- |
| **Modelo de Dados de Golpe** | `hitDice: { total, remaining, die }` simple. No soporta clases múltiples con diferentes dados (ej. d10 + d6). | `src/scripts/models/character.ts:199` |
| **Lógica de Descanso Corto** | `shortRest(n)` aplica un cálculo plano con promedio (`avgRoll + conMod`) sin tirada interactiva ni elección de dado. | `src/scripts/state/characterStore.ts:893` |
| **Lógica de Descanso Largo** | `longRest()` restaura PG al máximo y recupera `floor(total / 2)` dados del único tipo configurado, sin selección ni dados de portento. | `src/scripts/state/characterStore.ts:945` |
| **Modal de Descanso Actual** | `RestModal.astro` tiene 2 botones duros ("Realizar Descanso Corto" que siempre gasta 1 dado de golpe con promedio, y "Completar Descanso Largo"). | `src/components/modals/RestModal.astro` |
| **Recursos y Dados Guardados** | `Resource` en `resource.ts` ya tiene `values?: number[]`, pero no hay generador de dados de Portento ni UI en la hoja para usarlos. | `src/scripts/models/resource.ts`, `src/scripts/dnd/resources.ts` |
| **Descanso de Grupo del DM** | `broadcastGroupRest` emite `group_rest`, pero el descanso corto en el cliente no le ofrece al jugador curarse con dados de golpe. | `src/scripts/state/groupRestSync.ts`, `characterStore.ts:929` |
| **Resumen del Descanso** | No existe modal ni vista de resumen; solo una notificación `showAlert` breve y una línea de texto en `journalStore`. | `RestModal.astro:129,136` |

---

## Stack, Restricciones y Reglas de Arquitectura

Se mantienen las decisiones **D1–D13** de [`docs/Plans/01-dm-panel/README.md`](../Plans/01-dm-panel/README.md) y las de las Specs 07 y 08:

1. **Astro estático sin SSR:** Todo corre en el navegador del cliente sin backend intermedio en tiempo de ejecución.
2. **Cero colecciones nuevas:** Todos los datos de dados de golpe, recursos y dados guardados viven dentro del documento del personaje (`characters/{id}`).
3. **Eficiencia en Cuota Spark (Firestore):**
   - Toda la secuencia de descanso interactivo (tirar 1, 2 o más dados de golpe) ocurre en memoria del cliente.
   - Solo al pulsar **"Confirmar y Guardar Descanso"** o finalizar el proceso se realiza **una única escritura** al documento del personaje vía `saveAndNotify()`.
4. **Lógica desacoplada y testeable:**
   - La matemática de tiradas, Constitución, recuperación de dados multiclase y dados guardados vive en funciones puras en `src/scripts/dnd/rests.ts`.
   - Se testea exhaustivamente con Node test runner nativo (`node --test tests/rests.test.mjs`) sin frameworks pesados ni dependencias de DOM en la lógica pura.
5. **Compatibilidad total hacia atrás:**
   - Cualquier personaje creado previamente sin `pools` o sin `values` sigue funcionando exactamente igual; las funciones de cálculo asumen valores por defecto seguros.

---

## 1. Modelo de Dados de Golpe y Soporte Multiclase

Para soportar personajes monoclass y multiclass sin romper esquemas existentes:

```ts
export type HitDie = 'd6' | 'd8' | 'd10' | 'd12';

export interface HitDicePool {
  die: HitDie;
  total: number;
  remaining: number;
}
```

- En `CharacterData['hitDice']`:
  ```ts
  hitDice: {
    total: number;        // Total general de dados de golpe (igual a char.level)
    remaining: number;    // Dados disponibles totales
    die: string;          // Dado principal o default (ej. 'd8')
    pools?: HitDicePool[]; // Desglose opcional por clase (ej. [{ die: 'd10', total: 5, remaining: 3 }, { die: 'd6', total: 3, remaining: 2 }])
  };
  ```
- Si `pools` no está definido o tiene 0 elementos, se infiere automáticamente un único pool a partir de `{ die: char.hitDice.die, total: char.hitDice.total, remaining: char.hitDice.remaining }`.
- Si `pools` está definido, la suma de `pools[i].total` debe coincidir con `char.hitDice.total` (y con `char.level`). La función pura `syncHitDicePools(char)` en `recalculateCharacter` asegura la coherencia de manera idempotente.

---

## 2. Descanso Corto Interactivo

El descanso corto permite recuperar puntos de golpe gastando uno o más dados de golpe disponibles.

### Reglas oficiales aplicadas
- Por cada dado gastado: se lanza el dado y se suma el modificador de Constitución (`Math.max(0, roll + conMod)`).
- El personaje recupera PG iguales al resultado, sin superar nunca su `hp.max`.
- Si el personaje tiene salud máxima alcanzada, la interfaz avisa y previene el gasto innecesario de más dados.
- Al confirmar el descanso corto:
  1. Se descuentan los dados utilizados de sus respectivos pools y del contador total `remaining`.
  2. Se incrementa `hp.current` por la suma total curada.
  3. Se recargan todos los recursos con `rechargeOn === 'shortRest'`.
  4. Expiran los efectos activos con `untilRest` (`rest: 'short'`).

### Experiencia de usuario (UI)
- **Vista interactiva en `RestModal.astro`:**
  - Muestra la barra de salud actual y el modificador de Constitución: ej. `Salud: 14 / 32 PG (CON: +2)`.
  - Muestra los dados de golpe disponibles agrupados por tipo (ej. `d10: 2/3 disponibles`, `d6: 1/2 disponibles`).
  - Botón *"Tirar 1 [Dado]"* o selector para tirar en lote.
  - Opción *"Tirada manual en mesa"*: permite teclear el número obtenido en los dados físicos.
  - Historial de la sesión de descanso: ej. *"Dado 1 (d10): Sacaste 7 + 2 (CON) = 9 PG"*.
  - Barra de salud interactiva que sube en verde translúcido mostrando la vida ganada.
  - Botón destacado *"Finalizar Descanso Corto"*, que persiste los cambios y abre el Resumen Interactivo.

---

## 3. Descanso Largo Automático y Guiado

El descanso largo (8 horas de sueño o guardia ligera) renueva por completo al aventurero.

### Reglas oficiales aplicadas
1. **Puntos de Golpe:** Se restauran al 100% (`hp.current = hp.max`). Se eliminan los puntos de golpe temporales (`hp.temp = 0`), salvo efectos explícitos.
2. **Dados de Golpe recuperados:**
   - Se recupera hasta la mitad de los Dados de Golpe máximos del personaje (mínimo 1):
     `recoveryQuota = Math.max(1, Math.floor(char.hitDice.total / 2))`.
   - No se puede superar el total de dados de cada pool.
   - En personajes multiclase:
     - Algoritmo sugerido por defecto: recupera primero los dados más valiosos (`d12` > `d10` > `d8` > `d6`).
     - El jugador puede ajustar cuántos dados de cada tipo recuperar antes de confirmar, siempre dentro del límite `recoveryQuota`.
3. **Espacios de Conjuro:** Se restablecen todos los espacios gastados de niveles 1 a 9 (`used = 0`), así como los espacios de pacto.
4. **Recursos:** Se reinician todos los recursos con `rechargeOn === 'longRest'` o `rechargeOn === 'shortRest'` (`used = 0`).
5. **Efectos:** Expiran todos los efectos activos con `untilRest` (`short` o `long`).

---

## 4. Dados Guardados (Portento y Facultades Análogas)

El rasgo de clase **Portento (Portent)** de los Magos de la Escuela de Adivinación (SRD 5.1) y facultades equivalentes requieren tirar dados al finalizar un descanso largo y anotarlos para sustituir tiradas posteriores.

### Especificación técnica
- Un recurso con la propiedad `dieType?: string` (ej. `'d20'`) y `rechargeOn: 'longRest'` se considera un generador de dados guardados.
- Ejemplo para Portento: `max: 2` (o `3` a nivel 14+), `rechargeOn: 'longRest'`, `dieType: 'd20'`, `values: [15, 4]`.
- Al culminar un descanso largo:
  - Si el personaje tiene recursos con `dieType`, el sistema genera automáticamente las tiradas correspondientes usando números aleatorios (1–20 para d20) o permite ingresarlos a mano si el jugador tiró dados reales en su mesa física.
  - Los números se guardan en el array `resource.values`.
- En la ficha de personaje:
  - En la sección de recursos o panel de vitals, los dados guardados se muestran como insignias o dados interactivos con su valor numérico visible (ej. `[18]` y `[5]`).
  - Al hacer clic en un dado guardado, se ofrece la opción *"Gastar para sustituir tirada"*: copia el valor al portapapeles o lo envía a la Torre de Dados para la próxima tirada, marcando el dado como utilizado (`used += 1` y removiendo el valor de `values`).

---

## 5. Resumen Interactivo del Descanso ("Bitácora de Reposo")

Al presionar el botón de finalizar descanso (corto o largo), la aplicación despliega un modal o tarjeta de celebración táctica:

```
┌────────────────────────────────────────────────────────┐
│  🌙 Descanso Largo Completado (8 horas)                │
├────────────────────────────────────────────────────────┤
│  ❤️ Salud Restaurada:          32 / 32 PG (+18 curados) │
│  🎲 Dados de Golpe:            +2 d8 (5/5 disponibles)  │
│  ✨ Espacios de Conjuro:       4 de Nivel 1, 2 de Nivel 2│
│  🔄 Recursos Recargados:       Segundo Aliento, Furia   │
│  🔮 Dados de Portento Nuevos:  [19]  [7]                │
│  ⏳ Efectos Expirados:         Bendición, Escudo        │
├────────────────────────────────────────────────────────┤
│  [ Continuar la Aventura ]                             │
└────────────────────────────────────────────────────────┘
```

- Este resumen permite al jugador revisar con exactitud qué facultades tiene listas para el nuevo día de partida.
- El evento genera automáticamente una entrada enriquecida en la bitácora pública de la partida (`journalStore`) para que el DM y los demás jugadores sepan que el personaje ha completado su reposo.

---

## 6. Descanso de Grupo Decretado por el DM

El Dungeon Master tiene el botón de descanso grupal en su Grimorio de Control (`DmControlGrimoire.astro`).

- **Descanso Largo Grupal:**
  - El DM emite el evento `group_rest { rest: 'long' }`.
  - Los clientes de los jugadores conectados procesan el descanso largo de forma inmediata y automática, desplegando el modal de resumen.
- **Descanso Corto Grupal:**
  - El DM emite el evento `group_rest { rest: 'short' }`.
  - Los recursos `shortRest` se recargan automáticamente en la ficha del jugador.
  - Se despliega una notificación prominente pero no invasiva:
    *"El Dungeon Master ha decretado un Descanso Corto (1 hora). ¿Deseas gastar Dados de Golpe para curarte?"*
  - Al hacer clic, se abre directamente el modal interactivo de Descanso Corto.

---

## Modelo de Datos

Todo reside dentro de `characters/{id}` en Firestore, sin colecciones nuevas.

```ts
// src/scripts/models/character.ts

export type HitDie = 'd6' | 'd8' | 'd10' | 'd12';

export interface HitDicePool {
  die: HitDie;
  total: number;
  remaining: number;
}

export interface CharacterHitDice {
  total: number;
  remaining: number;
  die: string;
  pools?: HitDicePool[];
}

// src/scripts/models/resource.ts
export interface Resource {
  id: string;
  name: string;
  max: number;
  used: number; // 0..max
  rechargeOn: RechargeOn;
  source?: string;
  values?: number[];  // Dados guardados (ej. [15, 3])
  dieType?: string;   // Tipo de dado a generar en descanso largo (ej. 'd20')
}

// src/scripts/models/rest.ts (Nuevo modelo de resultados)
export interface SpentHitDie {
  die: HitDie;
  roll: number;
  conMod: number;
  total: number; // Math.max(0, roll + conMod)
}

export interface ShortRestResult {
  healedHp: number;
  hpBefore: number;
  hpAfter: number;
  spentDice: SpentHitDie[];
  remainingDiceTotal: number;
  recoveredResources: string[];
  expiredEffects: string[];
}

export interface LongRestResult {
  healedHp: number;
  hpBefore: number;
  hpAfter: number;
  recoveredDice: { die: HitDie; count: number }[];
  remainingDiceTotal: number;
  recoveredSlots: Record<number, number>;
  recoveredResources: string[];
  expiredEffects: string[];
  savedDiceRolled?: { resourceName: string; values: number[] }[];
}
```

---

## Seguridad y Reglas de Firestore

- Los campos `hitDice`, `resources` y `activeEffects` son modificados exclusivamente por el jugador dueño de la ficha.
- Las reglas de seguridad actuales ya restringen al DM para escribir únicamente `hp`, `inspiration` y `updatedAt`.
- Por lo tanto, **no se requieren cambios en `firestore.rules`**. Se añaden pruebas en `tests/rules/` que verifiquen que el DM no puede escribir `hitDice` directamente.

---

## Requisitos Funcionales

| ID | Requisito | Prioridad |
| --- | --- | --- |
| **RF-300** | Modelo `HitDicePool` con soporte para dados de golpe monoclass y multiclass (`d6`, `d8`, `d10`, `d12`). | M |
| **RF-301** | Sincronización idempotente de dados de golpe con el nivel en `recalculateCharacter` y `syncHitDicePools`. | M |
| **RF-302** | Selector interactivo de Dados de Golpe en Descanso Corto por tipo y cantidad disponible. | M |
| **RF-303** | Tirada paso a paso o en lote de Dados de Golpe sumando modificador de CON (mínimo 0 por dado). | M |
| **RF-304** | Opción de entrada manual para tiradas con dados físicos en mesa presencial. | S ⚡ |
| **RF-305** | Ejecución atómica de Descanso Corto: cura PG, descuenta dados, recarga recursos `shortRest` y expira efectos. | M |
| **RF-306** | Descanso Largo automático: 100% de PG, todos los espacios de conjuro (1–9) y recursos diarios restablecidos. | M |
| **RF-307** | Recuperación de hasta la mitad de Dados de Golpe máximos en Descanso Largo, con sugerencia inteligente en multiclass y ajuste manual. | M |
| **RF-308** | Soporte para Dados Guardados (Portento): definición en `Resource`, tirada en descanso largo y almacenamiento en `values`. | M |
| **RF-309** | Uso táctico de dados guardados: botón en la hoja y en Torre de Dados para sustituir una tirada por un valor de Portento. | S ⚡ |
| **RF-310** | Modal / vista de Resumen Interactivo de Descanso desglosando salud, dados, conjuros, recursos y efectos. | M |
| **RF-311** | Sincronización en tiempo real de descansos grupales emitidos por el DM (largo automático, corto con diálogo interactivo). | M |
| **RF-312** | Registro automático y legible de los descansos en el diario de la campaña (`journalStore`). | S |

---

## Requisitos No Funcionales

- **RNF-300 (Desacoplamiento):** Toda la lógica matemática y de reglas de descansos reside en funciones puras en `src/scripts/dnd/rests.ts`, probadas de forma aislada sin dependencias de UI.
- **RNF-301 (Cuota Spark):** Un descanso interactivo realiza como máximo **una escritura** a Firestore al finalizar el flujo.
- **RNF-302 (Compatibilidad):** Las hojas antiguas sin `pools` ni `values` abren y descansan sin errores ni pérdida de datos.
- **RNF-303 (Mobile First & Accesibilidad):** El modal de descanso y el resumen son 100% responsivos en pantallas móviles táctiles, con botones grandes y contrastados.

---

## Plan de Tareas por Fase

IDs a partir de **T-280**. Cada fase se cierra con tests verdes antes de comenzar la siguiente.

### Fase A — Modelo y Lógica Pura de Descansos
- [x] **T-280** Tipos `HitDicePool`, `CharacterHitDice`, `ShortRestResult`, `LongRestResult` y migración idempotente `syncHitDicePools` en `calculations.ts` (RF-300, RF-301).
- [x] **T-281** Funciones puras de Descanso Corto en `src/scripts/dnd/rests.ts`: `calculateHitDieHeal`, `spendHitDice`, y tests unitarios (RF-302, RF-303, RF-304, RF-305).
- [x] **T-282** Funciones puras de Descanso Largo en `rests.ts`: recuperación de mitad de dados con algoritmo de prioridad multiclase, espacios de conjuro y recursos (RF-306, RF-307).
- [x] **T-283** Lógica de Dados Guardados (Portento): `rollSavedDice`, `consumeSavedDie` y suite completa `tests/rests.test.mjs` (RF-308, RF-309).

### Fase B — Interfaz Interactiva de Descanso Corto
- [x] **T-284** Rediseño de `src/components/modals/RestModal.astro` para implementar el selector de dados, tirada animada/paso a paso, entrada manual y barra interactiva de salud (RF-302, RF-303, RF-304).
- [x] **T-285** Integración de Descanso Corto con `characterStore.ts` y persistencia en una única escritura atómica (RF-305).

### Fase C — Descanso Largo, Dados Guardados y Resumen
- [x] **T-286** Implementación del flujo de Descanso Largo en `RestModal.astro` con selector de recuperación multiclase y tirada de dados de Portento (RF-306, RF-307, RF-308).
- [x] **T-287** Componente modal de Resumen Interactivo de Descanso (`RestSummaryModal.astro`) con desglose visual de todo lo recuperado y expirado (RF-310, RF-312).
- [x] **T-288** Widget o componente en la hoja de personaje para ver y gastar Dados de Portento guardados (RF-309).

### Fase D — Sincronización con DM, Verificación y Cierre
- [x] **T-289** Adaptar `groupRestSync.ts` y notificaciones en cliente para descansos grupales del DM (RF-311).
- [x] **T-290** Verificación integral: tests unitarios (`pnpm test`), reglas de seguridad (`pnpm test:rules`), build estático (`astro build`) y prueba manual con DM y jugador (RNF-300, RNF-301, RNF-302, RNF-303).

---

## Criterios de Aceptación

1. Un personaje con 10/25 PG y Constitución +2 gasta 1d8 en un Descanso Corto, saca 5 en el dado, y su salud pasa a 17/25 PG (+7 PG curados).
2. Si el jugador desea gastar otro dado, puede hacerlo y ver su vida subir hasta detenerse o alcanzar su máximo de PG.
3. Un personaje multiclase (Guerrero 3 / Mago 2) tiene 3d10 y 2d6; puede elegir gastar un d10 o un d6 indistintamente.
4. Tras un Descanso Largo, un personaje a 1 PG recupera el 100% de su vida, recupera la mitad de sus Dados de Golpe máximos y todos sus espacios de conjuro.
5. Un Mago de Adivinación con Portento recibe 2 tiradas de d20 al despertar de un Descanso Largo, visibles en su hoja para ser utilizadas.
6. El modal de Resumen Interactivo muestra claramente el desglose completo del descanso y genera una entrada en la bitácora.
7. Una partida con descanso grupal decretado por el DM despierta la interfaz de los jugadores en tiempo real.
8. `pnpm test` y `astro build` pasan al 100% sin advertencias ni errores.
