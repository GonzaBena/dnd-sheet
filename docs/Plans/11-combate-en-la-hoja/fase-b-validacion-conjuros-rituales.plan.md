# Plan Fase B — Validación de Conjuros, Componentes y Rituales (T-324 … T-327)

Spec: `docs/Specs/11-combate-en-la-hoja.spec.md`, RF-322, RF-323, RF-324; decisiones H4-2, H4-3.

---

## 1. Contexto y Objetivo

Lanzar magia en D&D 5e involucra tres tipos de componentes:
- **Verbal (V):** Exige capacidad de hablar en voz alta (un personaje amordazado o en silencio no puede).
- **Somático (S):** Requiere tener al menos una mano libre para gesticular. Si lleva espada en una mano y escudo en la otra, y el conjuro no usa material pero sí somático, las reglas oficiales 5e exigen guardar un arma o tener una dote específica (ej. *Conjurador de Guerra* / *War Caster*).
- **Material (M):** Requiere un foco de lanzamiento o una bolsa de componentes, salvo que el material tenga coste en oro especificado (ej. *"un diamante de 300 po"*), en cuyo caso debe estar presente en el inventario.

Además, los **Rituales** permiten a ciertas clases lanzar conjuros marcados con la etiqueta de ritual tomándose 10 minutos adicionales **sin consumir espacios de conjuro**.

Esta fase implementa:
1. Módulo de lógica pura `validateSpellCasting(char: CharacterData, spell: Spell)` en `src/scripts/dnd/spellcasting.ts`.
2. Detección de manos libres y compatibilidad de foco según objetos equipados en `equipped` / slots.
3. Alertas visuales no bloqueantes en `SpellcastingPanel.astro` y `SpellDetailModal.astro`.
4. Botón / opción "Lanzar como Ritual (+10 min)" que no descuenta espacios de conjuro.
5. Descuento reactivo e inmediato de ranuras con feedback visual y soporte de lanzamiento con espacios superiores (escalado de dados).

---

## 2. Prerrequisitos Verificables

| Debe existir | Cómo comprobarlo |
| --- | --- |
| Panel de magia y ranuras | `src/components/combat/SpellcastingPanel.astro` |
| Slots de equipo | `src/scripts/dnd/equipment.ts` |
| Catálogo y modal de conjuro | `src/components/modals/SpellDetailModal.astro` |

---

## 3. Decisiones Vigentes

- **FB-1 (La hoja avisa, no bloquea):** Las alertas de componentes aparecen en badges de color ámbar/rojo con icono de advertencia (`⚠️`), pero el botón de lanzar sigue accesible.
- **FB-2 (Foco de lanzamiento):** Si el personaje tiene en su inventario equipado un objeto de categoría `gear` o `weapon` con notas de canalizador/foco o báculo, se considera que cubre componentes M sin coste.
- **FB-3 (Rituales):** Lanzar como ritual añade 10 minutos y genera una entrada en el diario de la sesión con `#Ritual`, omitiendo `useSpellSlot`.
- **FB-4 (Escalado de conjuros):** Si se lanza un conjuro a un nivel mayor al base, la fórmula de daño escala según el texto o regla de "En niveles superiores".

---

## 4. Tareas Detalladas

- [ ] **T-324:** Crear `src/scripts/dnd/spellcasting.ts` con la función pura `checkSpellComponents(char, spell)` que evalúa manos ocupadas, foco y materiales con coste.
- [ ] **T-325:** Añadir badges de advertencia de componentes en `SpellcastingPanel.astro` y en el modal de detalle `SpellDetailModal.astro`.
- [ ] **T-326:** Añadir la opción de lanzamiento como Ritual para conjuros elegibles en `SpellcastingPanel.astro` y `SpellDetailModal.astro`.
- [ ] **T-327:** Probar y verificar con tests unitarios en `tests/combat_sheet.test.mjs`.

---

## 5. Verificación

1. Tests unitarios que comprueban advertencias de manos ocupadas con arma a 2 manos o arma + escudo.
2. Comprobación de que lanzar como ritual no resta ranuras.
3. Comprobación de que lanzar normal descuenta la ranura seleccionada.
