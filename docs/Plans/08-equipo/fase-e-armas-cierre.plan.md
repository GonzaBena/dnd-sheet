# Plan Fase E — Armas en acción y cierre (T-267 … T-269)

Spec: `docs/Specs/08-equipo.spec.md`, sección *5. Armas estructuradas*, RF-280 y RF-282, y los criterios de aceptación.

## 1. Contexto y objetivo

Las armas ya tienen datos estructurados (Fase B) y sabemos si el personaje es competente con ellas (Fase C). Esta fase **enlaza el arma equipada con una acción de ataque**, con el dado, la característica y el bono mágico ya cargados, agrega los **tests de reglas** del DM y **cierra la etapa** con la prueba manual.

Al terminar, equipar una espada larga ofrece crear su ataque con todo calculado, y la etapa H2 queda cerrada.

## 2. Prerrequisitos verificables

| Debe existir | Cómo comprobarlo |
| --- | --- |
| Fase B completa (`weapon`, `hands`) | `src/scripts/dnd/catalog.ts`, `character.ts` |
| Fase D completa (`computeAc`, `getArmorClass`) | `src/scripts/dnd/ac.ts` |
| `hasWeaponProficiency` | `src/scripts/dnd/compat.ts` |
| `AttackAction` con `damage`, `damageDice?`, `ability?`, `proficient?`, `attackBonusMod?`, `tags`, `mastery?` | `src/scripts/models/character.ts:17` |
| Alta de ataques | `src/components/modals/AddWeaponModal.astro` |
| Reglas del personaje | `firestore.rules:282-318`, `tests/rules/firestore_rules.test.mjs` |

## 3. Decisiones vigentes

- **D1/D2/D4/D11/D12**, **H1-1 a H1-6**, **H2-1 a H2-8** (ver README).

Decisiones propias:

- **FE-1** `AttackAction` gana `itemId?: string`. Las acciones sin `itemId` funcionan igual que hoy.
- **FE-2** Equipar un arma **ofrece** crear o actualizar su acción de ataque (una confirmación, no automático). Si ya existe una acción con ese `itemId`, se actualiza en lugar de duplicar.
- **FE-3** Característica de ataque: FUE por defecto; **DES** si el arma es a distancia (alcance) o tiene la propiedad `finesse` y DES es mayor. Se guarda en `ability`.
- **FE-4** `proficient` sale de `hasWeaponProficiency` (Fase C). Sin competencia, `proficient: false`.
- **FE-5** El bono mágico va en `attackBonusMod` y se suma también al daño: el `damage` generado incluye `+ magicBonus` más el modificador de característica.
- **FE-6** Se copian `damageDice`, `tags` (las propiedades traducidas) y, si el arma es versátil, se anota el dado alternativo en `notes`. Las propiedades **no se evalúan** (H4, H6).
- **FE-7** Al desequipar el arma, la acción **no se borra**: queda como estaba y se puede borrar a mano. Anotar con `// DECISION:`.
- **FE-8** `mastery` se conserva tal como lo tenga la acción; no se deriva del SRD en esta etapa.
- **FE-9** Test de reglas: el DM **no** puede escribir `inventory`, `proficiencies` ni `armorClass` de un personaje ajeno.

## 4. Modelo de datos

Un campo opcional nuevo en `AttackAction`: `itemId?: string`.

Contrato en `src/scripts/dnd/weaponAttack.ts` (puro):

```ts
export function buildAttackFromWeapon(char: CharacterData, item: InventoryItem): AttackAction;
export function upsertAttack(attacks: AttackAction[], action: AttackAction): AttackAction[];  // por itemId
```

## 5. Archivos

**Crear**
- `src/scripts/dnd/weaponAttack.ts` (puro)
- `tests/weapon_attack.test.mjs`

**Modificar**
- `src/scripts/models/character.ts`: `itemId?` en `AttackAction`.
- `src/scripts/state/characterStore.ts`: `createAttackFromWeapon(itemId)` con `saveAndNotify()`.
- `BackpackGrid.astro` / `ItemDetailModal.astro`: tras equipar un arma, ofrecer "Crear ataque" (FE-2).
- `tests/rules/firestore_rules.test.mjs`: casos de FE-9.
- `docs/Specs/08-equipo.spec.md` y `docs/ROADMAP.md`: marcar tareas y cerrar H2.

## 6. Pasos por tarea

### T-267 — Enlace entre arma y ataque (RF-280)

1. Tests primero (sección 7).
2. `buildAttackFromWeapon`: aplica FE-3 a FE-6 y devuelve la acción con `itemId`.
3. `upsertAttack` reemplaza por `itemId` o agrega.
4. UI: al equipar un arma en `mainHand`/`offHand`, mostrar "¿Crear ataque con Espada larga?" con la vista previa (bono y daño). Aceptar → `createAttackFromWeapon`.
5. `AddWeaponModal` sigue funcionando sin cambios.

### T-268 — Tests de reglas (RF-282)

1. En `tests/rules/firestore_rules.test.mjs` agregar: el dueño escribe `inventory`, `proficiencies` y `armorClass`; el DM recibe permiso denegado al intentar escribir cada uno; el DM sigue pudiendo escribir `hp`, `inspiration` y `updatedAt`.
2. Confirmar que **no hizo falta tocar** `firestore.rules`.

### T-269 — Prueba manual y cierre

1. Ejecutar la prueba manual de la sección 8 con un DM y un jugador.
2. Marcar T-252 a T-269 y los criterios de aceptación en la spec.
3. Actualizar `docs/ROADMAP.md`: estado de la Spec 08 a "Cerrada" y "Próximo paso" apuntando a la Spec 09 (H3).
4. Revisar las preguntas abiertas de la spec y moverlas a "Decisiones" o a "Ideas sueltas".

## 7. Tests

`tests/weapon_attack.test.mjs`:

- Espada larga con FUE +3 y competencia marcial: `ability: 'str'`, `proficient: true`, `damageDice: '1d8'`.
- Estoque (sutil) con DES mayor que FUE: `ability: 'dex'`.
- Arco largo (a distancia): `ability: 'dex'`.
- Arma `+1`: `attackBonusMod: 1` y el daño suma 1.
- Sin competencia: `proficient: false`.
- Arma versátil: dado alternativo en `notes`.
- `upsertAttack`: sin acción previa agrega; con la misma `itemId` reemplaza y no duplica; las acciones sin `itemId` quedan intactas.

## 8. Verificación

```bash
pnpm test
pnpm test:rules
pnpm build
```

Prueba manual de cierre (con `pnpm emulators`, jugador y DM, partida `active`):

1. **Criterio del roadmap:** a un mago equipar una armadura pesada → aparece el aviso con sus penalizaciones y la CA queda desglosada y correcta.
2. Cuero + escudo en un guerrero: CA correcta, desglose coherente, "Ignorar" persiste tras recargar.
3. Sintonizar tres objetos; el cuarto se rechaza; `attunedItems` antiguos migrados.
4. Equipar una espada larga: "Crear ataque" genera la acción con dado, característica y competencia; repetirlo no la duplica.
5. El DM ve la CA correcta en la iniciativa y no puede escribir equipo.
6. Equipar, desequipar y sintonizar generan una sola escritura por acción (consola del emulador).
7. Un personaje antiguo abre sin errores y sin perder objetos.

## 9. Fuera de alcance

- Evaluar propiedades de arma en combate, alcance y maestría (H4, H6).
- Borrar o desactivar el ataque al desequipar el arma.
- Tiempos de ponerse y quitarse la armadura.

## 10. Checklist de cierre

- [ ] T-267 … T-269 marcadas en la spec; T-252 … T-266 también.
- [ ] `// DECISION:` en FE-2 (confirmación) y FE-7 (el ataque no se borra).
- [ ] Criterios de aceptación 1 a 9 de la spec verificados.
- [ ] ROADMAP actualizado con H2 cerrada.
- [ ] `pnpm test`, `pnpm test:rules` y `pnpm build` en verde.
