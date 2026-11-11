# Plan Fase B — Armaduras y armas en el catálogo (T-256 … T-259)

Spec: `docs/Specs/08-equipo.spec.md`, secciones *2. Armaduras* y *5. Armas estructuradas*, y RF-265, RF-266, RF-279, RF-281.

## 1. Contexto y objetivo

Los tipos `ArmorData` y `WeaponData` existen desde la Fase A, pero nada los llena. Esta fase hace que **armaduras, escudos y armas** se puedan agregar al inventario con sus datos estructurados, ya sea desde el catálogo SRD o como entradas propias, y que la ficha del objeto los muestre.

Al terminar, agregar "Cota de malla" desde el compendio guarda CA base, tope de DES, FUE mínima y desventaja en Sigilo; y agregar una "Espada larga" guarda su dado, tipo y propiedades.

## 2. Prerrequisitos verificables

| Debe existir | Cómo comprobarlo |
| --- | --- |
| Fase A completa (`ArmorData`, `WeaponData`, campos nuevos de `InventoryItem`) | `src/scripts/models/character.ts` |
| Catálogo con `meta` y `effects?` | `src/scripts/models/catalog.ts`, `src/scripts/dnd/catalog.ts` (`srdToEntry` `:32`, `toCatalogEntry` `:100`) |
| Datos SRD de equipo | `public/data/srd/{2014,2024}/equipment.json` (`armor_class`, `str_minimum`, `stealth_disadvantage`, `weapon_category`, `damage`, `properties`, `range`) y `weapon-properties.json` |
| Ficha de objeto | `src/scripts/dnd/detailView.ts`, `src/components/modals/ItemDetailModal.astro` |
| Alta de objetos | `AddItemModal`, `AddWeaponModal`, `CompendiumModal` (categoría `armor` ya existe en el filtro), `CustomEntryFields.astro` |

## 3. Decisiones vigentes

- **D1/D2/D4/D11/D12**, **H1-1 a H1-6**, **H2-1 a H2-8** (ver README).

Decisiones propias:

- **FB-1** `srdToEntry` deja los datos estructurados en `entry.meta.armor` y `entry.meta.weapon` con la **misma forma** que `ArmorData`/`WeaponData`. Al agregar al inventario se **copian** al objeto; después son independientes del catálogo.
- **FB-2** Mapeo de armaduras SRD: `equipment_categories` con `light-armor`/`medium-armor`/`heavy-armor`/`shield` → `category`; `armor_class.base` → `baseAc`; `armor_class.dex_bonus` falso → `dexCap: 0`; `max_bonus` → `dexCap`; ligera con `dex_bonus` verdadero y sin `max_bonus` → `dexCap: null`; `str_minimum` (0 → ausente); `stealth_disadvantage`. El escudo usa `baseAc` como **bono** (2).
- **FB-3** Mapeo de armas SRD: `weapon_category` → `category`; `damage.damage_dice` y `damage.damage_type` → `damageDice`/`damageType`; `properties[].index` → `properties`; `range.normal/long` → `range`; la propiedad *versátil* trae `two_handed_damage` → `versatileDice`. Un arma con la propiedad `two-handed` pone `hands: 2`.
- **FB-4** Si el SRD no trae un dato, se omite el campo (no se inventa). La armadura sin `baseAc` válido se agrega como objeto común y se avisa.
- **FB-5** Las entradas propias usan los mismos campos mediante `CustomEntryFields`; todo valor numérico se valida (entero, rango razonable) antes de guardar.
- **FB-6** Armadura y arma mágicas: `bonus` / `magicBonus` y `requiresAttunement` son campos editables en la entrada propia y vienen de `magic-items.json` cuando el SRD los indica; el `effects` de ejemplo (`ac add 1`) solo se carga a unos pocos objetos mágicos.

## 4. Modelo de datos

Sin cambios en Firestore. Contratos en `src/scripts/dnd/catalog.ts`:

```ts
export function armorFromSrd(raw: unknown): ArmorData | undefined;   // FB-2
export function weaponFromSrd(raw: unknown): { weapon: WeaponData; hands: 1 | 2 } | undefined; // FB-3
```

`headerFields` y `detailSections` de `detailView.ts` suman:

- Armadura: categoría, CA base (con bono), tope de DES, FUE mínima, desventaja en Sigilo.
- Arma: categoría, dado y tipo, propiedades, alcance, versátil, bono mágico.
- Equipo: slot sugerido y estado de sintonización.

## 5. Archivos

**Crear**
- `tests/catalog_equipment.test.mjs`

**Modificar**
- `src/scripts/dnd/catalog.ts`: `armorFromSrd`, `weaponFromSrd`, y su uso en `srdToEntry` para `meta.armor`/`meta.weapon`.
- `src/scripts/dnd/detailView.ts`: campos y secciones nuevos.
- `src/components/ui/CustomEntryFields.astro`: campos de armadura y arma según la categoría.
- `AddItemModal.astro`, `AddWeaponModal.astro`, `CompendiumModal.astro`: al agregar, copiar `armor`/`weapon`/`hands`/`requiresAttunement` al `InventoryItem`.
- `src/components/modals/ItemDetailModal.astro`: mostrar las secciones nuevas.

## 6. Pasos por tarea

### T-256 — Armaduras y escudos (RF-265, RF-266)

1. Tests primero (sección 7).
2. `armorFromSrd` según FB-2; `srdToEntry` guarda `meta.armor` cuando el equipo es una armadura o escudo.
3. Al agregar desde el compendio, el objeto toma `category: 'armor'` y `armor`. Un escudo lleva `armor.category: 'shield'`.
4. La CA base y la categoría no se pisan por traducciones: usar los `index` del SRD, no los nombres.

### T-257 — Armas (RF-279)

1. `weaponFromSrd` según FB-3 y `srdToEntry` guarda `meta.weapon`.
2. Al agregar, el objeto toma `category: 'weapon'`, `weapon` y `hands`.
3. `AddWeaponModal` (alta de ataque) **no cambia** su comportamiento en esta fase: el enlace llega en la Fase E.

### T-258 — Entradas propias (RF-265, RF-279)

1. `CustomEntryFields`: si la categoría es `armor`, campos de categoría, CA base, tope de DES, FUE mínima, desventaja en Sigilo y bono; si es `weapon`, campos de categoría, dado, tipo, propiedades, alcance, versátil y bono mágico. Casilla "Requiere sintonización".
2. Validación (FB-5) y saneamiento de textos con las utilidades de la Spec 07.
3. Todo texto con `textContent`.

### T-259 — Ficha de objeto (RF-281)

1. `headerFields`/`detailSections` con los datos de la sección 4; omiten lo vacío.
2. `ItemDetailModal` los muestra; botón "Equipar" ya existe (`availableActions`) y llama a `equipItem` de la Fase A con el slot sugerido.

## 7. Tests

`tests/catalog_equipment.test.mjs` (con datos reales de `public/data/srd/`, como `catalog.test.mjs`):

- Cuero (ligera): `baseAc 11`, `dexCap: null`.
- Camisote de mallas (media): `dexCap: 2`.
- Cota de malla (pesada): `dexCap: 0`, `strMin: 13`, `stealthDisadv: true`.
- Escudo: `category: 'shield'`, `baseAc: 2`.
- Espada larga: `category: 'martial'`, `damageDice: '1d8'`, `damageType` slashing, `versatileDice: '1d10'`.
- Gran hacha: propiedad `two-handed` → `hands: 2`.
- Una armadura sin `armor_class` devuelve `undefined`.
- `detailSections` omite las secciones vacías y muestra las de armadura y arma.

## 8. Verificación

```bash
pnpm test
pnpm build
```

Prueba manual:

1. Compendio → Cota de malla → Agregar: la ficha muestra CA 16, sin DES, FUE 13 y desventaja en Sigilo.
2. Agregar Escudo y Espada larga: la ficha de cada uno muestra sus datos.
3. Crear una armadura propia "Armadura de placas +1" con bono 1: la ficha muestra CA 19.
4. Un objeto sin datos de equipo se sigue agregando como antes.

## 9. Fuera de alcance

- Cálculo de la CA y avisos de compatibilidad (Fases C y D).
- Crear o actualizar la acción de ataque desde el arma (Fase E).
- Efectos estructurados para todo el SRD: solo los de ejemplo (FB-6).

## 10. Checklist de cierre

- [ ] T-256 … T-259 marcadas en la spec.
- [ ] `// DECISION:` en FB-2, FB-3 y FB-4 (mapeos y datos ausentes).
- [ ] Los datos copiados al inventario no dependen del catálogo cargado.
- [ ] `pnpm test` y `pnpm build` en verde.
