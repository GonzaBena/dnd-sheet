# Planes de Implementación — Spec 13: Alcance Táctico y Tokens Propios

Planes derivados de [`docs/Specs/13-alcance-y-tokens.spec.md`](../../Specs/13-alcance-y-tokens.spec.md). Cada plan es **autocontenido**: un desarrollador o agente de IA puede ejecutarlo leyendo únicamente ese archivo y el código del repositorio.

---

## Cuándo se Ejecuta

Esta es la etapa **H6** del [roadmap](../../ROADMAP.md). Depende de **H1** (Spec 07), **H2** (Spec 08), **H4** (Spec 11), **H5** (Spec 12) y de la base del VTT (Spec 01 / 02), las cuales están cerradas y verificadas con 1.143 tests en verde.

El objetivo es unir la **hoja viva de personaje** con la **geometría del mapa táctico**:
1. Automatizar el cálculo de distancias entre tokens en el mapa borde a borde bajo la regla oficial Chebyshev 5/5/5 de D&D 5e (1 celda = 5 pies).
2. Validar automáticamente el alcance de armas y conjuros al seleccionar un objetivo en combate, alertando de desventajas (quemarropa con armas a distancia, rango extendido) o imposibilidad de impacto.
3. Permitir que los personajes registren y gestionen compañeros animales, familiares, monturas e invocaciones subordinadas en su hoja (`companions`).
4. Permitir que el jugador despliegue y mueva en vivo los tokens de sus criaturas secundarias en el VTT gracias a la propiedad `ownerUid`.

---

## Índice de Fases

| Plan | Tareas | Requisitos | Objetivo |
| --- | --- | --- | --- |
| [Fase A — Geometría Táctica Token a Token y Medición 5e](fase-a-geometria-token-a-token.plan.md) | T-350 … T-353 | RF-350 | **(Cerrada)** Funciones puras `calculateTokenDistanceFeet`, `getTokenGridBounds` y `resolveCombatantDistance` con soporte multi-tamaño (1x1 a 4x4), regla Chebyshev 5/5/5 y tests verdes en `tests/tactical_distance.test.mjs`. |
| [Fase B — Validación Automática de Alcance en Combate](fase-b-validacion-alcance-en-combate.plan.md) | T-354 … T-357 | RF-351 | **(Cerrada)** Detección automática de distancia entre atacante y objetivo en `InitiativeList` desde el mapa activo; comprobación de alcance óptimo, fuera de rango y desventajas tácticas (quemarropa / largo alcance). |
| [Fase C — Modelo y Gestión de Compañeros en la Hoja](fase-c-companeros-en-la-hoja.plan.md) | T-358 … T-361 | RF-353 | **(Cerrada)** Tipos `CharacterCompanion` en `character.ts`, métodos CRUD en `characterStore.ts`, componente UI `CompanionsPanel.astro` con PG/CA y suite verde `tests/companions.test.mjs`. |
| [Fase D — Tokens Secundarios en el VTT, Tests y Cierre](fase-d-tokens-secundarios-vtt-y-cierre.plan.md) | T-362 … T-366 | RF-352, RF-354 | **(Cerrada)** Despliegue de tokens de compañeros con `ownerUid`, permisos de movimiento en vivo por el jugador (`buildCompanionToken`), HUD de centrado rápido, guía visual de alcance en mapa (`showReachRing`), suite de tests verde y cierre H6. |

---

## Secuencia de Ejecución

```
Fase A: Geometría Táctica Token a Token (Medición Borde a Borde 5/5/5)
        │
        ▼
Fase B: Validación Automática de Alcance y Desventajas en Combate
        │
        ▼
Fase C: Modelo y Gestión de Compañeros e Invocaciones en la Hoja
        │
        ▼
Fase D: Tokens Secundarios en el VTT, Permisos, Guía Visual y Cierre H6
```

---

## Mapa del Repositorio (Archivos Involucrados)

| Componente / Archivo | Función |
| --- | --- |
| `src/scripts/vtt/tacticalCombat.ts` | Ampliación con cálculo de distancia entre tokens y resolución de objetivos. |
| `src/scripts/models/map.ts` | Campos `kind?: TokenKind` y `companionId?: string` en `Token`. |
| `src/scripts/models/character.ts` | Interfaz `CharacterCompanion` y campo `companions?: CharacterCompanion[]`. |
| `src/scripts/state/characterStore.ts` | Métodos CRUD para compañeros e invocaciones en la ficha. |
| `src/components/party/InitiativeList.astro` | Autocompletado de distancia desde el mapa táctico al elegir objetivo. |
| `src/components/character/CompanionsPanel.astro` | **(Nuevo)** Pestaña y tarjetas de gestión de criaturas subordinadas. |
| `src/scripts/vtt/tokens.ts` | Validación de permisos `canMoveToken` para criaturas subordinadas con `ownerUid`. |
| `src/scripts/data/mapService.ts` | Despliegue de token vinculado al personaje/compañero. |
| `src/components/map/MapStage.astro` | HUD de centrado rápido en compañero y visualización de guía de alcance. |
| `tests/tactical_distance.test.mjs` | **(Nuevo)** Suite de pruebas unitarias de geometría y validación táctica. |

---

## Decisiones Globales de Arquitectura

- **H6-1 (Regla 5/5/5 Chebyshev Oficial):** En D&D 5e con cuadrícula, 1 celda representa un cuadrado de 5 pies. Moverse o medir en diagonal cuesta 5 pies (igual que ortogonal). La distancia entre dos tokens es la distancia mínima entre cualquier casilla ocupada por el token A y cualquier casilla ocupada por el token B ($\max(\Delta \text{col}, \Delta \text{row}) \times 5$).
- **H6-2 (La Hoja Avisa, No Bloquea):** Si el mapa indica que el objetivo está a 20 pies y el arma tiene alcance de 5 pies, la app alerta con badge rojo (*"Fuera de alcance"*), pero el DM o el jugador aún pueden forzar la tirada si en la narrativa el DM concedió un salto heroico o movimiento circunstancial.
- **H6-3 (Propiedad de Tokens por `ownerUid`):** Todo token colocado para un compañero o montura recibe `ownerUid = auth.uid` del jugador. Esto permite que el jugador mueva a su criatura inmediatamente en Firestore y Realtime Database sin alterar las reglas de seguridad existentes.
- **H6-4 (Fallback sin Mapa):** Si la partida no tiene un mapa activo cargado o las criaturas no están desplegadas, el sistema mantiene los selectores manuales de distancia (5, 10, 30, 60 ft) sin generar errores ni interrumpir la fluidez de la mesa.
