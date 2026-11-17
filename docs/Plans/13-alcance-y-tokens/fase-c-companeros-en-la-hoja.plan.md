# Fase C — Modelo y Gestión de Compañeros en la Hoja · [Completada]

Plan de implementación para la **Fase C de la Spec 13 (H6)**.
Requisito cubierto: **RF-353** (Gestión de Compañeros e Invocaciones en la Hoja).
**Estado: Completada y verificada.**

---

## Objetivo

Permitir que los jugadores registren, editen y gestionen en su hoja de personaje sus criaturas subordinadas (familiares, monturas, animales de compañía, invocaciones y sirvientes mágicos) con sus puntos de golpe, clase de armadura, velocidad y notas.

---

## Tareas

### T-358: Modelo de Datos `CharacterCompanion`
- En `src/scripts/models/character.ts`:
  ```typescript
  export type CompanionType = 'familiar' | 'mount' | 'companion' | 'summon' | 'sidekick';

  export interface CharacterCompanion {
    id: string;
    name: string;
    type: CompanionType;
    size: 1 | 2 | 3 | 4; // 1: Mediano/Pequeño, 2: Grande, 3: Enorme, 4: Gigantesco
    hp: {
      current: number;
      max: number;
    };
    armorClass?: number;
    speedFt?: number;
    avatarUrl?: string;
    notes?: string;
    tokenId?: string; // ID del token desplegado en el mapa actual si existe
  }
  ```
- Añadir campo `companions?: CharacterCompanion[]` a `CharacterData`.
- Migración y fallback: si `char.companions` es `undefined`, se inicializa como array vacío `[]`.

### T-359: Métodos en `characterStore.ts`
- Métodos CRUD en `characterStore`:
  * `addCompanion(charId: string, companion: Omit<CharacterCompanion, 'id'>): Promise<string>`
  * `updateCompanion(charId: string, companionId: string, patch: Partial<CharacterCompanion>): Promise<void>`
  * `removeCompanion(charId: string, companionId: string): Promise<void>`
  * `linkCompanionToken(charId: string, companionId: string, tokenId: string | null): Promise<void>`
- Manejo de persistencia local y actualización en Firestore con `saveAndNotify()`.

### T-360: UI de Gestión de Compañeros (`CompanionsPanel.astro` o sección en la Hoja)
- Nueva sección o pestaña en la hoja del personaje: "Compañeros e Invocaciones".
- Tarjeta de cada compañero:
  * Avatar o icono según tipo (mascota, corcel, espíritu, calavera/familiar).
  * Nombre, tipo legible en español (*Familiar*, *Montura*, *Compañero Animal*, *Invocación*).
  * Barra y controles de PG actuales / máximos con delta rápido (+1, -1, +5, -5).
  * CA y velocidad en pies.
  * Botón para editar detalles y notas.
  * Botón para desplegar o enlazar con un token en el mapa.
- Modal o formulario *"Añadir Compañero"* con presets típicos (Lechuza familiar, Mastín, Caballo de guerra, Arma espiritual).

### T-361: Pruebas Unitarias de Store y Datos
- Pruebas en `tests/companions.test.mjs`:
  * Creación de compañero genera ID único y añade a `char.companions`.
  * Modificación de PG del compañero persiste de forma reactiva.
  * Eliminación de compañero lo quita de la lista sin tocar el resto de la hoja.
  * Límite razonable: máximo 10 compañeros por personaje.

---

## Criterio de Cierre

El jugador puede crear, ver y modificar compañeros en su hoja con persistencia garantizada en Firestore y modo local, y la suite de tests pasa en verde.
