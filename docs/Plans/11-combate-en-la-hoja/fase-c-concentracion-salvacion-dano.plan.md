# Plan Fase C — Concentración Activa y Salvación al Daño (T-328 … T-331)

Spec: `docs/Specs/11-combate-en-la-hoja.spec.md`, RF-325, RF-326; decisiones H4-4.

---

## 1. Contexto y Objetivo

En D&D 5e:
- Solo se puede mantener la concentración en **un único conjuro** a la vez. Iniciar otro termina el anterior al instante.
- Cada vez que una criatura concentrada recibe daño, debe realizar una tirada de salvación de Constitución para mantener la concentración.
- La dificultad de la tirada es:
  $$\text{CD} = \max(10, \lfloor \text{daño recibido} / 2 \rfloor)$$

Actualmente en el repositorio, `applyEffectFlow.ts` tiene un diálogo básico de confirmación para reemplazar efectos de concentración, pero cuando el personaje recibe daño (ya sea por el DM, por una tirada o por ajuste manual de PG en la hoja), la hoja no sabe que debe pedir una salvación de concentración.

Esta fase implementa:
1. Módulo de lógica pura `src/scripts/dnd/concentration.ts` con cálculo de CD y detección de efecto concentrado.
2. Intercepción reactiva de daño en `characterStore` y `hpActions.ts`: si `hp.current` disminuye y hay un efecto con `duration.kind === 'concentration'`, se emite el evento `concentration-check-required`.
3. Banner de alerta flotante en la hoja con la CD calculada, botón directo para tirar salvación de CON en la Torre de Dados y botón para perder la concentración voluntariamente.
4. Integración con `DiceRollerModal.astro`: al superar la CD se registra el éxito; si falla, se ofrece finalizar la concentración eliminando el efecto activo de `characterStore`.
5. Tests unitarios en `tests/combat_sheet.test.mjs`.

---

## 2. Prerrequisitos Verificables

| Debe existir | Cómo comprobarlo |
| --- | --- |
| Efectos activos | `src/scripts/models/effect.ts`, `src/scripts/dnd/effects.ts` |
| Transacción de PG | `src/scripts/dnd/hp.ts`, `src/scripts/data/hpTransaction.ts` |
| Panel de efectos activos | `src/components/character/ActiveEffectsPanel.astro` |

---

## 3. Decisiones Vigentes

- **FC-1 (Cálculo de CD exacto):** `calculateConcentrationDc(damage: number): number => Math.max(10, Math.floor(damage / 2))`. Si el daño es 0 o curación, no hay tirada.
- **FC-2 (Confirmación de reemplazo):** Al concentrarse en un nuevo efecto, se solicita confirmación al usuario para terminar el efecto previo. Si acepta, el anterior se purga de `activeEffects`.
- **FC-3 (Banner interactivo):** El banner de salvación permanece visible hasta que el jugador realice la tirada o decida soltar la concentración.
- **FC-4 (Salvación en Torre de Dados):** Al pulsar "Tirar Salvación de CON", se abre la Torre de Dados con `die: 20`, modificador de salvación de CON del personaje, etiqueta `"Salvación de Concentración"` y la CD fijada.

---

## 4. Tareas Detalladas

- [ ] **T-328:** Crear `src/scripts/dnd/concentration.ts` con funciones puras `calculateConcentrationDc`, `getActiveConcentrationEffect` y `handleConcentrationLoss`.
- [ ] **T-329:** Conectar la reducción de PG en `characterStore.ts` y `hpActions.ts` para emitir `concentration-check-required` cuando el personaje sufra daño mientras mantiene concentración.
- [ ] **T-330:** Crear componente UI banner de concentración o insertarlo en `VitalsGrid.astro` / `ActiveEffectsPanel.astro` para responder al evento, mostrando CD y botones de acción.
- [ ] **T-331:** Conectar la resolución de la tirada en `DiceRollerModal.astro` para auto-descartar el banner o solicitar retirada del efecto ante fallo. Añadir tests en `tests/combat_sheet.test.mjs`.

---

## 5. Verificación

1. Tests unitarios que verifican CD 10 para daños entre 1 y 21, CD 11 para 22, CD 15 para 30, etc.
2. Verificación de que recibir daño activa la alerta si hay efecto de concentración activo.
3. Verificación de reemplazo de concentración única en `activeEffects`.
