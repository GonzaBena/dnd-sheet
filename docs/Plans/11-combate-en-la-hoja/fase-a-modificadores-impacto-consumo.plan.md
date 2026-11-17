# Plan Fase A — Modificadores al Impacto y Consumo Condicional (T-320 … T-323)

Spec: `docs/Specs/11-combate-en-la-hoja.spec.md`, RF-320, RF-321; decisiones H4-1.

---

## 1. Contexto y Objetivo

En D&D 5e, muchas de las opciones tácticas más potentes se declaran antes de atacar o se activan al impactar:
- *Ataque Furtivo (Sneak Attack)* del Pícaro: 1 vez por turno, añade dados de daño (`Xd6`) si el arma es sutil o a distancia. Si el ataque falla, el pícaro conserva su uso para otro posible ataque en el mismo turno (ej. con acción adicional o reacción).
- *Castigo Divino (Divine Smite)* del Paladín: se decide al impactar con un arma cuerpo a cuerpo y consume un espacio de conjuro.
- *Inspiración Bárdica*: puede sumarse a la tirada de ataque antes o después de tirar, o al daño.
- *Maniobras del Maestro de la Batalla*: gastan un dado de superioridad para impacto o daño.

Actualmente, el jugador debe calcular estos dados mentalmente o agregarlos a mano. Lo más crítico: **si un ataque falla, el jugador no debería perder el recurso que planeaba aplicar al impactar**.

Esta fase implementa:
1. Modelo de datos `CombatModifierOption` en `src/scripts/models/combat.ts`.
2. Módulo de lógica pura en `src/scripts/dnd/combat.ts` para detectar modificadores disponibles según la ficha del personaje y aplicar fórmulas.
3. Selector en `WeaponActionCard.astro` y paso de modificadores a `DiceRollerModal.astro`.
4. Lógica de deducción en `DiceRollerModal.astro`: **solo si el ataque impacta** (supera la CA o el usuario confirma impacto) se descuenta el recurso. Si falla, el recurso no se descuenta.
5. Botón "Nuevo Turno" para reiniciar el estado de facultades de "1 vez por turno".
6. Tests unitarios en `tests/combat_sheet.test.mjs`.

---

## 2. Prerrequisitos Verificables

| Debe existir | Cómo comprobarlo |
| --- | --- |
| Armas y acciones de ataque | `src/scripts/dnd/weaponAttack.ts` |
| Recursos del personaje | `src/scripts/models/resource.ts`, `src/scripts/dnd/resources.ts` |
| Apertura de la Torre de Dados | `src/components/modals/DiceRollerModal.astro` (`open-dice-roller`) |

---

## 3. Decisiones Vigentes

- **FA-1:** Los modificadores se detectan por coincidencia en `features` y `resources` (ej. nombres como "Ataque Furtivo", "Sneak Attack", "Castigo Divino", "Divine Smite", "Inspiración Bárdica", "Maniobra").
- **FA-2:** Los modificadores seleccionados para daño se inyectan en `followUpDamage.extraDice` o modificador de daño de `DiceRollerModal`.
- **FA-3:** El estado `turnState: { usedModifiers: string[] }` se mantiene en `characterStore` y se puede reiniciar manualmente con un botón o con el evento de cambio de turno.
- **FA-4 (Consumo condicional):** En `DiceRollerModal`, si el resultado es pifia o no alcanza la CA del objetivo, no se ejecuta ninguna llamada de descuento de recurso. Solo en caso de acierto confirmado se llama a `spendResource` o `useSpellSlot`.

---

## 4. Tareas Detalladas

- [ ] **T-320:** Crear tipos `CombatModifierOption` en `src/scripts/models/combat.ts` y funciones detectoras puras `getAvailableCombatModifiers(char: CharacterData, weapon: AttackAction)` en `src/scripts/dnd/combat.ts`.
- [ ] **T-321:** Añadir selector de modificadores en `WeaponActionCard.astro` previo a la tirada de ataque, con checkboxes interactivos y previsualización del bono.
- [ ] **T-322:** Conectar el selector con `DiceRollerModal.astro`, pasando los modificadores activos en el evento `open-dice-roller`. Implementar la deducción condicional en `processRollResult` y en los botones de daño encadenado.
- [ ] **T-323:** Implementar botón "Nuevo Turno" en `WeaponActionCard.astro` para limpiar el estado `usedThisTurn` y añadir tests unitarios en `tests/combat_sheet.test.mjs`.

---

## 5. Verificación

1. `node --test tests/combat_sheet.test.mjs` valida que los modificadores se detectan y calculan correctamente.
2. Simulación en tests de que un ataque fallido no descuenta el recurso y uno exitoso sí lo hace.
