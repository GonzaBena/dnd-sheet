# Plan Fase A — Modelo y Lógica Pura de Descansos (T-280 … T-283)

Spec: `docs/Specs/10-descansos-y-recursos.spec.md`, secciones 1, 2, 3 y 4; RF-300, RF-301, RF-303, RF-305, RF-306, RF-307, RF-308.

---

## 1. Contexto y Objetivo

Hoy los descansos en el store (`shortRest` y `longRest`) calculan la curación con un promedio fijo (`Math.floor(dieSize / 2) + 1 + conMod`) sin permitir tiradas de dados reales ni selección de tipos de dados. Además, `CharacterData['hitDice']` solo admite un único tipo de dado de golpe, lo que impide representar fielmente personajes multiclase (por ejemplo, Guerrero 3 con d10 y Pícaro 2 con d8).

Esta fase implementa:
1. El **modelo de datos ampliado** con soporte multiclase (`HitDicePool`) y consistencia idempotente con el nivel en `calculations.ts`.
2. Las **estructuras de resultados** (`ShortRestResult`, `LongRestResult`, `SpentHitDie`) en `src/scripts/models/rest.ts`.
3. El módulo de **lógica pura** `src/scripts/dnd/rests.ts` que implementa sin dependencias de DOM ni Firebase:
   - Cálculo de curación por dado con modificador de CON (mínimo 0 PG por dado).
   - Simulación y deducción atómica de pools de dados de golpe.
   - Algoritmo de recuperación de hasta la mitad de dados en descanso largo con priorización de dados mayores (d12 > d10 > d8 > d6).
   - Generación y consumo de dados especiales guardados (Portento / Portent).
4. La suite completa de tests unitarios en `tests/rests.test.mjs`.

Al cerrar esta fase, toda la matemática de descanso estará blindada por tests unitarios antes de tocar cualquier componente de interfaz.

---

## 2. Prerrequisitos Verificables

| Debe existir | Cómo comprobarlo |
| --- | --- |
| Tipos de recursos y `rechargeOn` | `src/scripts/models/resource.ts` (`Resource`, `RechargeOn`) |
| Funciones de recursos y efectos | `src/scripts/dnd/resources.ts` (`resetOn`), `src/scripts/dnd/effects.ts` (`expireOnRest`) |
| `recalculateCharacter` | `src/scripts/dnd/calculations.ts:48` |
| `hitDieForClass` | `src/scripts/dnd/hitDice.ts` |

---

## 3. Decisiones Vigentes

- **FA-1 (Compatibilidad hacia atrás):** Si `pools` no está definido en `char.hitDice`, las funciones puras infieren un pool único a partir de `{ die: char.hitDice.die, total: char.hitDice.total, remaining: char.hitDice.remaining }`.
- **FA-2 (Regla de curación SRD 5.1):** Cada dado tirado suma el modificador de Constitución del personaje: `const healed = Math.max(0, roll + conMod)`. La salud resultante nunca supera `char.hp.max`.
- **FA-3 (Cuota de dados en Descanso Largo):** Se recupera como máximo `Math.max(1, Math.floor(char.hitDice.total / 2))` dados.
- **FA-4 (Prioridad Multiclase por defecto):** Si el usuario no especifica qué dados recuperar en multiclase, el algoritmo prioriza recuperar los dados con caras más altas (`d12` antes que `d10`, `d10` antes que `d8`, etc.).
- **FA-5 (Portento y dados guardados):** Si un recurso tiene `dieType: 'd20'` y `rechargeOn: 'longRest'`, al procesar el descanso largo se generan `resource.max` tiradas aleatorias (o provistas) de 1..20 y se almacenan en `resource.values`.

---

## 4. Contratos y Modelo de Datos

### En `src/scripts/models/character.ts`
```ts
export type HitDie = 'd6' | 'd8' | 'd10' | 'd12';

export interface HitDicePool {
  die: HitDie;
  total: number;
  remaining: number;
}
```

### En `src/scripts/models/rest.ts` (Nuevo archivo)
```ts
import type { HitDie } from './character.ts';

export interface SpentHitDie {
  die: HitDie;
  roll: number;
  conMod: number;
  total: number; // Math.max(0, roll + conMod)
}

export interface ShortRestOptions {
  spent: { die: HitDie; roll: number }[];
  conMod: number;
}

export interface ShortRestResult {
  healedHp: number;
  hpBefore: number;
  hpAfter: number;
  spentDice: SpentHitDie[];
  remainingDiceTotal: number;
  remainingPools: { die: HitDie; total: number; remaining: number }[];
  recoveredResources: string[];
  expiredEffects: string[];
}

export interface LongRestOptions {
  customDiceRecovery?: Partial<Record<HitDie, number>>;
  rng?: () => number;
}

export interface LongRestResult {
  healedHp: number;
  hpBefore: number;
  hpAfter: number;
  recoveredDice: { die: HitDie; count: number }[];
  remainingDiceTotal: number;
  remainingPools: { die: HitDie; total: number; remaining: number }[];
  recoveredSlots: Record<number, number>;
  recoveredResources: string[];
  expiredEffects: string[];
  savedDiceRolled: { resourceName: string; values: number[] }[];
}
```

### En `src/scripts/dnd/rests.ts` (Nuevo archivo)
```ts
export function calculateHitDieHeal(die: HitDie, conMod: number, roll?: number, rng?: () => number): { roll: number; conMod: number; total: number };
export function syncHitDicePools(char: CharacterData): boolean;
export function calculateMaxHitDiceRecovery(total: number): number;
export function suggestHitDiceRecovery(pools: HitDicePool[], maxToRecover: number): { die: HitDie; count: number }[];
export function executeShortRestLogic(char: CharacterData, options: ShortRestOptions): { char: CharacterData; result: ShortRestResult };
export function executeLongRestLogic(char: CharacterData, options?: LongRestOptions): { char: CharacterData; result: LongRestResult };
export function consumeSavedDie(resource: Resource, dieIndex: number): { resource: Resource; value: number };
```

---

## 5. Tareas a Ejecutar

- [ ] **T-280** Definir tipos `HitDicePool` en `character.ts`, crear `src/scripts/models/rest.ts` con los tipos de descanso e implementar `syncHitDicePools(char)` en `calculations.ts` asegurando idempotencia con `char.level`.
- [ ] **T-281** Implementar funciones puras de tirada de dados de golpe y descanso corto en `src/scripts/dnd/rests.ts` (`calculateHitDieHeal`, deducción de pools, límite de `hp.max`, recarga de recursos `shortRest` y expiración de efectos `untilRest: short`).
- [ ] **T-282** Implementar funciones puras de descanso largo en `src/scripts/dnd/rests.ts` (`hp.current = hp.max`, `hp.temp = 0`, cálculo de cuota de recuperación de dados `floor(total / 2)`, algoritmo de priorización multiclase, reinicio de slots de conjuro 1–9 y recursos `longRest`/`shortRest`).
- [ ] **T-283** Implementar soporte de dados especiales guardados (Portento) y escribir la suite de pruebas unitarias exhaustiva en `tests/rests.test.mjs`.

---

## 6. Criterios de Aceptación de la Fase

1. `syncHitDicePools` alinea automáticamente los pools con el nivel del personaje sin romper personajes que solo tienen `char.hitDice.die`.
2. `calculateHitDieHeal` suma correctamente CON y nunca devuelve menos de 0 puntos curados por dado.
3. Un personaje con 10/30 PG que gasta dos dados (d10 con roll 8 y d10 con roll 6) teniendo CON +2 cura 10 + 8 = 18 PG, terminando en 28/30 PG.
4. Un personaje nivel 5 recupera como máximo 2 Dados de Golpe en descanso largo. En multiclase (3d10 y 2d8), recupera por defecto 2d10 si ha gastado ambos.
5. Los recursos con `dieType: 'd20'` reciben tiradas guardadas en `values` tras un descanso largo.
6. `node --test tests/rests.test.mjs` pasa al 100% en verde.
