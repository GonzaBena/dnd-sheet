# Plan Fase D — Ventajas/Desventajas Explicadas y Cierre de Etapa (T-332 … T-335)

Spec: `docs/Specs/11-combate-en-la-hoja.spec.md`, RF-327; decisiones H4-5.

---

## 1. Contexto y Objetivo

En D&D 5e, la **Ventaja** y la **Desventaja** definen el dramatismo del combate:
- Con Ventaja se tiran dos d20 y se elige el mayor.
- Con Desventaja se tiran dos d20 y se elige el menor.
- Regla de anulación: Si concurren una o más ventajas y una o más desventajas, se anulan y se realiza una tirada normal.

Las fuentes de ventaja/desventaja provienen de:
1. Equipo: Armaduras sin competencia (`compat.ts`) imponen desventaja en ataques y salvaciones/pruebas de FUE y DES. Armaduras con desventaja en Sigilo.
2. Efectos activos: Modificadores con `op === 'advantage'` o `op === 'disadvantage'`.
3. Alcance de armas: Armas a distancia usadas a quemarropa (≤ 5 pies) o a largo alcance imponen desventaja táctica (`tacticalCombat.ts`).
4. Condiciones: Cegado, Envenenado, Derribado, Asustado, etc.
5. Maestrías de arma: *Vex* (ventaja al impactar), *Sap* (desventaja al enemigo).

Actualmente el jugador a menudo no sabe por qué tiene ventaja o desventaja. Esta fase implementa:
1. Módulo puro `evaluateRollAdvantage(char, targetType, context)` en `src/scripts/dnd/advantage.ts` que compila todas las causas activas y explica el resultado.
2. Visualización explicativa en `DiceRollerModal.astro`: cartel con el desglose legible de razones.
3. Modo de tirada 2d20 en el tambor de la ruleta animada, resaltando el dado ganador y tachando el descartado.
4. Soporte en modo físico (dos casillas o ingreso manual del dado seleccionado).
5. Suite completa de tests en `tests/combat_sheet.test.mjs`, build estático limpio y actualización del roadmap.

---

## 2. Prerrequisitos Verificables

| Debe existir | Cómo comprobarlo |
| --- | --- |
| Compatibilidad de armaduras | `src/scripts/dnd/compat.ts` |
| Efectos y modificadores | `src/scripts/dnd/effects.ts` |
| Alcance táctico | `src/scripts/vtt/tacticalCombat.ts` |
| Torre de Dados | `src/components/modals/DiceRollerModal.astro` |

---

## 3. Decisiones Vigentes

- **FD-1 (Explicación textual obligatoria):** Toda tirada que tenga ventaja o desventaja debe mostrar la lista de motivos ("Ventaja por: Flanqueo, Rasgo Vex").
- **FD-2 (Anulación mutua visual):** Si hay ventajas y desventajas a la vez, se muestra: *"Tirada normal: Ventaja y desventaja se neutralizan mutuamente"*, detallando ambas listas.
- **FD-3 (Ruleta de 2d20):** En modo virtual con ventaja/desventaja, se muestran dos casillas de d20 animadas; la descartada se atenúa con `opacity-40` y una línea diagonal.

---

## 4. Tareas Detalladas

- [ ] **T-332:** Crear `src/scripts/dnd/advantage.ts` con la función pura `evaluateAdvantage(char, actionOrContext)`.
- [ ] **T-333:** Actualizar `DiceRollerModal.astro` para recibir `advantageInfo` o evaluarlo en caliente, renderizando el banner explicativo con desglose.
- [ ] **T-334:** Implementar la visualización y selección del dado ganador (2d20) en el tambor virtual y en el input físico de `DiceRollerModal.astro`.
- [ ] **T-335:** Ejecutar la suite completa de tests (`node --test tests/combat_sheet.test.mjs`), verificar `astro build` limpio y actualizar `docs/ROADMAP.md` marcando H4 como cerrada.

---

## 5. Verificación

1. Comprobación en tests de anulación mutua y agregación de fuentes.
2. Verificación de renderizado en `DiceRollerModal` de las explicaciones de ventaja y desventaja.
3. Build estático exitoso.
