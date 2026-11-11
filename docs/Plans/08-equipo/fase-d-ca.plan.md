# Plan Fase D — CA derivada (T-263 … T-266)

Spec: `docs/Specs/08-equipo.spec.md`, sección *4. CA derivada y desglose* y RF-264, RF-273 a RF-278.

## 1. Contexto y objetivo

Hoy la CA es un número manual (`armorClass`) que ningún cálculo toca. Esta fase la convierte en un **resultado calculado**: la mejor fórmula aplicable más escudo, objetos y efectos, con un **desglose** visible. El número manual pasa a ser un override. También hace que `collectModifiers` lea los efectos de los objetos equipados.

Al terminar, la CA de la hoja, de la iniciativa y de la forma salvaje sale de una sola función y se puede abrir su desglose.

## 2. Prerrequisitos verificables

| Debe existir | Cómo comprobarlo |
| --- | --- |
| Fase C completa (`checkCompatibility`) | `src/scripts/dnd/compat.ts` |
| `equippedItems`, `attuned`, `requiresAttunement` | `src/scripts/dnd/equipment.ts`, `character.ts` |
| `collectModifiers` | `src/scripts/dnd/effects.ts:70` |
| Lectores de CA | `VitalsGrid.astro:50-52,200-208`, `EditCharacterModal.astro:183,266,396`, `InitiativeList.astro:272`, `WildShapePanel.astro:123-184`, `campaignStore.ts:138-271` |

## 3. Decisiones vigentes

- **D1/D2/D4/D11/D12**, **H1-1 a H1-6**, **H2-1 a H2-8** (ver README).

Decisiones propias:

- **FD-1** `computeAc(char)` devuelve `{ total, formula, parts, manual }`. **No se guarda** el resultado (H2-5).
- **FD-2** Fórmulas candidatas: **armadura equipada** (`baseAc + bonus + DES` con `dexCap`), **sin armadura** (`10 + DES`), **Defensa sin Armadura** del Bárbaro (`10 + DES + CON`) y del Monje (`10 + DES + SAB`), **Armadura de Mago** (`13 + DES`). Gana la de mayor total. Las fórmulas de clase solo se consideran si `className` coincide (bárbaro, monje) **y no hay armadura equipada** salvo que la regla lo permita (el bárbaro y el monje la pierden con armadura; el monje también con escudo). Armadura de Mago solo con un efecto activo cuyo `sourceId` o nombre sea `mage-armor` y sin armadura equipada.
- **FD-3** Luego se suman: bono del **escudo** (`baseAc + bonus`), modificadores `ac add` de los objetos equipados **que estén en condiciones de aportar** (FD-4) y de `activeEffects`.
- **FD-4** Un objeto aporta efectos solo si está `equipped` y, si `requiresAttunement`, también `attuned` (FA-5, RF-264).
- **FD-5** Un modificador `ac set` (de un efecto o un objeto) **reemplaza la fórmula** y se muestra como tal; los `add` siguen sumándose encima.
- **FD-6** **Override manual:** si `armorClass` está definido como número, manda y `computeAc` marca `manual: true`. Para volver al cálculo, el campo se borra (`undefined`). Los personajes antiguos **tienen** `armorClass` numérico: se tratan como override **solo si difiere del cálculo** al primer abrirlos; si coincide, se limpia. Anotar con `// DECISION:`.
- **FD-7** `getArmorClass(char)` es el **único** punto de lectura. Si hay forma salvaje activa con `ac`, prevalece sobre todo (comportamiento actual de `WildShapePanel`).
- **FD-8** `collectModifiers(char, target)` suma los `effects` de los objetos que aportan (FD-4) además de `activeEffects`. Mantiene la coincidencia por igualdad o prefijo con punto, y sigue sin evaluar `when`. Los modificadores de compatibilidad de la Fase C **no** entran aquí: se muestran en el desglose aparte.
- **FD-9** `armorNote` pasa a nota libre; deja de ser la descripción automática. No se borra.

## 4. Modelo de datos

Sin campos nuevos en Firestore. `CharacterData.armorClass` pasa a opcional (override).

Contrato en `src/scripts/dnd/ac.ts` (puro):

```ts
export interface AcPart { label: string; value: number }
export interface AcResult {
  total: number;
  formula: string;          // 'Armadura', 'Sin armadura', 'Defensa sin armadura', 'Armadura de mago', 'Efecto', 'Manual'
  parts: AcPart[];          // desglose ordenado
  manual: boolean;
  alternatives: { formula: string; total: number }[];  // fórmulas descartadas, para mostrar la elección
}

export function computeAc(char: CharacterData): AcResult;
export function getArmorClass(char: CharacterData): number;   // forma salvaje > manual > calculada
```

## 5. Archivos

**Crear**
- `src/scripts/dnd/ac.ts` (puro)
- `src/components/modals/AcBreakdownModal.astro`
- `tests/ac.test.mjs`

**Modificar**
- `src/scripts/models/character.ts`: `armorClass?: number`.
- `src/scripts/dnd/effects.ts`: `collectModifiers` incluye los efectos de objetos que aportan.
- `src/scripts/dnd/calculations.ts`: migración idempotente de FD-6.
- `src/components/character/VitalsGrid.astro`, `src/components/combat/InitiativeList.astro` (ruta real en `InitiativeList.astro:272`), `WildShapePanel.astro`, `campaignStore.ts`: leer `getArmorClass(char)`.
- `EditCharacterModal.astro`: el input de CA pasa a "CA manual (opcional)" con botón "Volver al cálculo".
- `src/scripts/state/characterStore.ts`: `setManualAc(value | undefined)`.

## 6. Pasos por tarea

### T-263 — `computeAc` (RF-273, RF-274, RF-275)

1. Tests primero (sección 7).
2. Fórmulas y elección del mejor total (FD-2); `alternatives` con las descartadas.
3. Suma de escudo y modificadores (FD-3, FD-4); `ac set` reemplaza (FD-5).
4. Partes con etiquetas legibles: `Armadura de cuero`, `Destreza +2 (máx. +2)`, `Escudo +2`, `Anillo de Protección +1`.

### T-264 — `collectModifiers` con objetos equipados (RF-264, RF-276)

1. Extender la firma para aceptar `char` con `inventory?`; sin inventario, el comportamiento actual no cambia.
2. Un objeto sin `equipped`, o con `requiresAttunement` sin `attuned`, no aporta.
3. Mantener los tests de `tests/effects.test.mjs` en verde; agregar los casos nuevos.

### T-265 — `getArmorClass` y lectores (RF-277)

1. Implementar según FD-7 y reemplazar cada lectura directa de `armorClass` por la función.
2. Migración de FD-6 en `recalculateCharacter`.
3. Verificar que el DM ve la misma CA en la iniciativa (usa los datos del personaje que ya recibe).
4. Búsqueda en `src/` de `armorClass` para confirmar que no queda ningún lector directo fuera del override.

### T-266 — Desglose y override (RF-275, RF-278)

1. Tocar la CA abre `AcBreakdownModal`: fórmula elegida, partes, fórmulas descartadas con su total, avisos de compatibilidad (Fase C) y las desventajas declaradas.
2. Si es manual, mostrar "CA manual" y el botón "Volver al cálculo".
3. `setManualAc` guarda una sola escritura.
4. Todo texto con `textContent`.

## 7. Tests

`tests/ac.test.mjs`:

- Sin armadura, DES +2: 12.
- Cuero (11) con DES +3: 14; camisote (13, `dexCap 2`) con DES +3: 15; cota de malla (16, `dexCap 0`): 16.
- Con escudo (+2): suma 2 sobre cualquiera.
- Bárbaro sin armadura: `10 + DES + CON`; con armadura, la fórmula de bárbaro **no** se considera.
- Monje sin armadura ni escudo: `10 + DES + SAB`; con escudo, no.
- Mago con `mage-armor` activo: `13 + DES`; gana sobre `10 + DES`.
- Anillo de Protección (`ac add 1`) equipado y sintonizado suma; sin sintonizar, no.
- `ac set` de un efecto reemplaza la fórmula; un `add` posterior se suma.
- Armadura mágica con `bonus: 1`: suma 1.
- Override manual: `manual: true` y `total` igual al valor.
- `getArmorClass` con forma salvaje activa: devuelve el `ac` de la forma.
- Migración de FD-6: `armorClass` coincidente con el cálculo se limpia; distinto se conserva; segunda ejecución sin cambios.
- `collectModifiers`: efectos de objetos aportan según FD-4; sin `inventory` se comporta como antes.

## 8. Verificación

```bash
pnpm test
pnpm build
```

Prueba manual (personaje antiguo con CA manual, más un mago y un bárbaro):

1. Personaje antiguo: abre con su CA de siempre; "CA manual" visible en el desglose.
2. Volver al cálculo con cuero y escudo: la CA cambia y el desglose lo explica.
3. Mago con armadura pesada: aviso de compatibilidad en el desglose y CA correcta.
4. Bárbaro sin armadura: `10 + DES + CON`; con armadura media, usa la mejor.
5. Sintonizar y desintonizar un anillo con `ac add 1`: la CA sube y baja.
6. DM en otra ventana: ve la misma CA en la iniciativa.
7. Forma salvaje activa: muestra la CA de la forma; al terminar, vuelve la calculada.

## 9. Fuera de alcance

- Aplicar la desventaja a las tiradas (H4).
- CA temporal contra un ataque concreto (reacción Escudo, H5).
- Cobertura parcial u otras reglas opcionales.

## 10. Checklist de cierre

- [ ] T-263 … T-266 marcadas en la spec.
- [ ] `// DECISION:` en FD-2 y FD-6.
- [ ] No queda ningún lector directo de `armorClass` salvo el override.
- [ ] `tests/effects.test.mjs` sigue en verde.
- [ ] `pnpm test` y `pnpm build` en verde.
