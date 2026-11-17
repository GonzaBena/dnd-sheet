# Spec 14: Layouts Especializados — dnd.gonzabena.com.ar

Nov 17, 2026 · @Gonzalo Benavente · **Estado: Cerrada**

Etapa H7 del [roadmap](../ROADMAP.md). Depende de H1 ([Spec 07](07-cimientos-de-la-hoja.spec.md), cimientos de la hoja), H4 ([Spec 11](11-combate-en-la-hoja.spec.md), combate en la hoja), H5 ([Spec 12](12-reacciones.spec.md), reacciones) y H6 ([Spec 13](13-alcance-y-tokens.spec.md), alcance táctico y medición de distancias 5e).

---

## Objetivo y Alcance

Adaptar la interfaz y la experiencia de usuario a los tres escenarios reales de juego de una mesa de rol donde la hoja de 12 paneles o el VTT tradicional resultan densos o incómodos:
1. **Modo Mesa Física (Mobile-First):** Una interfaz táctil ligera para jugadores en partidas presenciales con dados y miniaturas físicas, que arranca activa por defecto en móviles (< 640px) y prioriza vitales gigantes, matriz de ranuras de conjuro nivel 1-9 (consumo/recuperación con 1 toque), recursos de clase y armas preparadas listas para tirar sin navegación pesada.
2. **Cockpit Táctico del DM:** Una disposición horizontal de pantalla ancha tipo *DM Screen* donde el mapa táctico (o teatro de la mente) ocupa el área principal (65%) y una columna lateral fija (35%) integra el control de turnos, dados secretos y el **Party Dashboard** (con botones compactos `[-]` y `[+]` que solicitan cantidad para dañar o curar aventureros sin saturar la pantalla con 4 botones por personaje).
3. **Modo Teatro de la Mente (TotM):** Combate abstracto sin cuadrícula de píxeles dividido en 3 zonas tácticas (*Melé $\le 5$ ft*, *Cerca $30$ ft*, *Lejos $60+$ ft*) con cálculo automático de distancias e integración nativa con las reglas de alcance y desventajas a quemarropa de H6.

---

## Requisitos Funcionales

| ID | Requisito | Descripción |
|---|---|---|
| **RF-360** | **Modo Mesa Física para Jugadores** | Vista especializada móvil con PG grandes (`text-3xl` / `text-5xl`), barra de vida, controles táctiles `[-5 / -1 / +1 / +5]`, matriz táctil de ranuras de conjuro 1–9, recursos de clase y tiradas rápidas de armas preparadas. Activo por defecto en pantallas < 640px con switch para alternar a la Ficha Completa. |
| **RF-361** | **Cockpit Táctico del DM** | Disposición de pantalla ancha optimizada que reúne Mapa/TotM en el área principal y una columna táctica integrada con turnos, dados secretos y Party Dashboard sin scroll vertical desmedido. |
| **RF-362** | **Party Dashboard con Controles `[-]` y `[+]`** | Resumen en vivo de los aventureros para el DM con CA, PP, estados y botones simplificados `[-]` y `[+]` que solicitan cantidad para aplicar daño o curación atómica vía `campaignStore.mutateHp`. |
| **RF-363** | **Modo Teatro de la Mente (TotM)** | Tablero narrativo de 3 zonas (*Melé 5 ft*, *Cerca 30 ft*, *Lejos 60 ft*) alternable desde la barra del mapa (`MapStage`), que mide distancias automáticamente para la lista de iniciativa (`InitiativeList`) y valida ataques 5e. |
| **RF-364** | **Persistencia Reactiva de Preferencias de Vista** | Guardado de preferencias de visualización (`viewMode: 'standard' | 'table'`, `dnd_dm_view_mode: 'classic' | 'cockpit'`, `dnd_stage_mode: 'grid' | 'totm'`) en `localStorage` y en el modelo de datos sin recargar la página. |

---

## Modelo de Datos

### 1. Extensión de `LayoutConfig` en `src/scripts/models/character.ts`

```typescript
export type SheetViewMode = 'standard' | 'table';

export interface LayoutConfig {
  activeTab: 'all' | 'combat' | 'skills' | 'spells' | 'wildshape' | 'inventory' | 'journal';
  showSpells: boolean;
  showWildShape: boolean;
  showWeapons: boolean;
  showInventory: boolean;
  showJournal: boolean;
  showSkills: boolean;
  classPreset?: 'custom' | 'wizard' | 'druid' | 'fighter' | 'rogue' | 'cleric';
  sectionOrder?: SectionOrderConfig;
  collapsedSections?: string[];
  /** Modo de vista de la hoja: 'standard' (3 bloques completos) o 'table' (Mesa física reducida, Spec 14, H7). */
  viewMode?: SheetViewMode;
}
```

### 2. Extensión de `src/scripts/models/map.ts`

```typescript
/** Zonas narrativas para combate en modo Teatro de la Mente (Spec 14, H7). */
export type TotmZone = 'melee' | 'near' | 'far';

export interface TotmCombatantState {
  id: string;
  name: string;
  zone: TotmZone;
  avatarUrl?: string;
  isMonster?: boolean;
  engagementId?: string;
}
```

### 3. Función Pura de Distancias TotM en `src/scripts/vtt/tacticalCombat.ts`

```typescript
export function calculateTotmDistanceFeet(
  zoneA: TotmZone,
  zoneB: TotmZone,
  sameEngagement: boolean = false
): TokenDistanceResult {
  let feet = 30;
  let cells = 6;

  if (zoneA === 'melee' && zoneB === 'melee') {
    feet = sameEngagement ? 5 : 10;
    cells = sameEngagement ? 1 : 2;
  } else if ((zoneA === 'melee' && zoneB === 'near') || (zoneA === 'near' && zoneB === 'melee')) {
    feet = 30;
    cells = 6;
  } else if ((zoneA === 'melee' && zoneB === 'far') || (zoneA === 'far' && zoneB === 'melee')) {
    feet = 60;
    cells = 12;
  } else if (zoneA === 'near' && zoneB === 'near') {
    feet = 15;
    cells = 3;
  } else if ((zoneA === 'near' && zoneB === 'far') || (zoneA === 'far' && zoneB === 'near')) {
    feet = 30;
    cells = 6;
  } else if (zoneA === 'far' && zoneB === 'far') {
    feet = 30;
    cells = 6;
  }

  return {
    cells,
    feet,
    adjacent: feet <= 5,
    overlapping: feet === 0,
  };
}
```

---

## Criterios de Aceptación y Verificación

1. **Mesa Física:**
   - En pantallas móviles (< 640px), al abrir la hoja de personaje se renderiza por defecto `PhysicalTableSheet`.
   - Se visualizan PG con fuente de tamaño heroico, barra de vida y botones rápidos.
   - La matriz de conjuros representa ranuras del 1 al 9 como botones circulares táctiles; al hacer clic se gastan o recuperan actualizando el estado de la ficha.
   - Las armas preparadas permiten tirar dados abriendo el modal de ataque contextual con daño configurado.
   - El botón `Ficha Completa` conmuta de inmediato a la vista tradicional de 3 bloques sin recargar.
2. **Cockpit DM:**
   - El Grimorio permite alternar entre vista clásica y modo Cockpit con un selector permanente.
   - En modo Cockpit, el Party Dashboard aparece en la columna lateral derecha con filas compactas por aventurero.
   - Los botones `[-]` y `[+]` solicitan la cantidad numérica vía prompt/input y aplican la mutación atómica sobre `character.hp` respetando máximos y mínimo de 0.
3. **Teatro de la Mente:**
   - La barra de herramientas del mapa permite alternar entre `Cuadrícula` y `Teatro`.
   - Los combatientes se distribuyen entre Melé (5 ft), Cerca (30 ft) y Lejos (60 ft).
   - Al declarar un ataque en `InitiativeList`, la distancia se resuelve automáticamente como `🎭 Teatro de la mente (X ft)`.
   - Un arma cuerpo a cuerpo (5 ft) resulta válida si ambos están en melé, pero queda fuera de alcance si el objetivo está en zona cercana (30 ft).
   - Un arco disparado en melé (5 ft) recibe automáticamente la alerta de desventaja a quemarropa.
4. **Regresión y Compilación:**
   - Más de 1.165 pruebas unitarias automatizadas pasando sin fallos.
   - Compilación estática limpia en Astro (`pnpm build`).
