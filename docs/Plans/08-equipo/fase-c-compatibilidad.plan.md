# Plan Fase C — Competencias y compatibilidad (T-260 … T-262)

Spec: `docs/Specs/08-equipo.spec.md`, sección *3. Competencias y compatibilidad* y RF-267 a RF-272.

## 1. Contexto y objetivo

El personaje no guarda competencias de armadura ni de arma. Esta fase agrega una **lista de competencias que el jugador carga a mano**, y un **evaluador** que, dado lo que lleva equipado, devuelve avisos y penalizaciones declaradas. La hoja avisa; no bloquea.

Al terminar, equipar una armadura pesada a un personaje sin esa competencia muestra un aviso con sus penalizaciones, y el jugador puede ignorarlo.

## 2. Prerrequisitos verificables

| Debe existir | Cómo comprobarlo |
| --- | --- |
| Fase B completa (`armor`, `weapon`, `strMin`, `stealthDisadv` en objetos) | `src/scripts/models/character.ts`, `src/scripts/dnd/catalog.ts` |
| `equippedItems` y `equipItem` | `src/scripts/dnd/equipment.ts` (Fase A) |
| Tipo `Modifier` con `op: 'disadvantage'` y `when` | `src/scripts/models/effect.ts` |
| Pantalla de edición del personaje | `src/components/modals/EditCharacterModal.astro` |
| Hoja con espacio para avisos | `src/components/character/VitalsGrid.astro` |

## 3. Decisiones vigentes

- **D1/D2/D4/D11/D12**, **H1-1 a H1-6**, **H2-1 a H2-8** (ver README).

Decisiones propias:

- **FC-1** `proficiencies: { armor: string[]; weapons: string[] }` en `CharacterData`, **vacío por defecto**. Valores de armadura: `light`, `medium`, `heavy`, `shield`. Valores de arma: `simple`, `martial` y el `index` de un arma concreta (por ejemplo `longsword`, `hand-crossbow`).
- **FC-2** No se derivan del SRD ni de la clase, y no hay multiclase: la lista plana admite sumar competencias tildando más casillas (H2-8).
- **FC-3** Con la lista de armadura **y** de armas vacía, la hoja muestra un mensaje único ("Cargá tus competencias para que los avisos sean fiables") **en lugar** de avisos por objeto. Los avisos solo aparecen cuando hay al menos una competencia cargada.
- **FC-4** El evaluador es **puro** y devuelve `{ warnings, penalties, modifiers }`; no toca el personaje. Cada `warning` lleva `itemId`, texto y `ignorable: true`.
- **FC-5** Penalizaciones por **armadura sin competencia** (reglas): desventaja en tiradas de ataque, en salvaciones y pruebas de característica de FUE y DES, y **no puede lanzar conjuros**. Se declaran como modificadores con `target` `attack`, `save.str`, `save.dex`, `check.str`, `check.dex` y `op: 'disadvantage'`, más un marcador `spellcasting` con `op: 'set'` y `value: 'blocked'`. No se evalúan en tiradas (H2-7).
- **FC-6** Un escudo sin competencia aplica la misma penalización que una armadura sin competencia.
- **FC-7** **FUE mínima**: si `stats.str.score < armor.strMin`, penalización de velocidad `speed add -10` y aviso. No aplica con competencia o sin ella: es independiente.
- **FC-8** **Desventaja en Sigilo**: si la armadura la tiene, modificador `skill.stealth disadvantage` mientras esté equipada; no genera aviso, solo aparece en el desglose.
- **FC-9** **Arma sin competencia**: el bono de competencia no se suma al ataque; se declara el aviso. El cálculo del ataque lo usa en la Fase E.
- **FC-10** "Ignorar" se guarda en `InventoryItem.ignoreWarnings`. Ignorar quita el aviso **y las penalizaciones declaradas** de ese objeto, no la FUE mínima.
- **FC-11** Un objeto no equipado no genera avisos ni penalizaciones.

## 4. Modelo de datos

En `src/scripts/models/character.ts`:

```ts
export interface Proficiencies { armor: string[]; weapons: string[] }
// CharacterData: proficiencies?: Proficiencies  (ausente = vacío)
```

Contrato en `src/scripts/dnd/compat.ts` (puro):

```ts
export interface CompatWarning { itemId: string; text: string; ignorable: boolean }
export interface CompatResult {
  warnings: CompatWarning[];
  modifiers: Modifier[];          // penalizaciones declaradas (FC-5, FC-7, FC-8)
  proficiencyMissing: boolean;    // FC-3: no hay competencias cargadas
}

export function checkCompatibility(char: CharacterData): CompatResult;
export function hasArmorProficiency(prof: Proficiencies | undefined, a: ArmorData): boolean;
export function hasWeaponProficiency(prof: Proficiencies | undefined, itemOrIndex: InventoryItem): boolean;
```

## 5. Archivos

**Crear**
- `src/scripts/dnd/compat.ts` (puro)
- `src/components/character/CompatWarnings.astro`
- `tests/compat.test.mjs`

**Modificar**
- `src/scripts/models/character.ts`: `Proficiencies` y el campo.
- `src/scripts/models/defaultCharacter.ts`: `proficiencies: { armor: [], weapons: [] }`.
- `src/scripts/dnd/calculations.ts`: si falta, crear `proficiencies` vacío (migración idempotente).
- `src/scripts/state/characterStore.ts`: `setProficiencies`, `setIgnoreWarnings(itemId, bool)` con `saveAndNotify()`.
- `src/components/modals/EditCharacterModal.astro` (o un modal propio `EditProficienciesModal.astro`): casillas de competencias.
- `VitalsGrid.astro` o la mochila: montar `CompatWarnings`.

## 6. Pasos por tarea

### T-260 — Campo y edición de competencias (RF-269)

1. Agregar el tipo, el valor por defecto y la migración.
2. UI de casillas: armaduras (ligera, media, pesada, escudos), armas (simples, marciales) y un campo para agregar armas concretas por nombre (se guarda como `index`: minúsculas con guiones).
3. Guardar con `setProficiencies` (una escritura).
4. Mostrar el mensaje de FC-3 cuando no hay nada cargado.

### T-261 — Evaluador (RF-267, RF-268, RF-270, RF-271)

1. Escribir **primero** los tests de la sección 7.
2. `checkCompatibility` recorre `equippedItems`, aplica FC-4 a FC-11 y devuelve avisos y modificadores.
3. Textos de aviso en español, con el objeto y la competencia que falta ("Cota de malla: no tienes competencia con armadura pesada. Desventaja en ataques, salvaciones y pruebas de FUE y DES; no puedes lanzar conjuros.").

### T-262 — Aviso en la hoja e "Ignorar" (RF-270, RF-272)

1. `CompatWarnings.astro`: lista de avisos con el botón "Ignorar" por objeto; los ignorados se muestran atenuados con "Restablecer".
2. Mostrar el aviso junto a la CA y en la mochila, sobre el objeto afectado.
3. `setIgnoreWarnings` guarda en el objeto; recargar mantiene el estado.
4. Todo texto con `textContent`.

## 7. Tests

`tests/compat.test.mjs`:

- Mago con armadura pesada y `proficiencies.armor = ['light']`: aviso, modificadores de desventaja y `spellcasting` bloqueado.
- Mismo mago con `heavy` en la lista: sin aviso.
- Escudo sin `shield`: misma penalización.
- FUE 10 con armadura de `strMin: 13`: `speed add -10`, con y sin competencia.
- Desventaja en Sigilo con la armadura equipada: modificador `skill.stealth`; sin equipar: nada.
- Arma marcial sin `martial`: aviso y sin bono de competencia; con `longsword` concreta, sin aviso.
- Listas vacías: `proficiencyMissing: true` y sin avisos por objeto (FC-3).
- `ignoreWarnings: true`: sin avisos ni penalizaciones del objeto, pero la FUE mínima se conserva.
- Objeto no equipado: sin avisos.

## 8. Verificación

```bash
pnpm test
pnpm build
```

Prueba manual:

1. Personaje sin competencias cargadas: mensaje de FC-3, sin avisos.
2. Cargar `light` y equipar una armadura pesada: aviso con las penalizaciones.
3. "Ignorar": desaparece y sigue así tras recargar; "Restablecer" lo devuelve.
4. Cargar `heavy`: el aviso desaparece.
5. Con FUE baja y una armadura con requisito: aviso de velocidad.
6. Cada cambio de competencias o de "Ignorar" es una sola escritura.

## 9. Fuera de alcance

- Aplicar ventaja y desventaja a las tiradas y explicarla (H4).
- Impedir realmente el lanzamiento de conjuros (H4).
- Derivar competencias del SRD o sumar las de multiclase.
- Tiempos de ponerse y quitarse la armadura.

## 10. Checklist de cierre

- [ ] T-260 … T-262 marcadas en la spec.
- [ ] `// DECISION:` en FC-3 (mensaje en lugar de avisos) y FC-10 (qué quita "Ignorar").
- [ ] Ningún `innerHTML` con texto de usuario.
- [ ] `pnpm test` y `pnpm build` en verde.
