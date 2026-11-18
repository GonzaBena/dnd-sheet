# Spec 15: Zonas de Hechizo en el Mapa — dnd.gonzabena.com.ar

Nov 17, 2026 · @Gonzalo Benavente · **Estado: Borrador (para después)**

Etapa H8 del [roadmap](../ROADMAP.md). Depende de H1 ([Spec 07](07-cimientos-de-la-hoja.spec.md), efectos activos), H4 ([Spec 11](11-combate-en-la-hoja.spec.md), concentración y salvaciones) y del VTT de la Spec 01 (mapa, tokens, niebla). No bloquea ninguna otra etapa; puede adelantarse detrás de H6 si un grupo real la pide.

---

## Objetivo y Alcance

Que **los conjuros de área se puedan colocar en el mapa** con su forma y tamaño reales, y que **las criaturas que están dentro sufran el efecto mientras permanezcan dentro**, según lo que diga el conjuro (al entrar, al empezar o terminar su turno dentro, o de forma pasiva mientras estén dentro).

Al cerrar esta etapa:
1. Al lanzar un conjuro con área (*Bola de Fuego*, *Lentitud*, *Telaraña*, *Nube Apestosa*, *Oscuridad*, *Rayo de Luna*…), el jugador o el DM coloca en el mapa una **plantilla** (esfera/círculo, cono, cubo, línea o cilindro) con el tamaño del conjuro, ajustada a la cuadrícula y orientable.
2. La plantilla muestra **qué tokens quedan dentro** antes de confirmar.
3. Si el conjuro es **instantáneo** (*Bola de Fuego*), la zona marca a los afectados, ofrece la salvación con la CD del lanzador y desaparece.
4. Si el conjuro **dura** (*Lentitud*, *Telaraña*, *Oscuridad*), la zona queda persistente en el mapa: quien entra recibe el efecto vinculado a la zona y **lo pierde al salir**; cuando la zona termina (rondas agotadas, concentración rota o el DM la quita), el efecto se retira de todos.

---

### Dentro del Alcance (v1)

1. **Plantillas de área en el mapa:** las cinco formas de `area_of_effect` del SRD (`sphere`, `cylinder`, `cube`, `cone`, `line`), con el tamaño tomado del catálogo y editable a mano.
2. **Colocación y orientación:** arrastrar el origen, rotar conos y líneas, y que el origen pueda anclarse a un token (ej. *Espíritus Guardianes*, *Aura*): la zona se mueve con ese token.
3. **Previsualización de afectados:** resaltado de los tokens dentro mientras se coloca la plantilla.
4. **Zonas instantáneas:** lista de afectados + aviso de salvación (CD del lanzador), sin efecto persistente.
5. **Zonas persistentes:** guardadas en el mapa, con duración (rondas, concentración, indefinida), vinculadas al efecto de concentración del lanzador cuando corresponde.
6. **Efecto "mientras estés dentro":** al entrar se aplica un `ActiveEffect` con `zoneId`; al salir se retira. Para PNJ, el DM ve la zona como etiqueta/condición en el combatiente.
7. **Disparadores por turno:** avisos de salvación "al entrar por primera vez en el turno", "al empezar el turno" o "al terminar el turno" dentro de la zona, con la CD guardada en la zona.
8. **Ajustes manuales del DM:** mover, redimensionar, quitar una zona o excluir a un token de ella (ej. una criatura que superó la salvación y el conjuro no la vuelve a afectar).

---

### Fuera del Alcance (v1)

- Línea de visión y cobertura: la zona no se recorta por paredes (el DM usa la niebla o excluye tokens a mano).
- Automatizar los efectos de **todos** los conjuros del SRD: la v1 trae plantillas para cualquier conjuro con `area_of_effect`, pero el efecto mecánico (modificadores) solo viene precargado para una lista corta (ver §1.4); el resto se configura con el mismo editor de efectos de la Fase E de la Spec 07.
- Aplicar daño automáticamente sin intervención: la zona ofrece la tirada y el daño, pero quien sufre el daño confirma con un clic (mismo flujo `hpTransaction`).
- Terreno difícil calculado al mover (la zona lo **muestra** como etiqueta; no se descuentan pies de movimiento).
- Zonas en mapas sin cuadrícula: requieren `grid.size`.
- Vista en 3D o altura (los cilindros se tratan como círculos en el plano).

---

## Usuarios y Beneficios

| Rol | Beneficio Concreto |
| --- | --- |
| **Jugador** | Coloca su *Bola de Fuego* donde quiere y ve al instante a quién alcanza. Si su personaje cae dentro de una *Telaraña* o sale de un *Lentitud*, su hoja aplica o quita el efecto sola. |
| **Dungeon Master** | Ya no tiene que recordar quién está dentro de qué zona ni qué salvación toca al empezar cada turno; ve las zonas en el mapa y en el tracker de combate. |
| **Mesa Presencial / Mixta** | El mapa compartido en pantalla muestra el área exacta y evita las discusiones de "¿me alcanzó o no?". |

---

## Estado Actual del Repo (Punto de Partida)

| Área | Estado Actual | Ubicación |
| --- | --- | --- |
| **Datos de área** | El SRD ya trae `area_of_effect: { type, size }` (en pies) para los conjuros de área, pero nada en `src/` lo lee. | `public/data/srd/2014/spells.json`, `public/data/srd/2024/spells.json` |
| **Mapa** | `MapDoc` tiene cuadrícula, `tokens` y `fogRevealed`; no existe ninguna figura de juego aparte de la niebla. | `src/scripts/models/map.ts`, `src/scripts/vtt/mapStage.ts` |
| **Geometría** | Hay utilidades puras de cuadrícula (`snapToGrid`), medición en pies (`measure.ts`, 1 celda = 5 ft) y formas de niebla (círculo, rect, polígono). | `src/scripts/vtt/geometry.ts`, `src/scripts/vtt/measure.ts`, `src/scripts/vtt/fog.ts` |
| **Efectos activos** | `ActiveEffect` vive en el documento del personaje, sin noción de origen espacial. Se aplica desde `applyEffectFlow.ts` solo al propio personaje. | `src/scripts/models/effect.ts`, `src/scripts/ui/applyEffectFlow.ts`, `src/scripts/dnd/effects.ts` |
| **Rondas** | `effectsRoundSync` descuenta rondas en el cliente del dueño leyendo `combat/current`; el DM no escribe el documento del jugador. | `src/scripts/state/effectsRoundSync.ts` |
| **Concentración** | Un único efecto de concentración por personaje (Spec 11, RF-325) y salvación al daño. | `src/scripts/dnd/effects.ts`, `src/scripts/dnd/concentration.ts` |
| **Combatientes PNJ** | `Combatant.conditions: string[]`, solo lo escribe el DM. | `src/scripts/models/combat.ts` |
| **Reglas Firestore** | Un jugador solo puede cambiar `x`/`y` de **un** token propio por escritura (`lastMove`); no puede tocar otros campos del mapa. | `firestore.rules:178-205` |
| **CD de conjuros** | `spellcasting.saveDc` ya se calcula. | `src/scripts/dnd/calculations.ts:257` |

---

## Stack, Restricciones y Reglas de Arquitectura

Se aplican las reglas **D1–D13** del proyecto y las del roadmap:
1. **Cero colecciones nuevas.** Las zonas viven como campo `zones` dentro del documento del mapa (`campaigns/{cid}/maps/{mid}`), que ya tiene un listener abierto en cada cliente: **cero lecturas extra**.
2. **Cada uno escribe lo suyo.**
   - La **zona** la escribe su lanzador (jugador dueño) o el DM.
   - El **efecto en la hoja** lo escribe el cliente del **dueño del personaje** afectado, igual que `effectsRoundSync`. El DM nunca escribe el documento del jugador.
   - El **estado de los PNJ** (etiqueta de zona en `Combatant.conditions`) lo escribe el cliente del DM.
3. **Pertenencia calculada, no guardada.** Quién está dentro de una zona **no se persiste**: cada cliente lo deriva de `zones` + posiciones confirmadas de los tokens (las de Firestore, nunca las posiciones `live` de RTDB mientras se arrastra). Solo se escribe cuando cambia el resultado (entra/sale), y una sola escritura por cambio.
4. **Funciones puras y testeables.** Geometría de plantillas y diff de pertenencia en `src/scripts/vtt/zones.ts`, sin DOM ni Firebase, con tests en `tests/zones.test.mjs` (`node --test`).
5. **La hoja avisa, no bloquea.** Las salvaciones se ofrecen, no se imponen; el DM siempre puede excluir a un token o quitar una zona.
6. **Idempotencia.** Aplicar/retirar un efecto de zona dos veces no debe duplicarlo ni fallar: el efecto se identifica por `zoneId`.

---

## 1. Modelo de Datos y Contratos (TypeScript)

### 1.1 Zona en el mapa (`SpellZone`)

```ts
// src/scripts/models/map.ts
export type ZoneShape =
  | { kind: 'circle'; radiusFt: number }              // sphere, cylinder
  | { kind: 'square'; sideFt: number }                // cube
  | { kind: 'cone'; lengthFt: number; angleDeg: number } // ángulo en grados, 0 = hacia la derecha
  | { kind: 'line'; lengthFt: number; widthFt: number; angleDeg: number };

export type ZoneTrigger = 'whileInside' | 'onEnter' | 'onTurnStart' | 'onTurnEnd';

export interface SpellZone {
  name: string;               // "Telaraña"
  spellId?: string;           // id del catálogo
  shape: ZoneShape;
  /** Origen en px de imagen. Si anchorTokenId está definido, se ignora y se usa el centro del token. */
  x: number;
  y: number;
  anchorTokenId?: string;
  color?: string;
  /** Lanzador: uid (null = DM) y personaje, para vincular la concentración. */
  casterUid: string | null;
  casterCharacterId?: string;
  /** CD y salvación fijadas al lanzar. */
  save?: { ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'; dc: number };
  triggers: ZoneTrigger[];
  /** Modificadores que reciben los afectados mientras están dentro (mismo formato que ActiveEffect). */
  modifiers: Modifier[];
  /** Condiciones que impone (ids de DND_CONDITIONS), ej. ['restrained'] para Telaraña. */
  conditions?: string[];
  /** Texto libre del daño, ej. "2d10 radiante" (se ofrece, no se aplica solo). */
  damage?: string;
  duration: EffectDuration;   // rounds | concentration | indefinite
  /** 'instant' = se borra tras resolver; 'persistent' = queda en el mapa. */
  mode: 'instant' | 'persistent';
  /** Tokens que el DM sacó a mano de la zona. */
  excludedTokenIds?: string[];
  createdAt: number;
}

export interface MapDoc {
  // …campos actuales…
  zones?: Record<string, SpellZone>;
}

export const MAP_LIMITS = {
  // …límites actuales…
  maxZones: 20,
} as const;
```

### 1.2 Vínculo efecto ↔ zona

```ts
// src/scripts/models/effect.ts
export interface ActiveEffect {
  // …campos actuales…
  /** Si viene de una zona del mapa: se retira al salir de ella o cuando la zona desaparece. */
  zone?: { mapId: string; zoneId: string };
}
```

`sourceType` se mantiene en `'spell'`. Un efecto con `zone` **no** se cuenta como concentración del afectado (la concentración es del lanzador).

### 1.3 Contrato puro de geometría y pertenencia

```ts
// src/scripts/vtt/zones.ts
export function zoneCells(zone: SpellZone, grid: GridConfig, tokens: Record<string, Token>): Set<string>; // "col,row"
export function tokensInZone(zone: SpellZone, grid: GridConfig, tokens: Record<string, Token>): string[];
export function zoneFromSpell(entry: CatalogEntry, origin: Point, caster: CasterInfo): SpellZone;

export interface ZoneMembershipDiff {
  entered: Array<{ zoneId: string; tokenId: string }>;
  left: Array<{ zoneId: string; tokenId: string }>;
}
export function diffMembership(prev: Map<string, Set<string>>, next: Map<string, Set<string>>): ZoneMembershipDiff;
```

**Regla de pertenencia (decisión de diseño):** una celda está en la zona si su **centro** cae dentro de la figura (equivale a la regla de "al menos media casilla cubierta" de la guía del DM y es fácil de testear). Un token está dentro si **cualquiera** de sus celdas lo está (regla 5e: "cualquier parte de su espacio"). Los tokens de `excludedTokenIds` nunca están dentro.

**Orígenes según la forma:**
- *Esfera / cilindro:* origen = centro; se ajusta a una intersección de la cuadrícula.
- *Cubo:* origen = una cara; se dibuja con el origen en el borde y se ajusta a la cuadrícula.
- *Cono:* origen = vértice; ancho al final = largo (≈ 53°). Rotación libre con paso de 45° por defecto.
- *Línea:* origen = un extremo; ancho por defecto 5 ft.

### 1.4 Conjuros con efecto precargado (v1)

| Conjuro | Forma | Disparadores | Efecto dentro |
| --- | --- | --- | --- |
| *Bola de Fuego* | esfera 20 ft | instantáneo | Salvación DES, 8d6 fuego |
| *Lentitud* (*Slow*) | cubo 40 ft (elige objetivos) | `onEnter` (salvación SAB) | CA −2, salvaciones DES −2, velocidad ½ |
| *Telaraña* (*Web*) | cubo 20 ft | `onEnter`, `onTurnStart` (salvación DES) | condición `restrained` |
| *Nube Apestosa* | esfera 20 ft | `onTurnStart` (salvación CON) | condición `incapacitated` hasta fin de turno (aviso) |
| *Oscuridad* | esfera 15 ft | `whileInside` | condición `blinded` para quien no ve en oscuridad mágica |
| *Rayo de Luna* | cilindro 5 ft | `onEnter`, `onTurnStart` (salvación CON) | 2d10 radiante |
| *Espíritus Guardianes* | esfera 15 ft anclada al lanzador | `onEnter`, `onTurnStart` (salvación SAB) | velocidad ½, 3d8 radiante/necrótico |
| *Niebla* (*Fog Cloud*) | esfera 20 ft | `whileInside` | condición `blinded` (zona muy oscurecida) |

El resto de conjuros con `area_of_effect` crean la plantilla con forma y tamaño, sin modificadores; el lanzador puede agregarlos con el editor de efectos.

---

## 2. Requisitos Funcionales

### RF-500: Colocar una plantilla de área
- **RF-500.1:** En `SpellcastingPanel` / `SpellDetailModal`, un conjuro con `area_of_effect` muestra el botón *"Colocar en el mapa"* (solo si hay un mapa activo con cuadrícula).
- **RF-500.2:** El mapa entra en modo plantilla: la figura sigue al cursor/dedo, se ajusta a la cuadrícula y los conos/líneas se rotan (rueda, botón o arrastre del extremo en móvil).
- **RF-500.3:** Un botón *"Anclar a mi token"* fija el origen al token del lanzador.
- **RF-500.4:** El tamaño viene del catálogo y se puede editar (ej. *Bola de Fuego* a nivel superior sigue en 20 ft, pero una regla de la casa puede cambiarlo).
- **RF-500.5:** También se puede colocar una zona **sin conjuro** desde la barra del DM (forma + tamaño + nombre), para trampas o terreno.

### RF-501: Previsualización de afectados
- **RF-501.1:** Mientras se coloca la plantilla, los tokens dentro se resaltan y se lista su nombre (los tokens secretos del DM solo se cuentan en la vista del DM).
- **RF-501.2:** El lanzador confirma o cancela. Cancelar no escribe nada.

### RF-502: Zona instantánea
- **RF-502.1:** Al confirmar una zona `instant`, se escribe en el mapa con `mode: 'instant'` para que todos la vean.
- **RF-502.2:** Cada jugador cuyo token quedó dentro recibe un aviso: *"Te alcanza Bola de Fuego: salvación DES CD 15 · 8d6 fuego (mitad si superás)"*, con botón para tirar en la Torre de Dados y, después, aplicar el daño (completo o la mitad) por `hpTransaction`.
- **RF-502.3:** El DM ve la misma lista para los PNJ en el tracker.
- **RF-502.4:** La zona instantánea se borra cuando el lanzador o el DM la descartan, o automáticamente al pasar el turno.

### RF-503: Zona persistente y efecto "mientras estés dentro"
- **RF-503.1:** Al confirmar una zona `persistent`, cada cliente calcula `tokensInZone` para **sus** tokens (los del dueño del personaje; el DM, para los PNJ).
- **RF-503.2:** Si un token **entra** (en la colocación o al moverse y confirmar la posición), el cliente del dueño agrega a su hoja un `ActiveEffect` con `zone: { mapId, zoneId }`, los `modifiers` y `conditions` de la zona.
- **RF-503.3:** Si un token **sale**, su cliente retira el efecto con ese `zoneId`.
- **RF-503.4:** Si la zona se mueve (anclada a un token que se mueve, o la reubica el DM), se recalcula para todos.
- **RF-503.5:** Para PNJ, el cliente del DM agrega/quita una etiqueta `zone:<nombre>` y las condiciones de la zona en `Combatant.conditions`, en una sola escritura por cambio.
- **RF-503.6:** Al reconectarse, el cliente reconcilia: retira efectos con `zone` cuya zona ya no existe o cuyo token ya no está dentro, y agrega los que falten.

### RF-504: Disparadores por turno
- **RF-504.1:** `onEnter`: aviso de salvación la primera vez que el token entra en la zona en un mismo turno (se guarda en memoria del cliente, no en Firestore).
- **RF-504.2:** `onTurnStart` / `onTurnEnd`: cuando `combat/current` marca el turno del combatiente vinculado al token, el cliente del dueño muestra el aviso de salvación (y daño si aplica).
- **RF-504.3:** Si la salvación tiene éxito y el conjuro lo indica (ej. *Lentitud*: termina el efecto), el aviso ofrece *"Ya no me afecta"*, que pide al DM excluir el token (o lo excluye directamente si quien la tira es el DM).

### RF-505: Fin de la zona
- **RF-505.1:** `duration.kind === 'rounds'`: el cliente del **lanzador** (o el del DM, si la lanzó el DM) descuenta rondas con el combate y borra la zona al llegar a 0.
- **RF-505.2:** `duration.kind === 'concentration'`: la zona queda vinculada al efecto de concentración del lanzador. Si la concentración se pierde o se reemplaza (RF-325/RF-326), el cliente del lanzador borra la zona.
- **RF-505.3:** Al borrar una zona, todos los clientes retiran los efectos con ese `zoneId` (RF-503.6 lo cubre si alguien estaba desconectado).
- **RF-505.4:** El DM puede quitar cualquier zona; el lanzador solo las suyas.

### RF-506: Visualización
- **RF-506.1:** Las zonas se dibujan en una capa propia de `mapStage` entre la cuadrícula y los tokens, semitransparentes, con el color del lanzador y el nombre del conjuro.
- **RF-506.2:** Las celdas afectadas se sombrean levemente para dejar claro el borde según la cuadrícula.
- **RF-506.3:** `TokenInfoCard` muestra las zonas en las que está el token.
- **RF-506.4:** La niebla tapa las zonas igual que tapa los tokens (un jugador no ve una zona en un área no revelada).

### RF-507: Reglas de Firestore
- **RF-507.1:** Nuevo permiso de escritura en `maps/{mapId}`: un jugador puede cambiar solo `zones` (+ `updatedAt`), y solo las entradas cuyo `casterUid == uid()` (crear, editar, borrar). No puede tocar zonas ajenas ni otros campos.
- **RF-507.2:** El DM/creador puede escribir cualquier zona.
- **RF-507.3:** Validación: `zones.size() <= 20`, `name` ≤ 80 caracteres, `shape.kind` en la lista permitida.
- **RF-507.4:** Solo con la partida en estado `active` (mismo criterio que mover tokens); en `paused` solo el DM prepara zonas.

---

## 3. Riesgos y Decisiones Abiertas

| Tema | Riesgo | Decisión propuesta |
| --- | --- | --- |
| **Oscilación entrar/salir** | Si se evalúa con posiciones `live` mientras se arrastra, el efecto entra y sale decenas de veces (mismo tipo de problema que el rebote de PG). | Evaluar **solo** con posiciones confirmadas de Firestore; diff contra el estado anterior; una escritura por cambio real. |
| **Dos clientes del mismo dueño** | Dos pestañas abiertas aplican el mismo efecto. | Idempotencia por `zoneId` (RF-503.6) y escritura con transacción en `characterStore`. |
| **Escritura concurrente de `zones`** | El DM y un jugador escriben zonas a la vez y se pisan. | Escrituras por ruta de campo (`zones.<zid>`) con `updateDoc`, no reemplazando el mapa entero. |
| **Selección de objetivos** | *Lentitud* afecta a "hasta 6 criaturas a elección" dentro del cubo, no a todas. | v1: el lanzador puede desmarcar tokens en la previsualización (pasan a `excludedTokenIds`). |
| **Cuota** | Muchas zonas ancladas que se mueven con cada paso generan escrituras. | La zona anclada **no** se reescribe al moverse el token: su posición se deriva del token (`anchorTokenId`). |

---

## 4. Plan de Trabajo por Fases

```
Fase A: Geometría pura de plantillas y pertenencia (zones.ts + tests)
        │
        ▼
Fase B: Plantillas en el mapa (modelo, capa Konva, colocación, reglas Firestore)
        │
        ▼
Fase C: Efecto "mientras estés dentro" (entrar/salir, PNJ, reconciliación)
        │
        ▼
Fase D: Disparadores por turno, fin de zona, conjuros precargados y cierre
```

| Fase | Tareas | Archivos Principales | Entregable |
| --- | --- | --- | --- |
| **Fase A** | T-500 … T-503 | `src/scripts/vtt/zones.ts`, `src/scripts/models/map.ts`, `tests/zones.test.mjs` | Celdas cubiertas por las 5 formas, tokens dentro, diff de pertenencia, `zoneFromSpell`. |
| **Fase B** | T-504 … T-508 | `src/scripts/vtt/mapStage.ts`, `src/scripts/data/mapService.ts`, `firestore.rules`, `SpellDetailModal.astro`, `SpellcastingPanel.astro` | Colocar, rotar, anclar y borrar zonas sincronizadas; zonas instantáneas con lista de afectados. |
| **Fase C** | T-509 … T-512 | `src/scripts/state/zoneEffectsSync.ts` (nuevo), `src/scripts/models/effect.ts`, `src/scripts/state/characterStore.ts`, `combatService.ts` | Efectos que entran y salen con el token, etiquetas en PNJ, reconciliación al reconectar. |
| **Fase D** | T-513 … T-516 | `zoneEffectsSync.ts`, `src/scripts/dnd/concentration.ts`, `src/scripts/dnd/effectFactory.ts`, `TokenInfoCard.astro`, tests E2E | Salvaciones por turno, fin por rondas/concentración, tabla §1.4 precargada, suite verde y prueba manual. |

---

## 5. Criterios de Aceptación y Checklist de Cierre

- [ ] **Plantilla:** Un jugador coloca *Bola de Fuego* (esfera 20 ft) en el mapa, ve resaltados los tokens alcanzados y el DM la ve en tiempo real.
- [ ] **Instantánea:** Cada jugador alcanzado recibe el aviso de salvación DES con la CD del lanzador y puede aplicar el daño (completo o la mitad) con un clic.
- [ ] **Persistente:** Con *Telaraña* colocada, un token que entra recibe `Apresado` en su hoja; al salir, la condición desaparece sin intervención.
- [ ] **Concentración:** Si el lanzador de *Lentitud* pierde la concentración, la zona desaparece del mapa y el efecto se retira de todos los afectados, incluidos los que estaban desconectados (al volver).
- [ ] **Turnos:** Con *Rayo de Luna*, al empezar el turno de un token dentro, su dueño ve el aviso de salvación CON con 2d10 radiante.
- [ ] **PNJ:** Los combatientes del DM dentro de una zona muestran la etiqueta y las condiciones en el tracker.
- [ ] **Sin oscilaciones:** Arrastrar un token por dentro y fuera de una zona produce como mucho una escritura al soltarlo.
- [ ] **Reglas:** Un jugador no puede borrar ni editar la zona de otro jugador (test de reglas).
- [ ] **Tests y build:** `tests/zones.test.mjs`, tests de reglas y E2E pasan al 100 %, y `astro build` termina sin errores.
